import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: vi.fn(),
}))

vi.mock('@/lib/markdown', () => ({
  // Pass-through sanitizer so we can assert on the wiring without DOMPurify.
  sanitizeHtml: vi.fn((html: string) => html),
}))

vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { fetchOEmbed } from '@/lib/oembed'
import { assertSafeUrl } from '@/lib/ssrf-guard'
import { sanitizeHtml } from '@/lib/markdown'
import { redis } from '@/lib/redis'

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as unknown as Response)
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

describe('fetchOEmbed', () => {
  it('returns null and never fetches when the SSRF guard blocks the URL', async () => {
    vi.mocked(assertSafeUrl).mockRejectedValue(new Error('blocked'))
    const fetchSpy = mockFetchOnce({})
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchOEmbed(YT)

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null for an unsupported provider', async () => {
    const fetchSpy = mockFetchOnce({})
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchOEmbed('https://example.com/some/page')

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the cached result without fetching on a cache hit', async () => {
    const cached = { html: '<iframe></iframe>', width: 560, height: 315 }
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached))
    const fetchSpy = mockFetchOnce({})
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchOEmbed(YT)

    expect(result).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches the hardcoded YouTube endpoint and caches a sanitized result', async () => {
    const fetchSpy = mockFetchOnce({
      html: '<iframe src="https://youtube.com/embed/x"></iframe>',
      width: 640,
      height: 360,
      thumbnail_url: 'https://img.youtube.com/x.jpg',
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchOEmbed(YT)

    expect(result).toEqual({
      html: '<iframe src="https://youtube.com/embed/x"></iframe>',
      width: 640,
      height: 360,
      thumbnailUrl: 'https://img.youtube.com/x.jpg',
    })
    // Endpoint must be the hardcoded YouTube oEmbed URL with the encoded user URL.
    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('https://www.youtube.com/oembed')
    expect(calledUrl).toContain(encodeURIComponent(YT))
    expect(sanitizeHtml).toHaveBeenCalled()
    expect(redis.set).toHaveBeenCalled()
  })

  it('falls back to default dimensions when the provider omits them', async () => {
    const fetchSpy = mockFetchOnce({ html: '<blockquote>tweet</blockquote>' })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchOEmbed('https://x.com/jack/status/1')

    expect(result).toEqual({
      html: '<blockquote>tweet</blockquote>',
      width: 560,
      height: 315,
    })
  })

  it('returns null on a non-2xx provider response', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({}, false, 404))

    const result = await fetchOEmbed(YT)

    expect(result).toBeNull()
  })

  it('returns null when the provider response has no html field', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ width: 100 }))

    const result = await fetchOEmbed(YT)

    expect(result).toBeNull()
  })

  it('returns null when sanitization strips the html to empty', async () => {
    vi.mocked(sanitizeHtml).mockReturnValue('   ')
    vi.stubGlobal('fetch', mockFetchOnce({ html: '<script>evil()</script>' }))

    const result = await fetchOEmbed('https://vimeo.com/12345')

    expect(result).toBeNull()
  })

  it('returns null and never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(fetchOEmbed(YT)).resolves.toBeNull()
  })
})
