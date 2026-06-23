import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: vi.fn(),
}))

vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { fetchLinkPreview } from '@/lib/link-preview'
import { assertSafeUrl } from '@/lib/ssrf-guard'
import { redis } from '@/lib/redis'

const URL_OK = 'https://www.example.com/article'

/** Build a Response-like object whose body streams `html` as a single chunk. */
function htmlResponse(html: string, ok = true, status = 200): Response {
  const bytes = new TextEncoder().encode(html)
  let sent = false
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          read: async () =>
            sent
              ? { done: true, value: undefined }
              : ((sent = true), { done: false, value: bytes }),
          cancel: async () => undefined,
        }
      },
    },
  } as unknown as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(assertSafeUrl).mockResolvedValue(undefined as never)
  vi.mocked(redis.get).mockResolvedValue(null)
  vi.mocked(redis.set).mockResolvedValue('OK' as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLinkPreview', () => {
  it('returns null and never fetches when the SSRF guard blocks the URL', async () => {
    vi.mocked(assertSafeUrl).mockRejectedValue(new Error('blocked'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchLinkPreview('http://169.254.169.254/')

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the cached preview without fetching on a cache hit', async () => {
    const cached = {
      title: 'Cached',
      description: 'd',
      imageUrl: null,
      domain: 'example.com',
    }
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchLinkPreview(URL_OK)

    expect(result).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('prefers Open Graph tags and strips a www. prefix from the domain', async () => {
    const html = `<html><head>
      <meta property="og:title" content="OG Title" />
      <meta property="og:description" content="OG Desc" />
      <meta property="og:image" content="https://cdn.example.com/i.png" />
      <title>Fallback</title>
    </head><body></body></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchLinkPreview(URL_OK)

    expect(result).toEqual({
      title: 'OG Title',
      description: 'OG Desc',
      imageUrl: 'https://cdn.example.com/i.png',
      domain: 'example.com',
    })
    expect(redis.set).toHaveBeenCalled()
  })

  it('falls back to <title> and meta description when OG tags are absent', async () => {
    const html = `<html><head>
      <title>  Plain Title  </title>
      <meta name="description" content="Meta description" />
    </head><body></body></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchLinkPreview(URL_OK)

    expect(result?.title).toBe('Plain Title')
    expect(result?.description).toBe('Meta description')
    expect(result?.imageUrl).toBeNull()
  })

  it('uses og:site_name as the domain when present', async () => {
    const html = `<html><head>
      <meta property="og:site_name" content="Example News" />
      <title>t</title>
    </head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)))

    const result = await fetchLinkPreview(URL_OK)

    expect(result?.domain).toBe('Example News')
  })

  it('returns null on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('', false, 500)))

    const result = await fetchLinkPreview(URL_OK)

    expect(result).toBeNull()
  })

  it('returns null and never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(fetchLinkPreview(URL_OK)).resolves.toBeNull()
  })
})
