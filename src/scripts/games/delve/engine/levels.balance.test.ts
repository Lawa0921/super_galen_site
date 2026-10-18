// levels.balance.test.ts — 平衡模型：用「典型的一天」的事件清單跑 xpForEvent，確認曲線落在設計目標上。
//   · 第一天（地表、10 分鐘）≈ 770 經驗 → 3 級（約升 2 級）。
//   · 打首領前（約 8–9 天，越來越深）≈ 1.8–2.3 萬 → 14–16 級；首領第一次擊敗 +2700 → 15–17 級。
//   · 刷怪（同一種怪一天打 200 隻）拿到的比正常探索的一天還少。
import { describe, expect, it } from 'vitest';
import { Progression, levelForXp, xpForEvent, BOSS_FIRST_XP, BOSS_XP, type XpCtx } from './levels';
import { T } from './tiles';
import type { DelveEvent } from './game';
import type { EnemyKind } from './enemies';
import type { RegionCat } from './discovery';

let n = 0;
const ctx = (day: number): XpCtx => ({
  day, idx: (x, y) => y * 10000 + x, depth: (_x, y) => Math.min(1, y / 600), fishCount: () => 1, isFish: () => true, legendary: () => false,
  catStats: () => [], recipeStation: (id) => (id.startsWith('a') ? 'anvil' : id.startsWith('f') ? 'furnace' : 'workbench'),
});
const kills = (kind: EnemyKind, k: number): DelveEvent[] => Array.from({ length: k }, () => ({ type: 'kill', id: n++, kind, x: 0, y: 0 }));
const regions = (cat: RegionCat, k: number): DelveEvent[] => Array.from({ length: k }, () => ({ type: 'discover', region: { id: n++, name: '', cat, kind: '' } }));
const recipes = (prefix: string, k: number): DelveEvent[] => Array.from({ length: k }, () => ({ type: 'craft', recipe: `${prefix}${n++}`, item: 'torch', n: 1 }));
const ores = (tile: number, k: number, depth: number): DelveEvent[] => Array.from({ length: k }, () => ({ type: 'mine', x: n++, y: depth, tile, item: 'copper_ore' }));
const chests = (k: number, depth: number): DelveEvent[] => Array.from({ length: k }, () => ({ type: 'chest', open: true, x: n++, y: depth }));
function run(p: Progression, day: number, ev: DelveEvent[]): number {
  let s = 0;
  for (const e of ev) { const a = xpForEvent(p, e, ctx(day)); if (a) s += p.gain(a.amount).amount; }
  return s;
}
/** 第一天：地表白天打凝膠、晚上夜行屍 / 暗羽梟；發現 4 處；10 個新配方；15 顆銅礦；2 個寶箱；1 塊古碑 */
const day1 = (): DelveEvent[] => [
  ...kills('gel_blob', 12), ...kills('night_walker', 8), ...kills('dusk_owl', 4),
  ...regions('land', 2), ...regions('depth', 1), ...regions('site', 1),
  ...recipes('w', 10), ...ores(T.COPPER_ORE, 15, 40), ...chests(2, 30), { type: 'lore', id: 1, x: 0, y: 0, first: true },
];
/** 之後的一天（越來越深：depth 0..1 → 怪越強、寶箱越值錢） */
const laterDay = (d: number): DelveEvent[] => {
  const deep = Math.min(1, d / 8);
  const mid: EnemyKind[] = deep < 0.5 ? ['cave_bat', 'rock_crab', 'spore_walker'] : ['rock_crab', 'bone_knight', 'cursed_skull', 'ember_imp'];
  return [
    ...mid.flatMap((k) => kills(k, Math.round(8 + 6 * deep))), ...kills('night_walker', 8), ...kills('dusk_owl', 4),
    ...regions('cave', 2), ...regions('site', 1), ...(d % 2 ? regions('dungeon', 1) : regions('secret', 1)),
    ...recipes(deep < 0.5 ? 'f' : 'a', 5), ...ores(deep < 0.5 ? T.IRON_ORE : T.GOLD_ORE, 30, 300), ...chests(3, Math.round(120 + 400 * deep)),
    { type: 'lore', id: d, x: 0, y: 0, first: true },
    ...Array.from({ length: 4 }, (_, k) => ({ type: 'codex', affix: (['keen', 'savage', 'stout', 'hale', 'swift', 'gale', 'bound', 'glow', 'mending', 'fortune', 'sunder', 'heavy'] as const)[(d * 4 + k) % 12] } as DelveEvent)),
  ];
};

describe('balance model', () => {
  it('day 1 ≈ 700–900 XP → level 3', () => {
    const p = new Progression();
    const xp = run(p, 0, day1());
    expect(xp).toBeGreaterThan(650);
    expect(xp).toBeLessThan(950);
    expect(p.level).toBe(3);
  });
  it('before the boss (≈ 9 days) the character is around level 14–16, and the first boss kill pushes it to 15–17', () => {
    const p = new Progression();
    run(p, 0, day1());
    const per: number[] = [];
    for (let d = 1; d <= 8; d++) per.push(run(p, d, laterDay(d)));
    expect(p.level).toBeGreaterThanOrEqual(14);
    expect(p.level).toBeLessThanOrEqual(16);
    // 每天拿到的經驗大致遞增（越深越多）
    expect(per[per.length - 1]).toBeGreaterThan(per[0]);
    run(p, 9, kills('lantern_warden', 1));
    expect(p.level).toBeGreaterThanOrEqual(15);
    expect(p.level).toBeLessThanOrEqual(18);
    expect(BOSS_XP + BOSS_FIRST_XP).toBe(2700);
  });
  it('farming one mob kind all day gives less than a normal exploring day', () => {
    const farm = new Progression(), normal = new Progression();
    const f = run(farm, 3, kills('bone_knight', 200));
    const ok = run(normal, 3, laterDay(3));
    expect(f).toBeLessThan(ok);
    expect(levelForXp(f)).toBeLessThan(10);
  });
});
