/**
 * Markdown rendering and HTML sanitization utilities for PostUp.
 *
 * Pipeline: markdown string → unified (remark-parse) → remark-rehype →
 * rehype-sanitize (strict allowlist) → rehype-stringify → safe HTML string.
 *
 * The sanitization schema allows only a minimal subset of HTML elements that
 * are safe and appropriate for user-generated content (rich text, drop bodies,
 * hub rules). Script, style, iframe, form, and all event-handler attributes
 * are stripped by the sanitizer before any output is produced.
 *
 * `sanitizeHtml` provides a DOMPurify pass for raw HTML input paths (e.g.
 * oEmbed HTML that arrives pre-rendered rather than as markdown).
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import DOMPurify from "isomorphic-dompurify";
import type { Schema } from "hast-util-sanitize";

// ---------------------------------------------------------------------------
// Sanitization schema
// ---------------------------------------------------------------------------

/**
 * Strict allowlist derived from rehype-sanitize's defaultSchema but narrowed
 * to the elements PostUp actually needs. Everything not listed here is stripped.
 */
const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "strong",
    "em",
    "a",
    "img",
    "br",
    "hr",
  ],
  attributes: {
    // Only href on anchors; strip javascript: via protocol check
    a: ["href"],
    // Only src and alt on images (no width/height/style to prevent layout attacks)
    img: ["src", "alt"],
    // No attributes on any other element
    "*": [],
  },
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
};

// ---------------------------------------------------------------------------
// Unified processor (created once, shared across calls)
// ---------------------------------------------------------------------------

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Convert a raw Markdown string to sanitized HTML.
 *
 * Safe to call with untrusted user input — the rehype-sanitize pass enforces
 * the strict allowlist before any HTML reaches the caller.
 *
 * @param raw  Markdown text from user input (up to 40 000 chars for drop bodies)
 */
export async function renderMarkdown(raw: string): Promise<string> {
  const vfile = await processor.process(raw);
  return String(vfile);
}

/**
 * DOMPurify sanitization pass for raw HTML input.
 *
 * Used for oEmbed HTML fragments and any other pre-rendered HTML that must be
 * stored or re-emitted. Strips all disallowed tags and event attributes.
 *
 * @param html  Raw HTML string (potentially untrusted)
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "iframe",
      "blockquote",
      "a",
      "p",
      "br",
      "strong",
      "em",
      "code",
      "pre",
    ],
    ALLOWED_ATTR: ["src", "allow", "allowfullscreen", "href", "width", "height", "frameborder"],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
  });
}
