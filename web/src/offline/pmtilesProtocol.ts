import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles'

import type { OfflineMapPackEntry } from '../types'

export class BlobSource implements Source {
  private readonly blob: Blob
  private readonly key: string

  constructor(blob: Blob, key: string) {
    this.blob = blob
    this.key = key
  }

  getKey(): string {
    return this.key
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const slice = this.blob.slice(offset, offset + length)
    if (typeof slice.arrayBuffer === 'function') {
      return { data: await slice.arrayBuffer() }
    }
    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read PMTiles blob slice'))
      reader.readAsArrayBuffer(slice)
    })
    return { data }
  }
}

export const OFFLINE_FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'odysseus-offline-bg',
      type: 'background',
      paint: { 'background-color': '#0b1623' },
    },
  ],
}

let pmtilesProtocol: Protocol | null = null
let protocolRegistered = false

function ensurePmtilesProtocol(): Protocol {
  if (!pmtilesProtocol) {
    pmtilesProtocol = new Protocol()
  }
  if (!protocolRegistered && typeof maplibregl.addProtocol === 'function') {
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)
    protocolRegistered = true
  }
  return pmtilesProtocol
}

export function buildPmtilesSourceKey(packId: string): string {
  return `odysseus-pack-${packId}`
}

function buildPackVectorLayers(sourceKey: string): StyleSpecification['layers'] {
  return [
    { id: `${sourceKey}-water`, type: 'fill', source: sourceKey, 'source-layer': 'water', paint: { 'fill-color': '#0e2238' } },
    { id: `${sourceKey}-land`, type: 'fill', source: sourceKey, 'source-layer': 'earth', paint: { 'fill-color': '#111d2e' } },
    { id: `${sourceKey}-roads`, type: 'line', source: sourceKey, 'source-layer': 'roads', paint: { 'line-color': '#1e334d', 'line-width': 1 } },
    { id: `${sourceKey}-boundaries`, type: 'line', source: sourceKey, 'source-layer': 'boundaries', paint: { 'line-color': '#334155', 'line-width': 0.8 } },
  ]
}

export function registerOfflineMapPacks(packs: OfflineMapPackEntry[]): StyleSpecification {
  if (packs.length === 0) {
    return OFFLINE_FALLBACK_MAP_STYLE
  }
  const protocol = ensurePmtilesProtocol()
  const sources: StyleSpecification['sources'] = {}
  const layers: StyleSpecification['layers'] = [
    {
      id: 'odysseus-offline-bg',
      type: 'background',
      paint: { 'background-color': '#0b1623' },
    },
  ]

  for (const pack of packs) {
    const sourceKey = buildPmtilesSourceKey(pack.packId)
    protocol.add(new PMTiles(new BlobSource(pack.blob, sourceKey)))
    sources[sourceKey] = {
      type: 'vector',
      url: `pmtiles://${sourceKey}`,
    }
    layers.push(...buildPackVectorLayers(sourceKey))
  }

  return { version: 8, sources, layers }
}
