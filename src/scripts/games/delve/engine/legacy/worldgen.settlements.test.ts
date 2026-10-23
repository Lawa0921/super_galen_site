// worldgen.settlements.test.ts — 地表村落、矮人地廳、地標（gen/settlements.ts、gen/landmarks.ts）
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from './worldgen';
import { BIOME, World } from '../world';
import { T, W, isSolidTile } from '../tiles';
import { landmarkFor } from './gen/landmarks';
import { buildRegions } from '../discovery';
import { checkRoom } from '../housing';

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('世界生成：NPC 聚落與地標', { timeout: 180_000 }, () => {
  const seeds = ['alpha', 'npc-village', 'dwarf-deep'];
  const gens: GenResult[] = [];
  beforeAll(() => { for (const s of seeds) gens.push(generateWorld(s)); }, 180_000);

  it('每個世界 2～4 座村落：森林地表、地面整平、離出生點與地城夠遠、彼此不重疊', () => {
    for (const g of gens) {
      expect(g.villages.length).toBeGreaterThanOrEqual(2);
      expect(g.villages.length).toBeLessThanOrEqual(4);
      for (const v of g.villages) {
        const cx = (v.x0 + v.x1) / 2;
        expect(Math.abs(cx - g.spawn.x)).toBeGreaterThan(200);
        expect(v.x1 < g.dungeonZone.x0 - 60 || v.x0 > g.dungeonZone.x1 + 60).toBe(true);
        for (let x = v.x0; x <= v.x1; x++) {
          expect(g.world.biome[x]).toBe(BIOME.FOREST);
          expect(isSolidTile(g.world.getFg(x, v.ground))).toBe(true);
          // 房子以外的欄：地面就是整平後的那一列
          if (!v.houses.some((h) => x >= h.x0 - 1 && x <= h.x1 + 1)) expect(g.surface[x]).toBe(v.ground);
        }
      }
      const vs = g.structures.filter((s) => s.kind === 'village');
      expect(vs.length).toBe(g.villages.length);
      for (const v of vs) {
        for (const o of g.structures) {
          if (o === v || o.kind === 'cavern' || o.kind === 'chasm' || o.kind === 'mushroom_biome' || o.kind === 'crystal_cave') continue;
          expect(overlap(v, o), `${o.kind} 和村落重疊`).toBe(false);
        }
      }
    }
  });

  /** checkRoom 吃遊戲世界（區塊欄）：生成結果複製一份（每個 seed 一次） */
  const worlds = new Map<GenResult, World>();
  const gameWorld = (g: GenResult): World => {
    let w = worlds.get(g);
    if (!w) { w = World.fromGen(g.world, g.layers); worlds.set(g, w); }
    return w;
  };

  it('村落有 2～3 棟有門有床的房子、委託板、兩端的高旗桿；水不會淹進村子', () => {
    for (const g of gens) for (const v of g.villages) {
      const w = g.world;
      expect(v.houses.length).toBeGreaterThanOrEqual(2);
      for (const h of v.houses) {
        expect(w.getFg(h.door, h.floorY - 1)).toBe(T.DOOR_CLOSED);
        let bed = false, roof = false;
        for (let x = h.x0; x <= h.x1; x++) {
          if (w.getFg(x, h.floorY - 1) === T.BED_HEAD) bed = true;
          for (let y = h.floorY - 14; y < h.floorY - 6; y++) if (w.getFg(x, y) === T.THATCH) roof = true;
        }
        expect(bed && roof).toBe(true);
        // 房子內部是合格的房間（封閉、有背景牆 / 門 / 光 / 桌 / 椅 / 床）
        const r = checkRoom(gameWorld(g), (h.x0 + h.x1) >> 1, h.floorY - 2);
        expect(r?.ok, r?.reasons.join()).toBe(true);
      }
      expect(w.getFg(v.board.x, v.board.y)).toBe(T.QUEST_BOARD);
      let poles = 0;
      for (let x = v.x0; x <= v.x1; x++) if (w.getFg(x, v.ground - 10) === T.FLAGPOLE) poles++;
      expect(poles).toBe(2);
      for (let x = v.x0; x <= v.x1; x++) for (let y = v.ground - 20; y < v.ground; y++) expect(w.liquid[y * w.width + x]).toBe(0);
    }
  });

  it('1～2 座矮人地廳在洞穴層深處（熔岩深淵之上），有熔爐、礦車與通往外面的軌道隧道', () => {
    for (const g of gens) {
      expect(g.halls.length).toBeGreaterThanOrEqual(1);
      expect(g.halls.length).toBeLessThanOrEqual(2);
      for (const h of g.halls) {
        const w = g.world;
        for (const x of [h.x0, h.x1]) {
          expect(h.floorY).toBeGreaterThan(g.layers.deep[x]);
          expect(h.floorY).toBeLessThan(g.layers.molten[x]);
        }
        expect(w.getFg(h.forge.x, h.forge.y)).toBe(T.DWARF_FORGE);
        expect(w.getFg(h.cart.x, h.cart.y)).toBe(T.ORE_CART);
        expect(isSolidTile(w.getFg((h.x0 + h.x1) >> 1, h.floorY))).toBe(true);
        expect(w.getWall((h.x0 + h.x1) >> 1, h.floorY - 3)).toBe(W.DWARF_WALL);
        // 兩側的軌道往外延伸
        expect(w.getFg(h.x0 - 5, h.floorY - 1)).toBe(T.RAIL);
        expect(w.getFg(h.x1 + 5, h.floorY - 1)).toBe(T.RAIL);
      }
    }
  });

  it('發現地點都有地標（≥ 85%）；地標放在空地板上；村落 / 地廳是可發現的地區', () => {
    for (const g of gens) {
      const want = g.structures.filter((s) => landmarkFor(s) !== null);
      expect(g.landmarks.length / want.length).toBeGreaterThan(0.85);
      for (const l of g.landmarks) {
        expect(g.world.getFg(l.x, l.y)).toBe(l.tile);
        expect(isSolidTile(g.world.getFg(l.x, l.y + 1))).toBe(true);
      }
      const kinds = new Set(g.landmarks.map((l) => l.tile));
      for (const t of [T.RELIC_PACK, T.ORE_CART, T.GUARDIAN_STATUE, T.CAIRN]) expect(kinds.has(t)).toBe(true);
      const regions = buildRegions({ seed: 's', width: g.world.width, height: g.world.height, spawn: g.spawn, surface: g.world.surface, layers: g.layers, biomes: g.biomes, structures: g.structures, dungeon: g.dungeon });
      expect(regions.filter((r) => r.kind === 'village').length).toBe(g.villages.length);
      expect(regions.filter((r) => r.kind === 'dwarf_hall').length).toBe(g.halls.length);
      // 村落：還沒走進村子（左邊 15 格）就算發現
      const v = g.villages[0], r = regions.find((q) => q.kind === 'village' && q.contains(v.x0 + 5, v.ground - 2))!;
      expect(r.contains(v.x0 - 15, v.ground - 2)).toBe(true);
    }
  });
});
