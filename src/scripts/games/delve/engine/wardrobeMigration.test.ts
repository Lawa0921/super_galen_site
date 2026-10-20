// wardrobeMigration.test.ts — 舊角色（cformat 1）外觀上的服裝 / 頭飾 / 眼鏡一次性轉成時裝物品（spec C6）。
//   「外觀不變」一律用紙娃娃像素比對（整張影格表 + 兩隻手臂），不是比 Appearance 欄位。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { FIXED_DT, INV_SIZE } from './constants';
import { ACCESSORIES, OUTFITS, OUTFIT_PLAIN, normalizeAppearance, type Appearance } from './appearance';
import { Vanity } from './vanity';
import { plainLook, type DollLook } from './doll';
import { WARDROBE_CFORMAT, planWardrobeMigration } from './wardrobeMigration';
import { avatarArm, avatarSheet } from '../render/avatarArt';
import { CHARACTER_FORMAT, decodeCharacter, encodeCharacter, type DelveCharacter } from '../save/character';
import { decodeWorld, encodeWorld, restoreSplit, saveSplitGame } from '../save/worldSave';
import { planNewWorld } from '../save/split';

const O = (id: string): number => OUTFITS.findIndex((o) => o.id === id);
const A = (id: string): number => ACCESSORIES.findIndex((a) => a.id === id);
/** 穿哥德洋裝 + 自訂顏色（不是哥德的原色） */
const GOTH: Appearance = normalizeAppearance({ body: 0, hair: 1, hairColor: 2, outfit: O('gothic'), color1: 3, color2: 7, acc: 0, glasses: false });
const NONE = { head: false, body: false, legs: false };

function samePixels(a: DollLook, b: DollLook): boolean {
  const eq = (x: { px: Uint32Array }, y: { px: Uint32Array }): boolean => x.px.length === y.px.length && x.px.every((v, i) => v === y.px[i]);
  return eq(avatarSheet(a).b, avatarSheet(b).b) && eq(avatarArm(a, false), avatarArm(b, false)) && eq(avatarArm(a, true), avatarArm(b, true));
}

function arena(app: Appearance): DelveGame {
  const g = new DelveGame({ seed: 'wardrobe', width: 160, height: 100, peaceful: true, appearance: app });
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(60, 59);
  for (let i = 0; i < 6; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
/** 這個遊戲的角色當作舊角色檔（cformat 1）存出去 */
function oldCharacter(g: DelveGame): { world: ReturnType<typeof saveSplitGame>['world']; character: DelveCharacter } {
  const { world, character } = saveSplitGame(g, { id: 'old-1', nick: '舊', createdAt: 0, rev: 0 }, { worldId: 'w1', worldName: g.seed, visits: {} }, 1);
  return { world, character: { ...character, cformat: 1 } as DelveCharacter };
}
/** 舊角色讀進同一個世界（restoreSplit → restoreGame → applyCharacter） */
function load(g: DelveGame): DelveGame {
  const { world, character } = oldCharacter(g);
  const r = restoreSplit(decodeWorld(encodeWorld(world)), decodeCharacter(encodeCharacter(character)));
  if (!r.ok) throw new Error(r.message);
  return r.game;
}
const invTints = (g: DelveGame): { item: string; tint?: [number, number] }[] =>
  g.inventory.slots.filter((s) => s && (s.item.startsWith('gothic') || s.item.startsWith('acc_') || s.item.startsWith('sailor'))).map((s) => ({ item: s!.item, tint: s!.tint }));

describe('planWardrobeMigration（純函式）', () => {
  it('穿哥德 + 自訂色、時裝欄空、沒有護甲 → 上衣 / 褲子都穿上且帶原本的主副色；外觀改成布衣、主副色不變', () => {
    const p = planWardrobeMigration(GOTH, new Vanity().toJSON(), NONE);
    expect(p.equip).toEqual([
      { slot: 'body', stack: { item: 'gothic_top', count: 1, tint: [3, 7] } },
      { slot: 'legs', stack: { item: 'gothic_bottom', count: 1, tint: [3, 7] } },
    ]);
    expect(p.give).toEqual([]);
    expect(p.appearance).toEqual({ ...GOTH, outfit: OUTFIT_PLAIN, acc: 0, glasses: false });
    expect(p.appearance.color1).toBe(3);
    expect(p.appearance.color2).toBe(7);
  });
  it('身體有露出的護甲 → 上衣進背包、褲子（腿沒有護甲）穿上', () => {
    const p = planWardrobeMigration(GOTH, new Vanity().toJSON(), { head: false, body: true, legs: false });
    expect(p.equip).toEqual([{ slot: 'legs', stack: { item: 'gothic_bottom', count: 1, tint: [3, 7] } }]);
    expect(p.give).toEqual([{ item: 'gothic_top', count: 1, tint: [3, 7] }]);
  });
  it('時裝欄身體格已經有水手服上衣 → 轉出來的上衣進背包', () => {
    const v = new Vanity(); v.set('body', 'sailor_top');
    const p = planWardrobeMigration(GOTH, v.toJSON(), NONE);
    expect(p.equip.map((e) => e.slot)).toEqual(['legs']);
    expect(p.give.map((s) => s.item)).toEqual(['gothic_top']);
  });
  it('蝴蝶結 + 眼鏡 → 蝴蝶結進飾品格（帶副色）、眼鏡進背包', () => {
    const p = planWardrobeMigration({ ...GOTH, outfit: OUTFIT_PLAIN, acc: A('ribbon'), glasses: true }, new Vanity().toJSON(), NONE);
    expect(p.equip).toEqual([{ slot: 'acc', stack: { item: 'acc_ribbon', count: 1, tint: [7, 7] } }]);
    expect(p.give).toEqual([{ item: 'acc_glasses', count: 1 }]);
    expect(p.appearance.acc).toBe(0);
    expect(p.appearance.glasses).toBe(false);
  });
  it('只戴眼鏡 → 眼鏡穿進飾品格；固定配色的頭飾（小皇冠）不帶 tint', () => {
    expect(planWardrobeMigration({ ...GOTH, outfit: OUTFIT_PLAIN, glasses: true }, new Vanity().toJSON(), NONE).equip)
      .toEqual([{ slot: 'acc', stack: { item: 'acc_glasses', count: 1 } }]);
    expect(planWardrobeMigration({ ...GOTH, outfit: OUTFIT_PLAIN, acc: A('crown') }, new Vanity().toJSON(), NONE).equip)
      .toEqual([{ slot: 'acc', stack: { item: 'acc_crown', count: 1 } }]);
  });
  it('已經穿布衣、沒有頭飾 / 眼鏡 → 什麼都不發', () => {
    const app = { ...GOTH, outfit: OUTFIT_PLAIN };
    const p = planWardrobeMigration(app, new Vanity().toJSON(), NONE);
    expect(p.equip).toEqual([]);
    expect(p.give).toEqual([]);
    expect(p.appearance).toEqual(app);
  });
});

describe('讀舊角色時轉換（applyCharacter）：外觀逐像素不變', () => {
  it('哥德 + 自訂色、沒有護甲 → 兩件穿上；外觀相同', () => {
    const g = arena(GOTH), before = g.doll().look;
    const m = load(g);
    expect(m.vanity.getStack('body')).toEqual({ item: 'gothic_top', count: 1, tint: [3, 7] });
    expect(m.vanity.getStack('legs')).toEqual({ item: 'gothic_bottom', count: 1, tint: [3, 7] });
    expect(m.appearance.outfit).toBe(OUTFIT_PLAIN);
    expect(samePixels(m.doll().look, before)).toBe(true);
    expect(samePixels(m.doll().look, plainLook(m.appearance))).toBe(false); // 不是被扒成布衣
  });
  it('身上有露出的鐵胸甲 → 上衣進背包（帶原色）、褲子穿上；外觀相同（胸甲照露）', () => {
    const g = arena(GOTH);
    g.give('iron_chestplate'); g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_chestplate'));
    const before = g.doll().look;
    const m = load(g);
    expect(m.vanity.get('body')).toBeNull();
    expect(m.vanity.getStack('legs')).toEqual({ item: 'gothic_bottom', count: 1, tint: [3, 7] });
    expect(invTints(m)).toEqual([{ item: 'gothic_top', tint: [3, 7] }]);
    expect(samePixels(m.doll().look, before)).toBe(true);
  });
  it('胸甲設了「隱藏」= 沒有露出的護甲 → 上衣照樣穿上；外觀相同', () => {
    const g = arena(GOTH);
    g.give('iron_chestplate'); g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_chestplate'));
    g.setHideArmor('body', true);
    const before = g.doll().look;
    const m = load(g);
    expect(m.vanity.get('body')).toBe('gothic_top');
    expect(samePixels(m.doll().look, before)).toBe(true);
  });
  it('蝴蝶結 + 眼鏡 → 蝴蝶結在飾品格、眼鏡在背包；看起來 = 原本拿掉眼鏡', () => {
    const app = { ...GOTH, acc: A('ribbon'), glasses: true };
    const m = load(arena(app));
    expect(m.vanity.getStack('acc')).toEqual({ item: 'acc_ribbon', count: 1, tint: [7, 7] });
    expect(invTints(m)).toEqual([{ item: 'acc_glasses', tint: undefined }]);
    expect(samePixels(m.doll().look, arena({ ...app, glasses: false }).doll().look)).toBe(true);
  });
  it('兜帽（畫主色）+ 水手服、時裝欄身體已有別件 → 上衣進背包；外觀相同', () => {
    const app = normalizeAppearance({ ...GOTH, outfit: O('sailor'), color1: 6, color2: 10, acc: A('hood') });
    const g = arena(app);
    g.vanity.set('body', 'maid_dress');
    const before = g.doll().look;
    const m = load(g);
    expect(m.vanity.getStack('acc')).toEqual({ item: 'acc_hood', count: 1, tint: [6, 6] });
    expect(invTints(m)).toEqual([{ item: 'sailor_top', tint: [6, 10] }]);
    expect(m.vanity.get('body')).toBe('maid_dress');
    expect(samePixels(m.doll().look, before)).toBe(true);
  });
  it('背包滿 → 轉出來的東西掉在玩家腳邊（掉落物帶 tint）', () => {
    const g = arena(GOTH);
    g.give('iron_chestplate'); g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'iron_chestplate'));
    for (let i = 0; i < INV_SIZE; i++) if (!g.inventory.slots[i]) g.inventory.slots[i] = { item: 'dirt', count: 1 };
    const m = load(g);
    const d = m.drops.list.filter((x) => x.item === 'gothic_top');
    expect(d).toHaveLength(1);
    expect(d[0].tint).toEqual([3, 7]);
    expect(d[0].count).toBe(1);
    const pc = m.playerCenter();
    expect(Math.abs(d[0].body.x - pc.x)).toBeLessThan(48);
    expect(Math.abs(d[0].body.y - pc.y)).toBeLessThan(48);
  });
  it('新世界 + 舊角色（planNewWorld）也轉換', () => {
    const { character } = oldCharacter(arena(GOTH));
    const { game } = planNewWorld(arena(normalizeAppearance(undefined)), character, 5);
    expect(game.vanity.get('body')).toBe('gothic_top');
    expect(game.appearance.outfit).toBe(OUTFIT_PLAIN);
  });
  it('只做一次：轉換後存檔 → cformat 2；再讀不再發物品', () => {
    const m = load(arena({ ...GOTH, acc: A('ribbon'), glasses: true }));
    const s = saveSplitGame(m, { id: 'old-1', nick: '舊', createdAt: 0, rev: 1 }, { worldId: 'w1', worldName: m.seed, visits: {} }, 2);
    expect(s.character.cformat).toBe(CHARACTER_FORMAT);
    expect(CHARACTER_FORMAT).toBe(WARDROBE_CFORMAT);
    const r = restoreSplit(decodeWorld(encodeWorld(s.world)), decodeCharacter(encodeCharacter(s.character)));
    if (!r.ok) throw new Error(r.message);
    expect(r.game.inventory.toJSON()).toEqual(m.inventory.toJSON());
    expect(r.game.vanity.toJSON()).toEqual(m.vanity.toJSON());
    expect(r.game.drops.list).toHaveLength(m.drops.list.length);
    // 轉換後在梳妝台把眼鏡從背包拿走、再讀一次也不會補發
    r.game.inventory.slots[r.game.inventory.slots.findIndex((x) => x?.item === 'acc_glasses')] = null;
    const s2 = saveSplitGame(r.game, { id: 'old-1', nick: '舊', createdAt: 0, rev: 2 }, { worldId: 'w1', worldName: m.seed, visits: s.world.header.visits }, 3);
    const r2 = restoreSplit(decodeWorld(encodeWorld(s2.world)), decodeCharacter(encodeCharacter(s2.character)));
    if (!r2.ok) throw new Error(r2.message);
    expect(r2.game.inventory.slots.some((x) => x?.item === 'acc_glasses')).toBe(false);
  });
});
