// worldgen.explore.test.ts — 探索內容：14 篇古碑各一塊、珍寶箱在難到達處、礦坑盡頭的裂紋石密室、導航工具、
// 更大更寬的地城（厚磚殼、房間之間沒有天然洞穴）
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from './worldgen';
import { T, W, SOLID_LUT, LIGHT_LUT, isDungeonBrick } from './tiles';
import { LORE } from './lore';
import type { ItemId } from './items';

const SEEDS = ['alpha', 'beta'];

function chestHas(r: GenResult, item: ItemId): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [i, slots] of r.world.chests) if (slots.some((s) => s?.item === item)) out.push({ x: i % r.world.width, y: Math.floor(i / r.world.width) });
  return out;
}

describe('探索內容（worldgen）', { timeout: 180_000 }, () => {
  const R: GenResult[] = [];
  beforeAll(() => { for (const s of SEEDS) R.push(generateWorld(s)); }, 180_000);

  it('古碑：每篇碑文剛好一塊（id 0..13 不重複），都站在實心地面上', () => {
    for (const r of R) {
      const ids = r.tablets.map((t) => t.id).sort((a, b) => a - b);
      expect(ids).toEqual(LORE.map((_, i) => i));
      for (const t of r.tablets) {
        expect(r.world.getFg(t.x, t.y)).toBe(T.LORE_TABLET);
        expect(SOLID_LUT[r.world.getFg(t.x, t.y + 1)]).toBe(1);
      }
      let n = 0;
      for (let i = 0; i < r.world.fg.length; i++) if (r.world.fg[i] === T.LORE_TABLET) n++;
      expect(n).toBe(LORE.length);
    }
  });
  it('珍寶：跳躍靴（浮空島）、疾行靴（裂谷底）、夜視護符（熔岩深淵）、磁石（密室）各一個', () => {
    for (const r of R) {
      const where: Record<string, string> = { jump_boots: 'sky_island', swift_boots: 'chasm', night_amulet: 'molten', magnet: 'secret_room' };
      for (const [item, w] of Object.entries(where)) {
        const rel = r.relics.filter((q) => q.item === item);
        expect(rel.length, item).toBe(1);
        expect(rel[0].where, item).toBe(w);
        expect(chestHas(r, item as ItemId), item).toEqual([{ x: rel[0].x, y: rel[0].y }]);
      }
      const molten = r.relics.find((q) => q.item === 'night_amulet')!;
      expect(molten.y).toBeGreaterThanOrEqual(r.layers.molten[molten.x]);
      const ch = r.relics.find((q) => q.item === 'swift_boots')!;
      const chasm = r.structures.find((s) => s.kind === 'chasm' && ch.x >= s.x && ch.x < s.x + s.w)!;
      expect(chasm).toBeTruthy();
      expect(ch.y).toBeGreaterThan(chasm.y + chasm.h - 30);
    }
  });
  it('密室：≥ 3 間，入口是礦坑盡頭兩格厚的裂紋石；不敲開裂紋石就進不去；裡面有箱子', () => {
    for (const r of R) {
      const w = r.world;
      const rooms = r.structures.filter((s) => s.kind === 'secret_room');
      expect(rooms.length).toBeGreaterThanOrEqual(3);
      for (const s of rooms) {
        expect(s.chest).toBeTruthy();
        expect(w.getFg(s.chest!.x, s.chest!.y)).toBe(T.CHEST);
        // 洪水填充：從房間內部出發，不穿過實心（含裂紋石）→ 不會離開房間外接框
        const seen = new Set<number>();
        const st = [[s.x + 1, s.y + s.h - 2]];
        let cracked = 0, escaped = false;
        while (st.length) {
          const [x, y] = st.pop()!;
          const k = y * w.width + x;
          if (seen.has(k)) continue;
          seen.add(k);
          if (x < s.x - 1 || x > s.x + s.w || y < s.y - 1 || y > s.y + s.h) { escaped = true; break; }
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            const t = w.getFg(nx, ny);
            if (t === T.CRACKED_STONE) { cracked++; continue; }
            if (SOLID_LUT[t] !== 1) st.push([nx, ny]);
          }
        }
        expect(escaped).toBe(false);
        expect(cracked).toBeGreaterThan(0);
        // 密室裡沒有會發光的東西（否則光會穿過兩格裂紋石，從坑道就看得到房間）
        for (let y = s.y - 1; y <= s.y + s.h; y++) for (let x = s.x - 1; x <= s.x + s.w; x++) expect(LIGHT_LUT[w.getFg(x, y)]).toBe(0);
      }
    }
  });
  it('指南針與深度計在離出生點最近的小屋箱子裡', () => {
    for (const r of R) {
      expect(chestHas(r, 'compass').length).toBe(1);
      expect(chestHas(r, 'depth_meter').length).toBe(1);
    }
  });
  it('地城：房間 ≥ 25、外接框寬 ≥ 高 × 0.7（不再細長）', () => {
    for (const r of R) {
      const d = r.dungeon!;
      expect(d.rooms.length).toBeGreaterThanOrEqual(25);
      expect(d.bbox.w).toBeGreaterThanOrEqual(d.bbox.h * 0.7);
    }
  });
  it('地城：房間外圍是厚磚殼（房間左右各 ≥ 5 格磚，門 / 走廊除外）', () => {
    for (const r of R) {
      const d = r.dungeon!, w = r.world;
      let checked = 0, thick = 0;
      for (const q of d.rooms) {
        const y = q.y + 1; // 天花板下一列：不會是門或走廊
        for (const [x0, dx] of [[q.x - 1, -1], [q.x + q.w, 1]] as const) {
          checked++;
          let n = 0;
          while (n < 8 && isDungeonBrick(w.getFg(x0 + dx * n, y))) n++;
          if (n >= 5) thick++;
        }
      }
      expect(thick / checked).toBeGreaterThan(0.85);
    }
  });
  it('地城範圍內沒有天然洞穴：內部的空格都屬於地城（有地城背景牆）', () => {
    for (const r of R) {
      const d = r.dungeon!, w = r.world;
      const y0 = Math.max(d.bbox.y + 14, d.entrance.y + 24);
      let bad = 0;
      for (let y = y0; y < d.bbox.y + d.bbox.h - 14; y++) for (let x = d.bbox.x + 14; x < d.bbox.x + d.bbox.w - 14; x++) {
        const t = w.getFg(x, y);
        if (SOLID_LUT[t] === 1) continue;
        if (w.getWall(x, y) < W.DUNGEON_WALL_BLUE) bad++;
      }
      expect(bad).toBe(0);
    }
  });
});
