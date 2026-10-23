// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { woff2Cmap } from './woff2Cmap';

/** The game's one font, as the page loads it. */
const FONT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'public', 'assets', 'fonts', 'cubic-11', 'Cubic_11.woff2');
const brotli = (b: Uint8Array): Uint8Array => brotliDecompressSync(b);

describe('woff2Cmap (legibility Task 1)', () => {
  it("reads Cubic 11's cmap", () => {
    const cmap = woff2Cmap(new Uint8Array(readFileSync(FONT)), brotli);
    expect(cmap.size).toBe(10268);   // what fontTools' getBestCmap counts for this file
    for (const ch of ['星', 'A', '▲', '▼', '←', '→', '↓', '◆']) expect(cmap.has(ch.codePointAt(0)!), ch).toBe(true);
    for (const ch of ['▶', '◀', '▸', '▾']) expect(cmap.has(ch.codePointAt(0)!), ch).toBe(false);
  });

  it('rejects bytes that are not WOFF2', () => {
    const notWoff2 = new Uint8Array(readFileSync(FONT));
    notWoff2.set([0x77, 0x4f, 0x46, 0x46]);   // 'wOFF': WOFF 1, not 2
    expect(() => woff2Cmap(notWoff2, brotli)).toThrow(/WOFF2/);
    expect(() => woff2Cmap(new Uint8Array(8), brotli)).toThrow(/WOFF2/);
  });
});
