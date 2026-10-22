// mirror.test.ts — 梳妝台：工作台做得出來、放得下；靠近按使用 → mirror 事件，走遠 / 被拆 → 關閉事件；
// setBodyLook 只改身體特徵與布衣配色（種族、服裝 / 頭飾 / 眼鏡欄位不動）；recolorWorn 替身上那件時裝換顏色（紙娃娃跟著重畫）。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W, isInteractive, tileDef } from './tiles';
import { FIXED_DT } from './constants';
import { ITEMS } from './items';
import { craft, findRecipe } from './crafting';
import { Inventory } from './inventory';
import { FURNITURE_BY_TILE } from './furniture';
import { bodyDefaults, OUTFIT_PLAIN, type Appearance } from './appearance';
import { defaultTint, tintChannels } from './tint';

const SMALL = { width: 160, height: 100 };
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'mirror', ...SMALL, peaceful: true });
  g.levels.locked = true;
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquidRaw(x, y, 0, 0);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(60, 59);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void { for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT); }
/** 拿著 vanity_table 對 (x, y) 按使用 → 放下 */
function placeTable(g: DelveGame, x = 62, y = 59): void {
  g.give('vanity_table', 1);
  g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'vanity_table'));
  g.setAim(x, y); g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT);
  g.drainEvents();
}
const mirrorEvents = (g: DelveGame) => g.drainEvents().filter((e) => e.type === 'mirror');

describe('梳妝台：物品 / tile / 配方', () => {
  it('vanity_table 放下是 VANITY_TABLE（接在 tile 表最後）；拆掉拿回梳妝台', () => {
    expect(T.VANITY_TABLE).toBe(117);
    expect(tileDef(T.VANITY_TABLE).key).toBe('vanity_table');
    expect(tileDef(T.VANITY_TABLE).drop).toBe('vanity_table');
    expect(ITEMS.vanity_table.place).toBe(T.VANITY_TABLE);
    expect(ITEMS.vanity_table.name.zh).toBe('梳妝台');
    expect(isInteractive(T.VANITY_TABLE)).toBe(true);
    const g = arena();
    placeTable(g);
    expect(g.world.getFg(62, 59)).toBe(T.VANITY_TABLE);
    expect(g.inventory.count('vanity_table')).toBe(0);
    g.mineInstant(62, 59);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
    expect(g.inventory.count('vanity_table')).toBe(1);
  });
  it('家具目錄：不是合成站（裝飾類、有舒適度）', () => {
    const f = FURNITURE_BY_TILE.get(T.VANITY_TABLE);
    expect(f).toBeDefined();
    expect(f!.item).toBe('vanity_table');
    expect(f!.role).not.toBe('station');
    expect(f!.comfort).toBeGreaterThan(0);
  });
  it('工作台旁用木板 + 玻璃做得出來（開局一小時內的材料）；離開工作台做不出來', () => {
    const rc = findRecipe('vanity_table');
    expect(rc).toBeDefined();
    expect(rc!.station).toBe('workbench');
    expect(rc!.out).toEqual({ item: 'vanity_table', n: 1 });
    const inv = new Inventory();
    for (const a of rc!.inputs) inv.add(a.item, a.n);
    expect(rc!.inputs.map((a) => a.item).sort()).toEqual(['glass', 'planks']);
    expect(craft(inv, 'vanity_table', { nearWorkbench: false }).ok).toBe(false);
    expect(craft(inv, 'vanity_table', { nearWorkbench: true }).ok).toBe(true);
    expect(inv.count('vanity_table')).toBe(1);
  });
});

describe('梳妝台：互動', () => {
  it('靠近按使用 → mirror 開啟事件（就算手上拿著方塊也不會放下）', () => {
    const g = arena();
    placeTable(g);
    g.give('dirt', 10);
    g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'dirt'));
    g.setAim(62, 59); g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(mirrorEvents(g)).toEqual([{ type: 'mirror', open: true, x: 62, y: 59 }]);
    expect(g.openMirror).toEqual({ x: 62, y: 59 });
    expect(g.inventory.count('dirt')).toBe(10);
  });
  it('拿著梳妝台按住使用放下去：同一次按住不會接著打開它（放開再按才開）', () => {
    const g = arena();
    g.give('vanity_table', 1);
    g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'vanity_table'));
    g.setAim(62, 59); g.setUse(true);
    run(g, 0.5);
    g.setUse(false); g.step(FIXED_DT);
    expect(g.world.getFg(62, 59)).toBe(T.VANITY_TABLE);
    expect(g.openMirror).toBeNull();
    expect(mirrorEvents(g)).toEqual([]);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.openMirror).toEqual({ x: 62, y: 59 });
  });
  it('太遠不能用', () => {
    const g = arena();
    g.world.setFg(90, 59, T.VANITY_TABLE);
    expect(g.interact(90, 59)).toBe(false);
    expect(g.openMirror).toBeNull();
    expect(mirrorEvents(g)).toEqual([]);
  });
  it('走出範圍 → 關閉事件', () => {
    const g = arena();
    placeTable(g);
    expect(g.interact(62, 59)).toBe(true);
    g.drainEvents();
    g.teleport(90, 59);
    g.step(FIXED_DT);
    expect(g.openMirror).toBeNull();
    expect(mirrorEvents(g)).toEqual([{ type: 'mirror', open: false, x: 62, y: 59 }]);
  });
  it('梳妝台被拆掉 → 關閉事件；UI 自己關（closeMirror）也會推關閉事件，只推一次', () => {
    const g = arena();
    placeTable(g);
    g.interact(62, 59);
    g.mineInstant(62, 59);
    g.step(FIXED_DT);
    expect(mirrorEvents(g)).toContainEqual({ type: 'mirror', open: false, x: 62, y: 59 });
    placeTable(g);
    g.interact(62, 59);
    g.drainEvents();
    g.closeMirror();
    g.closeMirror();
    expect(mirrorEvents(g)).toEqual([{ type: 'mirror', open: false, x: 62, y: 59 }]);
    g.step(FIXED_DT);
    expect(mirrorEvents(g)).toEqual([]);
  });
});

describe('setBodyLook', () => {
  it('改身體特徵 + 布衣配色；種族不變（梳妝台不能換種族），服裝 / 頭飾 / 眼鏡欄位維持原值', () => {
    const g = arena();
    const start: Appearance = { ...bodyDefaults(0), race: 2, outfit: OUTFIT_PLAIN, acc: 3, glasses: true };
    g.setAppearance(start);
    const want: Appearance = { ...start, race: 4, hair: (start.hair + 1) % 5, hairColor: (start.hairColor + 2) % 5, color1: 6, color2: 9, outfit: 1, acc: 0, glasses: false };
    g.setBodyLook(want);
    expect(g.appearance.race).toBe(2);
    expect(g.appearance.outfit).toBe(OUTFIT_PLAIN);
    expect(g.appearance.acc).toBe(3);
    expect(g.appearance.glasses).toBe(true);
    expect(g.appearance.hair).toBe(want.hair);
    expect(g.appearance.hairColor).toBe(want.hairColor);
    expect(g.appearance.color1).toBe(6);
    expect(g.appearance.color2).toBe(9);
  });
  it('換成新物件（渲染器靠參考判斷要重烘）', () => {
    const g = arena();
    const before = g.appearance;
    g.setBodyLook({ ...before, skin: (before.skin + 1) % 3 });
    expect(g.appearance).not.toBe(before);
    expect(g.doll().look.app).toBe(g.appearance);
  });
});

describe('recolorWorn', () => {
  function wear(g: DelveGame, item: 'sailor_top' | 'acc_ribbon' | 'acc_crown' | 'straw_hat', slot: 'body' | 'acc' | 'head'): void {
    g.give(item, 1);
    expect(g.equipVanityFromInventory(g.inventory.slots.findIndex((s) => s?.item === item), slot)).toBe(true);
  }
  it("recolorWorn('body', [1, 2]) 改的是身上那件的 tint；紙娃娃 key 跟著變", () => {
    const g = arena();
    wear(g, 'sailor_top', 'body');
    const k0 = g.doll().key;
    expect(g.recolorWorn('body', [1, 2])).toBe(true);
    expect(g.vanity.getStack('body')!.tint).toEqual([1, 2]);
    expect(g.doll().look.body!.tint).toEqual([1, 2]);
    expect(g.doll().key).not.toBe(k0);
    // 存檔帶著顏色
    expect(g.vanity.toJSON().tint.body).toEqual([1, 2]);
  });
  it('那格沒穿東西 / 顏色不合法 → false、不動', () => {
    const g = arena();
    expect(g.recolorWorn('body', [1, 2])).toBe(false);
    wear(g, 'sailor_top', 'body');
    const v = g.vanity.version;
    expect(g.recolorWorn('body', [1, 999] as unknown as [number, number])).toBe(false);
    expect(g.recolorWorn('body', [-1, 2])).toBe(false);
    expect(g.vanity.getStack('body')!.tint).toBeUndefined();
    expect(g.vanity.version).toBe(v);
  });
  it('單色的（蝴蝶結）：副色跟著主色；沒有可換色布料的（小皇冠）→ false', () => {
    const g = arena();
    wear(g, 'acc_ribbon', 'acc');
    expect(g.recolorWorn('acc', [7, 2])).toBe(true);
    expect(g.vanity.getStack('acc')!.tint).toEqual([7, 7]);
    g.unequipVanity('acc');
    wear(g, 'acc_crown', 'acc');
    expect(g.recolorWorn('acc', [7, 2])).toBe(false);
    expect(g.vanity.getStack('acc')!.tint).toBeUndefined();
  });
  it('mirrorTints：身上每件看得出顏色的時裝（目前顏色、幾個色）；固定色的不列', () => {
    const g = arena();
    expect(g.mirrorTints()).toEqual([]);
    wear(g, 'sailor_top', 'body');
    wear(g, 'acc_ribbon', 'acc');
    wear(g, 'straw_hat', 'head');
    g.recolorWorn('body', [4, 5]);
    expect(g.mirrorTints()).toEqual([
      { slot: 'head', item: 'straw_hat', tint: defaultTint('hat:straw'), channels: 2 },
      { slot: 'body', item: 'sailor_top', tint: [4, 5], channels: 2 },
      { slot: 'acc', item: 'acc_ribbon', tint: defaultTint('acc:ribbon'), channels: 1 },
    ]);
    g.unequipVanity('acc');
    wear(g, 'acc_crown', 'acc');
    expect(g.mirrorTints().map((t) => t.slot)).toEqual(['head', 'body']);
  });
});

describe('tintChannels（看得見幾個顏色）', () => {
  it('服裝 2；雙色帽 / 背飾 2；單色（貝雷帽 / 大蝴蝶結 / 頭飾）1；固定色 0', () => {
    expect(tintChannels('outfit:sailor')).toBe(2);
    expect(tintChannels('hat:straw')).toBe(2);
    expect(tintChannels('hat:witch')).toBe(2);
    expect(tintChannels('hat:maid')).toBe(2);
    expect(tintChannels('back:cape')).toBe(2);
    expect(tintChannels('back:feathers')).toBe(2);
    expect(tintChannels('hat:beret')).toBe(1);
    expect(tintChannels('back:bow')).toBe(1);
    for (const a of ['ribbon', 'catears', 'hood', 'headphones', 'hairpin']) expect(tintChannels(`acc:${a}`), a).toBe(1);
    for (const l of ['hat:miner', 'hat:flower', 'back:wings', 'acc:clip', 'acc:flower', 'acc:crown', 'acc:foxmask', 'acc:glasses', 'armor:iron']) expect(tintChannels(l), l).toBe(0);
  });
});
