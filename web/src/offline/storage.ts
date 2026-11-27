import type { TripWorkspace } from '../types'

export interface StoredTripOfflineRecord {
  tripId: string
  syncedAt: string
  workspaceSha256: string
  workspace: TripWorkspace
  attachmentIds: string[]
  mapPackIds: string[]
  totalBytes: number
  includesMapPacks: boolean
}

export interface StoredAttachmentBlob {
  attachmentId: string
  tripId: string
  sha256: string
  filename: string
  mimeType: string
  sizeBytes: number
  blob: Blob
}

export interface StoredMapPackMeta {
  packId: string
  tripId: string
  legId: string | null
  label: string
  sha256: string
  filename: string
  sizeBytes: number
  maxZoom: number
  bbox: [number, number, number, number]
  storageBackend: 'opfs' | 'indexeddb'
}

export interface StoredMapPackBlob extends StoredMapPackMeta {
  blob: Blob
}

export interface OfflineStorageAdapter {
  getTripRecord(tripId: string): Promise<StoredTripOfflineRecord | null>
  listTripRecords(): Promise<StoredTripOfflineRecord[]>
  putTripRecord(record: StoredTripOfflineRecord): Promise<void>
  deleteTripRecord(tripId: string): Promise<void>
  getAttachmentMeta(attachmentId: string): Promise<Omit<StoredAttachmentBlob, 'blob'> | null>
  getAttachmentBlob(attachmentId: string): Promise<StoredAttachmentBlob | null>
  putAttachmentBlob(entry: StoredAttachmentBlob): Promise<void>
  deleteAttachmentBlob(attachmentId: string): Promise<void>
  listAttachmentIdsForTrip(tripId: string): Promise<string[]>
  getMapPackMeta(packId: string): Promise<StoredMapPackMeta | null>
  getMapPackBlob(packId: string): Promise<StoredMapPackBlob | null>
  putMapPackBlob(entry: Omit<StoredMapPackBlob, 'storageBackend'>): Promise<void>
  deleteMapPackBlob(packId: string): Promise<void>
  listMapPackIdsForTrip(tripId: string): Promise<string[]>
}

const DB_NAME = 'odysseus-offline-v1'
const DB_VERSION = 1
const OPFS_MAPPACK_DIR = 'odysseus-mappacks'

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable in this browser environment.')
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'tripId' })
      }
      if (!db.objectStoreNames.contains('attachments')) {
        const attStore = db.createObjectStore('attachments', { keyPath: 'attachmentId' })
        attStore.createIndex('by_trip', 'tripId', { unique: false })
      }
      if (!db.objectStoreNames.contains('mappacks')) {
        const packStore = db.createObjectStore('mappacks', { keyPath: 'packId' })
        packStore.createIndex('by_trip', 'tripId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })
}

async function getOpfsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(OPFS_MAPPACK_DIR, { create: true })
  } catch (err: unknown) {
    if (isQuotaError(err)) throw err
    return null
  }
}

async function writeOpfsMapPack(packId: string, blob: Blob): Promise<boolean> {
  const dir = await getOpfsDir()
  if (!dir) return false
  try {
    const handle = await dir.getFileHandle(`${packId}.pmtiles`, { create: true })
    if (typeof handle.createWritable !== 'function') return false
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch (err: unknown) {
    if (isQuotaError(err)) throw err
    return false
  }
}

async function readOpfsMapPack(packId: string): Promise<Blob | null> {
  const dir = await getOpfsDir()
  if (!dir) return null
  try {
    const handle = await dir.getFileHandle(`${packId}.pmtiles`, { create: false })
    return await handle.getFile()
  } catch {
    return null
  }
}

async function removeOpfsMapPack(packId: string): Promise<void> {
  const dir = await getOpfsDir()
  if (!dir) return
  try {
    await dir.removeEntry(`${packId}.pmtiles`)
  } catch {
    // Ignore missing entry on cleanup
  }
}

export class BrowserOfflineStorageAdapter implements OfflineStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openOfflineDb()
    return this.dbPromise
  }

  async getTripRecord(tripId: string): Promise<StoredTripOfflineRecord | null> {
    const db = await this.getDb()
    const tx = db.transaction('trips', 'readonly')
    const result = await idbRequest<StoredTripOfflineRecord | undefined>(tx.objectStore('trips').get(tripId))
    await idbTransactionDone(tx)
    return result ?? null
  }

  async listTripRecords(): Promise<StoredTripOfflineRecord[]> {
    const db = await this.getDb()
    const tx = db.transaction('trips', 'readonly')
    const result = await idbRequest<StoredTripOfflineRecord[]>(tx.objectStore('trips').getAll())
    await idbTransactionDone(tx)
    return result ?? []
  }

  async putTripRecord(record: StoredTripOfflineRecord): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction('trips', 'readwrite')
    tx.objectStore('trips').put(record)
    await idbTransactionDone(tx)
  }

  async deleteTripRecord(tripId: string): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction('trips', 'readwrite')
    tx.objectStore('trips').delete(tripId)
    await idbTransactionDone(tx)
  }

  async getAttachmentMeta(attachmentId: string): Promise<Omit<StoredAttachmentBlob, 'blob'> | null> {
    const found = await this.getAttachmentBlob(attachmentId)
    if (!found) return null
    const { blob: _unused, ...meta } = found
    return meta
  }

  async getAttachmentBlob(attachmentId: string): Promise<StoredAttachmentBlob | null> {
    const db = await this.getDb()
    const tx = db.transaction('attachments', 'readonly')
    const result = await idbRequest<StoredAttachmentBlob | undefined>(
      tx.objectStore('attachments').get(attachmentId),
    )
    await idbTransactionDone(tx)
    return result ?? null
  }

  async putAttachmentBlob(entry: StoredAttachmentBlob): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction('attachments', 'readwrite')
    tx.objectStore('attachments').put(entry)
    await idbTransactionDone(tx)
  }

  async deleteAttachmentBlob(attachmentId: string): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction('attachments', 'readwrite')
    tx.objectStore('attachments').delete(attachmentId)
    await idbTransactionDone(tx)
  }

  async listAttachmentIdsForTrip(tripId: string): Promise<string[]> {
    const db = await this.getDb()
    const tx = db.transaction('attachments', 'readonly')
    const index = tx.objectStore('attachments').index('by_trip')
    const keys = await idbRequest<IDBValidKey[]>(index.getAllKeys(tripId))
    await idbTransactionDone(tx)
    return keys.map(String)
  }

  async getMapPackMeta(packId: string): Promise<StoredMapPackMeta | null> {
    const db = await this.getDb()
    const tx = db.transaction('mappacks', 'readonly')
    const raw = await idbRequest<(StoredMapPackMeta & { blob?: Blob }) | undefined>(
      tx.objectStore('mappacks').get(packId),
    )
    await idbTransactionDone(tx)
    if (!raw) return null
    const { blob: _unused, ...meta } = raw
    return meta
  }

  async getMapPackBlob(packId: string): Promise<StoredMapPackBlob | null> {
    const db = await this.getDb()
    const tx = db.transaction('mappacks', 'readonly')
    const raw = await idbRequest<(StoredMapPackMeta & { blob?: Blob }) | undefined>(
      tx.objectStore('mappacks').get(packId),
    )
    await idbTransactionDone(tx)
    if (!raw) return null
    if (raw.storageBackend === 'opfs') {
      const opfsBlob = await readOpfsMapPack(packId)
      if (opfsBlob) return { ...raw, blob: opfsBlob }
    }
    return raw.blob ? { ...raw, blob: raw.blob } : null
  }

  async putMapPackBlob(entry: Omit<StoredMapPackBlob, 'storageBackend'>): Promise<void> {
    const storedInOpfs = await writeOpfsMapPack(entry.packId, entry.blob)
    const db = await this.getDb()
    const tx = db.transaction('mappacks', 'readwrite')
    if (storedInOpfs) {
      const { blob: _unused, ...meta } = entry
      tx.objectStore('mappacks').put({ ...meta, storageBackend: 'opfs' })
    } else {
      tx.objectStore('mappacks').put({ ...entry, storageBackend: 'indexeddb' })
    }
    await idbTransactionDone(tx)
  }

  async deleteMapPackBlob(packId: string): Promise<void> {
    await removeOpfsMapPack(packId)
    const db = await this.getDb()
    const tx = db.transaction('mappacks', 'readwrite')
    tx.objectStore('mappacks').delete(packId)
    await idbTransactionDone(tx)
  }

  async listMapPackIdsForTrip(tripId: string): Promise<string[]> {
    const db = await this.getDb()
    const tx = db.transaction('mappacks', 'readonly')
    const index = tx.objectStore('mappacks').index('by_trip')
    const keys = await idbRequest<IDBValidKey[]>(index.getAllKeys(tripId))
    await idbTransactionDone(tx)
    return keys.map(String)
  }
}

export class InMemoryOfflineStorageAdapter implements OfflineStorageAdapter {
  private readonly trips = new Map<string, StoredTripOfflineRecord>()
  private readonly attachments = new Map<string, StoredAttachmentBlob>()
  private readonly mappacks = new Map<string, StoredMapPackBlob>()

  async getTripRecord(tripId: string): Promise<StoredTripOfflineRecord | null> {
    return this.trips.get(tripId) ?? null
  }

  async listTripRecords(): Promise<StoredTripOfflineRecord[]> {
    return Array.from(this.trips.values())
  }

  async putTripRecord(record: StoredTripOfflineRecord): Promise<void> {
    this.trips.set(record.tripId, record)
  }

  async deleteTripRecord(tripId: string): Promise<void> {
    this.trips.delete(tripId)
  }

  async getAttachmentMeta(attachmentId: string): Promise<Omit<StoredAttachmentBlob, 'blob'> | null> {
    const found = this.attachments.get(attachmentId)
    if (!found) return null
    const { blob: _unused, ...meta } = found
    return meta
  }

  async getAttachmentBlob(attachmentId: string): Promise<StoredAttachmentBlob | null> {
    return this.attachments.get(attachmentId) ?? null
  }

  async putAttachmentBlob(entry: StoredAttachmentBlob): Promise<void> {
    this.attachments.set(entry.attachmentId, entry)
  }

  async deleteAttachmentBlob(attachmentId: string): Promise<void> {
    this.attachments.delete(attachmentId)
  }

  async listAttachmentIdsForTrip(tripId: string): Promise<string[]> {
    return Array.from(this.attachments.values())
      .filter((entry) => entry.tripId === tripId)
      .map((entry) => entry.attachmentId)
  }

  async getMapPackMeta(packId: string): Promise<StoredMapPackMeta | null> {
    const found = this.mappacks.get(packId)
    if (!found) return null
    const { blob: _unused, ...meta } = found
    return meta
  }

  async getMapPackBlob(packId: string): Promise<StoredMapPackBlob | null> {
    return this.mappacks.get(packId) ?? null
  }

  async putMapPackBlob(entry: Omit<StoredMapPackBlob, 'storageBackend'>): Promise<void> {
    this.mappacks.set(entry.packId, { ...entry, storageBackend: 'indexeddb' })
  }

  async deleteMapPackBlob(packId: string): Promise<void> {
    this.mappacks.delete(packId)
  }

  async listMapPackIdsForTrip(tripId: string): Promise<string[]> {
    return Array.from(this.mappacks.values())
      .filter((entry) => entry.tripId === tripId)
      .map((entry) => entry.packId)
  }
}
