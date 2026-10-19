// game.folk2.test.ts — 驗收回饋：NPC 不重疊 / 點最近的、邀請與護送的順序、嚮導標記、距離檢查、行商庫存、多重 buff、
// 護送的風險（血量 / 被打 / 死亡失敗 / 玩家死亡後原地等）、BFS 跟隨、鍵盤對話、招募後的據點專屬好處。
import { describe, expect, it } from 'vitest';
import { DelveGame } from './game';
import { FIXED_DT, TILE_SIZE as S, DAY_LENGTH } from './constants';
import { T } from './tiles';
import { ROLES } from './folkDefs';
import { restoreGame, serializeGame } from '../save/serialize';

const fresh = (seed = 'alpha'): DelveGame => new DelveGame({ seed, peaceful: true });
const steps = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(FIXED_DT); };
const goTo = (g: DelveGame, key: string, dx = 1): void => {
  const n = g.folk.byKey(key)!;
  g.teleport(Math.floor((n.body.x + n.body.w / 2) / S) + dx, Math.floor((n.body.y + n.body.h - 1) / S));
};
/** 洞穴裡救一位探險者（站在他旁邊） */
function rescueOne(g: DelveGame): ReturnType<DelveGame['debugEncounter']> {
  const l = g.landmarks.find((q) => q.site === 'cavern')!;
  g.teleport(l.x - 2, l.y);
  const n = g.debugEncounter('stranded', 3) ?? g.debugEncounter('stranded', -3)!;
  goTo(g, n.key);
  expect(g.folkService(n.key, 'rescue').ok).toBe(true);
  return n;
}

describe('驗收回饋', { timeout: 180_000 }, () => {
  it('同村的 NPC 各有不重疊的活動範圍；點擊選離游標最近的那位', () => {
    for (const seed of ['alpha', 'beta']) {
      const g = fresh(seed);
      for (let i = 0; i < g.villages.length; i++) {
        const fs = g.folk.npcs.filter((n) => n.key.startsWith(`v${i}:`)).sort((a, b) => a.zone.x0 - b.zone.x0);
        for (let k = 1; k < fs.length; k++) expect(fs[k].zone.x0, `${seed} v${i} ${fs[k - 1].role}/${fs[k].role}`).toBeGreaterThan(fs[k - 1].zone.x1);
        const xs = fs.map((n) => Math.floor(n.body.x / S));
        expect(new Set(xs).size).toBe(xs.length);
        // 晚上待的位置也不一樣
        const nights = fs.map((n) => `${n.night?.x},${n.night?.y}`);
        expect(new Set(nights).size).toBe(nights.length);
      }
    }
    const g = fresh();
    const [a, b] = g.folk.npcs;
    b.body.x = a.body.x + 6; b.body.y = a.body.y;
    expect(g.folk.atPx(b.body.x + b.body.w / 2 + 2, b.body.y + 10)?.key).toBe(b.key);
    expect(g.folk.atPx(a.body.x + 2, a.body.y + 10)?.key).toBe(a.key);
  });

  it('每個世界都有嚮導可以找（第一座村子一定有）', () => {
    for (const seed of ['alpha', 'beta', 'gamma']) expect(fresh(seed).folk.byKey('v0:guide'), seed).not.toBeNull();
  });

  it('先按「邀請入住」也不會卡死：邀請時自動交付護送；對象消失的護送會自動結案 / 可以放棄', () => {
    const g = fresh();
    const n = rescueOne(g)!;
    const qid = `${n.key}#escort`;
    // 一起走到地表（測試直接把兩人放到出生點旁）
    g.teleport(g.spawn.x, g.spawn.y);
    n.body.x = g.player.x + 24; n.body.y = g.player.y + g.player.h - n.body.h;
    steps(g, 60 * 3);
    expect(n.safe).toBe(true);
    goTo(g, n.key);
    const xp = g.levels.xp;
    expect(g.folkService(n.key, 'invite').ok).toBe(true);
    expect(g.quests.completed.has(qid)).toBe(true);
    expect(g.quests.get(qid)).toBeNull();
    expect(g.levels.xp).toBeGreaterThan(xp);
    // 對象消失（例如被移除）→ 護送自動結案
    const h = fresh();
    const m = rescueOne(h)!;
    h.folk.npcs = h.folk.npcs.filter((q) => q !== m);
    steps(h, 40);
    expect(h.quests.get(`${m.key}#escort`)).toBeNull();
    expect(h.quests.completed.has(`${m.key}#escort`)).toBe(false);
  });

  it('嚮導的「標出地點」：用自己的標記清單（不吃玩家的 20 個上限）；沒有新地點可標時不收錢', () => {
    const g = fresh();
    g.give('silver_coin', 200);
    for (let i = 0; i < 20; i++) g.markers.push({ x: i, y: 5 });
    goTo(g, 'v0:guide');
    const c0 = g.coins();
    const r = g.folkService('v0:guide', 'scout');
    expect(r.ok).toBe(true);
    expect(g.coins()).toBeLessThan(c0);
    expect(g.markers.length).toBe(20);
    expect(g.scoutMarks.length).toBe(1);
    const r2 = g.folkService('v0:guide', 'scout');
    expect(r2.msg).not.toBe(r.msg);
    // 全部標完 → 不收錢
    for (const l of g.landmarks) g.discovery.landmarks.add(g.world.idx(l.x, l.y));
    for (const reg of g.regions) g.discovery.found.add(reg.id);
    const c1 = g.coins();
    const r3 = g.folkService('v0:guide', 'scout');
    expect(r3.ok).toBe(false);
    expect(r3.msg).toMatch(/沒有/);
    expect(g.coins()).toBe(c1);
  });

  it('買賣 / 服務 / 委託都要在 NPC 身邊才行', () => {
    const g = fresh();
    g.give('silver_coin', 50);
    g.teleport(g.spawn.x, g.spawn.y);
    expect(g.folkBuy('v0:trader', 0)).toBe(false);
    expect(g.folkService('v0:healer', 'heal').ok).toBe(false);
    g.give('gel', 3);
    expect(g.folkSell('v0:trader', 'gel', 1)).toBe(false);
    const off = g.questOffers('v0:elder')[0];
    expect(g.acceptQuest('v0:elder', off.id)).toBe(false);
    goTo(g, 'v0:trader');
    expect(g.folkBuy('v0:trader', 0)).toBe(true);
  });

  it('行商的限定貨有庫存，賣完就買不到；庫存會存檔', () => {
    const g = fresh();
    g.give('silver_coin', 900);
    const t = g.debugEncounter('peddler', 4) ?? g.debugEncounter('peddler', -4)!;
    goTo(g, t.key);
    const shop = g.folk.shop(t);
    const left = g.folk.stockLeft(t, 0);
    expect(left).toBeGreaterThanOrEqual(1);
    expect(left).toBeLessThanOrEqual(3);
    for (let k = 0; k < left; k++) expect(g.folkBuy(t.key, 0), `buy ${k}`).toBe(true);
    expect(g.folk.stockLeft(t, 0)).toBe(0);
    expect(g.folkBuy(t.key, 0)).toBe(false);
    expect(shop.length).toBe(5);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.game.folk.stockLeft(r.game.folk.byKey(t.key)!, 0)).toBe(0);
  });

  it('buff 可以同時有好幾種：守護不會蓋掉祝福、圖騰的祝福不會蓋掉礦工之歌；存檔讀回', () => {
    const g = fresh();
    g.giveBuff('minesong');
    g.giveBuff('bless');
    g.giveBuff('ward');
    expect(g.buffOn('minesong') && g.buffOn('bless') && g.buffOn('ward')).toBe(true);
    expect(g.activeBuffs().map((b) => b.kind).sort()).toEqual(['bless', 'minesong', 'ward']);
    const totem = g.landmarks.find((l) => l.tile === T.SPORE_TOTEM);
    if (totem) { g.teleport(totem.x + 1, totem.y); g.interact(totem.x, totem.y); expect(g.buffOn('minesong')).toBe(true); }
    const r = restoreGame(serializeGame(g));
    expect(r.ok && r.game.buffOn('ward') && r.game.buffOn('minesong')).toBe(true);
  });

  it('護送有風險：探險者有血量，被怪物碰到會受傷；死了護送失敗（自動結案、之後可以再遇到）', () => {
    const g = fresh();
    g.peaceful = false;
    const n = rescueOne(g)!;
    expect(n.hp).toBeGreaterThan(0);
    const hp0 = n.hp!;
    const fx = Math.floor((n.body.x + n.body.w / 2) / S), fy = Math.floor((n.body.y + n.body.h - 1) / S);
    const e = g.spawnEnemy('night_walker', fx, fy);
    e.body.x = n.body.x; e.body.y = n.body.y + n.body.h - e.body.h;
    steps(g, 3);
    expect(n.hp!).toBeLessThan(hp0);
    const before = g.folk.enc.stranded;
    n.hp = 1;
    g.iframesFolk(n, 0);
    e.body.x = n.body.x; e.body.y = n.body.y + n.body.h - e.body.h;
    steps(g, 3);
    expect(g.folk.byKey(n.key)).toBeNull();
    expect(g.quests.get(`${n.key}#escort`)).toBeNull();
    expect(g.folk.enc.stranded).toBe(before - 1);
  });

  it('玩家死亡重生：探險者不會跟著傳送、也不會算安全，留在原地等；回去說話才繼續跟', () => {
    const g = fresh();
    const n = rescueOne(g)!;
    const at = { x: n.body.x, y: n.body.y };
    g.hp = 1; g.hurtPlayer(9999, 0);
    steps(g, 60 * 8);
    expect(n.safe).toBeFalsy();
    expect(n.following).toBe(false);
    expect(n.waiting).toBe(true);
    expect(Math.hypot(n.body.x - at.x, n.body.y - at.y)).toBeLessThan(S * 6);
    goTo(g, n.key);
    expect(g.folkService(n.key, 'rescue').ok).toBe(true);
    expect(n.following).toBe(true);
  });

  it('跟隨用 BFS 找路：玩家走到一段階梯上面，探險者自己爬上去（不是瞬移）', () => {
    const g = fresh();
    const n = rescueOne(g)!;
    // 造一個 6 格高、一格一階的樓梯（玩家站在頂上，距離 8 格）
    const w = g.world, x0 = Math.floor((n.body.x + n.body.w / 2) / S), y0 = Math.floor((n.body.y + n.body.h - 1) / S);
    for (let x = x0 - 2; x <= x0 + 12; x++) for (let y = y0 - 10; y <= y0; y++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 0, 0); }
    for (let x = x0 - 2; x <= x0 + 12; x++) w.setFg(x, y0 + 1, T.STONE);
    for (let k = 0; k < 6; k++) for (let x = x0 + 3 + k; x <= x0 + 12; x++) w.setFg(x, y0 - k, T.STONE);
    g.teleport(x0 + 10, y0 - 6);
    let jumps = 0, last = n.body.x;
    for (let i = 0; i < 60 * 8; i++) { g.step(FIXED_DT); if (Math.abs(n.body.x - last) > S * 3) jumps++; last = n.body.x; }
    const fy = Math.floor((n.body.y + n.body.h - 1) / S);
    expect(fy).toBeLessThanOrEqual(y0 - 4);
    expect(jumps).toBe(0);
  });

  it('鍵盤對話：靠近 NPC 按對話鍵（talkNearest）就開面板；太遠沒反應', () => {
    const g = fresh();
    goTo(g, 'v0:trader', 2);
    g.drainEvents();
    expect(g.talkNearest()).toBe(true);
    expect(g.drainEvents()).toContainEqual(expect.objectContaining({ type: 'folktalk', key: 'v0:trader' }));
    expect(g.nearestTalkable()?.name).toBeTruthy();
    g.teleport(g.spawn.x, g.spawn.y);
    expect(g.talkNearest()).toBe(false);
  });

  it('招募的好處：據點有嚮導 → 每天自動在地圖標一個新地點；有藥師 → 每天第一次說話送一次祝福', () => {
    const g = fresh();
    const t = g.playerTile();
    g.world.setFg(t.x + 2, t.y, T.HEARTH); g.settle.found(t.x + 2, t.y);
    g.debugMoveIn('guide', true); g.debugMoveIn('healer', true);
    const m0 = g.scoutMarks.length;
    g.time += DAY_LENGTH;
    steps(g, 3);
    expect(g.scoutMarks.length).toBe(m0 + 1);
    const h = g.settle.npc('healer')!;
    g.teleport(Math.floor(h.body.x / S) + 1, Math.floor((h.body.y + h.body.h - 1) / S));
    g.residentTalk('healer');
    expect(g.buffOn('bless')).toBe(true);
    void ROLES;
  });
});
