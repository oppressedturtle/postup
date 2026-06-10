import { describe, expect, it } from 'vitest';

import { themeNoFlashScript } from './theme-provider';

describe('themeNoFlashScript', () => {
  it('reads the persisted PostUp theme key', () => {
    expect(themeNoFlashScript).toContain('postup-theme');
  });

  it('falls back to the system colour-scheme preference', () => {
    expect(themeNoFlashScript).toContain('prefers-color-scheme: dark');
  });

  it('toggles the dark class on the document root', () => {
    expect(themeNoFlashScript).toContain(
      "document.documentElement.classList.toggle('dark'",
    );
  });
});
