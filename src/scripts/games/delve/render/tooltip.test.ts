// tooltip.test.ts — 道具說明（武器 / 防具 / 飾品 / 彈藥 / 消耗品）與生命愛心換算
import { describe, it, expect } from 'vitest';
import { itemTooltip, heartFills, speedLabel } from './tooltip';
import { ITEMS, type ItemId } from '../engine/items';

describe('道具說明', () => {
  it('武器：傷害 / 速度 / 擊退 / 暴擊；弓要箭、法杖耗魔', () => {
    const t = itemTooltip('iron_sword').join('\n');
    expect(t).toContain('鐵劍');
    expect(t).toContain('傷害 13');
    expect(t).toContain('暴擊 5%');
    expect(t).toMatch(/速度/);
    expect(itemTooltip('wood_bow').join('\n')).toContain('需要箭');
    expect(itemTooltip('crystal_staff').join('\n')).toContain('耗魔 6');
  });
  it('防具：防禦 + 套裝加成；飾品效果；彈藥；消耗品', () => {
    const a = itemTooltip('gold_helmet').join('\n');
    expect(a).toContain('防禦 3');
    expect(a).toContain('套裝');
    expect(itemTooltip('chitin_buckler').join('\n')).toContain('防禦 +3');
    expect(itemTooltip('magnet').join('\n')).toContain('撿拾');
    expect(itemTooltip('flaming_arrow').join('\n')).toContain('傷害 +8');
    expect(itemTooltip('healing_potion').join('\n')).toContain('回復');
    expect(itemTooltip('wick_offering').join('\n')).toContain('召喚');
  });
  it('每個道具都有說明（至少名稱一行）', () => {
    for (const id of Object.keys(ITEMS) as ItemId[]) expect(itemTooltip(id).length).toBeGreaterThan(0);
  });
  it('速度描述', () => {
    expect(speedLabel(0.25)).toBe('很快');
    expect(speedLabel(0.4)).toBe('普通');
    expect(speedLabel(0.6)).toBe('慢');
  });
});

describe('生命愛心', () => {
  it('每顆 20：100/100 = 5 顆滿、55/100 = 2 滿 + 1 顆 75%', () => {
    expect(heartFills(100, 100)).toEqual([1, 1, 1, 1, 1]);
    expect(heartFills(55, 100)).toEqual([1, 1, 0.75, 0, 0]);
    expect(heartFills(0, 120)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(heartFills(130, 130).length).toBe(7);
  });
});
