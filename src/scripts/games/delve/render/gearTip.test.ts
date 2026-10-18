// gearTip.test.ts — 裝備說明：稀有度 / 詞條 / 傳奇效果 / 強化；與裝備中比較的綠升紅降；能力總覽列。
import { describe, it, expect } from 'vitest';
import { gearTooltip, compareLines, statRows } from './gearTip';
import { emptyTotals, type Gear } from '../engine/gear';
import type { Stack } from '../engine/inventory';

const sword = (g?: Gear): Stack => (g ? { item: 'iron_sword', count: 1, gear: g } : { item: 'iron_sword', count: 1 });

describe('裝備說明', () => {
  it('第一行是組合名稱（帶稀有度），第二行稀有度 / 物品等級；每條詞條一行（含階數）', () => {
    const t = gearTooltip(sword({ rarity: 3, ilvl: 4, plus: 0, affixes: [{ id: 'blazing', tier: 3, value: 17 }, { id: 'swift', tier: 2, value: 5 }] }));
    expect(t[0]).toMatchObject({ tone: 'name', rarity: 3 });
    expect(t[0].text).toBe('熾焰的 鐵劍 · 迅捷');
    expect(t[1].text).toContain('史詩');
    expect(t[1].text).toContain('物品等級 4');
    const affix = t.filter((l) => l.tone === 'affix').map((l) => l.text);
    expect(affix).toContain('◆ 命中燃燒機率 +17%（T3）');
    expect(affix).toContain('◆ 攻擊速度 +5%（T2）');
    expect(t.some((l) => l.text.includes('傷害 13'))).toBe(true);
  });
  it('傳奇詞條列出效果；強化列出加成；鎖定標示', () => {
    const t = gearTooltip(sword({ rarity: 4, ilvl: 5, plus: 2, locked: true, affixes: [{ id: 'stormcall', tier: 5, value: 25 }] }));
    expect(t.find((l) => l.tone === 'unique')!.text).toContain('連鎖閃電');
    expect(t.some((l) => l.text.startsWith('強化 +2'))).toBe(true);
    expect(t[1].text).toContain('已鎖定');
  });
  it('沒有 gear 的裝備 = 普通；非裝備照舊', () => {
    expect(gearTooltip(sword())[1].text).toContain('普通');
    const dirt = gearTooltip({ item: 'dirt', count: 5 });
    expect(dirt[0].tone).toBe('name');
    expect(dirt.every((l) => l.tone === 'name' || l.tone === 'base')).toBe(true);
  });
  it('比較：比較好的列綠（up）、比較差的列紅（down）', () => {
    const a = sword({ rarity: 2, ilvl: 2, plus: 1, affixes: [{ id: 'keen', tier: 2, value: 8 }] });
    const b = sword({ rarity: 2, ilvl: 2, plus: 0, affixes: [{ id: 'savage', tier: 2, value: 4 }] });
    const c = compareLines(a, b);
    expect(c.find((l) => l.text.startsWith('傷害'))!.tone).toBe('up');
    expect(c.find((l) => l.text.startsWith('暴擊率'))!.tone).toBe('down');
    expect(c.find((l) => l.text.startsWith('暴擊率'))!.text).toBe('暴擊率 −4%');
    const t = gearTooltip(a, b);
    expect(t.some((l) => l.tone === 'head')).toBe(true);
    expect(compareLines(a, a)[0].text).toBe('數值相同');
  });
  it('比較的標題可以換（飾品：和最弱的那件比、會換掉它）；空槽有提示', () => {
    const a = sword({ rarity: 2, ilvl: 2, plus: 0, affixes: [{ id: 'keen', tier: 2, value: 8 }] });
    const b = sword({ rarity: 1, ilvl: 2, plus: 0, affixes: [{ id: 'keen', tier: 1, value: 4 }] });
    const t = gearTooltip(a, b, { head: '和最弱的飾品「X」比較（裝上會換掉它）：' });
    expect(t.find((l) => l.tone === 'head')!.text).toBe('和最弱的飾品「X」比較（裝上會換掉它）：');
    const e = gearTooltip(a, null, { note: '會裝進空的飾品槽' });
    expect(e.at(-1)).toEqual({ text: '會裝進空的飾品槽', tone: 'note' });
  });
  it('能力總覽：基本四列 + 非 0 的詞條', () => {
    const g = emptyTotals();
    g.move = 12; g.djump = 1; g.regen = 0.5;
    const rows = statRows({ defense: 8, hp: 90, maxHp: 120, damageMul: 1.25, crit: 0.07, gear: g, setBonus: null });
    expect(rows.slice(0, 4)).toEqual([['防禦', '8'], ['生命', '90/120'], ['傷害', '×1.25'], ['暴擊', '+7%']]);
    expect(rows).toContainEqual(['移動速度', '+12%']);
    expect(rows).toContainEqual(['空中再跳', '可以']);
    expect(rows).toContainEqual(['生命回復', '+0.5/秒']);
  });
});
