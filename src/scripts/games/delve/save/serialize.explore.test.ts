// serialize.explore.test.ts — 存檔格式 4：戰爭迷霧（RLE + base64）、地圖標記、發現 / 日誌、床（重生點）；v3 → 什麼都沒探索
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T } from '../engine/tiles';
import { encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame, SAVE_FORMAT, SaveFormatError } from './serialize';

const SMALL = { width: 200, height: 120 };

function played(): DelveGame {
  const g = new DelveGame({ seed: 'save-explore', ...SMALL });
  g.explored.revealDisc(30, 40, 12);
  for (let x = 0; x < 200; x++) g.explored.reveal(x, 5);
  g.toggleMarker(30, 40); g.toggleMarker(150, 90);
  const r = g.regions.find((q) => !g.discovery.isFound(q.id))!;
  g.discovery.found.add(r.id);
  g.discovery.readLore(4); g.discovery.gainTreasure('magnet');
  g.discovery.depthRecord = 77; g.discovery.distance = 123.5;
  const x = g.spawn.x + 3, y = g.world.surfaceAt(x) - 1;
  for (let k = 0; k < 2; k++) { g.world.setFg(x + k, y, T.AIR); g.world.setFg(x + k, y + 1, T.STONE); }
  g.world.setFg(x, y, T.BED_HEAD); g.world.setFg(x + 1, y, T.BED_FOOT);
  g.bed = { x, y };
  return g;
}

describe('存檔格式 4（探索）', () => {
  it('格式版本 ≥ 4', () => {
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(4);
    expect(snapshotGame(played()).header.format).toBe(SAVE_FORMAT);
  });
  it('迷霧位元圖、標記、發現的地區 / 碑文 / 珍寶 / 紀錄、床都能存回來', () => {
    const g = played();
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.explored.count).toBe(g.explored.count);
    expect(Array.from(h.explored.bits)).toEqual(Array.from(g.explored.bits));
    expect(h.markers).toEqual(g.markers);
    expect(h.discovery.toJSON()).toEqual(g.discovery.toJSON());
    expect(h.bed).toEqual(g.bed);
    expect(h.respawnPoint()).toEqual(g.bed);
  });
  it('探索資料很小：迷霧 RLE 後 header 不到 2KB', () => {
    const snap = snapshotGame(played());
    expect(typeof snap.header.explored).toBe('string');
    expect(JSON.stringify(snap.header).length).toBeLessThan(2048 + 1500);
    expect(snap.header.explored!.length).toBeLessThan(600);
  });
  it('v3 存檔（沒有探索欄位）→ 可讀，什麼都沒探索、沒有標記、沒有床', () => {
    const snap = snapshotGame(played());
    const h = snap.header as unknown as Record<string, unknown>;
    h.format = 3;
    delete h.explored; delete h.markers; delete h.discovery; delete h.bed;
    const r = restoreGame(decodeSave(encodeSave(snap)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.explored.count).toBe(0);
    expect(r.game.markers).toEqual([]);
    expect(r.game.bed).toBeNull();
    expect(r.game.discovery.lore.size).toBe(0);
  });
  it('不合法的探索欄位 → 存檔損毀', () => {
    const g = played();
    const bad = (patch: Record<string, unknown>): void => {
      const snap = snapshotGame(g);
      Object.assign(snap.header as unknown as Record<string, unknown>, patch);
      expect(() => decodeSave(encodeSave(snap)), JSON.stringify(patch)).toThrow(SaveFormatError);
    };
    bad({ explored: 42 });
    bad({ explored: '!!!!' });
    bad({ explored: btoa('\x05') }); // RLE 長度不對
    bad({ markers: 'x' });
    bad({ markers: [{ x: 1 }] });
    bad({ markers: Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0 })) });
    bad({ bed: { x: 'a', y: 2 } });
    bad({ discovery: 7 });
  });
  it('床已經不在了（被拆掉的世界狀態）→ 還原後重生點回到出生點', () => {
    const g = played();
    g.world.setFg(g.bed!.x, g.bed!.y, T.AIR);
    const r = restoreGame(serializeGame(g));
    expect(r.ok && r.game.respawnPoint()).toEqual(g.spawn);
  });
});
