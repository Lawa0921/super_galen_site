export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A session seed from the page's `?seed=` text: its whole 32-bit value (what mulberry32 uses anyway), so a fraction or a huge
 * number cannot become a game's forgeSalt that the save loader refuses. Missing, zero or non-numeric text gives `fallback`.
 */
export const seedFrom = (raw: string | null, fallback: number): number => (Number(raw) >>> 0) || (fallback >>> 0);

export const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
