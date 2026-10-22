// remotePlayers.test.ts — 遠端玩家的來源（C9 / M-C2）：Sprites 依樣子分開快取、host / guest 的 RemoteView（pose + 時鐘）、名牌 DOM
import { describe, it, expect } from 'vitest';
import { Sprites } from './sprites';
import { guestRemoteViews, hostRemoteViews, type RemoteView } from './remotePlayers';
import { Nameplates } from './nameplates';
import { Renderer } from './renderer';
import { arenaGame } from '../net/testRig';
import { createCharacter } from '../save/character';
import { normalizeAppearance, type Appearance } from '../engine/appearance';
import { plainLook, dollKey } from '../engine/doll';
import type { PeerView } from '../net/guest';
import type { PlayerPose } from '../engine/pose';

const sprites = (): Sprites => new Sprites(() => { throw new Error('no icons'); });
const app2 = (): Appearance => ({ ...normalizeAppearance(undefined), skin: 3 } as Appearance);
const pose = (o: Partial<PlayerPose> = {}): PlayerPose => ({
  x: 0, y: 0, vx: 0, vy: 0, onGround: true, gfxOffY: 0, facing: 1, dead: false, iframes: 0, boating: false, climbing: false,
  mantle: null, liquidFrac: 0, held: null, attack: null, mining: null, fishing: null, hurt: 0, ...o,
});

function view(o: Partial<RemoteView> & { x?: number; y?: number; dead?: boolean } = {}): RemoteView {
  const look = plainLook(normalizeAppearance(undefined));
  const { x = 100, y = 200, dead = false, ...rest } = o;
  return { pid: 'p2', nick: '乙', look, key: dollKey(look), pose: pose({ x, y, dead }), time: 0, ...rest };
}

describe('Sprites：依紙娃娃 key 分開快取（D5）', () => {
  it('sheetFor 不清手臂快取；兩種樣子的手臂分開存、各自只烘一次', () => {
    const sp = sprites();
    const a = plainLook(normalizeAppearance(undefined)), ka = dollKey(a);
    const b = plainLook(app2()), kb = dollKey(b);
    const ca = sp.arm(a, ka, false, null, 30).canvas;
    const before = sp.bakes.arms;
    const sh = sp.sheetFor(b, kb, 0);
    expect(sh.key).toBe(kb);
    expect(sp.arm(a, ka, false, null, 30).canvas).toBe(ca);
    expect(sp.bakes.arms).toBe(before);
    const cb = sp.arm(b, kb, false, null, 30).canvas;
    expect(cb).not.toBe(ca);
    expect(sp.bakes.arms).toBe(before + 1);
    // 輪流畫兩種樣子：都不必重烘
    for (let i = 0; i < 5; i++) { expect(sp.arm(a, ka, false, null, 30).canvas).toBe(ca); expect(sp.arm(b, kb, false, null, 30).canvas).toBe(cb); }
    expect(sp.bakes.arms).toBe(before + 1);
  });
  it('肩膀依樣子的體型', () => {
    const sp = sprites();
    const a = plainLook(normalizeAppearance(undefined));
    expect(sp.shoulder(a, true)).toEqual(sp.shoulder(a, true));
    expect(sp.shoulder(a, false)).not.toEqual(sp.shoulder(a, true));
  });
});

describe('hostRemoteViews', () => {
  it('排除本地 actor，帶 nick、look、pose（= poseOf）與時鐘 = game.time', () => {
    const g = arenaGame();
    expect(hostRemoteViews(g)).toEqual([]);
    g.addActor('p2', createCharacter('小明', normalizeAppearance(undefined), 0));
    const vs = hostRemoteViews(g);
    expect(vs).toHaveLength(1);
    expect(vs[0].pid).toBe('p2');
    expect(vs[0].nick).toBe('小明');
    expect(vs[0].look).not.toBeNull();
    expect(vs[0].key).toBe(dollKey(vs[0].look!));
    expect(vs[0].pose).toEqual(g.poseOf('p2'));
    expect(vs[0].pose.dead).toBe(false);
    expect(vs[0].time).toBe(g.time);
  });
  it('房主端遠端 actor 的 gfxOffY 不會讓腳底飄移（客人沒回報 → 0）；本地照舊', () => {
    const g = arenaGame();
    g.mode = 'host';
    g.addActor('p2', createCharacter('小明', normalizeAppearance(undefined), 0));
    g.actors.get('p2')!.player.gfxOffY = 7;
    g.local.player.gfxOffY = 3;
    expect(g.poseOf('p2').gfxOffY).toBe(0);
    expect(hostRemoteViews(g)[0].pose.gfxOffY).toBe(0);
    expect(g.poseOf(g.localPid).gfxOffY).toBe(3);
  });
});

describe('guestRemoteViews', () => {
  const peer = (o: Partial<PeerView> = {}): PeerView => ({ pid: 'p2', nick: '乙', look: null, x: 0, y: 0, facing: 1, hp: 10, maxHp: 10, dead: false, pose: pose(), ...o });
  it('pose 照抄、key = dollKey(look)（look 為 null → 空字串）、時鐘 = 給的 time', () => {
    const look = plainLook(normalizeAppearance(undefined));
    const p = pose({ x: 12, vx: 30 });
    const [v] = guestRemoteViews([peer({ look, pose: p })], 42.5);
    expect(v.pose).toBe(p);
    expect(v.key).toBe(dollKey(look));
    expect(v.time).toBe(42.5);
    expect(guestRemoteViews([peer()], 0)[0].key).toBe('');
  });
});

describe('Nameplates', () => {
  const w2s = (x: number, y: number) => ({ x: x * 2, y: y * 2 });
  it('新增、移動、移除元素', () => {
    const box = document.createElement('div');
    const np = new Nameplates(box);
    np.update([view({ pid: 'a', nick: '甲', x: 100, y: 200 })], w2s);
    const el = box.querySelector('span.delve-nameplate') as HTMLElement;
    expect(el.textContent).toBe('甲');
    const x0 = el.style.getPropertyValue('--x');
    np.update([view({ pid: 'a', nick: '甲', x: 140, y: 200 })], w2s);
    expect(box.querySelectorAll('.delve-nameplate')).toHaveLength(1);
    expect(el.style.getPropertyValue('--x')).not.toBe(x0);
    np.update([], w2s);
    expect(box.querySelectorAll('.delve-nameplate')).toHaveLength(0);
  });
  it('空 nick 不建元素；死掉加 is-dead', () => {
    const box = document.createElement('div');
    const np = new Nameplates(box);
    np.update([view({ pid: 'a', nick: '' }), view({ pid: 'b', nick: '乙', dead: true })], w2s);
    const els = box.querySelectorAll('.delve-nameplate');
    expect(els).toHaveLength(1);
    expect(els[0].classList.contains('is-dead')).toBe(true);
    np.destroy();
    expect(box.querySelectorAll('.delve-nameplate')).toHaveLength(0);
  });
});

describe('Renderer.remoteViews', () => {
  it('回傳這一幀 draw 用的同一個陣列', () => {
    const arr = [view()];
    const get = Object.getOwnPropertyDescriptor(Renderer.prototype, 'remoteViews')!.get!;
    expect(get.call({ remoteNow: arr })).toBe(arr);
  });
});
