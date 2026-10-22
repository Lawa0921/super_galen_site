// avatarDraw.test.ts — AvatarPainter（co-op M-C2 Task 2）：遠端玩家跟本地玩家同一條繪製路徑
//   （手持物 / 揮擊 / 挖掘 / 火把光 / 攀邊手臂 / 釣線 / 船 / 受傷），Sprites 依樣子分開快取（8 種樣子不互相清掉）。
//   單機逐幀回歸在 avatarRegression.test.ts。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FakeCanvas, installFakeCanvas, mainCanvas } from './fakeCanvas';
import { Renderer } from './renderer';
import { Sprites, FH } from './sprites';
import { buildAtlas } from './textures';
import { drawAvatar, newAvatarState, type AvatarState, type AvatarWorld } from './avatarDraw';
import type { RemoteView } from './remotePlayers';
import { arenaGame } from '../net/testRig';
import { normalizeAppearance } from '../engine/appearance';
import { plainLook, dollKey, type DollLook } from '../engine/doll';
import type { PlayerPose } from '../engine/pose';
import type { DelveGame } from '../engine/game';
import { FIXED_DT, PLAYER_H, PLAYER_W } from '../engine/constants';

let restore: () => void = () => {};
beforeAll(() => { restore = installFakeCanvas(); });
afterAll(() => restore());

const DT = 1 / 60;
const look = (hairColor = 0): DollLook => plainLook({ ...normalizeAppearance(undefined), hairColor });
const pose = (o: Partial<PlayerPose> = {}): PlayerPose => ({
  x: 0, y: 0, vx: 0, vy: 0, onGround: true, gfxOffY: 0, facing: 1, dead: false, iframes: 0, boating: false, climbing: false,
  mantle: null, liquidFrac: 0, held: null, attack: null, mining: null, fishing: null, ...o,
});

// ── painter 單元（直接叫 drawAvatar） ──
function painter(): { sp: Sprites; c: FakeCanvas; l: DollLook; key: string; world: AvatarWorld; draw: (p: PlayerPose, st: AvatarState, time: number, poseTime?: number) => ReturnType<typeof drawAvatar> } {
  const atlas = buildAtlas();
  const sp = new Sprites((item) => atlas.iconBmp(item));
  const c = mainCanvas(), l = look(), key = dollKey(l);
  const world: AvatarWorld = { isClimbable: () => false };
  return { sp, c, l, key, world, draw: (p, st, time, poseTime = time) => drawAvatar(c.ctx, sp, p, l, key, st, DT, time, world, poseTime) };
}

// ── renderer（遠端來源 = 手寫的 RemoteView） ──
interface Priv {
  clock: number; viewBox: { x: number; y: number; w: number; h: number }; lightAt: (x: number, y: number) => number;
  torchesSeen: { x: number; y: number }[]; coolSeen: { x: number; y: number }[];
  boatCanvas: HTMLCanvasElement | null; bobber: HTMLCanvasElement; remotes: Map<string, AvatarState>;
  drawRemotes(ctx: CanvasRenderingContext2D, dt: number): void; drawPlayer(ctx: CanvasRenderingContext2D, dt: number): void;
  drawBoats(ctx: CanvasRenderingContext2D): void; drawFishing(ctx: CanvasRenderingContext2D): void; drawPlayerRim(ctx: CanvasRenderingContext2D): void;
}
function scene(): { g: DelveGame; r: Renderer; R: Priv; c: FakeCanvas; views: RemoteView[]; at: (o?: Partial<PlayerPose>) => PlayerPose; remote: (o?: Partial<PlayerPose>, pid?: string, l?: DollLook, time?: number) => RemoteView; frame: () => void } {
  const g = arenaGame();
  const c = mainCanvas();
  const r = new Renderer(c as unknown as HTMLCanvasElement, g, { direct: true });
  const R = r as unknown as Priv;
  R.viewBox = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
  R.lightAt = () => 0;
  const views: RemoteView[] = [];
  r.setRemoteSource(() => views);
  const at = (o: Partial<PlayerPose> = {}): PlayerPose => pose({ x: g.player.x + 60, y: g.player.y, ...o });
  const remote = (o: Partial<PlayerPose> = {}, pid = 'p2', l = look(1), time = g.time): RemoteView => ({ pid, nick: pid, pose: at(o), look: l, key: dollKey(l), time });
  const frame = (): void => {
    R.clock += DT;
    R.torchesSeen.length = 0; R.coolSeen.length = 0;
    c.calls.length = 0;
    R.drawRemotes(c.ctx, DT); R.drawPlayer(c.ctx, DT); R.drawBoats(c.ctx); R.drawFishing(c.ctx); R.drawPlayerRim(c.ctx);
  };
  return { g, r, R, c, views, at, remote, frame };
}
const drawn = (c: FakeCanvas, img: unknown): boolean => c.calls.some((k) => k[0] === 'drawImage' && k[1] === img);

describe('AvatarPainter：遠端玩家畫得跟本地一樣', () => {
  it('遠端揮劍：pose.attack 有值 → 畫出武器（avatarDraws.get(pid).held === true）', () => {
    const s = scene();
    const T = s.g.time;
    s.views.push(s.remote({ attack: { item: 'wood_sword', kind: 'sword', angle: 0, dir: 1, at: T - 0.1, dur: 0.42 } }));
    s.frame();
    expect(s.r.avatarDraws.get('p2')?.held).toBe(true);
    // 揮劍殘影（白 / 淺藍點）
    expect(s.c.calls.some((k) => k[0] === 'fillRect' && k[1] === '#ffffff')).toBe(true);
    // 空手、沒在揮 → 手上沒東西
    s.views[0] = s.remote();
    s.frame();
    expect(s.r.avatarDraws.get('p2')?.held).toBe(false);
  });

  it('遠端揮擊進度：用 RemoteView.time（客人 = 跟身體同一個延遲時鐘）、夾在 [0, 1)：揮完就不畫，還沒開始 = 起手', () => {
    const s = scene();
    const T = 100;
    const atk = (at: number) => ({ attack: { item: 'wood_sword' as const, kind: 'sword' as const, angle: 0, dir: 1 as const, at, dur: 0.42 } });
    // 以最新的時間看已經揮完（0.5 / 0.42 ≥ 1）→ 不畫
    s.views[0] = s.remote(atk(T - 0.5), 'p2', look(1), T);
    s.frame();
    expect(s.r.avatarDraws.get('p2')?.held).toBe(false);
    // 同一份 pose，用晚 100 ms 的內插時鐘看 → 還在揮（0.4 / 0.42）
    s.views[0] = s.remote(atk(T - 0.5), 'p2', look(1), T - 0.1);
    s.frame();
    expect(s.r.avatarDraws.get('p2')?.held).toBe(true);
    // at 在時鐘之後（還沒開始）→ 進度夾成 0，照樣畫起手
    s.views[0] = s.remote(atk(T + 0.2), 'p2', look(1), T);
    s.frame();
    expect(s.r.avatarDraws.get('p2')?.held).toBe(true);
  });

  it('遠端挖掘：畫出鎬與揮動角度隨時間改變', () => {
    const P = painter(), st = newAvatarState();
    const p = pose({ x: 100, y: 100, held: 'copper_pickaxe', mining: { x: 4, y: 7, progress: 0.3, pick: 'copper_pickaxe' } });
    const seen = new Set<HTMLCanvasElement>();
    for (let i = 0; i < 30; i++) {
      const o = P.draw(p, st, i * DT);
      expect(o.heldDraws?.length).toBe(1);
      seen.add(o.heldDraws![0].c);
    }
    // 鎬跟著手臂轉：好幾個角度
    expect(seen.size).toBeGreaterThanOrEqual(3);
    // 面向挖的那格（在左邊 → 面向左）
    expect(st.facing).toBe(-1);
  });

  it('遠端拿火把：畫出火把並回報光源', () => {
    const P = painter(), st = newAvatarState();
    const o = P.draw(pose({ x: 100, y: 100, held: 'torch' }), st, 0);
    expect(o.heldDraws?.some((q) => P.sp.torches.includes(q.c))).toBe(true);
    expect(o.torches).toHaveLength(1);
    // renderer：遠端的火把光進 torchesSeen（光暈照著畫）
    const s = scene();
    s.views.push(s.remote({ held: 'torch' }));
    s.frame();
    const px = s.views[0].pose.x;
    expect(s.R.torchesSeen.some((t) => Math.abs(t.x - px) < 32)).toBe(true);
  });

  it('遠端翻上邊緣：畫 grip 手臂', () => {
    const P = painter(), st = newAvatarState();
    const grip = vi.spyOn(P.sp, 'grip');
    const p = pose({ x: 100, y: 100, onGround: false, mantle: { p: 0.15, dir: 1, edgeX: 100 + 30, edgeY: 100 + 6 } });
    const o = P.draw(p, st, 0);
    expect(o.anim).toBe('mantle');
    expect(grip).toHaveBeenCalled();
    const g = grip.mock.results[0].value as { arms: HTMLCanvasElement; hands: HTMLCanvasElement };
    expect(drawn(P.c, g.arms)).toBe(true);
    expect(drawn(P.c, g.hands)).toBe(true);
    expect(st.facing).toBe(1);
  });

  it('遠端釣魚：畫釣線', () => {
    const s = scene();
    const v = s.remote({ held: 'wood_rod' });
    v.pose.fishing = { state: 'floating', x: v.pose.x + 90, y: v.pose.y + 20, liquid: true };
    s.views.push(v);
    s.frame();
    expect(s.R.remotes.get('p2')!.rodTip).not.toBeNull();
    expect(s.c.calls.filter((k) => k[0] === 'fillRect' && k[1] === '#cceaf8').length).toBeGreaterThan(10);
    expect(drawn(s.c, s.R.bobber)).toBe(true);
  });

  it('遠端划船：畫船', () => {
    const s = scene();
    s.views.push(s.remote({ boating: true }));
    s.frame();
    expect(s.R.boatCanvas).not.toBeNull();
    expect(drawn(s.c, s.R.boatCanvas)).toBe(true);
    // 本地沒坐船 → 只有一艘
    expect(s.c.calls.filter((k) => k[0] === 'drawImage' && k[1] === s.R.boatCanvas)).toHaveLength(1);
  });

  it('8 個不同外觀輪流畫 120 幀，本地玩家的 bakes.arms 在第 60 幀之後不再增加', () => {
    const s = scene();
    // 7 位遠端（各一種樣子）都在走路（左右各半）：走路的循環 < 60 幀 → 之後每個角度都看過了，快取沒被別人清掉就不會再烘
    for (let i = 1; i <= 7; i++) s.views.push(s.remote({ x: s.g.player.x + 40 * i, vx: i % 2 ? 90 : -90 }, `p${i}`, look(i)));
    s.g.setMoveX(1);
    let at60 = -1;
    for (let f = 1; f <= 120; f++) {
      s.g.step(FIXED_DT);
      for (const v of s.views) v.time = s.g.time;
      s.frame();
      if (f === 60) at60 = s.r.sprites.bakes.arms;
    }
    expect(at60).toBeGreaterThan(0);
    expect(s.r.sprites.bakes.arms).toBe(at60);
    expect(s.r.avatarDraws.size).toBe(7);
  });

  it('遠端 iframes 從 0 變正 → 受傷姿勢（本地不自己判斷：由 hurt 事件設定）', () => {
    const P = painter(), st = newAvatarState();
    expect(P.draw(pose({ x: 100, y: 100 }), st, 1).anim).toBe('idle');
    expect(P.draw(pose({ x: 100, y: 100, iframes: 0.6 }), st, 1 + DT).anim).toBe('hurt');
    const mine = Object.assign(newAvatarState(), { autoHurt: false });
    P.draw(pose({ x: 100, y: 100 }), mine, 1);
    expect(P.draw(pose({ x: 100, y: 100, iframes: 0.6 }), mine, 1 + DT).anim).not.toBe('hurt');
  });

  it('離開的 pid：畫圖狀態與 avatarDraws 一起丟掉；位置 = 腳底中心', () => {
    const s = scene();
    s.views.push(s.remote());
    s.frame();
    const d = s.r.avatarDraws.get('p2')!;
    const p = s.views[0].pose;
    expect(d.x).toBe(Math.round(p.x + PLAYER_W / 2));
    expect(d.y).toBe(Math.round(p.y + PLAYER_H + p.gfxOffY));
    s.views.length = 0;
    s.frame();
    expect(s.r.avatarDraws.has('p2')).toBe(false);
    expect(s.R.remotes.size).toBe(0);
  });

  it('遠端在暗處也畫輪廓光', () => {
    const s = scene();
    s.views.push(s.remote());
    s.frame();
    const st = s.R.remotes.get('p2')!;
    expect(st.rim).not.toBeNull();
    // 輪廓光那一列（影格表第 3 列 = FH * 2）畫了兩次：遠端 + 本地
    const rimRow = s.c.calls.filter((k) => k[0] === 'drawImage' && k[4] === FH * 2);
    expect(rimRow).toHaveLength(2);
  });
});
