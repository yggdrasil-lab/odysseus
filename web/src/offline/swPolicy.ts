export type SwRequestClass = 'shell-html' | 'static-asset' | 'bypass'

const STATIC_ROOT_PATHS = new Set([
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
])

const SW_SELF_PATHS = new Set(['/sw.js', '/registerSW.js'])

export function classifySwRequest(
  urlStr: string,
  method: string,
  mode: RequestMode,
  origin?: string,
): SwRequestClass {
  if (method.toUpperCase() !== 'GET') return 'bypass'
  const baseOrigin =
    origin ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'http://localhost')

  let parsed: URL
  try {
    parsed = new URL(urlStr, baseOrigin)
  } catch {
    return 'bypass'
  }

  if (parsed.origin !== baseOrigin) return 'bypass'
  const { pathname } = parsed
  if (pathname === '/api' || pathname.startsWith('/api/')) return 'bypass'
  if (SW_SELF_PATHS.has(pathname) || pathname.startsWith('/workbox-')) return 'bypass'
  if (pathname.startsWith('/assets/') || STATIC_ROOT_PATHS.has(pathname)) {
    return 'static-asset'
  }
  if (
    mode === 'navigate' ||
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname.startsWith('/share/')
  ) {
    return 'shell-html'
  }
  return 'bypass'
}

export function isValidCacheableResponse(response: Response, expectHtml: boolean): boolean {
  if (response.status === 302 || response.type === 'opaqueredirect' || response.redirected) {
    return false
  }
  if (!response.ok) return false
  const url = response.url || ''
  if (url.includes('/outpost.goauthentik.io/') || url.includes('/flows/executor/')) {
    return false
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (!expectHtml && contentType.includes('text/html')) {
    return false
  }
  if (expectHtml && contentType && !contentType.includes('text/html')) {
    return false
  }
  return true
}
