import { describe, it, expect } from 'vitest';
import { QuestLog, MAX_ACTIVE, BOARD_START, BOARD_MAX, makeQuest, type GiverInfo, type QuestCtx } from './quests';

const g: GiverInfo = { key: 'v0:elder', name: '村長', race: 'human', x: 100, y: 50 };
const dg: GiverInfo = { key: 'h0:dwarf_elder', name: '長老', race: 'dwarf', x: 500, y: 600 };
const ctx = (day = 0, regions = [{ id: 7, name: '老礦坑', x: 120, y: 80 }]): QuestCtx => ({
  day,
  nearestUnfound: (_x, _y, _c, skip) => regions.find((r) => !skip.has(r.id)) ?? null,
});

describe('委託', () => {
  it('同一個委託人、同一序號 → 同樣的委託（確定性）；前兩張是收集 + 討伐', () => {
    const a = makeQuest('s', g, 0, ctx(), new Set()), b = makeQuest('s', g, 0, ctx(), new Set());
    expect(a).toEqual(b);
    expect(a!.kind).toBe('collect');
    expect(makeQuest('s', g, 1, ctx(), new Set())!.kind).toBe('slay');
    expect(makeQuest('s', dg, 0, ctx(), new Set())!.reward.xp).toBeGreaterThan(a!.reward.xp);
  });
  it('委託板一開始 2 張；接了不會馬上補，過一天才補一張；最多掛 BOARD_MAX 張', () => {
    const log = new QuestLog('s');
    const o = log.offers(g, ctx(0));
    expect(o.length).toBe(BOARD_START);
    expect(log.accept(o[0])).toBe(true);
    expect(log.offers(g, ctx(0)).length).toBe(BOARD_START - 1);
    expect(log.offers(g, ctx(1)).length).toBe(BOARD_START);
    expect(log.offers(g, ctx(9)).length).toBeLessThanOrEqual(BOARD_MAX);
  });
  it('討伐：接下之後才算擊殺；收集：依背包數量；交付只給一次', () => {
    const log = new QuestLog('s');
    const [col, slay] = log.offers(g, ctx(0));
    log.onKill(slay.enemy!);
    log.accept(col); log.accept(slay);
    const s = log.get(slay.id)!;
    expect(s.progress).toBe(0);
    for (let i = 0; i < slay.n + 3; i++) log.onKill(slay.enemy!);
    expect(s.progress).toBe(slay.n);
    expect(log.ready(s)).toBe(true);
    log.refresh(() => col.n - 1, () => false, () => false);
    expect(log.turnIn(col.id)).toBeNull();
    log.refresh(() => col.n + 5, () => false, () => false);
    expect(log.turnIn(col.id)?.id).toBe(col.id);
    expect(log.turnIn(col.id)).toBeNull();
    expect(log.accept(col)).toBe(false); // 完成過的不能再接
    expect(log.offers(g, ctx(5)).some((q) => q.id === col.id)).toBe(false);
  });
  it('探索：指定還沒發現的地點，發現後才能交付；兩張探索不會指同一個地點', () => {
    const log = new QuestLog('s');
    const regions = [{ id: 3, name: 'A', x: 1, y: 1 }, { id: 4, name: 'B', x: 2, y: 2 }];
    let ex = null;
    for (let n = 2; n < 40 && !ex; n++) { const q = makeQuest('s', g, n, ctx(0, regions), new Set()); if (q?.kind === 'explore') ex = q; }
    expect(ex).not.toBeNull();
    log.accept(ex!);
    log.refresh(() => 0, () => false, () => false);
    expect(log.turnIn(ex!.id)).toBeNull();
    log.refresh(() => 0, (id) => id === ex!.region, () => false);
    expect(log.turnIn(ex!.id)).not.toBeNull();
  });
  it(`同時最多 ${MAX_ACTIVE} 個；存檔讀回一致、壞資料丟掉`, () => {
    const log = new QuestLog('s');
    for (let d = 0; d < 6; d++) for (const q of log.offers(g, ctx(d))) log.accept(q);
    expect(log.active.length).toBe(MAX_ACTIVE);
    log.onKill(log.active.find((q) => q.def.kind === 'slay')!.def.enemy!);
    const j = JSON.parse(JSON.stringify(log.toJSON()));
    j.active.push({ def: { id: 'bad' }, progress: 1 });
    const b = new QuestLog('s');
    b.load(j);
    expect(b.toJSON()).toEqual(log.toJSON());
  });
});
