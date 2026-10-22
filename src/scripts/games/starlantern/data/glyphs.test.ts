// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { woff2Cmap } from './woff2Cmap';

/** The starlantern folder: this file sits in its `data/`. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '..', '..', '..');
const FONT = join(SRC, '..', 'public', 'assets', 'fonts', 'cubic-11', 'Cubic_11.woff2');

/**
 * Every file the player's characters can come from, walked as data/terms.test.ts walks them: each `.ts` under `data/`,
 * `ui2/`, `engine/`, `render/`, `ui/` and `audio/` that is not a test, the game's pages `src/pages/games/starlantern*.astro`,
 * and the game's stylesheet (its `content:` strings).
 */
function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push({ file: relative(ROOT, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') });
    }
  };
  for (const top of ['data', 'ui2', 'engine', 'render', 'ui', 'audio']) walk(join(ROOT, top));
  const pages = join(SRC, 'pages', 'games');
  for (const name of readdirSync(pages)) {
    if (/^starlantern.*\.astro$/.test(name)) out.push({ file: `pages/games/${name}`, text: readFileSync(join(pages, name), 'utf8') });
  }
  out.push({ file: 'styles/_starlantern-ui.scss', text: readFileSync(join(SRC, 'styles', '_starlantern-ui.scss'), 'utf8') });
  return out;
}

const COMMENT = /\/\*[\s\S]*?\*\/|(?<![:'"\\])\/\/[^\n]*/g;

/**
 * Each character above U+007E in `text` with its line: escapes decoded first (`\uXXXX` and `\u{…}`; in a stylesheet also
 * CSS's `\XXXX`), then comments dropped (their line breaks kept, so the lines still count true).
 */
function charsOf(file: string, text: string): { ch: string; line: number }[] {
  let t = text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
  if (file.endsWith('.scss')) t = t.replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
  t = t.replace(COMMENT, (c) => c.replace(/[^\n]/g, ''));
  const out: { ch: string; line: number }[] = [];
  let line = 1;
  for (const ch of t) {
    if (ch === '\n') line++;
    else if (ch.codePointAt(0)! > 0x7e) out.push({ ch, line });
  }
  return out;
}

const hex = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

describe('glyphs (legibility Task 1)', () => {
  it('finds a character written as an escape, and skips comments', () => {
    expect(charsOf('ui2/x.ts', "const a = '\\u25B6';").map((c) => hex(c.ch))).toEqual(['U+25B6']);
    expect(charsOf('ui2/x.ts', "const a = '\\u{1F600}';").map((c) => hex(c.ch))).toEqual(['U+1F600']);
    expect(charsOf('styles/x.scss', ".a::before { content: '\\25B8'; }").map((c) => hex(c.ch))).toEqual(['U+25B8']);
    expect(charsOf('ui2/x.ts', '// ▶ a note\n/* ◀ */ const b = 1;\nconst c = "▾";')).toEqual([{ ch: '▾', line: 3 }]);
    // A URL's `//` is not a comment.
    expect(charsOf('ui2/x.ts', "const u = 'https://x/▸';").map((c) => c.ch)).toEqual(['▸']);
  });

  it('every character the player can see is in Cubic 11', () => {
    const cmap = woff2Cmap(new Uint8Array(readFileSync(FONT)), (b) => brotliDecompressSync(b));
    const texts = sources();
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.map((t) => t.file)).toContain('pages/games/starlantern.astro');
    const missing = texts.flatMap(({ file, text }) =>
      charsOf(file, text).filter(({ ch }) => !cmap.has(ch.codePointAt(0)!)).map(({ ch, line }) => `${ch} ${hex(ch)} ${file}:${line}`));
    expect(missing).toEqual([]);
  });
});
