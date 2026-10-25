// game.folk.test.ts — 世界 NPC 接上遊戲：村民 / 矮人的職能、好感度定價、服務（治療 / buff / 深岩升階）、
// 遇見（行商 / 受困探險者：條件、冷卻、上限、護送）、委託（接 / 進度 / 交付不能重刷）、地標（只能領一次）、存檔來回。
import { beforeAll, describe, expect, it } from 'vitest';
import { DelveGame } from './game';
import { FIXED_DT, TILE_SIZE as S, DAY_LENGTH } from './constants';
import { T } from './tiles';
import { ROLES, AFF_TRADE_DAILY, BUFFS, affTier } from './folkDefs';
import { STRANDED_MAX } from './folk';
import { restoreGame, serializeGame } from '../save/serialize';
import type { DungeonInfo } from './genTypes';
import { SITE_NPC_BASE, npcIdFor } from './siteRegistry';
import { gen2SiteRegionId } from './gen2/structId';




const fresh = (): DelveGame => new DelveGame({ seed: 'alpha', peaceful: true });
const steps = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(FIXED_DT); };
/** 站到某位 NPC 旁邊 */
function goTo(g: DelveGame, key: string): void {
  const n = g.folk.byKey(key)!;
  g.teleport(Math.floor((n.body.x + n.body.w / 2) / S) + 1, Math.floor((n.body.y + n.body.h - 1) / S));
}

/** FNV-1a（外觀指紋用） */
const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
// 改 folk.ts / SiteRegistry 之前，在舊世界 'alpha' 錄下的村民 / 矮人：[key, 角色, 名字, 外觀指紋, 白天範圍, 晚上的位置, 初始身體 px]
const FOLK_BEFORE = [
  ['h0:dwarf_elder', 'dwarf_elder', '晶耳・岡妲', 932598616, '2426..2438', '-', '38910,11005'],
  ['h0:ore_trader', 'ore_trader', '深脈・杜瓦', 1654945588, '2447..2453', '-', '39198,11005'],
  ['h0:runesmith', 'runesmith', '深脈・魯克', 3038395399, '2406..2413', '-', '38542,11005'],
  ['h1:dwarf_elder', 'dwarf_elder', '灰岩・伯恩', 2881899463, '918..930', '-', '14782,13565'],
  ['h1:ore_trader', 'ore_trader', '灰岩・朵菈', 423104471, '946..952', '-', '15182,13565'],
  ['h1:runesmith', 'runesmith', '晶耳・朵菈', 2268316833, '891..898', '-', '14302,13565'],
  ['v0:elder', 'elder', '漢克', 1400021624, '270..273', '259,280', '4334,4461'],
  ['v0:guide', 'guide', '雪菈', 248887729, '239..242', '286,280', '3838,4461'],
  ['v0:smith', 'smith', '莫莉', 2578590433, '296..300', '289,280', '4766,4461'],
  ['v0:trader', 'trader', '葛雷', 445350778, '277..281', '246,280', '4462,4461'],
  ['v1:elder', 'elder', '提歐', 3022895399, '2981..2984', '2997,282', '47710,4493'],
  ['v1:guide', 'guide', '葛雷', 197652797, '3009..3014', '3000,282', '48174,4493'],
  ['v1:healer', 'healer', '諾拉', 2851642318, '2959..2964', '2971,282', '47374,4493'],
  ['v1:trader', 'trader', '琪雅', 3154175815, '2988..2992', '2968,282', '47838,4493'],
  ['v2:elder', 'elder', '露露', 2219663239, '1589..1592', '1605,271', '25438,4317'],
  ['v2:healer', 'healer', '艾琳', 2376874338, '1617..1622', '1608,271', '25902,4317'],
  ['v2:smith', 'smith', '提歐', 3498937182, '1568..1572', '1579,271', '25118,4317'],
  ['v2:trader', 'trader', '蜜拉', 3950961827, '1596..1600', '1576,271', '25566,4317'],
];
/** 改動前的 siteName（村落依序、地廳依序） */
const NAMES_BEFORE = ['麥浪村', '暮光村', '白石村', '深爐大廳', '灰鬚石廳'];

describe('聚落登錄（舊世界 alpha）', { timeout: 120_000 }, () => {
  let g: DelveGame;
  beforeAll(() => { g = fresh(); }, 120_000);

  it('舊世界的 NPC key / 角色 / 名字 / 外觀與改動前相同', () => {
    const rows = g.folk.npcs.filter((n) => n.origin !== 'road' && n.origin !== 'cave')
      .map((n) => [n.key, n.role, n.name, fnv(JSON.stringify(n.look)), `${n.zone.x0}..${n.zone.x1}`, n.night ? `${n.night.x},${n.night.y}` : '-', `${n.body.x},${n.body.y}`]).sort();
    expect(rows).toEqual(FOLK_BEFORE);
  });
  it('聚落 NPC 的 id = npcIdFor(key)、彼此不撞', () => {
    const settled = g.folk.npcs.filter((q) => q.id >= SITE_NPC_BASE), ids = settled.map((n) => n.id);
    expect(settled.length).toBe(FOLK_BEFORE.length);
    for (const n of settled) expect(n.id).toBe(npcIdFor(n.key));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('登錄 = v{i} / h{i} / d0（依序）；siteName(key) 與改動前相同；委託板找得到自己的村子', () => {
    expect(g.sites.list('village').map((s) => s.key)).toEqual(g.villages.map((_, i) => `v${i}`));
    expect(g.sites.list('hall').map((s) => s.key)).toEqual(g.halls.map((_, i) => `h${i}`));
    expect(g.sites.list('dungeon').map((s) => s.key)).toEqual(g.dungeon ? ['d0'] : []);
    expect([...g.villages.map((_, i) => g.siteName(`v${i}`)), ...g.halls.map((_, i) => g.siteName(`h${i}`))]).toEqual(NAMES_BEFORE);
    for (let i = 0; i < g.villages.length; i++) {
      const b = g.villages[i].board;
      expect(g.siteAt(b.x, b.y)?.key).toBe(`v${i}`);
      expect(g.folk.byKey(`v${i}:elder`)!.site).toBe(`v${i}`);
    }
    for (const n of g.folk.npcs) if (n.origin === 'hall') expect(n.site).toMatch(/^h\d+$/);
  });
});

describe('安全的地方（folkSafeAt：旅人不出現、護送完成）', { timeout: 120_000 }, () => {
  it('gen2：隱士小屋算安全；地城不算（siteAt 仍認得它）；範圍外不算', () => {
    const g = new DelveGame({ seed: 'safe', worldGen: { kind: 'gen2' } });
    // 家鄉的聚落開局就登錄（M2a Task 9）：注入的地城 / 隱士放在家鄉外，不和真的村莊重疊
    const dx = g.spawn.x + 20_000, hx = g.spawn.x - 20_000;
    expect(g.siteAt(dx + 20, 315)).toBeNull(); expect(g.siteAt(hx + 8, 192)).toBeNull();
    g.sites.add({ kind: 'dungeon', key: 'sd', rot: 0, info: { bbox: { x: dx, y: 300, w: 40, h: 30 } } as DungeonInfo });
    g.sites.add({ kind: 'hermit', key: 'sh', rot: 0, at: { x: hx, y: 200 } });
    expect(g.siteAt(dx + 20, 315)?.kind).toBe('dungeon');
    expect(g.folkSafeAt(dx + 20, 315)).toBe(false);
    expect(g.folkSafeAt(dx, 300)).toBe(false);
    expect(g.siteAt(hx + 8, 192)?.key).toBe('sh');
    expect(g.folkSafeAt(hx + 8, 192)).toBe(true);
    expect(g.folkSafeAt(hx + 9, 200)).toBe(false);
  });
  it('舊世界：村落 / 地廳安全、地城不安全（同改動前）', () => {
    const g = fresh(), d = g.dungeon!, v = g.villages[0], h = g.halls[0];
    expect(g.folkSafeAt(d.bbox.x + (d.bbox.w >> 1), d.bbox.y + (d.bbox.h >> 1))).toBe(false);
    expect(g.folkSafeAt(v.board.x, v.board.y)).toBe(true);
    expect(g.folkSafeAt(h.forge.x, h.forge.y)).toBe(true);
  });
});

describe('村民與矮人', { timeout: 120_000 }, () => {
  it('每座村落有村長 + 雜貨商 + 兩位職能 NPC；每座地廳有三位矮人；職能都派得上用場', () => {
    const g = fresh();
    expect(g.villages.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < g.villages.length; i++) {
      const roles = g.folk.npcs.filter((n) => n.key.startsWith(`v${i}:`)).map((n) => n.role);
      expect(roles).toContain('elder');
      expect(roles).toContain('trader');
      expect(roles.length).toBe(4);
    }
    const all = new Set(g.folk.npcs.map((n) => n.role));
    for (const r of ['smith', 'healer', 'guide']) expect(all.has(r as never)).toBe(true);
    for (let i = 0; i < g.halls.length; i++) {
      const d = g.folk.npcs.filter((n) => n.key.startsWith(`h${i}:`));
      expect(d.map((n) => n.role).sort()).toEqual(['dwarf_elder', 'ore_trader', 'runesmith']);
      for (const n of d) { expect(n.race).toBe('dwarf'); expect(n.look.dwarf).toBe(true); expect(n.name).toMatch(/・/); }
    }
    // 每個角色都有用途：商店 / 服務 / 委託至少一樣
    for (const def of Object.values(ROLES)) expect(def.shop.length + def.services.length + (def.quests ? 1 : 0) + (def.role === 'peddler' ? 1 : 0)).toBeGreaterThan(0);
  });

  it('村民白天在村裡、晚上回屋子裡（會開門）', () => {
    const g = fresh();
    const key = 'v0:trader';
    goTo(g, key);
    g.setDate({ hour: 12 });
    steps(g, 60);
    const n = g.folk.byKey(key)!, v = g.villages[0];
    expect(n.body.x / S).toBeGreaterThan(v.x0 - 2);
    expect(n.body.x / S).toBeLessThan(v.x1 + 2);
    g.setDate({ hour: 23 });
    steps(g, 60 * 25);
    const fx = Math.floor((n.body.x + n.body.w / 2) / S);
    expect(v.houses.some((h) => fx > h.x0 && fx < h.x1)).toBe(true);
  });

  it('買東西：價格 × 好感度倍率；好感度不夠的商品買不到；交易好感度每天有上限', () => {
    const g = fresh();
    const key = 'v0:trader';
    goTo(g, key);
    g.give('silver_coin', 50);
    const shop = ROLES.trader.shop;
    const lock = shop.findIndex((e) => (e.tier ?? 0) >= 2);
    expect(g.folkBuy(key, lock)).toBe(false);
    const before = g.coins();
    expect(g.folkBuy(key, 0)).toBe(true);
    expect(before - g.coins()).toBe(shop[0].price);
    for (let i = 0; i < 10; i++) g.folkBuy(key, 0);
    expect(g.folk.affinity(key)).toBe(AFF_TRADE_DAILY);
    g.folk.addAff(key, 60);
    expect(affTier(g.folk.affinity(key))).toBeGreaterThanOrEqual(2);
    const b2 = g.coins();
    expect(g.folkBuy(key, lock)).toBe(true);
    expect(b2 - g.coins()).toBeLessThan(shop[lock].price);
    // 賣東西：好感度越高單價越高
    g.give('fang', 5);
    expect(g.folkSellPrice(key, 'fang')).toBeGreaterThan(ROLES.trader.buys!.fang!);
  });

  it('醫者：治療回滿、祝福 buff 加回血、守護減傷；buff 會過期', () => {
    const g = fresh();
    const v = g.folk.npcs.find((n) => n.role === 'healer')!;
    goTo(g, v.key);
    g.give('silver_coin', 20);
    expect(g.folkService(v.key, 'heal').ok).toBe(false); // 滿血
    g.hp = 10;
    expect(g.folkService(v.key, 'heal').ok).toBe(true);
    expect(g.hp).toBe(g.maxHp());
    expect(g.folkService(v.key, 'bless').ok).toBe(false); // 要熟識
    g.folk.addAff(v.key, 30);
    expect(g.folkService(v.key, 'bless').ok).toBe(true);
    expect(g.buffOn('bless')).toBe(true);
    g.time += BUFFS.bless.secs + 1;
    steps(g, 2);
    expect(g.buffOn('bless')).toBe(false);
  });

  it('矮人：礦石商賣地表買不到的深層礦；符文匠的深岩升階要熟識、用錠升一階', () => {
    const g = fresh();
    const surfaceItems = new Set([...ROLES.trader.shop, ...ROLES.smith.shop].map((e) => e.item));
    expect(ROLES.ore_trader.shop.some((e) => !surfaceItems.has(e.item) && (e.item === 'gold_ore' || e.item === 'obsidian'))).toBe(true);
    const rs = g.folk.npcs.find((n) => n.role === 'runesmith')!;
    goTo(g, rs.key);
    g.giveGear('iron_sword', 1);
    const at = g.inventory.slots.findIndex((s) => s?.item === 'iron_sword' && s.gear?.rarity === 1);
    g.give('gold_bar', 10); g.give('silver_coin', 20);
    expect(g.deepforge(at, rs.key)).toEqual({ ok: false, reason: 'locked' });
    g.folk.addAff(rs.key, 30);
    const c = g.deepforgeCost(at, rs.key)!;
    expect(g.deepforge(at, rs.key)).toEqual({ ok: true });
    expect(g.inventory.slots[at]!.gear!.rarity).toBe(2);
    expect(g.inventory.count('gold_bar')).toBe(10 - c.n);
    // 熔爐 + 符文匠身邊就是鐵砧
    expect(g.stations().anvil).toBe(true);
  });
});

describe('遇見', { timeout: 120_000 }, () => {
  it('行商：白天、地表、不在村落 → 在畫面外出現；有冷卻，同時只有一位；天黑就離開', () => {
    const g = fresh();
    g.folk.chanceOverride = 1;
    // 出生點附近的平地（不在村落裡）
    g.teleport(g.spawn.x, g.spawn.y);
    g.setDate({ hour: 10 });
    steps(g, 60 * 10);
    expect(g.folk.travellers().length).toBe(0); // 開局的冷卻：剛開始不會馬上遇到
    g.folk.enc.nextTraveller = 0;
    steps(g, 60 * 10);
    const t = g.folk.travellers();
    expect(t.length).toBe(1);
    expect(['peddler', 'herbalist']).toContain(t[0].role);
    expect(Math.abs(t[0].body.x / S - g.playerTile().x)).toBeGreaterThan(g.viewHalf.w);
    if (t[0].role === 'peddler') expect(g.folk.shop(t[0]).length).toBe(5);
    steps(g, 60 * 20);
    expect(g.folk.travellers().length).toBe(1); // 冷卻中：不會再生
    g.setDate({ hour: 23 });
    steps(g, 60 * 2);
    expect(g.folk.travellers()[0]?.leaving ?? true).toBe(true);
  });

  it('受困探險者：只在地底出現；救援後跟著走，到地表算護送完成；謝禮只能領一次；之後可邀請成嚮導', () => {
    const g = fresh();
    g.folk.chanceOverride = 1;
    g.setDate({ hour: 10 });
    g.teleport(g.spawn.x, g.spawn.y);
    g.folk.enc.nextStranded = 0;
    steps(g, 60 * 10);
    expect(g.folk.travellers().some((n) => n.role === 'stranded')).toBe(false);
    const n = g.debugEncounter('stranded', 3)!;
    expect(n).not.toBeNull();
    goTo(g, n.key);
    expect(g.folkService(n.key, 'rescue').ok).toBe(true);
    expect(n.following).toBe(true);
    const qid = `${n.key}#escort`;
    expect(g.quests.get(qid)).not.toBeNull();
    // 玩家傳回出生點（地表）：探險者跟上 → 安全
    g.teleport(g.spawn.x, g.spawn.y);
    steps(g, 60 * 3);
    expect(n.safe).toBe(true);
    g.teleport(Math.floor(n.body.x / S) + 1, Math.floor((n.body.y + n.body.h - 1) / S));
    const xp = g.levels.xp;
    expect(g.turnInQuest(qid)).toBe(true);
    expect(g.levels.xp).toBeGreaterThan(xp);
    expect(g.turnInQuest(qid)).toBe(false);
    expect(g.folkService(n.key, 'invite').ok).toBe(true);
    expect(g.settle.invited.has('guide')).toBe(true);
    expect(g.settle.canMoveIn('guide', 0, g.world).ok).toBe(false); // 還沒有據點
  });

  it(`受困探險者整個世界最多 ${STRANDED_MAX} 位，而且有冷卻`, () => {
    const g = fresh();
    g.folk.chanceOverride = 1;
    const h = g.halls[0];
    // 洞穴：找地底一個站得住的地方
    g.teleport((h.x0 + h.x1) >> 1, h.floorY - 1);
    g.folk.enc.nextStranded = 0;
    let spawned = 0;
    for (let k = 0; k < 6; k++) {
      g.teleport(h.x0 - 40 - k * 3, h.floorY - 1);
      steps(g, 60 * 9);
      const s = g.folk.travellers().find((q) => q.role === 'stranded');
      if (s) { spawned++; g.folk.dismiss(s); s.t = 99; g.folk.npcs = g.folk.npcs.filter((q) => q !== s); }
      g.time += DAY_LENGTH * 1.3;
    }
    expect(spawned).toBeGreaterThan(0);
    expect(g.folk.enc.stranded).toBeLessThanOrEqual(STRANDED_MAX);
    expect(spawned).toBeLessThanOrEqual(STRANDED_MAX);
  });
});

describe('委託', { timeout: 120_000 }, () => {
  it('村長的委託：接下 → 討伐計數 → 在村長身邊交付 → 經驗 / 銅幣 / 好感；不能重刷', () => {
    const g = fresh();
    const key = 'v0:elder';
    goTo(g, key);
    const offers = g.questOffers(key);
    expect(offers.length).toBe(2);
    const slay = offers.find((q) => q.kind === 'slay')!;
    expect(g.acceptQuest(key, slay.id)).toBe(true);
    expect(g.questOffers(key).some((q) => q.id === slay.id)).toBe(false);
    expect(g.turnInQuest(slay.id)).toBe(false);
    for (let i = 0; i < slay.n; i++) { const e = g.spawnEnemy(slay.enemy!, g.playerTile().x + 3, g.playerTile().y - 2); g.debugDamage(e.id, 9999); }
    steps(g, 5);
    expect(g.quests.ready(g.quests.get(slay.id)!)).toBe(true);
    const coins = g.coins(), aff = g.folk.affinity(key);
    g.teleport(g.playerTile().x + 40, g.playerTile().y);
    expect(g.turnInQuest(slay.id)).toBe(false); // 不在村長身邊
    goTo(g, key);
    expect(g.turnInQuest(slay.id)).toBe(true);
    expect(g.coins()).toBeGreaterThan(coins);
    expect(g.folk.affinity(key)).toBeGreaterThan(aff);
    expect(g.turnInQuest(slay.id)).toBe(false);
    expect(g.acceptQuest(key, slay.id)).toBe(false);
  });
  it('收集委託交付時扣掉道具；委託板（tile）打開村長的面板', () => {
    const g = fresh();
    const key = 'v0:elder';
    goTo(g, key);
    const col = g.questOffers(key).find((q) => q.kind === 'collect')!;
    g.acceptQuest(key, col.id);
    g.give(col.item!, col.n + 2);
    expect(g.turnInQuest(col.id)).toBe(true);
    expect(g.inventory.count(col.item!)).toBe(2);
    const b = g.villages[0].board;
    g.teleport(b.x + 1, b.y);
    g.drainEvents();
    expect(g.interact(b.x, b.y)).toBe(true);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'folktalk', key, board: true }));
  });
});

describe('地標', { timeout: 120_000 }, () => {
  it('第一次互動給獎勵 + 文字（+ 線索標記），之後只說「搜過了」；日誌統計', () => {
    const g = fresh();
    const l = g.landmarks.find((q) => q.tile === T.RELIC_PACK)!;
    g.teleport(l.x + 1, l.y);
    g.drainEvents();
    const coins = g.coins(), markers = g.scoutMarks.length;
    expect(g.interact(l.x, l.y)).toBe(true);
    const e = g.drainEvents().find((q) => q.type === 'landmark');
    expect(e).toMatchObject({ type: 'landmark', first: true });
    expect(g.coins()).toBeGreaterThan(coins);
    expect(g.scoutMarks.length).toBe(markers + 1);
    expect(g.discovery.stats().landmarks.found).toBe(1);
    const c2 = g.coins();
    g.interact(l.x, l.y);
    expect(g.drainEvents().find((q) => q.type === 'landmark')).toMatchObject({ first: false });
    expect(g.coins()).toBe(c2);
  });
});

describe('存檔', { timeout: 120_000 }, () => {
  it('好感度 / 委託 / 邀請 / 旅人 / buff / 地標都能存檔讀回', () => {
    const g = fresh();
    g.folk.addAff('v0:trader', 42);
    goTo(g, 'v0:elder');
    const q = g.questOffers('v0:elder')[0];
    g.acceptQuest('v0:elder', q.id);
    g.settle.invite('healer');
    const t = g.debugEncounter('peddler', 5)!;
    g.giveBuff('ward');
    const l = g.landmarks[0];
    g.teleport(l.x + 1, l.y);
    g.interact(l.x, l.y);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.folk.affinity('v0:trader')).toBe(42);
    expect(h.quests.get(q.id)?.def.title).toBe(q.title);
    expect(h.settle.invited.has('healer')).toBe(true);
    const t2 = h.folk.byKey(t.key)!;
    expect(t2.role).toBe('peddler');
    expect(h.folk.shop(t2)).toEqual(g.folk.shop(t));
    expect(h.buffOn('ward')).toBe(true);
    expect(h.discovery.landmarks.has(h.world.idx(l.x, l.y))).toBe(true);
    expect(h.folk.npcs.filter((n) => n.site !== null).length).toBe(g.folk.npcs.filter((n) => n.site !== null).length);
  });
});

// M2a Task 20：隱士的 chart 服務（荒野大陸的隱士小屋 = 該大陸朝外的下一片大陸；島上的隱士在 gen2/islands.test.ts）
describe('隱士的 chart（荒野大陸的隱士小屋）', { timeout: 120_000 }, () => {
  it('標出朝外下一片大陸的一處未找到的大東西（村莊 / 小地城 / 地廳）；都找到了就退回一般的 scout', () => {
    const g = new DelveGame({ seed: 'chart-c', worldGen: { kind: 'gen2' } }), src = g.gen2()!, lay = src.layout, cont = lay.landmass(1, 2);
    const hut = src.blueprints.overlapping(cont.x0, cont.x1).find((b) => b.kind === 'hermit_hut' && b.x >= cont.x0 && b.x < cont.x1)!;
    const site = hut.site!;
    if (site.kind !== 'hermit') throw new Error('no hermit site');
    g.teleport(site.at.x, site.at.y); steps(g, 30);
    const key = `${site.key}:hermit`, next = lay.landmass(1, 4);
    expect(g.folk.byKey(key)?.role).toBe('hermit');
    g.give('copper_coin', 2000);
    // 下一片大陸的大東西的地區
    const big = src.blueprints.anchorsOf(next).filter((a) => a.kind === 'village' || a.kind === 'keep' || a.kind === 'hall')
      .map((a) => g.discovery.region(gen2SiteRegionId(src.blueprints.anchorBlueprint(next, a)!.id, 0))!);
    expect(big.length).toBeGreaterThanOrEqual(2);
    const before = g.scoutMarks.length, coins = g.coins(), r = g.folkService(key, 'chart');
    expect(r.ok).toBe(true); expect(g.coins()).toBe(coins - 120);
    const m = g.scoutMarks.at(-1)!;
    expect(g.scoutMarks.length).toBe(before + 1);
    expect(big.some((q) => q.ax === m.x && q.ay === m.y)).toBe(true);
    expect(r.msg).toContain(`「${big.find((q) => q.ax === m.x && q.ay === m.y)!.name}」`);
    // 全部走過（找到）→ 退回一般的 scout（標附近已知、沒去過的地點）
    for (const q of big) g.discovery.visit(q.ax, q.ay);
    expect(big.every((q) => g.discovery.isFound(q.id))).toBe(true);
    const r2 = g.folkService(key, 'chart'), m2 = g.scoutMarks.at(-1)!;
    expect(r2.ok).toBe(true); expect(r2.msg).not.toContain('「」');
    expect(big.some((q) => q.ax === m2.x && q.ay === m2.y)).toBe(false);
    expect(g.lastScout).toMatchObject({ x: m2.x, y: m2.y });
  });
});
