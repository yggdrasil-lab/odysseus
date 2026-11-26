import { SessionExpiredError } from '../api/client'
import type {
  OfflineBundle,
  OfflineBundleAttachmentManifest,
  OfflineBundleMapPackManifest,
  OfflineSyncSummary,
} from '../types'
import type { OfflineStorageAdapter } from './storage'

export class OfflineQuotaError extends Error {
  readonly requiredBytes?: number
  readonly availableBytes?: number

  constructor(message: string, details?: { requiredBytes?: number; availableBytes?: number }) {
    super(message)
    this.name = 'OfflineQuotaError'
    this.requiredBytes = details?.requiredBytes
    this.availableBytes = details?.availableBytes
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class OfflineSyncError extends Error {
  readonly status?: number
  readonly url: string

  constructor(message: string, details: { url: string; status?: number }) {
    super(message)
    this.name = 'OfflineSyncError'
    this.status = details.status
    this.url = details.url
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface OfflineSyncProgress {
  phase: 'preflight' | 'manifest' | 'downloading' | 'committing' | 'pruning' | 'complete'
  completedCount: number
  totalCount: number
  downloadedBytes: number
  totalBytes: number
  skippedCount: number
}

export interface SaveTripOfflineOptions {
  tripId: string
  includeMapPacks: boolean
  storage: OfflineStorageAdapter
  baseUrl?: string
  fetchImpl?: typeof fetch
  concurrency?: number
  onProgress?: (progress: OfflineSyncProgress) => void
}

type SyncDownloadTask =
  | { kind: 'attachment'; item: OfflineBundleAttachmentManifest }
  | { kind: 'mappack'; item: OfflineBundleMapPackManifest }

function isDomQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
}

function assertValidSyncResponse(response: Response, url: string, expectedKind: 'json' | 'binary'): void {
  const resUrl = response.url || url
  const isRedirectOrAuth =
    response.status === 302 ||
    response.status === 401 ||
    response.status === 403 ||
    response.type === 'opaqueredirect' ||
    response.redirected ||
    resUrl.includes('/outpost.goauthentik.io/') ||
    resUrl.includes('/flows/executor/')
  if (isRedirectOrAuth) {
    throw new SessionExpiredError(`Session expired during offline sync (${response.status}) on ${url}`, {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      url: resUrl,
    })
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('text/html')) {
    throw new SessionExpiredError(`Unexpected HTML login gate returned for ${url}`, {
      status: response.status,
      contentType,
      url: resUrl,
    })
  }
  if (!response.ok) {
    throw new OfflineSyncError(`Failed to fetch ${expectedKind} asset (${response.status})`, {
      url,
      status: response.status,
    })
  }
}

async function runPreflightStorageCheck(): Promise<{ quota?: number; usage?: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage) return {}
  try {
    if (typeof navigator.storage.persist === 'function') await navigator.storage.persist()
    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate()
      return { quota: estimate.quota, usage: estimate.usage }
    }
    return {}
  } catch (err: unknown) {
    if (isDomQuotaError(err)) throw new OfflineQuotaError('Device storage quota exceeded during preflight.')
    return {}
  }
}

async function fetchBundleManifest(tripId: string, baseUrl: string, fetchImpl: typeof fetch): Promise<OfflineBundle> {
  const url = `${baseUrl}/trips/${tripId}/offline-bundle`
  const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', cache: 'no-store' })
  assertValidSyncResponse(response, url, 'json')
  return (await response.json()) as OfflineBundle
}

async function planDownloads(
  bundle: OfflineBundle,
  includeMapPacks: boolean,
  storage: OfflineStorageAdapter,
): Promise<{ tasks: SyncDownloadTask[]; skippedCount: number; retainedBytes: number; downloadBytes: number }> {
  const tasks: SyncDownloadTask[] = []
  let skippedCount = 0
  let retainedBytes = 0
  let downloadBytes = 0

  for (const att of bundle.attachments) {
    const existing = await storage.getAttachmentMeta(att.id)
    if (existing && existing.sha256 === att.sha256) {
      skippedCount += 1; retainedBytes += existing.sizeBytes
    } else {
      tasks.push({ kind: 'attachment', item: att }); downloadBytes += att.size_bytes
    }
  }
  if (includeMapPacks) {
    for (const pack of bundle.map_packs) {
      const existing = await storage.getMapPackMeta(pack.id)
      if (existing && existing.sha256 === pack.sha256) {
        skippedCount += 1; retainedBytes += existing.sizeBytes
      } else {
        tasks.push({ kind: 'mappack', item: pack }); downloadBytes += pack.size_bytes
      }
    }
  }
  return { tasks, skippedCount, retainedBytes, downloadBytes }
}

function assertQuotaAvailable(estimate: { quota?: number; usage?: number }, downloadBytes: number): void {
  if (typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number' || downloadBytes <= 0) return
  const availableBytes = Math.max(0, estimate.quota - estimate.usage)
  if (availableBytes < downloadBytes) {
    throw new OfflineQuotaError(
      `Insufficient device storage (${availableBytes} B available, ${downloadBytes} B required).`,
      { requiredBytes: downloadBytes, availableBytes },
    )
  }
}

async function stageFetchedBlob(
  task: SyncDownloadTask,
  tripId: string,
  blob: Blob,
  storage: OfflineStorageAdapter,
): Promise<void> {
  try {
    if (task.kind === 'attachment') {
      await storage.putAttachmentBlob({
        attachmentId: task.item.id, tripId, sha256: task.item.sha256,
        filename: task.item.filename, mimeType: task.item.mime_type,
        sizeBytes: blob.size || task.item.size_bytes, blob,
      })
      return
    }
    await storage.putMapPackBlob({
      packId: task.item.id, tripId, legId: task.item.leg_id, label: task.item.label,
      sha256: task.item.sha256, filename: task.item.filename,
      sizeBytes: blob.size || task.item.size_bytes, maxZoom: task.item.max_zoom,
      bbox: [task.item.bbox_west, task.item.bbox_south, task.item.bbox_east, task.item.bbox_north],
      blob,
    })
  } catch (err: unknown) {
    if (isDomQuotaError(err)) {
      throw new OfflineQuotaError(`Device storage quota exceeded while saving ${task.item.filename}.`)
    }
    throw err
  }
}

async function downloadAndStageTask(
  task: SyncDownloadTask,
  tripId: string,
  storage: OfflineStorageAdapter,
  fetchImpl: typeof fetch,
): Promise<number> {
  const url = task.kind === 'attachment' ? task.item.content_url : task.item.file_url
  const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', cache: 'no-store' })
  assertValidSyncResponse(response, url, 'binary')
  const blob = await response.blob()
  await stageFetchedBlob(task, tripId, blob, storage)
  return blob.size || task.item.size_bytes
}

async function runBoundedDownloads(options: {
  tasks: SyncDownloadTask[]
  tripId: string
  storage: OfflineStorageAdapter
  fetchImpl: typeof fetch
  concurrency: number
  skippedCount: number
  totalBytes: number
  onProgress?: (progress: OfflineSyncProgress) => void
}): Promise<number> {
  const { tasks, tripId, storage, fetchImpl, skippedCount, totalBytes, onProgress } = options
  const totalCount = tasks.length + skippedCount
  let nextIndex = 0
  let completedCount = skippedCount
  let downloadedBytes = 0
  onProgress?.({ phase: 'downloading', completedCount, totalCount, downloadedBytes, totalBytes, skippedCount })
  if (tasks.length === 0) return 0

  const workerCount = Math.min(Math.max(1, options.concurrency), tasks.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex
      nextIndex += 1
      const size = await downloadAndStageTask(tasks[idx], tripId, storage, fetchImpl)
      completedCount += 1; downloadedBytes += size
      onProgress?.({ phase: 'downloading', completedCount, totalCount, downloadedBytes, totalBytes, skippedCount })
    }
  })
  await Promise.all(workers)
  return downloadedBytes
}

async function pruneStaleTripBlobs(
  tripId: string,
  keepAttachmentIds: Set<string>,
  keepMapPackIds: Set<string>,
  storage: OfflineStorageAdapter,
): Promise<void> {
  const existingAttachments = await storage.listAttachmentIdsForTrip(tripId)
  await Promise.all(existingAttachments.filter((id) => !keepAttachmentIds.has(id)).map((id) => storage.deleteAttachmentBlob(id)))
  const existingMapPacks = await storage.listMapPackIdsForTrip(tripId)
  await Promise.all(existingMapPacks.filter((id) => !keepMapPackIds.has(id)).map((id) => storage.deleteMapPackBlob(id)))
}

async function commitBundleAndPrune(options: {
  tripId: string
  bundle: OfflineBundle
  includeMapPacks: boolean
  storage: OfflineStorageAdapter
  totalBytes: number
  completedCount: number
  totalCount: number
  downloadedBytes: number
  skippedCount: number
  onProgress?: (progress: OfflineSyncProgress) => void
}): Promise<OfflineSyncSummary> {
  const attachmentIds = options.bundle.attachments.map((att) => att.id)
  const mapPackIds = options.includeMapPacks ? options.bundle.map_packs.map((pack) => pack.id) : []
  const syncedAt = new Date().toISOString()

  options.onProgress?.({
    phase: 'committing', completedCount: options.completedCount, totalCount: options.totalCount,
    downloadedBytes: options.downloadedBytes, totalBytes: options.totalBytes, skippedCount: options.skippedCount,
  })
  try {
    await options.storage.putTripRecord({
      tripId: options.tripId, syncedAt, workspaceSha256: options.bundle.workspace_sha256,
      workspace: options.bundle.workspace, attachmentIds, mapPackIds,
      totalBytes: options.totalBytes, includesMapPacks: options.includeMapPacks,
    })
  } catch (err: unknown) {
    if (isDomQuotaError(err)) throw new OfflineQuotaError('Device storage quota exceeded while committing trip bundle.')
    throw err
  }
  options.onProgress?.({
    phase: 'pruning', completedCount: options.completedCount, totalCount: options.totalCount,
    downloadedBytes: options.downloadedBytes, totalBytes: options.totalBytes, skippedCount: options.skippedCount,
  })
  await pruneStaleTripBlobs(options.tripId, new Set(attachmentIds), new Set(mapPackIds), options.storage)
  options.onProgress?.({
    phase: 'complete', completedCount: options.completedCount, totalCount: options.totalCount,
    downloadedBytes: options.downloadedBytes, totalBytes: options.totalBytes, skippedCount: options.skippedCount,
  })
  return {
    tripId: options.tripId, syncedAt, attachmentCount: attachmentIds.length,
    mapPackCount: mapPackIds.length, totalBytes: options.totalBytes, includesMapPacks: options.includeMapPacks,
  }
}

export async function saveTripOffline(options: SaveTripOfflineOptions): Promise<OfflineSyncSummary> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const baseUrl = options.baseUrl ?? '/api'
  const concurrency = options.concurrency ?? 3

  options.onProgress?.({ phase: 'preflight', completedCount: 0, totalCount: 0, downloadedBytes: 0, totalBytes: 0, skippedCount: 0 })
  const estimate = await runPreflightStorageCheck()
  options.onProgress?.({ phase: 'manifest', completedCount: 0, totalCount: 0, downloadedBytes: 0, totalBytes: 0, skippedCount: 0 })
  const bundle = await fetchBundleManifest(options.tripId, baseUrl, fetchImpl)
  const plan = await planDownloads(bundle, options.includeMapPacks, options.storage)
  assertQuotaAvailable(estimate, plan.downloadBytes)

  const totalBytes = plan.retainedBytes + plan.downloadBytes
  const downloadedBytes = await runBoundedDownloads({
    tasks: plan.tasks, tripId: options.tripId, storage: options.storage, fetchImpl,
    concurrency, skippedCount: plan.skippedCount, totalBytes, onProgress: options.onProgress,
  })
  const totalCount = plan.tasks.length + plan.skippedCount
  return commitBundleAndPrune({
    tripId: options.tripId, bundle, includeMapPacks: options.includeMapPacks, storage: options.storage,
    totalBytes, completedCount: totalCount, totalCount, downloadedBytes,
    skippedCount: plan.skippedCount, onProgress: options.onProgress,
  })
}

export async function clearTripOffline(tripId: string, storage: OfflineStorageAdapter): Promise<void> {
  const [attIds, packIds] = await Promise.all([
    storage.listAttachmentIdsForTrip(tripId),
    storage.listMapPackIdsForTrip(tripId),
  ])
  await Promise.all([
    ...attIds.map((id) => storage.deleteAttachmentBlob(id)),
    ...packIds.map((id) => storage.deleteMapPackBlob(id)),
    storage.deleteTripRecord(tripId),
  ])
}

export async function readTripOfflineSummary(
  tripId: string,
  storage: OfflineStorageAdapter,
): Promise<OfflineSyncSummary | null> {
  const record = await storage.getTripRecord(tripId)
  if (!record) return null
  return {
    tripId: record.tripId,
    syncedAt: record.syncedAt,
    attachmentCount: record.attachmentIds.length,
    mapPackCount: record.mapPackIds.length,
    totalBytes: record.totalBytes,
    includesMapPacks: record.includesMapPacks,
  }
}
