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
    const place = all.filter((r) => r.selector === '.slx-screen').flatMap((r) => decls(r.body).filter(([k]) => k === 'left' || k === 'top').map(([, v]) => v));
    for (const v of place) expect(v, v).toMatch(/100cq[wh]/);
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
