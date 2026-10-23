// @vitest-environment node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

/**
 * The static guard of the legibility plan (2026-10-23) over the compiled stylesheet: what the CSS itself promises,
 * whatever page shows it. Task 2a: the stage scale.
 */
const SCSS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'styles', '_starlantern-ui.scss');
const css = sass.compile(SCSS, { logger: sass.Logger.silent }).css;

interface Rule { media: string | null; selector: string; body: string }

/** Every style rule of `text` with the conditions it sits in: its @media and @container heads, joined by " && ". */
function rules(text: string, media: string | null = null): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (depth > 0 && j < text.length) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const inner = text.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@container')) out.push(...rules(inner, media ? `${media} && ${head}` : head));
    else if (!head.startsWith('@')) out.push({ media, selector: head, body: inner });
    i = j;
  }
  return out;
}

/** The declarations of a rule body, as [property, value]. */
const decls = (body: string): [string, string][] =>
  body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; });

describe('the stylesheet (legibility Task 2a)', () => {
  it('the stage scale is whole device pixels', () => {
    const all = rules(css);
    // The stage is drawn by one transform: a scale by --slx-s, or (a touch phone held upright, Task 2b) turned first.
    const transforms = all.filter((r) => /(^|,)\s*\.slx-screen\s*(,|$)/.test(r.selector)).flatMap((r) => decls(r.body).filter(([k]) => k === 'transform').map(([, v]) => v));
    expect(transforms.length).toBeGreaterThan(0);
    for (const t of transforms) expect(t, t).toMatch(/^(scale\(var\(--slx-s\)\)|translateX\(calc\(360px \* var\(--slx-s\)\)\) rotate\(90deg\) scale\(var\(--slx-s\)\))$/);
    // Each --slx-s is a whole number of device pixels at the DPR its query picks (the middle of its resolution range).
    const scales = all.flatMap((r) => decls(r.body).filter(([k]) => k === '--slx-s').map(([, v]) => ({ media: r.media, s: Number(v) })));
    expect(scales.length).toBeGreaterThan(10);
    for (const { media, s } of scales) {
      expect(Number.isFinite(s), `${media}: ${s}`).toBe(true);
      const lo = media?.match(/min-resolution:\s*([\d.]+)dppx/), hi = media?.match(/max-resolution:\s*([\d.]+)dppx/);
      const d = lo && hi ? (Number(lo[1]) + Number(hi[1])) / 2 : 1;
      expect(Math.abs(s * d - Math.round(s * d)), `${media}: s ${s} at d ${d}`).toBeLessThan(1e-4);
      // Never under 1x: where no crisp scale of 1 or more fits, the stage stays at 1x (readable over crisp, T2a ruling).
      expect(s, `${media}: s ${s} under 1`).toBeGreaterThanOrEqual(1);
    }
    // The scale is chosen on the page's own box (a size container as tall as 100dvh, so iPhone Safari's moving toolbar
    // never makes it scroll), and the corner is placed on the same box (cqw, cqh).
    const body = all.find((r) => r.selector === '.slx-body' && decls(r.body).some(([k]) => k === 'container-type'))!;
    expect(decls(body.body)).toEqual(expect.arrayContaining([['container-name', 'slx-view'], ['container-type', 'size'], ['height', '100dvh']]));
    for (const { media } of scales.filter((x) => x.media)) expect(media, 'a size condition on the page box, not the window').toMatch(/@container slx-view [^&]*\(min-width: [\d.]+px\) and \(min-height: [\d.]+px\)/);
    for (const { media } of scales.filter((x) => x.media)) expect(media).not.toMatch(/@media[^&]*(min|max)-(width|height)/);
    // The last left and top of each rule win (the lines before them are fallbacks for older browsers: vw/dvh, no round()).
    const place = all.filter((r) => r.selector === '.slx-screen').flatMap((r) => ['left', 'top'].flatMap((k) => decls(r.body).filter(([p]) => p === k).map(([, v]) => v).slice(-1)));
    expect(place.length).toBeGreaterThanOrEqual(4);
    for (const v of place) expect(v, v).toMatch(/^max\(\d+px, round\(down, .*100cq[wh]/);
    // Ratios up to 4 (phones at 3.5 and 4 too); no --slx-d left over.
    const mids = new Set(scales.map(({ media }) => { const lo = media?.match(/min-resolution:\s*([\d.]+)dppx/), hi = media?.match(/max-resolution:\s*([\d.]+)dppx/); return lo && hi ? (Number(lo[1]) + Number(hi[1])) / 2 : 1; }));
    for (const d of [1.25, 1.5, 2, 3, 3.5, 4]) expect(mids.has(d), `d ${d}`).toBe(true);
    expect(css).not.toContain('--slx-d');
    // A battle's jolt moves what is inside the stage, in stage px along the stage's own axes, never the stage itself.
    expect(all.some((r) => /^\.slx-shake-[sl]$/.test(r.selector) && /animation/.test(r.body))).toBe(false);
    expect(all.some((r) => /^\.slx-shake-s > \*$/.test(r.selector) && /animation:\s*slx-shake-s/.test(r.body))).toBe(true);
    // No fractional scale() anywhere (grayscale( is not a scale).
    expect(css).not.toMatch(/(?<![\w-])scale\(\s*\d*\.\d/);
    // The origin snaps to whole device pixels: the CSS round() reaches the browser as written.
    expect(css).toContain('round(down,');
  });
});

// ── Task 3: the 12/24 type scale ─────────────────────────────────────────────────────────────────────────────────────

/** Every rule of the compiled CSS, innermost blocks only (keyframe steps included), as [selector, body]. */
const flat = (text: string): [string, string][] => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

/** What keeps a rule body off the type scale: font sizes of 12 or 24px only, an even leading of 14px or more (24 or more at 24px), whole letter spacing, normal weight, no !important. */
function faults(body: string): string[] {
  const out: string[] = [];
  const ds = decls(body);
  let size: string | null = null, lh: string | null = null;
  for (const [k, v] of ds) {
    if (/!important/.test(v)) out.push(`${k}: ${v} (!important)`);
    if (k === 'font-size') size = v;
    if (k === 'line-height') lh = v;
    if (k === 'font') { const m = v.match(/(?:^|\s)([\d.]+[a-z%]+)(?:\/([\d.]+[a-z%]*|normal))?\s/); if (m) { size = m[1]; if (m[2]) lh = m[2]; } }
    if (k === 'letter-spacing' && !/^(0|0px|[1-9]\d*px|normal)$/.test(v)) out.push(`letter-spacing: ${v}`);
    if (k === 'font-weight' && !/^(normal|400)$/.test(v)) out.push(`font-weight: ${v}`);
    if (k === 'font' && /\b(bold|bolder|[5-9]00)\b/.test(v)) out.push(`font: ${v} (weight)`);
  }
  if (size !== null && size !== '12px' && size !== '24px' && size !== 'inherit') out.push(`font-size: ${size}`);
  if (lh !== null && lh !== 'inherit') {
    const px = /^\d+px$/.test(lh) ? parseInt(lh, 10) : NaN;
    // 14px or more (coordinator ruling 2026-10-23): Cubic 11 draws an 11px glyph in a 12px cell, so 12px lines touch.
    if (!(px >= 14 && px % 2 === 0)) out.push(`line-height: ${lh}`);
    else if (size === '24px' && px < 24) out.push(`line-height: ${lh} at 24px`);
  }
  return out;
}

describe('the type scale (legibility Task 3)', () => {
  it('every declaration keeps the 12/24 type scale', () => {
    // Every rule, no list of later tasks left (legibility Task 7).
    const bad = flat(css).flatMap(([sel, body]) => faults(body).map((f) => `${sel} { ${f} }`));
    expect(bad).toEqual([]);
  });
});
