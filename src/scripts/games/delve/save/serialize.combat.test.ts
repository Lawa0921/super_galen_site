// serialize.combat.test.ts — 存檔格式 5（戰鬥）：生命 / 生命上限 / 魔力、裝備欄、首領擊敗、擊殺數、和平模式；v4 → 裝備空、滿血
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame, SAVE_FORMAT } from './serialize';

const SMALL = { width: 200, height: 120 };

function fought(): DelveGame {
  const g = new DelveGame({ seed: 'save-combat', ...SMALL });
  g.baseMaxHp = 160;
  g.equip('gold_helmet'); g.equip('gold_chestplate'); g.equip('gold_greaves');
  g.equip('magnet'); g.equip('warden_heart', 'acc3');
  g.hp = 77.4; g.mana = 12;
  g.bossesDefeated.add('lantern_warden');
  g.kills = { gel_blob: 12, bone_knight: 3 };
  g.peaceful = true;
  return g;
}

describe('存檔格式 5（戰鬥）', () => {
  it('格式版本 5', () => {
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(5);
    expect(snapshotGame(fought()).header.format).toBe(SAVE_FORMAT);
  });
  it('生命、上限、魔力、裝備、首領、擊殺數、和平模式都存得回來', () => {
    const g = fought();
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.baseMaxHp).toBe(160);
    expect(h.getState().maxHp).toBe(180);
    expect(h.getState().hp).toBe(78);
    expect(h.getState().mana).toBe(12);
    expect(h.equipment.toJSON()).toEqual(g.equipment.toJSON());
    expect(h.getState().defense).toBe(g.getState().defense);
    expect([...h.bossesDefeated]).toEqual(['lantern_warden']);
    expect(h.kills).toEqual({ gel_blob: 12, bone_knight: 3 });
    expect(h.peaceful).toBe(true);
  });
  it('舊格式（4）讀進來：裝備空、滿血 100、一般模式', () => {
    const g = fought();
    const data = snapshotGame(g);
    data.header.format = 4;
    delete data.header.combat;
    const r = restoreGame(decodeSave(encodeSave(data)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.game.getState();
    expect(s.hp).toBe(100);
    expect(s.maxHp).toBe(100);
    expect(s.equipment).toEqual({ head: null, body: null, legs: null, acc: [null, null, null, null, null] });
    expect(s.bossesDefeated).toEqual([]);
    expect(s.peaceful).toBe(false);
  });
  it('不合法的戰鬥欄位：未知裝備丟掉、生命夾在範圍內、壞掉的型別 → 格式錯誤', () => {
    const data = snapshotGame(fought());
    data.header.combat = { ...data.header.combat!, hp: 9999, equipment: { head: 'dirt', body: null, legs: null, acc: ['magnet', 'nope'] } as never };
    const r = restoreGame(decodeSave(encodeSave(data)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.getState().hp).toBe(r.game.getState().maxHp);
    expect(r.game.equipment.toJSON().head).toBeNull();
    expect(r.game.equipment.toJSON().acc[0]).toBe('magnet');
    const bad = snapshotGame(fought());
    (bad.header.combat as unknown as { hp: string }).hp = 'lots';
    const rb = restoreGame(encodeSave(bad));
    expect(rb.ok).toBe(false);
  });
  it('死亡中存檔 → 讀回來是活著、滿血', () => {
    const g = fought();
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(true);
    const r = restoreGame(serializeGame(g));
    expect(r.ok && r.game.dead).toBe(false);
    if (r.ok) expect(r.game.getState().hp).toBe(r.game.getState().maxHp);
  });
});
