// dungeon.test.ts — 地城繪製（legacy/gen/dungeon.ts 搬過來的共用碼）畫在 gen2 的 BpCanvas 上：房數、外框、寶箱與鑰匙數
// （legacy 那一側的回歸網是 legacy/gen/dungeon.test.ts 與 world.central.test.ts 的雜湊）
import { describe, it, expect } from 'vitest';
import { Gen2Source } from '../index';
import { BpCanvas } from './bpCanvas';
import { generateDungeonOn } from './dungeon';
import { DUNGEON_COLORS } from '../../tiles';

describe('generateDungeonOn', () => {
  it('generateDungeonOn 在 BpCanvas 上：≥ 25 房、bbox 在 zone 內、一個上鎖寶箱（rune_pickaxe）、神殿箱有 golden_key、陶罐鑰匙 = 上鎖門數 − 箱子鑰匙數', () => {
    const src = new Gen2Source('dg'), zone = { x0: 100, x1: 520, y0: 290, y1: 700, side: 'left' as const };
    const cv = new BpCanvas({ x: zone.x0, y: zone.y0 - 40, w: zone.x1 - zone.x0, h: 480 }, src.profile);
    const d = generateDungeonOn(cv, { seed: 'dg', zone, surfaceAt: (x) => src.profile.surfaceAt(x), height: 1200, color: DUNGEON_COLORS[0], natural: true })!;
    expect(d.rooms.length).toBeGreaterThanOrEqual(25); expect(d.bbox.x).toBeGreaterThanOrEqual(zone.x0); expect(d.bbox.x + d.bbox.w).toBeLessThanOrEqual(zone.x1);
    const b = cv.toBlueprint(1, 'dungeon', 0);
    expect(b.chests.filter((c) => c.kind === 'treasure').map((c) => c.extra)).toEqual([['rune_pickaxe']]);
    expect(b.chests.some((c) => c.extra?.includes('golden_key'))).toBe(true);
    expect(b.pots.flatMap((p) => p.drops).filter((q) => q.item === 'dungeon_key').length + b.chests.filter((c) => c.extra?.includes('dungeon_key')).length).toBe(d.doors.filter((q) => q.locked).length);
    expect(b.solid).not.toBeNull();
  }, 60_000);
});
