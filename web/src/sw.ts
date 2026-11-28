import { classifySwRequest, isValidCacheableResponse } from './offline/swPolicy'

interface ManifestEntry {
  url: string
  revision: string | null
}

interface SwExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}

interface SwFetchEvent extends SwExtendableEvent {
  request: Request
  respondWith(response: Response | Promise<Response>): void
}

interface SwGlobalScope {
  __WB_MANIFEST?: Array<ManifestEntry | string>
  location: Location
  skipWaiting(): Promise<void>
  clients: {
    claim(): Promise<void>
  }
  addEventListener(type: 'install' | 'activate', listener: (event: SwExtendableEvent) => void): void
  addEventListener(type: 'fetch', listener: (event: SwFetchEvent) => void): void
}

const CACHE_PREFIX = 'odysseus-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const sw = globalThis as unknown as SwGlobalScope

function normalizeManifestUrls(entries: Array<ManifestEntry | string>): string[] {
  const urls = new Set<string>(['/', '/index.html'])
  for (const entry of entries) {
    const raw = typeof entry === 'string' ? entry : entry.url
    if (!raw) continue
    const normalized = raw.startsWith('/') ? raw : `/${raw}`
    urls.add(normalized)
  }
  return Array.from(urls)
}

async function precacheShell(urls: string[]): Promise<void> {
  const cache = await caches.open(CACHE_NAME)
  await Promise.all(
    urls.map(async (url) => {
      const expectHtml = url === '/' || url.endsWith('.html')
      try {
        const res = await fetch(url, { redirect: 'manual', cache: 'reload', credentials: 'same-origin' })
        if (isValidCacheableResponse(res, expectHtml, url)) {
          await cache.put(url, res)
        }
      } catch {
        // Ignore individual transient precache error during SW install
      }
    }),
  )
}

async function cleanupLegacyCaches(): Promise<void> {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  )
}

async function handleShellHtml(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME)
  try {
    const networkRes = await fetch(request.url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
    })
    if (isValidCacheableResponse(networkRes, true)) {
      await cache.put('/index.html', networkRes.clone())
      return networkRes
    }
    if (networkRes.status === 302 || networkRes.type === 'opaqueredirect' || networkRes.redirected) {
      return networkRes
    }
  } catch {
    // Offline or network error: fall back to cached shell HTML
  }
  const fallback = (await cache.match('/index.html')) ?? (await cache.match('/'))
  return fallback ?? Response.error()
}

async function handleStaticAsset(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached && isValidCacheableResponse(cached, false, request.url)) {
    return cached
  }
  try {
    const networkRes = await fetch(request.url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
    })
    if (isValidCacheableResponse(networkRes, false, request.url)) {
      await cache.put(request, networkRes.clone())
      return networkRes
    }
    return networkRes
  } catch {
    return Response.error()
  }
}

sw.addEventListener('install', (event) => {
  const manifestEntries = (self as unknown as SwGlobalScope).__WB_MANIFEST ?? []
  const urls = normalizeManifestUrls(manifestEntries)
  event.waitUntil(precacheShell(urls).then(() => sw.skipWaiting()))
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(cleanupLegacyCaches().then(() => sw.clients.claim()))
})

sw.addEventListener('fetch', (event) => {
  const requestClass = classifySwRequest(
    event.request.url,
    event.request.method,
    event.request.mode,
    sw.location.origin,
  )
  if (requestClass === 'bypass') return
  if (requestClass === 'shell-html') {
    event.respondWith(handleShellHtml(event.request))
    return
  }
  event.respondWith(handleStaticAsset(event.request))
})
