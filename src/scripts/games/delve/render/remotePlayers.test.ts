// remotePlayers.test.ts — 遠端玩家繪製（C9）：sheetFor 不動目前樣子、host / guest 的 RemoteView、只畫活著且有 look 的、名牌 DOM
import { describe, it, expect } from 'vitest';
import { Sprites } from './sprites';
import { RemotePlayers, GuestViews, hostRemoteViews, type RemoteView } from './remotePlayers';
import { Nameplates } from './nameplates';
import { Renderer } from './renderer';
import { arenaGame } from '../net/testRig';
import { createCharacter } from '../save/character';
import { normalizeAppearance, type Appearance } from '../engine/appearance';
import { plainLook, dollKey } from '../engine/doll';
import type { PeerView } from '../net/guest';
import type { PlayerPose } from '../engine/pose';
import { PLAYER_H, PLAYER_W } from '../engine/constants';

const sprites = (): Sprites => new Sprites(() => { throw new Error('no icons'); });
const app2 = (): Appearance => ({ ...normalizeAppearance(undefined), skin: 3 } as Appearance);

function view(o: Partial<RemoteView> = {}): RemoteView {
  const look = plainLook(normalizeAppearance(undefined));
  return { pid: 'p2', nick: '乙', look, key: dollKey(look), x: 100, y: 200, vx: 0, vy: 0, facing: 1, dead: false, ...o };
}

describe('Sprites.sheetFor', () => {
  it('sheetFor 不改 dollKey，也不清手臂快取', () => {
    const sp = sprites();
    sp.arm(false, null, 30);
    const before = sp.bakes.arms, key = sp.dollKey;
    const other = plainLook(app2());
    const sh = sp.sheetFor(other, dollKey(other), 0);
    expect(sh.key).toBe(dollKey(other));
    expect(sp.dollKey).toBe(key);
    sp.arm(false, null, 30);
    expect(sp.bakes.arms).toBe(before);
  });
});

describe('hostRemoteViews', () => {
  it('排除本地 actor，帶 nick 與 look', () => {
    const g = arenaGame();
    expect(hostRemoteViews(g)).toEqual([]);
    g.addActor('p2', createCharacter('小明', normalizeAppearance(undefined), 0));
    const vs = hostRemoteViews(g);
    expect(vs).toHaveLength(1);
    expect(vs[0].pid).toBe('p2');
    expect(vs[0].nick).toBe('小明');
    expect(vs[0].look).not.toBeNull();
    expect(vs[0].key).toBe(dollKey(vs[0].look!));
    expect(vs[0].dead).toBe(false);
  });
});

describe('GuestViews', () => {
  const pose: PlayerPose = {
    x: 0, y: 0, vx: 0, vy: 0, onGround: true, gfxOffY: 0, facing: 1, dead: false, iframes: 0, boating: false, climbing: false,
    mantle: null, liquidFrac: 0, held: null, attack: null, mining: null, fishing: null,
  };
  const peer = (o: Partial<PeerView> = {}): PeerView => ({ pid: 'p2', nick: '乙', look: null, x: 0, y: 0, facing: 1, hp: 10, maxHp: 10, dead: false, pose, ...o });
  it('由位置差算 vx / vy，第一幀為 0', () => {
    const gv = new GuestViews();
    expect(gv.views([peer({ x: 0 })], 0.1)[0].vx).toBe(0);
    const v = gv.views([peer({ x: 10, y: 5 })], 0.1)[0];
    expect(v.vx).toBeCloseTo(100);
    expect(v.vy).toBeCloseTo(50);
  });
  it('key = dollKey(look)；look 為 null 時 key 為空字串', () => {
    const look = plainLook(normalizeAppearance(undefined));
    const gv = new GuestViews();
    expect(gv.views([peer({ look })], 0.1)[0].key).toBe(dollKey(look));
    expect(gv.views([peer()], 0.1)[0].key).toBe('');
  });
  it('離開的 pid 狀態被丟掉（回來又是第一幀）', () => {
    const gv = new GuestViews();
    gv.views([peer({ x: 0 })], 0.1);
    gv.views([], 0.1);
    expect(gv.views([peer({ x: 50 })], 0.1)[0].vx).toBe(0);
  });
});

describe('RemotePlayers.draw', () => {
  const mockCtx = () => {
    const calls = { drawImage: 0, translate: [] as [number, number][] };
    const ctx = {
      save() {}, restore() {}, scale() {}, translate(x: number, y: number) { calls.translate.push([x, y]); },
      drawImage() { calls.drawImage++; },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };
  const id = (x: number, y: number) => ({ x, y });
  it('活著且有 look 的才 drawImage（後臂 + 身體 + 前臂 + 頭）', () => {
    const { ctx, calls } = mockCtx();
    const rp = new RemotePlayers();
    const sp = sprites();
    rp.draw(ctx, sp, [view({ pid: 'a' }), view({ pid: 'b', dead: true }), view({ pid: 'c', look: null, key: '' })], 0.016, id);
    expect(calls.drawImage).toBe(4);
  });
  it('腳底置中：translate 到 (x + W/2, y + H) 經 toPx', () => {
    const { ctx, calls } = mockCtx();
    new RemotePlayers().draw(ctx, sprites(), [view({ x: 100, y: 200 })], 0.016, (x, y) => ({ x: x + 1, y: y + 2 }));
    expect(calls.translate[0]).toEqual([Math.round(100 + PLAYER_W / 2) + 1, Math.round(200 + PLAYER_H) + 2]);
  });
  it('arms:true 的影格（待機）畫休息的手臂：後手臂、身體、前手臂、頭四次，且不動 Sprites 手臂快取', () => {
    const calls: { img: unknown; dx: number; dy: number }[] = [];
    const ctx = {
      save() {}, restore() {}, scale() {}, translate() {},
      drawImage(img: unknown, ...a: number[]) { const n = a.length; calls.push({ img, dx: a[n - 4], dy: a[n - 3] }); },
    } as unknown as CanvasRenderingContext2D;
    const sp = sprites();
    const before = sp.bakes.arms;
    new RemotePlayers().draw(ctx, sp, [view()], 0.016, (x, y) => ({ x, y }));
    expect(calls).toHaveLength(4);
    const sheet = calls[1].img;
    expect(calls[3].img).toBe(sheet);
    expect(calls[0].img).not.toBe(sheet);
    expect(calls[2].img).not.toBe(sheet);
    expect(calls[0].img).not.toBe(calls[2].img);
    expect(sp.bakes.arms).toBe(before);
  });
  it('gfxOffY 把腳底往下移', () => {
    const { ctx, calls } = mockCtx();
    const rp = new RemotePlayers();
    rp.draw(ctx, sprites(), [view({ y: 200 })], 0.016, id);
    rp.draw(ctx, sprites(), [view({ y: 200, gfxOffY: 6 })], 0.016, id);
    expect(calls.translate[1][1] - calls.translate[0][1]).toBe(6);
  });
  it('離開的 pid 的動畫器被丟掉', () => {
    const { ctx } = mockCtx();
    const rp = new RemotePlayers();
    rp.draw(ctx, sprites(), [view({ pid: 'a' })], 0.016, id);
    rp.draw(ctx, sprites(), [], 0.016, id);
    expect(rp.size).toBe(0);
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
