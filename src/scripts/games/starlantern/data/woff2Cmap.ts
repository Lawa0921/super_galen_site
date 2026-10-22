/**
 * The code points a WOFF2 font maps to a glyph (legibility Task 1): only the glyphs test reads it, to hold every character
 * the game shows to what Cubic 11 can draw. `brotliDecompress` is handed in (Node's zlib in the test), so this file needs no
 * Node module of its own.
 *
 * WOFF2 (W3C, section 4–5): a 48-byte header, a table directory, then one brotli stream holding every table in directory
 * order, back to back with no padding. The cmap: subtable (3,10) format 12 when there is one, else (3,1) format 4.
 */

/** The WOFF2 known-tag table: a directory entry's flags name its tag by index, 63 meaning the tag follows in 4 bytes. */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];
const HEADER = 48;

export function woff2Cmap(bytes: Uint8Array, brotliDecompress: (b: Uint8Array) => Uint8Array): Set<number> {
  if (bytes.length < HEADER || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2') throw new Error('not a WOFF2 font');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(12);
  const compressed = view.getUint32(20);
  let at = HEADER;
  /** UIntBase128: up to five bytes, seven bits each, high bit set on all but the last; no leading zero byte. */
  const base128 = (): number => {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const b = bytes[at++];
      if (i === 0 && b === 0x80) throw new Error('WOFF2: bad UIntBase128');
      n = n * 128 + (b & 0x7f);
      if (!(b & 0x80)) return n;
    }
    throw new Error('WOFF2: UIntBase128 too long');
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = bytes[at++];
    const tag = (flags & 0x3f) === 63 ? String.fromCharCode(...bytes.subarray(at, (at += 4))) : KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const orig = base128();
    // glyf and loca are transformed at version 0; any other table only at a version other than 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : orig });
  }
  const data = brotliDecompress(bytes.subarray(at, at + compressed));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === 'cmap') return readCmap(new DataView(data.buffer, data.byteOffset + offset, t.length));
    offset += t.length;
  }
  throw new Error('WOFF2: no cmap table');
}

function readCmap(v: DataView): Set<number> {
  const subtables = new Map<string, number>();
  for (let i = 0, n = v.getUint16(2); i < n; i++) {
    const rec = 4 + i * 8;
    subtables.set(`${v.getUint16(rec)},${v.getUint16(rec + 2)}`, v.getUint32(rec + 4));
  }
  const out = new Set<number>();
  const full = subtables.get('3,10');
  if (full !== undefined && v.getUint16(full) === 12) {
    for (let g = 0, n = v.getUint32(full + 12); g < n; g++) {
      const rec = full + 16 + g * 12;
      const start = v.getUint32(rec), end = v.getUint32(rec + 4), glyph = v.getUint32(rec + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.add(c);
    }
    return out;
  }
  const bmp = subtables.get('3,1');
  if (bmp === undefined || v.getUint16(bmp) !== 4) throw new Error('WOFF2: no (3,10) format 12 or (3,1) format 4 cmap');
  const segs = v.getUint16(bmp + 6) / 2;
  const ends = bmp + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  for (let s = 0; s < segs; s++) {
    const start = v.getUint16(starts + s * 2), end = v.getUint16(ends + s * 2);
    const delta = v.getUint16(deltas + s * 2), rangeAt = ranges + s * 2, range = v.getUint16(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        glyph = v.getUint16(rangeAt + range + (c - start) * 2);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
  return out;
}
