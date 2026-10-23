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
import type { OwnPose } from '../net/guest';
import { FIXED_DT, PLAYER_H, PLAYER_W } from '../engine/constants';

let restore: () => void = () => {};
beforeAll(() => { restore = installFakeCanvas(); });
afterAll(() => restore());

const DT = 1 / 60;
const look = (hairColor = 0): DollLook => plainLook({ ...normalizeAppearance(undefined), hairColor });
const pose = (o: Partial<PlayerPose> = {}): PlayerPose => ({
  x: 0, y: 0, vx: 0, vy: 0, onGround: true, gfxOffY: 0, facing: 1, dead: false, iframes: 0, boating: false, climbing: false,
  mantle: null, liquidFrac: 0, held: null, attack: null, mining: null, fishing: null, hurt: 0, ...o,
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
  drawMiningAndCursor(ctx: CanvasRenderingContext2D): void;
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
    // 7 位遠端（各一種樣子）：走路（左右）、邊走邊挖（左右）、邊走邊揮劍 / 大劍 / 刺矛（每 30 幀重揮一次）——
    // 都在走（待機的呼吸循環 > 60 幀，會在第 72 幀才第一次出現某些後手角度）；每種動作的循環都 < 60 幀
    // → 之後每個角度都看過了，快取沒被別人清掉就不會再烘
    const x0 = s.g.player.x;
    const kinds: Partial<PlayerPose>[] = [
      { vx: 90 }, { vx: -90 },
      { vx: 90, held: 'copper_pickaxe', mining: { x: Math.floor(x0 / 16) - 3, y: 60, progress: 0.4, pick: 'copper_pickaxe' } },
      { vx: -90, held: 'copper_pickaxe', mining: { x: Math.floor(x0 / 16) + 30, y: 60, progress: 0.4, pick: 'copper_pickaxe' } },
      { vx: 90, held: 'wood_sword' }, { vx: -90, held: 'bone_greatsword' }, { vx: 90, held: 'iron_spear' },
    ];
    const weapon = { wood_sword: 'sword', bone_greatsword: 'broadsword', iron_spear: 'spear' } as const;
    for (let i = 1; i <= 7; i++) s.views.push(s.remote({ x: x0 + 40 * i, ...kinds[i - 1] }, `p${i}`, look(i)));
    s.g.setMoveX(1);
    let at60 = -1;
    for (let f = 1; f <= 120; f++) {
      s.g.step(FIXED_DT);
      for (const v of s.views) {
        v.time = s.g.time;
        const h = v.pose.held;
        if (h && h in weapon) v.pose.attack = { item: h, kind: weapon[h as keyof typeof weapon], angle: -0.3, dir: 1, at: s.g.time - (f % 30) * DT, dur: 0.5 };
      }
      s.frame();
      if (f === 60) at60 = s.r.sprites.bakes.arms;
    }
    expect(at60).toBeGreaterThan(0);
    expect(s.r.sprites.bakes.arms).toBe(at60);
    expect(s.r.avatarDraws.size).toBe(7);
  });

  it('只畫武器的那張手臂不分樣子：不同樣子拿同一把劍共用一張', () => {
    const P = painter();
    const b = look(5), kb = dollKey(b);
    const before = P.sp.bakes.arms;
    const c1 = P.sp.arm(P.l, P.key, false, null, 40, 'wood_sword', true).canvas;
    expect(P.sp.arm(b, kb, false, null, 40, 'wood_sword', true).canvas).toBe(c1);
    expect(P.sp.bakes.arms).toBe(before + 1);
    // 帶袖子的手臂照樣依樣子分開
    expect(P.sp.arm(b, kb, false, null, 40).canvas).not.toBe(P.sp.arm(P.l, P.key, false, null, 40).canvas);
  });

  it('遠端突進（iframes 上升、挨打計數不變）→ 不是受傷姿勢；遠端挨打（計數 +1）→ 受傷姿勢', () => {
    const P = painter(), st = newAvatarState();
    expect(P.draw(pose({ x: 100, y: 100, hurt: 4 }), st, 1).anim).toBe('idle');
    // 突進 / 重生：無敵時間但計數沒變（閃爍那幾幀 out.anim 照樣回報）
    for (let i = 1; i <= 10; i++) expect(P.draw(pose({ x: 100, y: 100, hurt: 4, iframes: 0.3 }), st, 1 + i * DT).anim).not.toBe('hurt');
    // 挨打
    expect(P.draw(pose({ x: 100, y: 100, hurt: 5, iframes: 0.6 }), st, 2).anim).toBe('hurt');
    // 計數繞回 0（mod 256）也算變了
    const w = newAvatarState();
    P.draw(pose({ x: 100, y: 100, hurt: 255 }), w, 5);
    expect(P.draw(pose({ x: 100, y: 100, hurt: 0, iframes: 0.6 }), w, 5 + DT).anim).toBe('hurt');
  });

  it('第一次看到的 pose 計數就不是 0 → 不算挨打', () => {
    const P = painter(), st = newAvatarState();
    expect(P.draw(pose({ x: 100, y: 100, hurt: 9, iframes: 0.6 }), st, 1).anim).not.toBe('hurt');
    expect(P.draw(pose({ x: 100, y: 100, hurt: 9 }), st, 1 + DT).anim).not.toBe('hurt');
  });

  it('客人自己的身體：突進 → 不是受傷姿勢；房主回報挨打（ownPose.hurt 變了）→ 受傷姿勢', () => {
    const s = scene();
    let own: OwnPose | null = null;
    s.r.setOwnPose(() => own);
    s.frame();
    // 還沒收到房主的 ws：之後第一份（計數已經是 3）不算挨打
    own = { attack: null, mining: null, fishing: null, iframes: 0, hurt: 3 };
    s.frame();
    expect(s.r.playerAnim).not.toBe('hurt');
    // 突進：房主回報的無敵時間上升，計數不變
    own = { ...own, iframes: 0.3 };
    for (let i = 0; i < 5; i++) { s.frame(); expect(s.r.playerAnim).not.toBe('hurt'); }
    // 挨打
    own = { ...own, iframes: 0.6, hurt: 4 };
    s.frame();
    expect(s.r.playerAnim).toBe('hurt');
  });

  it('客人自己的受傷姿勢只看 ownPose.hurt 計數：房主轉送回來的私人 hurt 事件不再設一次', () => {
    const s = scene();
    const R = s.R as unknown as { local: AvatarState; clock: number };
    let own: OwnPose = { attack: null, mining: null, fishing: null, iframes: 0, hurt: 3 };
    s.r.setOwnPose(() => own);
    s.frame(); s.frame();
    const hurt = { type: 'hurt' as const, x: 0, y: 0, amount: 2, fall: false, pid: s.g.localPid };
    const before = R.local.hurtAt;
    // 事件比計數先到：不動受傷時間、不是受傷姿勢
    s.r.onEvent(hurt);
    expect(R.local.hurtAt).toBe(before);
    s.frame();
    expect(s.r.playerAnim).not.toBe('hurt');
    // 計數到了 → 受傷姿勢；之後才到的事件也不重設（不會從頭再演一次）
    own = { ...own, iframes: 0.6, hurt: 4 };
    s.frame();
    expect(s.r.playerAnim).toBe('hurt');
    const at = R.local.hurtAt;
    s.frame();
    s.r.onEvent(hurt);
    expect(R.local.hurtAt).toBe(at);
  });

  it('單機的本地玩家：受傷姿勢只由 hurt 事件設定（計數變了也不會在下一幀再設一次）', () => {
    const s = scene();
    s.frame();
    const R = s.R as unknown as { local: AvatarState };
    // 計數變了但沒有 hurt 事件（例：測試直接改）→ 不會變成受傷姿勢
    s.g.local.hurtSeq += 1;
    s.frame();
    expect(s.r.playerAnim).not.toBe('hurt');
    // hurt 事件 → hurtAt = 當時的 clock（跟重構前一樣）
    s.g.hurtPlayer(2, s.g.player.x + 40);
    for (const e of s.g.drainEvents()) s.r.onEvent(e);
    const at = R.local.hurtAt;
    s.frame();
    expect(s.r.playerAnim).toBe('hurt');
    expect(R.local.hurtAt).toBe(at);
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

  // 裂痕：atlas 上的 crack 影格畫到 (x, y) 那格；回傳畫了哪幾格、第幾階
  const cracks = (s: ReturnType<typeof scene>): { x: number; y: number; stage: number }[] => {
    const atlas = s.r.atlas, src = [0, 1, 2, 3].map((k) => atlas.crack(k));
    const out: { x: number; y: number; stage: number }[] = [];
    for (const k of s.c.calls) {
      if (k[0] !== 'drawImage' || k[1] !== atlas.canvas) continue;
      const stage = src.findIndex((q) => q.sx === k[3] && q.sy === k[4]);
      if (stage >= 0) out.push({ x: (k[7] as number) / 16, y: (k[8] as number) / 16, stage });
    }
    return out;
  };
  const mineFrame = (s: ReturnType<typeof scene>): void => { s.frame(); s.R.drawMiningAndCursor(s.c.ctx); };

  it('客人自己的裂痕：畫房主回報的 ownPose.mining（副本的 getState().mining 一直是 null）', () => {
    const s = scene();
    s.r.setOwnPose(() => ({ attack: null, mining: { x: 5, y: 7, progress: 0.6, pick: 'copper_pickaxe' }, fishing: null, iframes: 0, hurt: 0 }));
    expect(s.g.getState().mining).toBeNull();
    mineFrame(s);
    expect(cracks(s)).toEqual([{ x: 5, y: 7, stage: 2 }]);
  });

  it('隊友的裂痕：畫在他挖的那格、用他（內插過）的進度', () => {
    const s = scene();
    s.views.push(s.remote({ held: 'copper_pickaxe', mining: { x: 9, y: 3, progress: 0.3, pick: 'copper_pickaxe' } }));
    s.views.push(s.remote({}, 'p3', look(2)));
    mineFrame(s);
    expect(cracks(s)).toEqual([{ x: 9, y: 3, stage: 1 }]);
  });

  it('單機的裂痕：跟 getState().mining 一樣（位置、階段）', () => {
    const s = scene();
    s.r.setRemoteSource(null);
    const tx = Math.floor((s.g.player.x + s.g.player.w / 2) / 16), ty = Math.floor((s.g.player.y + s.g.player.h) / 16);
    s.g.setAim(tx, ty);
    s.g.setMining(true);
    for (let i = 0; i < 20 && !(s.g.getState().mining && s.g.getState().mining!.progress > 0.3); i++) s.g.step(FIXED_DT);
    const m = s.g.getState().mining!;
    expect(m).not.toBeNull();
    mineFrame(s);
    expect(cracks(s)).toEqual([{ x: m.x, y: m.y, stage: Math.min(3, Math.floor(m.progress * 4)) }]);
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
