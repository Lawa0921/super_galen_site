// avatarRegression.test.ts — 單機玩家畫面回歸（co-op M-C2 Task 2）：同一個種子、同一串輸入（走、跳、揮劍 / 大劍 / 弓 / 法杖 / 矛 / 飛刀、
// 挖、拿火把、爬繩 / 繩頂 / 翻邊、受傷、釣魚拋竿 / 上鉤、游泳、划船）一幀一幀畫本地玩家，
// 錄下 playerDraw / heldDraws / rimDraw / 竿尖 / 光源，以及畫玩家那幾步（drawPlayer → drawBoats → drawFishing → drawPlayerRim）
// 對畫布的每一個呼叫（drawImage 用「圖的內容」雜湊，不看是哪個快取物件）。
// fixture 在重構前的程式上錄好（UPDATE_AVATAR_FIXTURE=1 重錄）；重構後必須逐幀相同。
import { describe, it, expect, vi, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { LIQ } from '../engine/world';
import { FIXED_DT } from '../engine/constants';
import type { ItemId } from '../engine/items';
import { FW, FH } from './sprites';
import { SHEET } from './avatarArt';

const FIXTURE = resolve(process.cwd(), 'src/scripts/games/delve/render/__fixtures__/avatarSolo.json');

// ── 假畫布：記下每張圖的內容（putImageData / 畫進來的東西），主畫布記下所有呼叫 ──
function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function fnvBytes(b: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(36) + ':' + b.length;
}
let stream: unknown[][] | null = null;
class FakeCanvas {
  width = 300; height = 150; style = {};
  ops: string[] = [];
  puts = new Map<string, string>();
  ctx = makeCtx(this);
  main = false;
  getContext(): unknown { return this.ctx; }
  toDataURL(): string { return ''; }
  sig(): string { return `${this.width}x${this.height}#${fnv(this.ops.join('|')).toString(36)}`; }
}
function srcSig(src: unknown, a: number[]): string {
  if (!(src instanceof FakeCanvas)) return 'ext';
  // 影格表：九個參數的 drawImage 取一格 → 用那一格 putImageData 的內容
  if (a.length === 8) { const p = src.puts.get(`${a[0]},${a[1]}`); if (p) return p; }
  return src.sig();
}
function makeCtx(owner: FakeCanvas): CanvasRenderingContext2D {
  const st: Record<string | symbol, unknown> = { fillStyle: '#000', globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, globalAlpha: 1 };
  const rec = (e: unknown[]): void => { if (owner.main) { if (stream) stream.push(e); } else owner.ops.push(JSON.stringify(e)); };
  const fns: Record<string, (...a: never[]) => unknown> = {
    putImageData: (img: ImageData, x: number, y: number) => { const h = fnvBytes(img.data); owner.puts.set(`${x},${y}`, h); owner.ops.push(`p${x},${y}:${h}`); },
    getImageData: (_x: number, _y: number, w: number, h: number) => new ImageData(Math.max(1, w), Math.max(1, h)),
    createImageData: (w: number, h: number) => new ImageData(Math.max(1, w), Math.max(1, h)),
    drawImage: (src: unknown, ...a: number[]) => rec(['d', srcSig(src, a), ...a]),
    fillRect: (...a: number[]) => rec(['f', st.fillStyle, ...a]),
    clearRect: (...a: number[]) => rec(['c', ...a]),
    translate: (x: number, y: number) => rec(['t', x, y]),
    scale: (x: number, y: number) => rec(['s', x, y]),
    save: () => rec(['(']),
    restore: () => rec([')']),
    setTransform: (...a: number[]) => rec(['T', ...a]),
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
  };
  return new Proxy(st, {
    get(t, k) { if (typeof k === 'string' && k in fns) return fns[k]; if (k in t) return t[k]; if (k === 'canvas') return owner; return () => undefined; },
    set(t, k, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

// ── 場景：釣魚池（x 46..70，深 6 格）+ 左邊高台（x 31..33，台面第 52 列）+ 繩子（x 35，第 52..59 列）──
function scene(): DelveGame {
  const g = new DelveGame({ seed: 'avatar-fixture', width: 160, height: 100, peaceful: true });
  g.levels.locked = true;
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 0; y < w.height; y++) { w.setFg(29, y, T.STONE); w.setFg(100, y, T.STONE); }
  for (let y = 60; y < 66; y++) for (let x = 46; x <= 70; x++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, LIQ.WATER); }
  for (let y = 52; y < 60; y++) { for (let x = 31; x <= 33; x++) w.setFg(x, y, T.STONE); w.setFg(35, y, T.ROPE); }
  g.liquids.settle(200);
  g.teleport(40, 59);
  g.setDate({ season: 1, day: 2, hour: 12 });
  for (let i = 0; i < 12; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  if (!g.inventory.count(item)) g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}

interface Frame {
  anim: string; pd: unknown; held: unknown[]; rim: unknown; tip: unknown; torches: unknown; cool: unknown; draw: string;
}
interface R {
  clock: number; playerAnim: string; playerDraw: unknown; heldDraws: { c: FakeCanvas; x: number; y: number }[];
  rimDraw: { cx: number; bottom: number; facing: number; fi: number; x: number; y: number; canvas: FakeCanvas } | null;
  rodTip: unknown; torchesSeen: { x: number; y: number }[]; coolSeen: { x: number; y: number }[];
  viewBox: { x: number; y: number; w: number; h: number };
  lightAt: (x: number, y: number) => number;
  onEvent: (e: unknown) => void;
  drawPlayer(ctx: CanvasRenderingContext2D, dt: number): void;
  drawBoats(ctx: CanvasRenderingContext2D): void;
  drawFishing(ctx: CanvasRenderingContext2D): void;
  drawPlayerRim(ctx: CanvasRenderingContext2D): void;
}

/** 跑整串輸入，回傳每幀的紀錄與「出現過的狀態」（確認腳本真的走到每個姿勢） */
async function record(): Promise<{ frames: Frame[]; seen: Set<string> }> {
  const orig = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: ElementCreationOptions) =>
    (tag === 'canvas' ? new FakeCanvas() : orig(tag, o))) as typeof document.createElement);
  let rnd = 1;
  const rspy = vi.spyOn(Math, 'random').mockImplementation(() => { rnd = (Math.imul(rnd, 48271) >>> 0) % 0x7fffffff; return rnd / 0x7fffffff; });
  try {
    const { Renderer } = await import('./renderer');
    const g = scene();
    const canvas = new FakeCanvas();
    canvas.main = true;
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, g, { direct: true }) as unknown as R;
    const ctx = canvas.ctx;
    r.viewBox = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
    r.lightAt = () => 0;
    const frames: Frame[] = [];
    const seen = new Set<string>();
    const inp = g.input(g.localPid);
    const frame = (): void => {
      g.step(FIXED_DT);
      for (const e of g.drainEvents()) r.onEvent(e);
      r.clock += FIXED_DT;
      r.torchesSeen.length = 0; r.coolSeen.length = 0;
      const s: unknown[][] = [];
      stream = s;
      r.drawPlayer(ctx, FIXED_DT);
      r.drawBoats(ctx);
      r.drawFishing(ctx);
      r.drawPlayerRim(ctx);
      stream = null;
      const st = g.getState(), rim = r.rimDraw;
      seen.add(`anim:${r.playerAnim}`);
      if (st.attack) seen.add(`atk:${st.attack.kind}`);
      if (st.mining) seen.add('mining');
      if (st.fishing) seen.add(`fish:${st.fishing.state}`);
      if (g.local.boating) seen.add('boat');
      if (st.player.mantle) seen.add('mantle');
      if (st.player.climbing) seen.add('climbing');
      if (rim && rim.fi >= SHEET.ropetop[0] && rim.fi < SHEET.ropetop[0] + SHEET.ropetop[1]) seen.add('ropetop');
      if (r.rodTip) seen.add('rodTip');
      if (r.torchesSeen.length) seen.add('torchLight');
      if (r.coolSeen.length) seen.add('coolLight');
      if (st.iframes > 0) seen.add('iframes');
      frames.push({
        anim: r.playerAnim,
        pd: r.playerDraw,
        held: r.heldDraws.map((q) => [q.c.sig(), q.x, q.y]),
        rim: rim ? { ...rim, canvas: rim.canvas.puts.get(`${rim.fi * FW},${FH * 2}`) ?? rim.canvas.sig() } : null,
        tip: r.rodTip,
        torches: [...r.torchesSeen],
        cool: [...r.coolSeen],
        draw: fnv(JSON.stringify(s)).toString(36) + ':' + s.length,
      });
    };
    const run = (n: number, each?: (i: number) => void): void => { for (let i = 0; i < n; i++) { each?.(i); frame(); } };
    const reset = (tx = 40): void => {
      inp.moveX = 0; inp.jump = false; inp.up = false; inp.mining = false; inp.use = false;
      g.teleport(tx, 59);
      run(12);
    };
    const aimRel = (dx: number, dy: number): void => { const t = g.playerTile(); g.setAim(t.x + dx, t.y + dy); };

    // 待機（眨眼）→ 拿火把待機 → 往左走 → 跳
    run(40);
    hold(g, 'torch', 5);
    run(20);
    run(16, () => { inp.moveX = -1; });
    inp.moveX = 0; run(6);
    run(8, () => { inp.jump = true; });
    inp.jump = false; run(40);
    // 各種武器：右邊、上方、左邊
    const weapons: [ItemId, number][] = [['wood_sword', 50], ['bone_greatsword', 40], ['wood_bow', 50], ['crystal_staff', 40], ['iron_spear', 40], ['throwing_knife', 30]];
    for (const [item, n] of weapons) {
      reset();
      if (item === 'wood_bow') g.give('wooden_arrow', 50);
      hold(g, item, item === 'throwing_knife' ? 20 : 1);
      run(10);
      aimRel(4, 0); inp.mining = true; run(n);
      aimRel(3, -4); run(Math.round(n / 2));
      aimRel(-4, -1); run(Math.round(n / 2));
      inp.mining = false; run(10);
    }
    // 拿著劍 / 弓走路（手上拿著的樣子）
    reset();
    hold(g, 'wood_sword'); run(14, () => { inp.moveX = 1; });
    hold(g, 'crystal_staff'); run(14, () => { inp.moveX = -1; });
    inp.moveX = 0;
    // 挖：右下、左邊；拿著鎬走路、跳
    reset();
    hold(g, 'copper_pickaxe');
    g.setAim(42, 60); inp.mining = true; run(80);
    inp.mining = false; g.setAim(38, 60); run(4); inp.mining = true; run(50);
    inp.mining = false; run(14, () => { inp.moveX = 1; });
    inp.moveX = 0; run(8, () => { inp.jump = true; }); inp.jump = false; run(30);
    // 爬繩（拿火把）→ 繩頂 → 往左翻上高台
    reset(35);
    hold(g, 'torch');
    run(150, () => { inp.up = true; });
    run(50, () => { inp.up = true; inp.moveX = -1; });
    inp.up = false; inp.moveX = 0; run(20);
    // 受傷（拿劍）：縮身 + 無敵閃爍
    reset();
    hold(g, 'wood_sword');
    g.hurtPlayer(3, g.player.x + 40);
    run(70);
    // 釣魚：拋竿 → 漂 → 上鉤 → 收竿
    reset();
    g.give('worm', 5);
    hold(g, 'wood_rod');
    g.setAim(54, 58);
    inp.use = true; run(1); inp.use = false;
    run(120);
    g.debugForceBite();
    run(30);
    inp.use = true; run(1); inp.use = false; run(20);
    // 游泳
    reset(50);
    run(50, () => { inp.moveX = 1; });
    inp.moveX = 0;
    // 站到水面上按「使用」上船 → 划 → 跳下船
    hold(g, 'boat');
    g.teleport(55, 59); g.setAim(55, 56);
    inp.use = true; run(1); inp.use = false;
    run(40, () => { inp.moveX = 1; });
    inp.moveX = 0; run(10);
    run(6, () => { inp.jump = true; }); inp.jump = false; run(40);
    return { frames, seen };
  } finally {
    spy.mockRestore();
    rspy.mockRestore();
  }
}

describe('單機玩家畫面回歸（M-C2 Task 2）', () => {
  afterAll(() => { stream = null; });
  it('單機回歸：同一個種子、同一串輸入（走路、跳、揮劍、挖、拿火把、釣魚、翻邊）逐幀畫，重構前錄下的 playerDraw/heldDraws/rimDraw 與畫布呼叫序列與重構後逐幀相同', async () => {
    const { frames, seen } = await record();
    if (process.env.AVATAR_DEBUG) console.log([...seen].join(' '));
    // 腳本真的走到每個姿勢（不然 fixture 沒在檢查它）
    for (const k of ['anim:idle', 'anim:walk', 'anim:jump', 'anim:fall', 'anim:climb', 'anim:mantle', 'anim:hurt', 'anim:swim',
      'atk:sword', 'atk:broadsword', 'atk:bow', 'atk:staff', 'atk:spear', 'atk:throw', 'mining', 'fish:flying', 'fish:floating', 'fish:bite',
      'boat', 'mantle', 'climbing', 'ropetop', 'rodTip', 'torchLight', 'coolLight', 'iframes']) expect(seen, k).toContain(k);
    if (process.env.UPDATE_AVATAR_FIXTURE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, JSON.stringify({ v: 1, n: frames.length, frames }) + '\n');
    }
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { n: number; frames: Frame[] };
    expect(frames.length).toBe(want.n);
    for (let i = 0; i < frames.length; i++) expect(JSON.parse(JSON.stringify(frames[i])), `frame ${i}`).toEqual(want.frames[i]);
  }, 120000);
});
