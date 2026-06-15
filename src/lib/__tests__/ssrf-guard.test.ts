import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertSafeUrl, SsrfError } from '@/lib/ssrf-guard'

// Mock the dns/promises module so tests don't make real DNS queries
vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>()
  return {
    ...actual,
    promises: {
      lookup: vi.fn(),
    },
  }
})

// Grab the mocked lookup so individual tests can configure it
async function getMockedLookup() {
  const dns = await import('dns')
  return vi.mocked(dns.promises.lookup)
}

beforeEach(async () => {
  const lookup = await getMockedLookup()
  lookup.mockReset()
})

describe('assertSafeUrl — scheme checks', () => {
  it('throws SsrfError for file:// scheme', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(SsrfError)
  })

  it('throws SsrfError for ftp:// scheme', async () => {
    await expect(assertSafeUrl('ftp://example.com/file')).rejects.toThrow(SsrfError)
  })

  it('throws SsrfError for custom scheme', async () => {
    await expect(assertSafeUrl('redis://localhost:6379')).rejects.toThrow(SsrfError)
  })

  it('throws SsrfError for unparseable URL', async () => {
    await expect(assertSafeUrl('not-a-url')).rejects.toThrow(SsrfError)
  })
})

describe('assertSafeUrl — blocked IPv4 ranges', () => {
  it('rejects loopback http://127.0.0.1', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '127.0.0.1', family: 4 } as any)
    await expect(assertSafeUrl('http://127.0.0.1')).rejects.toThrow(SsrfError)
  })

  it('rejects localhost (resolved to 127.0.0.1)', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '127.0.0.1', family: 4 } as any)
    await expect(assertSafeUrl('http://localhost')).rejects.toThrow(SsrfError)
  })

  it('rejects private range 10.0.0.1', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '10.0.0.1', family: 4 } as any)
    await expect(assertSafeUrl('http://10.0.0.1')).rejects.toThrow(SsrfError)
  })

  it('rejects private range 192.168.1.1', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '192.168.1.1', family: 4 } as any)
    await expect(assertSafeUrl('http://192.168.1.1')).rejects.toThrow(SsrfError)
  })

  it('rejects private range 172.16.0.1', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '172.16.0.1', family: 4 } as any)
    await expect(assertSafeUrl('http://172.16.0.1')).rejects.toThrow(SsrfError)
  })

  it('rejects link-local 169.254.169.254 (AWS metadata)', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '169.254.169.254', family: 4 } as any)
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(SsrfError)
  })
})

describe('assertSafeUrl — safe public URLs', () => {
  it('accepts https://example.com resolving to a public IP', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any)
    await expect(assertSafeUrl('https://example.com')).resolves.toBeUndefined()
  })

  it('accepts http://example.com with a public IP', async () => {
    const lookup = await getMockedLookup()
    lookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any)
    await expect(assertSafeUrl('http://example.com/path')).resolves.toBeUndefined()
  })
})

describe('assertSafeUrl — DNS resolution failure', () => {
  it('throws SsrfError when DNS lookup fails', async () => {
    const lookup = await getMockedLookup()
    lookup.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(assertSafeUrl('http://nonexistent.invalid')).rejects.toThrow(SsrfError)
  })
})
