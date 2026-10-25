// siteRegistry.test.ts — 聚落登錄：穩定的 key、範圍查詢（舊世界逐點照舊 / gen2 新範圍）、NPC id 由 key 雜湊（不依登錄順序、撞號丟錯）。
import { describe, expect, it } from 'vitest';
import { World } from './world';
import { FolkWorld } from './folk';
import type { DungeonInfo, GenSite, HallInfo, VillageInfo } from './genTypes';
import { SITE_NPC_BASE, SiteRegistry, claimNpcId, legacySites, npcIdFor } from './siteRegistry';

const village = (x0: number, x1: number, ground: number): VillageInfo => {
  const bx = (x0 + x1) >> 1;
  return {
    x0, x1, ground, style: 0, board: { x: bx, y: ground - 1 },
    houses: [
      { x0: x0 + 6, x1: x0 + 14, floorY: ground, door: x0 + 6, role: 'elder' },
      { x0: bx + 4, x1: bx + 12, floorY: ground, door: bx + 12, role: 'shop' },
      { x0: x1 - 14, x1: x1 - 6, floorY: ground, door: x1 - 6, role: 'home' },
    ],
  };
};
const hall = (x0: number, x1: number, y0: number, floorY: number): HallInfo => ({
  x0, x1, y0, floorY, forge: { x: x0 + 4, y: floorY - 1 }, cart: { x: x1 - 4, y: floorY - 1 },
  tunnels: [{ x0: x0 - 10, x1: x0 - 1 }, { x0: x1 + 1, x1: x1 + 10 }],
});
// 3 座村落、2 座地廳（h1 的範圍和 v1 的範圍重疊：舊判斷先村落後地廳）
const V3: VillageInfo[] = [village(20, 80, 100), village(140, 200, 90), village(260, 330, 110)];
const H2: HallInfo[] = [hall(40, 70, 150, 160), hall(150, 180, 92, 100)];
const hermitSite = (sid: number): GenSite => ({ kind: 'hermit', key: `s${sid}`, rot: 0, at: { x: 360, y: 120 } });
const blankWorld = (): World => new World(400, 200);
const siteKeyOf = (s: GenSite | null): string | null => s?.key ?? null;

/** 照抄改動前的 game.siteAt（game.ts:4436-4446） */
function oldSiteAtKey(villages: readonly VillageInfo[], halls: readonly HallInfo[], x: number, y: number): string | null {
  for (let i = 0; i < villages.length; i++) {
    const v = villages[i];
    if (x >= v.x0 - 12 && x <= v.x1 + 12 && y >= v.ground - 28 && y <= v.ground + 4) return `v${i}`;
  }
  for (let i = 0; i < halls.length; i++) {
    const h = halls[i];
    if (x >= h.x0 - 4 && x <= h.x1 + 4 && y >= h.y0 - 5 && y <= h.floorY + 2) return `h${i}`;
  }
  return null;
}
/** 每座村落（地面 −28 .. +4）/ 地廳（y0 .. floorY）外框 ±r 格內的每一格（去重） */
function gridAround(villages: readonly VillageInfo[], halls: readonly HallInfo[], r: number): { x: number; y: number }[] {
  const boxes = [...villages.map((v) => [v.x0, v.x1, v.ground - 28, v.ground + 4]), ...halls.map((h) => [h.x0, h.x1, h.y0, h.floorY])];
  const seen = new Set<string>(), out: { x: number; y: number }[] = [];
  for (const [x0, x1, y0, y1] of boxes) {
    for (let x = x0 - r; x <= x1 + r; x++) for (let y = y0 - r; y <= y1 + r; y++) {
      const k = `${x},${y}`;
      if (!seen.has(k)) { seen.add(k); out.push({ x, y }); }
    }
  }
  return out;
}

describe('SiteRegistry', () => {
  it('legacySites：key v{i} / h{i} / d0、rot = 索引、依序', () => {
    const d = { bbox: { x: 5, y: 5, w: 10, h: 10 } } as DungeonInfo;
    const s = legacySites(V3, H2, d);
    expect(s.map((q) => [q.kind, q.key, q.rot])).toEqual([
      ['village', 'v0', 0], ['village', 'v1', 1], ['village', 'v2', 2], ['hall', 'h0', 0], ['hall', 'h1', 1], ['dungeon', 'd0', 0],
    ]);
    expect(legacySites(V3, [], null).map((q) => q.key)).toEqual(['v0', 'v1', 'v2']);
  });

  it('兩種登錄順序 → 同一組 key 與 NPC id；重複 add 忽略', () => {
    const sites = [...legacySites(V3, H2, null), hermitSite(77)], a = new FolkWorld('o'), b = new FolkWorld('o'), w = blankWorld();
    for (const s of sites) a.addSite(w, s);
    for (const s of [...sites].reverse()) b.addSite(w, s);
    const ids = (f: FolkWorld): (readonly [string, number])[] => f.npcs.map((n) => [n.key, n.id] as const).sort();
    // 3 座村莊 × 4、2 座地廳 × 3、1 座隱士小屋 × 1（Task 18：隱士）
    expect(ids(a)).toHaveLength(3 * 4 + 2 * 3 + 1);
    expect(ids(b)).toEqual(ids(a));
    const r = new SiteRegistry({ ranges: 'gen2' });
    expect(r.add(sites[0])).toBe(true);
    expect(r.add(sites[0])).toBe(false);
  });

  it('addSite：村落 = elder、trader + 依 rot 的兩位；地廳三位矮人；NPC 的 site = 聚落 key；同一個聚落再加一次不重複', () => {
    const f = new FolkWorld('o'), w = blankWorld();
    for (const s of legacySites(V3, H2, null)) f.addSite(w, s);
    f.addSite(w, legacySites(V3, H2, null)[0]);
    const roles = (p: string): string[] => f.npcs.filter((n) => n.key.startsWith(`${p}:`)).map((n) => n.role);
    expect(roles('v0')).toEqual(['elder', 'trader', 'guide', 'smith']);
    expect(roles('v1')).toEqual(['elder', 'trader', 'healer', 'guide']);
    expect(roles('v2')).toEqual(['elder', 'trader', 'smith', 'healer']);
    expect(roles('h1')).toEqual(['runesmith', 'ore_trader', 'dwarf_elder']);
    expect(f.npcs.filter((n) => n.key.startsWith('v1:')).every((n) => n.site === 'v1' && n.origin === 'village')).toBe(true);
    expect(f.npcs.filter((n) => n.key.startsWith('h0:')).every((n) => n.site === 'h0' && n.origin === 'hall' && n.race === 'dwarf')).toBe(true);
    expect(f.npcs).toHaveLength(18);
    expect(f.travellers()).toEqual([]);
  });

  it('onAdd 只對新 key 觸發；list 依加入順序、只回該種類；byKey', () => {
    const r = new SiteRegistry({ ranges: 'gen2' }), seen: string[] = [];
    r.onAdd((s) => seen.push(s.key));
    const all = [...legacySites(V3, H2, null), hermitSite(5)];
    for (const s of [all[5], all[1], all[3], all[1], all[0]]) r.add(s);
    expect(seen).toEqual(['s5', 'v1', 'h0', 'v0']);
    expect(r.list('village').map((s) => s.key)).toEqual(['v1', 'v0']);
    expect(r.list('hall').map((s) => s.info.x0)).toEqual([40]);
    expect(r.list('hermit').map((s) => s.at)).toEqual([{ x: 360, y: 120 }]);
    expect(r.list('dungeon')).toEqual([]);
    expect(r.byKey('v1')).toBe(all[1]);
    expect(r.byKey('v2')).toBeUndefined();
  });

  it('at（legacy）：與改動前的 game.siteAt 逐點相同（V3 / H2 外框 ±20 格的每一格）', () => {
    const r = new SiteRegistry({ ranges: 'legacy' });
    for (const s of legacySites(V3, H2, { bbox: { x: 30, y: 140, w: 60, h: 40 } } as DungeonInfo)) r.add(s);
    const grid = gridAround(V3, H2, 20), bad: string[] = [], hit = new Set<string | null>();
    for (const p of grid) {
      const want = oldSiteAtKey(V3, H2, p.x, p.y), got = siteKeyOf(r.at(p.x, p.y));
      hit.add(want);
      if (got !== want) bad.push(`${p.x},${p.y}: ${got} ≠ ${want}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    // 網格真的涵蓋了每個聚落、重疊處與外面（舊世界的地城不算安全地點）
    expect([...hit].sort()).toEqual(['h0', 'h1', 'v0', 'v1', 'v2', null].sort());
    expect(oldSiteAtKey(V3, H2, 160, 93)).toBe('v1');
    expect(grid.length).toBeGreaterThan(20_000);
  });

  it('at（gen2）：村落範圍內回村落、範圍外 null', () => {
    const r = new SiteRegistry({ ranges: 'gen2' });
    r.add(legacySites(V3, [], null)[0]);
    expect(r.at(V3[0].board.x, V3[0].board.y)!.key).toBe('v0');
    expect(r.at(V3[0].x1 + 40, V3[0].ground)).toBeNull();
    // 邊界：x0 − 4 .. x1 + 4、ground − 30 .. ground + 6
    const v = V3[0];
    expect(siteKeyOf(r.at(v.x0 - 4, v.ground - 30))).toBe('v0');
    expect(siteKeyOf(r.at(v.x1 + 4, v.ground + 6))).toBe('v0');
    expect(r.at(v.x0 - 5, v.ground)).toBeNull();
    expect(r.at(v.x1 + 5, v.ground)).toBeNull();
    expect(r.at(v.x0, v.ground - 31)).toBeNull();
    expect(r.at(v.x0, v.ground + 7)).toBeNull();
  });

  it('at（gen2）：地廳 = 外框 + 隧道；隱士 ±8；地城 = bbox', () => {
    const r = new SiteRegistry({ ranges: 'gen2' }), h = H2[0];
    r.add(legacySites([], [h], null)[0]);
    r.add(hermitSite(9));
    r.add({ kind: 'dungeon', key: 's11', rot: 0, info: { bbox: { x: 200, y: 20, w: 30, h: 10 } } as DungeonInfo });
    expect(siteKeyOf(r.at(h.x0, h.y0))).toBe('h0');
    expect(siteKeyOf(r.at(h.x1, h.floorY))).toBe('h0');
    expect(r.at(h.x0, h.y0 - 1)).toBeNull();
    expect(r.at(h.x1 + 1, h.y0)).toBeNull();
    // 隧道：欄 tunnels[k]、列 floorY − 5 .. floorY
    expect(siteKeyOf(r.at(h.tunnels[0].x0, h.floorY - 5))).toBe('h0');
    expect(siteKeyOf(r.at(h.tunnels[1].x1, h.floorY))).toBe('h0');
    expect(r.at(h.tunnels[1].x1, h.floorY - 6)).toBeNull();
    expect(r.at(h.tunnels[1].x1 + 1, h.floorY)).toBeNull();
    expect(siteKeyOf(r.at(360 - 8, 120 + 8))).toBe('s9');
    expect(r.at(360 + 9, 120)).toBeNull();
    expect(siteKeyOf(r.at(200, 20))).toBe('s11');
    expect(siteKeyOf(r.at(229, 29))).toBe('s11');
    expect(r.at(230, 25)).toBeNull();
    expect(r.at(215, 30)).toBeNull();
  });

  it('1,000 個 gen2 風格 key（s{sid}:{role}）的 npcIdFor 沒有碰撞、都是安全整數 ≥ SITE_NPC_BASE', () => {
    const keys = [...Array(1000)].flatMap((_, k) => ['elder', 'trader', 'guide'].map((r) => `s${k * 7919}:${r}`));
    const ids = keys.map(npcIdFor);
    expect(new Set(ids).size).toBe(keys.length);
    for (const id of ids) { expect(Number.isSafeInteger(id)).toBe(true); expect(id).toBeGreaterThanOrEqual(SITE_NPC_BASE); }
    // 確定性：同一個 key 永遠同一個 id；舊世界的 key 也在範圍內
    expect(npcIdFor('v0:elder')).toBe(npcIdFor('v0:elder'));
    expect(npcIdFor('v0:elder')).not.toBe(npcIdFor('v0:trader'));
    expect(npcIdFor('v0:elder')).toBeLessThan(SITE_NPC_BASE + 4503599627370496); // 2 的 52 次方
  });

  it('撞號直接丟錯（不探測，id 不依登錄順序）', () => {
    const used = new Map<number, string>();
    claimNpcId(used, 42, 'a');
    expect(() => claimNpcId(used, 42, 'a')).not.toThrow();
    expect(() => claimNpcId(used, 42, 'b')).toThrow(/collision/);
    expect(used.get(42)).toBe('a');
  });
});
