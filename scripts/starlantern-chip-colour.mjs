#!/usr/bin/env node
/**
 * 星燈迷宮: the search for a new ailment chip colour (roster plan B9, the coordinator's ruling on 遺忘, 2026-10-26).
 *
 *   node scripts/starlantern-chip-colour.mjs [ailment-key-to-replace=forget]
 *
 * Reads every chip colour from src/styles/_starlantern-ui.scss (`$slx-ailment`, `$slx-mech`, the window `$slx-win`) and
 * the affix ink from render/ailmentStyle.ts, leaves out the chip being chosen, and walks every sRGB colour on a 2-step
 * grid (deterministic, no randomness). A candidate must:
 *   - be at least CIEDE2000 15 from every other chip and the affix ink (ui2/rarity.test.ts CHIP_DE);
 *   - read on the window (WCAG contrast ≥ 4.5) and sit more than 40 apart in RGB from every ailment (rarity.test.ts);
 *   - sit inside the CIELAB lightness and chroma range of the other ailment chips, and be no paler than the art itself
 *     (L* at most the art's + 5, C* at least the art's − 5), so the word is not washed out beside the others;
 *   - stay in the cool green-teal family (CIELAB hue 150°–200°, the art's side of green);
 *   - keep a margin: CIEDE2000 at least CHIP_DE + MARGIN from its nearest chip, so a later chip cannot tip it over.
 * It prints the ten candidates nearest to the art's colour (#8FD9B6, the generated icon's) by CIEDE2000, best first,
 * each with its three nearest chips. The first one is the pick.
 */
import { readFileSync } from 'node:fs';

const ART = '8fd9b6';
const CHIP_DE = 15;
const MARGIN = 0.5;
const key = process.argv[2] ?? 'forget';
const scss = readFileSync('src/styles/_starlantern-ui.scss', 'utf8');
const map = (name) => Object.fromEntries([...(new RegExp(`\\$${name}:\\s*\\(([^)]*)\\)`).exec(scss)?.[1] ?? '').matchAll(/([a-z]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const ailments = map('slx-ailment');
delete ailments[key];
const mech = map('slx-mech');
const win = /\$slx-win: rgb\((\d+), (\d+), (\d+)\);/.exec(scss).slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
const affix = /AFFIX_FILL = 0x([0-9a-f]{6})/.exec(readFileSync('src/scripts/games/starlantern/render/ailmentStyle.ts', 'utf8'))[1];
const chips = [...Object.entries(ailments).map(([k, h]) => [`ailment ${k}`, h]), ...Object.entries(mech).map(([k, h]) => [`mech ${k}`, h]), ['affix ink', affix]];

const linear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
function lab(h) {
  const [r, g, b] = rgb(h).map(linear);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
  const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** CIEDE2000 as ui2/rarity.test.ts computes it. */
function de(p, q) {
  const [L1, a1, b1] = lab(p), [L2, a2, b2] = lab(q);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const hue = (b, a) => (Math.atan2(b, a) * deg + 360) % 360;
  const h1 = hue(b1, a1p), h2 = hue(b2, a2p);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cbp = (C1 + C2) / 2;
  const hb = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTh * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const lum = (h) => { const [r, g, b] = rgb(h).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const lch = (h) => { const [L, a, b] = lab(h); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };

const others = Object.values(ailments).map(lch);
const Lr = [Math.min(...others.map((x) => x[0])), Math.max(...others.map((x) => x[0]))];
const Cr = [Math.min(...others.map((x) => x[1])), Math.max(...others.map((x) => x[1]))];
const [artL, artC] = lch(ART);
const hex = (r, g, b) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const out = [];
for (let r = 0; r < 256; r += 2) for (let g = 0; g < 256; g += 2) for (let b = 0; b < 256; b += 2) {
  const h = hex(r, g, b);
  const [L, C, H] = lch(h);
  if (H < 150 || H > 200 || L < Lr[0] || L > Lr[1] || C < Cr[0] || C > Cr[1]) continue;
  if (L > artL + 5 || C < artC - 5) continue;
  if (contrast(h, win) < 4.5) continue;
  if (Object.values(ailments).some((a) => Math.hypot(...rgb(h).map((v, i) => v - rgb(a)[i])) <= 40)) continue;
  const near = chips.map(([k, c]) => [k, de(h, c)]).sort((x, y) => x[1] - y[1]);
  if (near[0][1] < CHIP_DE + MARGIN) continue;
  out.push({ h, art: de(h, ART), near: near.slice(0, 3), L, C, H });
}
out.sort((x, y) => x.art - y.art || (x.h < y.h ? -1 : 1));
console.log(`art #${ART}: L* ${artL.toFixed(1)} C* ${artC.toFixed(1)}; others: L* ${Lr.map((v) => v.toFixed(1)).join('-')}, C* ${Cr.map((v) => v.toFixed(1)).join('-')}; ${out.length} candidates`);
for (const c of out.slice(0, 10)) {
  console.log(`#${c.h} ΔE to art ${c.art.toFixed(1)}  L*${c.L.toFixed(1)} C*${c.C.toFixed(1)} h${c.H.toFixed(0)}  nearest: ${c.near.map(([k, d]) => `${k} ${d.toFixed(1)}`).join(', ')}`);
}
