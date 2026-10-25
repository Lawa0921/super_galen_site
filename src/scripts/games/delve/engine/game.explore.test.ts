// game.explore.test.ts — 遊戲裡的探索：出生點周圍已揭露、移動揭露、光照揭露、首次進入地區的發現事件、
// 古碑收進日誌、拿到珍寶、地圖標記
import { describe, it, expect, beforeAll } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T } from './tiles';
import { FIXED_DT } from './constants';
import { LightMap } from './lighting';
import { Discovery } from './discovery';
import type { QuestCtx } from './quests';
import { SEA_Y } from './gen2/profile';
import { areaLabel } from '../render/model';

const run = (g: DelveGame, s: number): void => { for (let i = 0, n = Math.round(s / FIXED_DT); i < n; i++) g.step(FIXED_DT); };
type Disc = Extract<DelveEvent, { type: 'discover' }>;

describe('探索（小世界）', () => {
  it('開局：出生點周圍已揭露、出生地區已發現（不跳橫幅）', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    expect(g.explored.has(g.spawn.x, g.spawn.y)).toBe(true);
    expect(g.explored.has(g.spawn.x + 60, g.spawn.y)).toBe(false);
    const home = g.discovery.regionsAt(g.spawn.x, g.spawn.y);
    expect(home.length).toBeGreaterThan(0);
    for (const r of home) expect(g.discovery.isFound(r.id)).toBe(true);
    run(g, 0.2);
    expect(g.drainEvents().some((e) => e.type === 'discover')).toBe(false);
  });
  it('移動 → 沿路揭露；光照夠亮的格（在畫面內）也揭露', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    g.teleport(20, g.world.surfaceAt(20) - 1);
    run(g, 0.1);
    expect(g.explored.has(20, g.world.surfaceAt(20) - 2)).toBe(true);
    const data = new Float32Array(10 * 10).fill(0.9);
    expect(g.revealLit(new LightMap(150, 90, 10, 10, data), { x: 150, y: 90, w: 10, h: 10 })).toBe(100);
    expect(g.explored.has(155, 95)).toBe(true);
  });
  it('地圖標記：新增 / 移除，最多 20 個', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 });
    expect(g.toggleMarker(10, 10)).toBe('added');
    expect(g.markers).toEqual([{ x: 10, y: 10 }]);
    expect(g.toggleMarker(11, 10)).toBe('removed');
    expect(g.markers).toEqual([]);
  });
});

describe('探索（完整世界）', { timeout: 120_000 }, () => {
  let g: DelveGame;
  beforeAll(() => { g = new DelveGame({ seed: 'alpha' }); }, 120_000);

  it('傳送到小屋 → 發現事件（帶中文名字），日誌的「遺跡與建築」+1；同一處不再觸發', () => {
    const cabin = g.structures.find((s) => s.kind === 'cabin' && s.chest)!;
    const before = g.discovery.stats().cats.find((c) => c.cat === 'site')!.found;
    g.drainEvents();
    g.teleport(cabin.chest!.x + 1, cabin.chest!.y);
    run(g, 0.1);
    const ev = g.drainEvents().filter((e): e is Disc => e.type === 'discover');
    const site = ev.find((e) => e.region.kind === 'cabin');
    expect(site?.region.name).toMatch(/[一-鿿]/);
    expect(g.discovery.stats().cats.find((c) => c.cat === 'site')!.found).toBe(before + 1);
    run(g, 0.2);
    expect(g.drainEvents().some((e) => e.type === 'discover' && e.region.kind === 'cabin')).toBe(false);
  });
  it('古碑：讀一次收進日誌（first = true），再讀不重複計算', () => {
    const t = g.tablets[3];
    g.teleport(t.x + 1, t.y);
    run(g, 0.05);
    g.drainEvents();
    expect(g.interact(t.x, t.y)).toBe(true);
    const ev = g.drainEvents().find((e) => e.type === 'lore') as Extract<DelveEvent, { type: 'lore' }>;
    expect(ev.id).toBe(t.id);
    expect(ev.first).toBe(true);
    g.interact(t.x, t.y);
    const ev2 = g.drainEvents().find((e) => e.type === 'lore') as Extract<DelveEvent, { type: 'lore' }>;
    expect(ev2.first).toBe(false);
    expect(g.discovery.stats().lore).toEqual({ found: 1, total: 14 });
  });
  it('拿到珍寶（背包裡出現獨特道具）→ treasure 事件、日誌珍寶 +1', () => {
    g.drainEvents();
    g.give('magnet');
    run(g, 0.6);
    expect(g.drainEvents().some((e) => e.type === 'treasure' && e.item === 'magnet')).toBe(true);
    expect(g.discovery.treasures.has('magnet')).toBe(true);
  });
  it('最深紀錄與移動距離會累積', () => {
    const s0 = g.discovery.stats();
    const x = g.spawn.x + 40;
    g.teleport(x, g.world.surfaceAt(x) + 60);
    for (let y = g.world.surfaceAt(x) + 55; y < g.world.surfaceAt(x) + 64; y++) for (let dx = -3; dx <= 3; dx++) g.world.setFg(x + dx, y, T.AIR);
    run(g, 0.5);
    expect(g.discovery.stats().depthRecord).toBeGreaterThanOrEqual(58);
    g.setMoveX(1); run(g, 0.5); g.setMoveX(0);
    expect(g.discovery.stats().distance).toBeGreaterThan(s0.distance + 2);
  });
});

// ── gen2：HUD / 提示 / 探路 / 委託讀已知地區表（Task 16） ──────
type Spot = { name: string; x: number; y: number };
type Hidden = { questCtx(): QuestCtx; markDone(x: number, y: number): boolean };
const hidden = (g: DelveGame): Hidden => g as unknown as Hidden;
/** 改動前 HUD 的取名（hud.ts 舊版逐字照抄）：只看中央 regionsAt */
const oldArea = (d: Discovery, x: number, y: number): string => {
  const here = d.regionsAt(x, y).filter((r) => r.cat !== 'depth' && d.isFound(r.id)).sort((a, b) => a.w * a.h - b.w * b.h);
  return here[0]?.name ?? d.regionsAt(x, y).find((r) => d.isFound(r.id))?.name ?? '未知之地';
};

describe('gen2：HUD、提示、探路、委託讀已知地區', () => {
  it('HUD 地區名：gen2 出生點 = 家鄉林地、第一道東海 = 東方大海（不是「未知之地」）；沒走過的外圍 = 未知之地', () => {
    const g = new DelveGame({ seed: 'hud2', worldGen: { kind: 'gen2' } });
    expect(areaLabel(g.discovery, g.spawn.x, g.spawn.y)).toBe('家鄉林地');
    expect(areaLabel(g.discovery, 4300, SEA_Y - 2)).toBe('未知之地');
    g.teleport(4300, SEA_Y - 2); g.step(FIXED_DT);
    expect(areaLabel(g.discovery, 4300, SEA_Y - 2)).toBe('東方大海');
    // 家鄉的村莊：走進去之後顯示村名（結構比地塊地區小，排前面）
    const v = g.discovery.listKnown().find((r) => r.kind === 'village')!;
    expect(areaLabel(g.discovery, v.ax, v.ay)).not.toBe(v.name);
    g.discovery.visit(v.ax, v.ay);
    expect(areaLabel(g.discovery, v.ax, v.ay)).toBe(v.name);
    // 蘑菇環境音用的 knownAt：家鄉的蘑菇林中心查得到
    const m = g.discovery.listKnown().find((r) => r.kind === 'mushroom_biome');
    if (m) expect(g.discovery.knownAt(m.ax, m.ay).some((r) => r.id === m.id)).toBe(true);
  }, 60_000);

  it('舊世界的 HUD 取名不變：與改動前的寫法逐點相同；外圍查詢查到、但不在已知表的地區照舊不顯示', () => {
    const g = new DelveGame({ seed: 'ex', width: 200, height: 120 }), d = g.discovery;
    for (const r of g.regions.filter((q) => q.ax >= 0)) d.visit(r.ax, r.ay);
    for (let x = 0; x < 200; x += 3) for (let y = 0; y < 120; y += 3) expect(areaLabel(d, x, y)).toBe(oldArea(d, x, y));
    // 舊世界的外圍（v1 外圍地區不進已知表）：發現了、HUD 仍是未知之地（同改動前）
    const far = { id: 2 ** 31, cat: 'land' as const, kind: 'forest', name: '東境・測試林', x: 500, y: 0, w: 100, h: 50, ax: 550, ay: 10, contains: (x: number, y: number) => x >= 500 && x < 600 && y >= 0 && y < 50 };
    const o = new Discovery(g.regions);
    o.setOuter((x, y) => (far.contains(x, y) ? [far] : []));
    expect(o.visit(550, 10).map((r) => r.id)).toContain(far.id);
    expect(areaLabel(o, 550, 10)).toBe('未知之地');
    expect(o.knownAt(550, 10)).toEqual([]);
  });

  it('gen2：提示指向家鄉沒去過的村莊（說得出村名）；聚落名取自已知表', () => {
    const g = new DelveGame({ seed: 'hint2', worldGen: { kind: 'gen2' } }), d = g.discovery;
    g.giveGear('iron_pickaxe', 1);
    g.settle.cores.push({ id: 1, x: g.spawn.x, y: g.spawn.y });
    const vs = d.listKnown().filter((r) => r.kind === 'village');
    expect(vs.length).toBeGreaterThan(1);
    // 每座村莊的聚落名 = 已知表裡那座村莊的名字
    for (const v of vs) { const s = g.siteAt(v.ax, v.ay)!; expect(s.kind).toBe('village'); expect(g.siteName(s.key)).toBe(v.name); }
    expect(g.nextStepHint()).toMatch(/村子「[^」]+」/);
    // 走過一座之後，提示改指另一座沒去過的
    const first = g.nextStepHint().match(/「([^」]+)」/)![1], went = vs.find((v) => v.name === first)!;
    d.visit(went.ax, went.ay);
    const next = g.nextStepHint().match(/村子「([^」]+)」/)![1];
    expect(next).not.toBe(first);
    expect(vs.filter((v) => !d.isFound(v.id)).map((v) => v.name)).toContain(next);
  }, 60_000);

  it('gen2：探路（scout）標出的地點在 listKnown 裡、還沒去過；委託的 nearestUnfound、markDone 也讀已知表', () => {
    const g = new DelveGame({ seed: 'hint2', worldGen: { kind: 'gen2' } }), d = g.discovery;
    const m: Spot | null = g.scout();                       // scout(): { name, x, y } | null（沒有 id）
    expect(m).not.toBeNull();
    const known = d.listKnown().find((r) => r.ax === m!.x && r.ay === m!.y), lm = g.landmarks.find((l) => l.x === m!.x && l.y === m!.y);
    expect(Boolean(known) || Boolean(lm)).toBe(true);
    if (known) { expect(known.name).toBe(m!.name); expect(d.isFound(known.id)).toBe(false); }
    expect(g.scoutMarks).toContainEqual({ x: m!.x, y: m!.y });  // scoutMarks: MapMarker[] = { x, y }
    // 委託：離委託人最近、還沒發現的地點（不含村莊 / 地廳）
    const q = hidden(g).questCtx().nearestUnfound(g.spawn.x, g.spawn.y, ['site', 'cave', 'secret', 'dungeon'], new Set());
    expect(q).not.toBeNull();
    const qr = d.listKnown().find((r) => r.id === q!.id)!;
    expect(qr).toBeDefined();
    expect(d.isFound(qr.id)).toBe(false);
    expect(['village', 'dwarf_hall']).not.toContain(qr.kind);
    expect({ name: qr.name, x: qr.ax, y: qr.ay }).toEqual({ name: q!.name, x: q!.x, y: q!.y });
    // markDone：那個地點發現之後，標記就算完成
    expect(hidden(g).markDone(qr.ax, qr.ay)).toBe(false);
    d.visit(qr.ax, qr.ay);
    expect(hidden(g).markDone(qr.ax, qr.ay)).toBe(true);
    expect(hidden(g).questCtx().nearestUnfound(g.spawn.x, g.spawn.y, ['site', 'cave', 'secret', 'dungeon'], new Set())?.id).not.toBe(qr.id);
  }, 60_000);
});
