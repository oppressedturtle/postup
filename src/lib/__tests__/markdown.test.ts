import { describe, it, expect } from 'vitest'
import { renderMarkdown, sanitizeHtml } from '@/lib/markdown'

describe('renderMarkdown', () => {
  it('renders bold text', async () => {
    const result = await renderMarkdown('**bold**')
    expect(result).toContain('<strong>bold</strong>')
  })

  it('renders italic text', async () => {
    const result = await renderMarkdown('_italic_')
    expect(result).toContain('<em>italic</em>')
  })

  it('renders an unordered list', async () => {
    const result = await renderMarkdown('- item one\n- item two')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>item one</li>')
    expect(result).toContain('<li>item two</li>')
  })

  it('renders an ordered list', async () => {
    const result = await renderMarkdown('1. first\n2. second')
    expect(result).toContain('<ol>')
    expect(result).toContain('<li>first</li>')
  })

  it('strips <script> tags from markdown output', async () => {
    const result = await renderMarkdown('<script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
  })

  it('strips onclick attributes', async () => {
    const result = await renderMarkdown('<p onclick="evil()">text</p>')
    expect(result).not.toContain('onclick')
  })

  it('allows <a href> links', async () => {
    const result = await renderMarkdown('[click](https://example.com)')
    expect(result).toContain('<a href="https://example.com">')
    expect(result).toContain('click</a>')
  })

  it('strips javascript: href schemes', async () => {
    const result = await renderMarkdown('[bad](javascript:alert(1))')
    // The sanitizer removes javascript: hrefs
    expect(result).not.toContain('javascript:')
  })

  it('allows <img src alt>', async () => {
    const result = await renderMarkdown('![alt text](https://example.com/img.png)')
    expect(result).toContain('<img')
    expect(result).toContain('src="https://example.com/img.png"')
    expect(result).toContain('alt="alt text"')
  })

  it('strips <iframe> entirely', async () => {
    const result = await renderMarkdown('<iframe src="https://evil.com"></iframe>')
    expect(result).not.toContain('<iframe')
  })

  it('returns a string for empty input', async () => {
    const result = await renderMarkdown('')
    expect(typeof result).toBe('string')
  })
})

describe('sanitizeHtml', () => {
  it('strips <script> tags', () => {
    const result = sanitizeHtml('<p>hello</p><script>alert(1)</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>hello</p>')
  })

  it('strips onclick attributes', () => {
    const result = sanitizeHtml('<a onclick="evil()">link</a>')
    expect(result).not.toContain('onclick')
  })

  it('allows <a href>', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>')
    expect(result).toContain('href="https://example.com"')
  })

  it('allows <iframe> (sanitizeHtml is more permissive than renderMarkdown)', () => {
    // sanitizeHtml allows iframes for oEmbed content
    const result = sanitizeHtml(
      '<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>',
    )
    expect(result).toContain('<iframe')
  })

  it('strips data: attributes', () => {
    const result = sanitizeHtml('<p data-evil="bad">text</p>')
    expect(result).not.toContain('data-evil')
  })

  it('returns a safe string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
