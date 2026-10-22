import { describe, expect, it } from 'vitest';
import { BUILD_DECOR_STYLES, BUILD_ICONS, BUILD_TILE_PAL, buildDecorBmp, buildIcon, buildTileBmp, buildWallBmp } from './buildArt';
import { Bmp, inPalette } from './pixel';
import { T, W } from '../engine/tiles';
import { npcFrames, npcLook, sleepHeadX } from './settleDraw';
import { NPC_KINDS } from '../engine/npcs';
import { DECOR_STYLES, decorStyle } from './autotile';

/** 每個像素不是全透明就是全不透明，而且顏色在色票裡 */
function clean(b: Bmp): boolean {
  for (const v of b.px) {
    const a = v >>> 24;
    if (a === 0) continue;
    if (a !== 255 || !inPalette(Bmp.unpack(v))) return false;
  }
  return true;
}
const opaque = (b: Bmp): number => b.px.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);

describe('build art', () => {
  it('new solid blocks have palette-only textures and a frame palette', () => {
    for (const id of [T.DARK_PLANKS, T.PALE_PLANKS, T.RED_BRICK, T.ROOF_RED, T.ROOF_SLATE, T.GLASS]) {
      for (let v = 0; v < 3; v++) { const b = buildTileBmp(id, v)!; expect(clean(b)).toBe(true); expect(opaque(b)).toBeGreaterThan(0); }
      expect(BUILD_TILE_PAL[id].length).toBeGreaterThanOrEqual(7);
    }
  });
  it('glass is mostly see-through (fully transparent pixels, never translucent)', () => {
    const b = buildTileBmp(T.GLASS, 0)!;
    expect(opaque(b)).toBeLessThan(256 / 3);
  });
  it('new walls are opaque palette textures', () => {
    for (const id of [W.DARK_PLANK_WALL, W.PALE_PLANK_WALL, W.STONE_BRICK_WALL, W.RED_BRICK_WALL, W.GLASS_WALL, W.PLASTER_WALL]) {
      const w = buildWallBmp(id, 1)!;
      expect(clean(w.b)).toBe(true);
      expect(opaque(w.b)).toBe(256);
    }
  });
  it('every new decor style is drawn, clean, and listed in DECOR_STYLES', () => {
    for (const [k, n] of Object.entries(BUILD_DECOR_STYLES)) {
      const id = Number(k);
      expect(DECOR_STYLES[id]).toBe(n);
      for (let s = 0; s < n; s++) { const b = buildDecorBmp(id, s)!; expect(clean(b)).toBe(true); expect(opaque(b)).toBeGreaterThan(8); }
    }
  });
  it('sofa / fireplace halves line up into one piece (right half continues the left)', () => {
    const l = buildDecorBmp(T.SOFA_L, 0)!, r = buildDecorBmp(T.SOFA_R, 0)!;
    let joined = 0;
    for (let y = 0; y < 16; y++) if (l.on(15, y) && r.on(0, y)) joined++;
    expect(joined).toBeGreaterThan(6);
  });
  it('fence connects to fences / walls on either side', () => {
    const n = (map: Record<string, number>) => (dx: number, dy: number): number => map[`${dx},${dy}`] ?? T.AIR;
    expect(decorStyle(T.FENCE, 0, 0, n({ '-1,0': T.FENCE, '1,0': T.FENCE }))).toBe(3);
    expect(decorStyle(T.FENCE, 0, 0, n({ '-1,0': T.STONE }))).toBe(1);
    expect(decorStyle(T.FENCE, 0, 0, n({}))).toBe(0);
  });
  it('vanity table: drawn as a placed decor tile and has an icon', () => {
    expect(BUILD_DECOR_STYLES[T.VANITY_TABLE]).toBe(1);
    expect(BUILD_ICONS).toContain('vanity_table');
    const b = buildDecorBmp(T.VANITY_TABLE, 0)!;
    expect(clean(b)).toBe(true);
    expect(opaque(b)).toBeGreaterThan(60);
  });
  it('every new item has a clean icon', () => {
    for (const it of BUILD_ICONS) { const b = buildIcon(it)!; expect(b).not.toBeNull(); expect(clean(b)).toBe(true); expect(opaque(b)).toBeGreaterThan(10); }
  });
});

describe('settler sprites', () => {
  it('each settler uses the player doll pipeline with their own look, clean frames', () => {
    const keys = new Set<string>();
    for (const k of NPC_KINDS) {
      const l = npcLook(k);
      keys.add(JSON.stringify(l));
      const f = npcFrames(k);
      expect(f.idle.length).toBeGreaterThan(1);
      expect(f.walk.length).toBeGreaterThan(1);
      for (const b of [...f.idle, ...f.walk, f.sleep, f.portrait]) expect(clean(b)).toBe(true);
      expect(opaque(f.sleep)).toBeGreaterThan(100);
      // 睡覺的頭放在床（兩格 32px）內：不會伸出床外
      const x = sleepHeadX(0, f.sleep.w);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x + f.sleep.w).toBeLessThanOrEqual(31);
    }
    expect(keys.size).toBe(NPC_KINDS.length);
  });
});
