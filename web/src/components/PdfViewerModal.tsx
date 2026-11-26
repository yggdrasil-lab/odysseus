import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { AlertBanner, Button, LoadingState, Modal } from '@yggdrasil-lab/ui'

import type { Attachment } from '../types'
import { formatBytesCompact } from '../utils/maps'

if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

interface PdfViewerModalProps {
  attachment: Attachment | null
  contentUrl: string
  onClose: () => void
}

async function fetchPdfBytes(contentUrl: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(contentUrl, { signal, cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Unable to fetch PDF (${response.status} ${response.statusText})`)
  }
  return response.arrayBuffer()
}

function usePdfDocumentLoader(attachment: Attachment | null, contentUrl: string, isPdf: boolean) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!attachment || !isPdf || !contentUrl) {
      setPdfDoc(null); setNumPages(0); setPageNumber(1); setErrorMessage(null)
      return
    }
    const controller = new AbortController()
    let active = true
    setLoading(true); setErrorMessage(null); setPageNumber(1)
    void (async () => {
      try {
        const bytes = await fetchPdfBytes(contentUrl, controller.signal)
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise
        if (!active) { await doc.destroy(); return }
        setPdfDoc(doc); setNumPages(doc.numPages)
      } catch (err: unknown) {
        if (!controller.signal.aborted && active) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to render PDF document.')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false; controller.abort() }
  }, [attachment, contentUrl, isPdf])

  return { pdfDoc, numPages, pageNumber, setPageNumber, loading, errorMessage, setErrorMessage }
}

function usePdfPageCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy | null,
  pageNumber: number,
  scale: number,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onError: (msg: string) => void,
) {
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    let renderTask: pdfjsLib.RenderTask | null = null
    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber)
        if (cancelled || !canvasRef.current) return
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) { onError('Canvas 2D rendering context unavailable.'); return }
        canvas.height = viewport.height; canvas.width = viewport.width
        renderTask = page.render({ canvasContext: context, viewport })
        await renderTask.promise
      } catch (err: unknown) {
        if (!cancelled && (err instanceof Error ? err.name : '') !== 'RenderingCancelledException') {
          onError(err instanceof Error ? err.message : 'PDF page render failed.')
        }
      }
    })()
    return () => { cancelled = true; renderTask?.cancel() }
  }, [canvasRef, onError, pageNumber, pdfDoc, scale])
}

const PdfToolbar: React.FC<{
  isPdf: boolean
  loading: boolean
  pageNumber: number
  numPages: number
  contentUrl: string
  filename: string
  onChangePage: (delta: number) => void
  onChangeScale: (delta: number) => void
}> = ({ isPdf, loading, pageNumber, numPages, contentUrl, filename, onChangePage, onChangeScale }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-control bg-background/70 border border-border/80 px-3 py-2">
    {isPdf ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="xs" className="min-h-[44px] sm:min-h-[34px]" disabled={pageNumber <= 1 || loading} icon={<ChevronLeft className="w-3.5 h-3.5" />} onClick={() => onChangePage(-1)}>
          Prev
        </Button>
        <span className="px-2 text-xs font-mono text-foreground">Page {numPages > 0 ? pageNumber : 0} / {numPages}</span>
        <Button variant="outline" size="xs" className="min-h-[44px] sm:min-h-[34px]" disabled={pageNumber >= numPages || loading} icon={<ChevronRight className="w-3.5 h-3.5" />} onClick={() => onChangePage(1)}>
          Next
        </Button>
        <Button variant="ghost" size="xs" aria-label="Zoom out PDF" className="min-h-[44px] sm:min-h-[34px]" icon={<ZoomOut className="w-3.5 h-3.5" />} onClick={() => onChangeScale(-0.2)} />
        <Button variant="ghost" size="xs" aria-label="Zoom in PDF" className="min-h-[44px] sm:min-h-[34px]" icon={<ZoomIn className="w-3.5 h-3.5" />} onClick={() => onChangeScale(0.2)} />
      </div>
    ) : (
      <span className="text-xs text-muted">Inline image preview</span>
    )}
    <a
      href={contentUrl}
      download={filename}
      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold min-h-[44px] sm:min-h-[36px] hover:opacity-90 transition-opacity"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Download</span>
    </a>
  </div>
)

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ attachment, contentUrl, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [scale, setScale] = useState(1.1)
  const isPdf = attachment?.mime_type === 'application/pdf'
  const loader = usePdfDocumentLoader(attachment, contentUrl, isPdf)
  usePdfPageCanvas(loader.pdfDoc, loader.pageNumber, scale, canvasRef, loader.setErrorMessage)

  if (!attachment) return null

  return (
    <Modal isOpen={Boolean(attachment)} onClose={onClose} title={attachment.filename} subtitle={`${attachment.mime_type} · ${formatBytesCompact(attachment.size_bytes)}`} className="max-w-3xl">
      <div data-testid="pdf-viewer-modal" className="space-y-3">
        <PdfToolbar
          isPdf={isPdf}
          loading={loader.loading}
          pageNumber={loader.pageNumber}
          numPages={loader.numPages}
          contentUrl={contentUrl}
          filename={attachment.filename}
          onChangePage={(d) => loader.setPageNumber((p) => Math.min(Math.max(1, p + d), loader.numPages || 1))}
          onChangeScale={(d) => setScale((s) => Math.min(2.2, Math.max(0.6, Number((s + d).toFixed(2)))))}
        />
        {loader.errorMessage && <AlertBanner variant="error" title="Document render error">{loader.errorMessage}</AlertBanner>}
        {loader.loading && <LoadingState label="Rendering PDF pages..." variant="brand" />}
        {isPdf ? (
          <div className="overflow-auto rounded-ui-control border border-border/80 bg-slate-950/80 p-3 flex justify-center min-h-[260px]">
            <canvas ref={canvasRef} data-testid="pdf-viewer-canvas" className="max-w-full h-auto" />
          </div>
        ) : (
          <div className="overflow-auto rounded-ui-control border border-border/80 bg-slate-950/80 p-3 flex justify-center">
            <img src={contentUrl} alt={attachment.filename} className="max-w-full max-h-[60vh] object-contain rounded" />
          </div>
        )}
      </div>
    </Modal>
  )
}
