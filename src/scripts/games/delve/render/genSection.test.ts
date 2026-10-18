// genSection.test.ts — 生成畫面的地層剖面：階段推進、取樣、揭露
import { describe, it, expect } from 'vitest';
import { GEN_PHASES, genPhaseOf, sampleSection, revealStep, revealThreshold, SECTION_COLORS } from './genSection';
import { generateWorldSteps, GEN_STAGE_COUNT } from '../engine/worldgen';
import { World } from '../engine/world';
import { T } from '../engine/tiles';
import { LIQ } from '../engine/liquidKind';
import { buildMapLut } from './mapModel';
import { PALETTE } from './pixel';

const SMALL = { width: 300, height: 160 };
const PAL = new Set(PALETTE.map((c) => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0));

describe('genPhaseOf：生成器實際的段名 → 六個大階段', () => {
  it('依生成器真正的順序單調推進，六個階段都會出現', () => {
    const it = generateWorldSteps('phases', SMALL);
    const seen: number[] = [];
    let p = 0;
    for (;;) {
      const r = it.next();
      if (r.done) break;
      const q = genPhaseOf(r.value, p);
      expect(q).toBeGreaterThanOrEqual(p);
      p = q;
      seen.push(p);
    }
    expect(seen.length).toBe(GEN_STAGE_COUNT);
    expect([...new Set(seen)]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(GEN_PHASES.map((x) => x.key)).toEqual(['terrain', 'caves', 'ores', 'dungeon', 'decor', 'liquids']);
  });
  it('不認得的段名沿用目前的階段（不會倒退）', () => {
    expect(genPhaseOf('不認得', 3)).toBe(3);
    expect(genPhaseOf('Shinies：礦脈群（', 4)).toBe(4);
    expect(genPhaseOf('caves:worms', 1)).toBe(1);
  });
});

describe('sampleSection', () => {
  const W = 120, H = 60, OW = 40, OH = 20;
  const blank = (): World => { const w = new World(W, H); return w; };
  it('世界還是空的（還沒成形）→ 整張暗色抖動', () => {
    const out = new Uint32Array(OW * OH);
    sampleSection(blank(), OW, OH, out);
    for (const c of out) expect([SECTION_COLORS.void, SECTION_COLORS.voidDot]).toContain(c);
  });
  it('地表以上是天空、以下是土 / 石；地下的空洞是洞穴色；礦與熔岩看得到；全部是色票色', () => {
    const w = blank();
    for (let y = 30; y < H; y++) for (let x = 0; x < W; x++) w.fg[w.idx(x, y)] = y < 36 ? T.DIRT : T.STONE;
    for (let y = 42; y < 51; y++) for (let x = 30; x < 60; x++) w.fg[w.idx(x, y)] = T.AIR; // 洞穴
    for (let y = 45; y < 48; y++) for (let x = 90; x < 93; x++) w.fg[w.idx(x, y)] = T.GOLD_ORE;
    for (let y = 54; y < 60; y++) for (let x = 0; x < 15; x++) { w.fg[w.idx(x, y)] = T.AIR; w.setLiquid(x, y, 255, LIQ.LAVA); }
    const out = new Uint32Array(OW * OH), lut = buildMapLut();
    sampleSection(w, OW, OH, out, lut);
    const at = (tx: number, ty: number): number => out[Math.floor(ty / (H / OH)) * OW + Math.floor(tx / (W / OW))];
    expect([SECTION_COLORS.skyHi, SECTION_COLORS.skyLo]).toContain(at(60, 3));
    expect([lut.fg[T.STONE], lut.fgDark[T.STONE]]).toContain(at(100, 57 - 3));
    expect(at(45, 46)).toBe(SECTION_COLORS.cave);
    expect(at(91, 46)).toBe(lut.fg[T.GOLD_ORE]);
    expect(at(6, 57)).toBe(lut.liquid[LIQ.LAVA]);
    for (const c of out) expect(PAL.has(c)).toBe(true);
  });
  it('取樣只看世界、可重現（同一個世界 → 同一張圖）', () => {
    const it = generateWorldSteps('section', SMALL);
    let r = it.next();
    while (!r.done) r = it.next();
    const a = new Uint32Array(OW * OH), b = new Uint32Array(OW * OH);
    sampleSection(r.value.world, OW, OH, a);
    sampleSection(r.value.world, OW, OH, b);
    expect(b).toEqual(a);
    // 生成完的世界：有天空、有地層、沒有「未成形」
    expect(a.includes(SECTION_COLORS.void)).toBe(false);
    expect(a.includes(SECTION_COLORS.skyHi) || a.includes(SECTION_COLORS.skyLo)).toBe(true);
  });
});

describe('revealStep：新像素由上往下抖動掃進來（每個像素從被改到的那刻起算）', () => {
  const w = 16, h = 16, n = w * h;
  const th = Float32Array.from({ length: n }, (_, i) => revealThreshold(i % w, Math.floor(i / w), h));
  it('剛改到還是舊圖、過了 ms 全是新圖；中間上面先換', () => {
    const shown = new Uint32Array(n).fill(1), target = new Uint32Array(n).fill(2), since = new Float64Array(n).fill(1000);
    expect(revealStep(shown, target, since, th, 1000, 200, 8)).toBe(true);
    expect(shown.every((v) => v === 1)).toBe(true);
    revealStep(shown, target, since, th, 1100, 200, 8);
    const rowNew = (y: number): number => shown.subarray(y * w, y * w + w).filter((v) => v === 2).length;
    expect(rowNew(0)).toBeGreaterThan(rowNew(h - 1));
    expect(revealStep(shown, target, since, th, 1200, 200, 8)).toBe(false);
    expect(shown.every((v) => v === 2)).toBe(true);
  });
  it('後來才改到的像素自己重新起算（前一批的動畫不會被打斷或重來）', () => {
    const shown = new Uint32Array(n).fill(1), target = new Uint32Array(n).fill(1), since = new Float64Array(n);
    for (let i = 0; i < n / 2; i++) { target[i] = 2; since[i] = 0; }
    revealStep(shown, target, since, th, 150, 200, 8);
    for (let i = n / 2; i < n; i++) { target[i] = 3; since[i] = 150; }
    revealStep(shown, target, since, th, 200, 200, 8);
    expect(shown.subarray(0, n / 2).every((v) => v === 2)).toBe(true); // 第一批照原本的時間播完
    expect(shown.subarray(n / 2).some((v) => v === 1)).toBe(true); // 第二批才剛開始
    revealStep(shown, target, since, th, 350, 200, 8);
    expect(shown.subarray(n / 2).every((v) => v === 3)).toBe(true);
  });
  it('門檻在 0..1', () => {
    for (const t of th) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(1); }
  });
});
