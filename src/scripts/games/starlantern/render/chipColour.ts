/**
 * The search behind an ailment chip's colour (roster plan B9, the coordinator's ruling on forget, 2026-10-26): pure, so
 * render/chipColour.test.ts can hold the pick and scripts/starlantern-chip-colour.mjs can print it. Nothing in the game
 * imports this. Erasable TypeScript only (the script runs it under Node's type stripping).
 *
 * A candidate, on a `step` grid over sRGB (deterministic, no randomness), must:
 *   - be at least CIEDE2000 `CHIP_DE + MARGIN` from every chip and the affix ink (ui2/rarity.test.ts CHIP_DE);
 *   - read on the window (WCAG contrast at least 4.5) and sit more than 40 apart in RGB from every ailment;
 *   - sit inside the CIELAB lightness and chroma range of the other ailment chips, and be no paler than the art
 *     (L* at most the art's + 5, C* at least the art's - 5);
 *   - stay in the cool green-teal family: CIELAB hue from HUE[0] to HUE[1] degrees, both bounds included.
 * Candidates are ranked by CIEDE2000 to the art's colour, then by hex; the first is the pick.
 */
export const CHIP_DE = 15;
export const MARGIN = 0.5;
/** The hue window, in CIELAB degrees, inclusive at both ends. */
export const HUE = [150, 200] as const;

const linear = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const rgbOf = (h: string): number[] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

export function labOf(h: string): [number, number, number] {
  const [r, g, b] = rgbOf(h).map(linear);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
  const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIEDE2000 (Sharma, Wu and Dalal 2005), kL = kC = kH = 1, as ui2/rarity.test.ts computes it. */
export function deltaE2000(p: string, q: string): number {
  const [L1, a1, b1] = labOf(p), [L2, a2, b2] = labOf(q);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (Math.atan2(b, a) * deg + 360) % 360;
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

const luminance = (h: string): number => { const [r, g, b] = rgbOf(h).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string): number => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** CIELAB lightness, chroma and hue (degrees). */
export const lchOf = (h: string): [number, number, number] => { const [L, a, b] = labOf(h); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };

/** The chip colours a search is held against, as hex without `#`. */
export interface ChipSet { ailments: Record<string, string>; mech: Record<string, string>; affix: string; win: string; art: string }
export interface Candidate { hex: string; art: number; near: [string, number][]; L: number; C: number; H: number }

/** Every candidate for a new ailment chip against `set`, best first (see the module's words). */
export function chipCandidates(set: ChipSet, step = 2): Candidate[] {
  const chips: [string, string][] = [...Object.entries(set.ailments).map(([k, h]) => [`ailment ${k}`, h] as [string, string]),
    ...Object.entries(set.mech).map(([k, h]) => [`mech ${k}`, h] as [string, string]), ['affix ink', set.affix]];
  const others = Object.values(set.ailments).map(lchOf);
  const Lr = [Math.min(...others.map((x) => x[0])), Math.max(...others.map((x) => x[0]))];
  const Cr = [Math.min(...others.map((x) => x[1])), Math.max(...others.map((x) => x[1]))];
  const [artL, artC] = lchOf(set.art);
  const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const out: Candidate[] = [];
  for (let r = 0; r < 256; r += step) for (let g = 0; g < 256; g += step) for (let b = 0; b < 256; b += step) {
    const h = hex(r, g, b);
    const [L, C, H] = lchOf(h);
    if (H < HUE[0] || H > HUE[1] || L < Lr[0] || L > Lr[1] || C < Cr[0] || C > Cr[1]) continue;
    if (L > artL + 5 || C < artC - 5) continue;
    if (contrast(h, set.win) < 4.5) continue;
    if (Object.values(set.ailments).some((a) => Math.hypot(...rgbOf(h).map((v, i) => v - rgbOf(a)[i])) <= 40)) continue;
    const near = chips.map(([k, c]): [string, number] => [k, deltaE2000(h, c)]).sort((x, y) => x[1] - y[1]);
    if (near[0][1] < CHIP_DE + MARGIN) continue;
    out.push({ hex: h, art: deltaE2000(h, set.art), near: near.slice(0, 3), L, C, H });
  }
  return out.sort((x, y) => x.art - y.art || (x.hex < y.hex ? -1 : 1));
}

/**
 * The chip set from the stylesheet's text and the affix ink's (render/ailmentStyle.ts AFFIX_FILL), the chip `key` left
 * out (the one being chosen).
 */
export function chipSetOf(scss: string, affix: number, key: string, art: string): ChipSet {
  const map = (name: string): Record<string, string> => Object.fromEntries([...(new RegExp(`\\$${name}:\\s*\\(([^)]*)\\)`).exec(scss)?.[1] ?? '')
    .matchAll(/([a-z]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const ailments = map('slx-ailment');
  delete ailments[key];
  const win = (/\$slx-win: rgb\((\d+), (\d+), (\d+)\);/.exec(scss) ?? []).slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  return { ailments, mech: map('slx-mech'), affix: affix.toString(16).padStart(6, '0'), win, art };
}
