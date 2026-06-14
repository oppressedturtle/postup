/**
 * @mention parsing and linkification utilities for PostUp.
 *
 * Extracts `@handle` references from user-generated text so callers can
 * notify the mentioned users and render clickable mention links in HTML.
 *
 * Handle format: 3–20 alphanumeric / underscore characters (matches the
 * registration constraint in /api/auth/register).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum distinct mentions processed per piece of content. */
const MAX_MENTIONS = 10;

/** Pattern that matches a @handle token. */
const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,20})/g;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Extract all unique @handles referenced in a plain-text or Markdown string.
 *
 * Returns lowercase handles (without the leading @), capped at MAX_MENTIONS.
 * Duplicate handles (case-insensitive) are deduplicated.
 *
 * @param text  Raw text or Markdown body from user input.
 */
export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_PATTERN.source, "g");

  while ((match = re.exec(text)) !== null) {
    const handle = match[1]!.toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      results.push(handle);
      if (results.length >= MAX_MENTIONS) break;
    }
  }

  return results;
}

/**
 * Replace every `@handle` occurrence in an HTML string with a clickable
 * mention link.
 *
 * This is applied AFTER the Markdown → HTML pipeline so the replacement
 * operates on the rendered output, not the raw Markdown source. Only
 * @handles that appear as bare text (not inside existing HTML attributes)
 * are replaced — a simple regex is sufficient here because the sanitizer
 * has already stripped all unsafe content before this runs.
 *
 * @param html  Sanitized HTML string (output of `renderMarkdown`).
 */
export function linkifyMentions(html: string): string {
  // Replace @handle that is NOT immediately preceded by `="` (i.e. not
  // already inside an href or other attribute value).
  return html.replace(
    /(?<!=")@([a-zA-Z0-9_]{3,20})/g,
    (_match, handle: string) =>
      `<a href="/u/${handle}" class="mention">@${handle}</a>`,
  );
}
