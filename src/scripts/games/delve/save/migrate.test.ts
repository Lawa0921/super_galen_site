// 遷移驗收：凍結的 format-9 存檔 → 角色 + 世界 → 存 → 再讀，逐欄相等（§5.1 第 4 點、§6 M-A 第一條）。
import { describe, expect, it } from 'vitest';
import { readLegacyFixture } from './legacyFixture';
import { decodeSave, restoreGame } from './serialize';
import { newId, newIdentity, encodeCharacter, decodeCharacter } from './character';
import { decodeAnySave, decodeWorld, encodeWorld, restoreSplit, saveSplitGame } from './worldSave';
import { expectSameGame } from './expectSameGame';
import { MAX_BREATH } from '../engine/game';
import { T } from '../engine/tiles';
import { OUTFIT_PLAIN } from '../engine/appearance';
import { buildDollLook, type DollLook } from '../engine/doll';
import { Equipment } from '../engine/equipment';
import { Vanity } from '../engine/vanity';
import { avatarArm, avatarSheet } from '../render/avatarArt';

function legacyGame() {
  const old = restoreGame(readLegacyFixture());
  if (!old.ok) throw new Error(old.message);
  return old.game;
}

describe('fixture 的拆分欄位都不是預設值（否則相等比較證明不了什麼）', () => {
  const g = legacyGame();
  it('背包／裝備／外觀', () => {
    const sword = g.inventory.slots.find((s) => s?.item === 'gold_sword');
    expect(sword?.gear?.locked).toBe(true);
    expect(sword?.gear?.plus).toBe(3);
    expect(sword?.gear?.affixes).toEqual([{ id: 'blazing', tier: 5, value: 30 }]);
    expect(g.equipment.toJSON().body).toBe('iron_chestplate');
    expect(g.equipment.gearJSON().body).not.toBeNull();
    expect(g.vanity.toJSON().slots.body).toBe('sailor_top');
    expect(g.appearance.race).toBe(3);
  });
  it('等級／圖鑑／釣魚／生命／buff', () => {
    expect(JSON.stringify(g.levels.toJSON())).toMatch(/"xp":[1-9]/);
    const c = g.codex.toJSON();
    expect(Object.keys(c.affixes).length + Object.keys(c.items).length).toBeGreaterThan(0);
    expect(g.fishLog).toEqual({ silver_minnow: 3 });
    expect(g.undyingCd).toBe(42);
    expect(g.hp).toBe(63.5);
    expect(g.activeBuffs().map((b) => b.kind)).toContain('bless');
  });
  it('世界／visit', () => {
    expect(g.breath).toBeLessThan(MAX_BREATH);
    expect(Object.keys(g.kills).length).toBeGreaterThan(0);
    expect(g.explored.encode().length).toBeGreaterThan(0);
    expect(g.markers).toHaveLength(2);
    const chest = g.world.chests.get(58 * 200 + 56)!;
    expect(chest[1]?.gear).toBeTruthy();
    expect(g.settle.spawnCore).not.toBeNull();
  });
  it('rng／發現有值；液體／天氣／半磚／掉落物在 fixture 是預設值（凍結檔不重生，這幾欄只證明預設值不丟）', () => {
    expect(g.rngState().loot.some((n) => n !== 0)).toBe(true);
    expect(g.discovery.toJSON().depthRecord).toBe(40);
    expect(g.world.liquidTotal()).toBe(0);
    expect(g.weatherOverride).toBeNull();
    expect(g.world.flaggedTiles('half')).toEqual([]);
    expect(g.drops.list).toHaveLength(0);
  });
});

describe('format 9 遷移', () => {
  it('format 9 → 遷移 → 存檔 → 再讀：背包／裝備／等級／房屋 chunk／箱子逐欄相等', () => {
    const any = decodeAnySave(readLegacyFixture());
    expect(any.kind).toBe('legacy');
    const oldGame = legacyGame();
    const who = newIdentity(1);
    const where = { worldId: newId(), worldName: oldGame.seed, visits: {} };
    const m = saveSplitGame(oldGame, who, where, 2);
    const r1 = restoreSplit(encodeWorld(m.world), decodeCharacter(encodeCharacter(m.character)));
    if (!r1.ok) throw new Error(r1.message);
    expectSameGame(oldGame, r1.game);
    const s = saveSplitGame(r1.game, { ...who, rev: who.rev + 1 }, { ...where, visits: r1.world.visits }, 3);
    const r2 = restoreSplit(decodeWorld(encodeWorld(s.world)), decodeCharacter(encodeCharacter(s.character)));
    if (!r2.ok) throw new Error(r2.message);
    expectSameGame(oldGame, r2.game);
    expect(r2.game.world.getFg(49, 58)).toBe(T.DOOR_CLOSED);
    expect(r2.game.world.chests.get(58 * 200 + 56)![0]).toEqual({ item: 'copper_coin', count: 37 });
  });

  it('世界檔壞掉的 chunk → 讀世界失敗，但角色檔照樣讀得到', () => {
    const oldGame = legacyGame();
    const m = saveSplitGame(oldGame, newIdentity(1), { worldId: newId(), worldName: oldGame.seed, visits: {} }, 2);
    const worldBytes = encodeWorld(m.world);
    const charBytes = encodeCharacter(m.character);
    const broken = worldBytes.slice(0, Math.floor(worldBytes.length / 2));
    const char = decodeCharacter(charBytes);
    const r = restoreSplit(broken, char);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('format');
    expect(decodeCharacter(charBytes)).toEqual(char);
    expect(char.inventory).toEqual(m.character.inventory);
  });
});

describe('format 9 舊角色的時裝轉換（spec C6）', () => {
  const same = (a: DollLook, b: DollLook): boolean => {
    const eq = (x: { px: Uint32Array }, y: { px: Uint32Array }): boolean => x.px.length === y.px.length && x.px.every((v, i) => v === y.px[i]);
    return eq(avatarSheet(a).b, avatarSheet(b).b) && eq(avatarArm(a, false), avatarArm(b, false)) && eq(avatarArm(a, true), avatarArm(b, true));
  };
  it('fixture（水手服 + 蝴蝶結、時裝欄身體有水手服上衣、露出鐵胸甲）走遷移後：外觀逐像素和 fixture 原本一樣', () => {
    const h = decodeSave(readLegacyFixture()).header;
    const original = buildDollLook(h.appearance!, Equipment.fromJSON(h.combat!.equipment, h.combat!.equipGear), Vanity.fromJSON(h.vanity));
    const g = legacyGame();
    expect(g.appearance.outfit).toBe(OUTFIT_PLAIN);
    expect(g.appearance.acc).toBe(0);
    expect([g.appearance.color1, g.appearance.color2]).toEqual([h.appearance!.color1, h.appearance!.color2]);
    expect(g.vanity.getStack('acc')).toEqual({ item: 'acc_ribbon', count: 1, tint: [h.appearance!.color2, h.appearance!.color2] });
    expect(g.vanity.getStack('legs')).toEqual({ item: 'sailor_skirt', count: 1, tint: [h.appearance!.color1, h.appearance!.color2] });
    expect(g.inventory.slots.filter((s) => s?.item === 'sailor_top')).toEqual([{ item: 'sailor_top', count: 1, tint: [h.appearance!.color1, h.appearance!.color2] }]);
    expect(same(g.doll().look, original)).toBe(true);
  });
  it('遷移成拆檔後角色檔是 cformat 2，再讀不會再發一次', () => {
    const oldGame = legacyGame();
    const m = saveSplitGame(oldGame, newIdentity(1), { worldId: newId(), worldName: oldGame.seed, visits: {} }, 2);
    expect(m.character.cformat).toBe(2);
    const r = restoreSplit(encodeWorld(m.world), decodeCharacter(encodeCharacter(m.character)));
    if (!r.ok) throw new Error(r.message);
    expect(r.game.inventory.toJSON()).toEqual(oldGame.inventory.toJSON());
    expect(r.game.vanity.toJSON()).toEqual(oldGame.vanity.toJSON());
  });
});
