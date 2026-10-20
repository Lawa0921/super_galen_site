// cosmeticSources.test.ts — 每件外觀（時裝道具）從哪裡拿得到：spec C8 的來源規則。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cosmeticSources, type CosmeticSource } from './cosmeticSources';
import { ACC_ITEMS, OUTFIT_ITEMS, VANITY_ITEMS, type ItemId } from './items';
import { RECIPES } from './crafting';
import { ENEMIES } from './enemies';
import { CHEST_FASHION, CHEST_FASHION_CHANCE, GENERATED_CHEST_KINDS, chestLoot, type ChestKind } from './loot';
import { BOSS_FASHION, DelveGame } from './game';
import { CHUNK } from './constants';
import { restoreGame, snapshotGame } from '../save/serialize';

/** 開局附近就拿得到的材料（spec C8：新角色 10 分鐘內做得出來） */
// 羽毛只有夜裡的暗羽梟會掉，不算開局材料
const STARTER = new Set<ItemId>(['wood', 'planks', 'gel', 'dirt', 'stone', 'mushroom']);
/** 世界生成真的會放的箱子種類：直接掃 worldgen.ts / gen/*.ts 裡每個 addChest(…, '<kind>') 呼叫 */
function placedChestKinds(): Set<string> {
  const dir = resolve(process.cwd(), 'src/scripts/games/delve/engine');
  const kinds = new Set<string>();
  for (const f of ['worldgen.ts', 'gen/dungeon.ts']) {
    const src = readFileSync(resolve(dir, f), 'utf8');
    const calls = [...src.matchAll(/addChest\(([^;]*?)\)[;,]/g)].map((m) => m[1]).filter((a) => !/:\s*number/.test(a));
    expect(calls.length, f).toBeGreaterThan(0);
    for (const a of calls) {
      const lit = a.match(/'([a-z]+)'/);
      expect(lit, `${f}: addChest(${a}) 的種類要寫成字面值`).not.toBeNull();
      kinds.add(lit![1]);
    }
  }
  return kinds;
}
/** Task 2 新增的 26 件（8 套服裝 × 2 + 9 個頭飾 + 眼鏡） */
const OLD_OUTFITS = ['explorer', 'sailor', 'miko', 'hoodie', 'coat', 'maid'];
const NEW_ITEMS: ItemId[] = [
  ...Object.entries(OUTFIT_ITEMS).filter(([o]) => !OLD_OUTFITS.includes(o)).flatMap(([, p]) => p),
  ...Object.values(ACC_ITEMS),
];
/** Task 3 之前的 21 件與它們當時的來源（新的來源集合必須是超集合） */
const BEFORE: Record<string, CosmeticSource[]> = {
  sailor_top: ['craft'], sailor_skirt: ['craft'], miko_robe: ['craft'], miko_hakama: ['craft'],
  hoodie_top: ['craft'], hoodie_shorts: ['craft'], travel_coat: ['craft', 'shop'], coat_trousers: ['craft'],
  explorer_vest: ['craft', 'chest'], explorer_shorts: ['craft'],
  maid_dress: ['chest'], maid_skirt: ['chest'], maid_headdress: ['chest'],
  straw_hat: ['craft', 'chest'], witch_hat: ['chest', 'shop'], beret: ['craft', 'chest'], flower_crown: ['craft', 'chest', 'shop'],
  travel_cape: ['craft'], feather_wings: ['chest', 'shop'], ribbon_bow: ['chest'],
  miner_helmet: ['shop'],
};
const starterCraftable = (id: ItemId): boolean => RECIPES.some((r) => r.out.item === id
  && (r.station === 'workbench' || r.station === null) && r.inputs.every((a) => STARTER.has(a.item)));
const kindsOf = (o: object): ChestKind[] => Object.keys(o) as ChestKind[];

describe('時裝的取得來源（spec C8）', () => {
  it('every cosmetic has a source', () => {
    expect(VANITY_ITEMS.length).toBe(47);
    for (const id of VANITY_ITEMS) expect(cosmeticSources(id).length, id).toBeGreaterThan(0);
  });

  // 和平模式（不生怪）拿得到每件時裝：製作要一路推到不靠怪物的材料、箱子要每個世界期望 ≥ 0.33 件
  // → cosmeticSources.peaceful.test.ts（生成真的世界量箱子數與材料來源）

  it('already-generated world：沒被改過的 chunk 裡的箱子不進存檔，讀檔時用目前的戰利品表重新生成（新池子也進得了舊世界）', () => {
    const opts = { width: 1200, height: 400, peaceful: true };
    const g = new DelveGame({ seed: 'old-world', ...opts });
    const w = g.world;
    const keys = [...w.chests.keys()];
    expect(keys.length).toBeGreaterThan(1);
    const chunkOf = (i: number): number => w.chunkIndex(Math.floor((i % w.width) / CHUNK), Math.floor(Math.floor(i / w.width) / CHUNK));
    // 第一個箱子被動過（拿走第一格）→ 它的 chunk 變成「被修改」；另找一個不在同一個 chunk 的箱子當「沒碰過」
    const touched = keys[0], untouched = keys.find((i) => chunkOf(i) !== chunkOf(touched))!;
    expect(untouched).toBeDefined();
    w.chests.get(touched)![0] = null;
    w.markModified(touched % w.width, Math.floor(touched / w.width));
    const snap = snapshotGame(g);
    expect(snap.header.chests!.map((c) => c.i)).toContain(touched);
    expect(snap.header.chests!.map((c) => c.i)).not.toContain(untouched);
    const r = restoreGame(snap);
    if (!r.ok) throw new Error(r.message);
    // 沒碰過的箱子 = 目前的世界生成（目前的 loot.ts）給的內容；動過的箱子 = 存檔裡的內容
    const fresh = new DelveGame({ seed: 'old-world', ...opts }).world.chests;
    expect(r.game.world.chests.get(untouched)).toEqual(fresh.get(untouched));
    expect(r.game.world.chests.get(touched)).toEqual(w.chests.get(touched));
    expect(r.game.world.chests.get(touched)![0]).toBeNull();
  });

  it('不新增商人來源（spec §2.3）：會在商店買到的時裝 = 上線版本（master cbe31d0e）就在賣的那幾件', () => {
    expect(VANITY_ITEMS.filter((id) => cosmeticSources(id).includes('shop')).sort())
      .toEqual(['feather_wings', 'flower_crown', 'miner_helmet', 'travel_coat', 'witch_hat']);
  });

  it('at least one cosmetic craftable from starter materials（含至少一件新物品；工作台本身也只用開局材料）', () => {
    const bench = RECIPES.find((r) => r.out.item === 'workbench')!;
    expect(bench.station).toBeNull();
    for (const a of bench.inputs) expect(STARTER.has(a.item), a.item).toBe(true);
    expect(VANITY_ITEMS.some(starterCraftable)).toBe(true);
    expect(NEW_ITEMS.filter(starterCraftable).length).toBeGreaterThan(0);
  });

  it('existing sources kept（現有 21 件的來源不減少；礦工頭燈盔仍只在商店）', () => {
    expect(Object.keys(BEFORE).length).toBe(21);
    for (const [id, was] of Object.entries(BEFORE)) {
      const now = cosmeticSources(id as ItemId);
      for (const s of was) expect(now, `${id} 失去 ${s}`).toContain(s);
    }
    expect(cosmeticSources('miner_helmet')).toEqual(['shop']);
  });

  it('約三分之一的新物品可以製作', () => {
    const crafted = NEW_ITEMS.filter((id) => cosmeticSources(id).includes('craft')).length;
    expect(NEW_ITEMS.length).toBe(26);
    expect(crafted).toBeGreaterThanOrEqual(7);
    expect(crafted).toBeLessThanOrEqual(11);
  });

  it('怪物掉的時裝都是個位數百分比；主題怪掉主題款', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const d of e.drops) if (VANITY_ITEMS.includes(d.item)) expect(d.chance, `${e.kind} → ${d.item}`).toBeLessThan(0.1);
    }
    const drops = (k: keyof typeof ENEMIES): ItemId[] => ENEMIES[k].drops.map((d) => d.item);
    expect(drops('bone_knight')).toEqual(expect.arrayContaining(['knight_top', 'knight_bottom']));
    expect(drops('cursed_skull')).toEqual(expect.arrayContaining(['gothic_top', 'gothic_bottom']));
    expect(drops('ember_imp')).toEqual(expect.arrayContaining(['qipao_top', 'qipao_bottom']));
  });

  it('高稀有款（小皇冠 / 偶像舞台裝 / 哥德洋裝）：首領 + 寶藏室或珍寶箱', () => {
    for (const id of ['acc_crown', 'idol_top', 'idol_bottom', 'gothic_top', 'gothic_bottom'] as ItemId[]) {
      expect(BOSS_FASHION, id).toContain(id);
      expect(CHEST_FASHION.treasure!.includes(id) || CHEST_FASHION.relic!.includes(id), id).toBe(true);
      expect(cosmeticSources(id), id).not.toContain('craft');
    }
  });

  it('一套服裝的上身與下身來源相同', () => {
    for (const [o, [top, bottom]] of Object.entries(OUTFIT_ITEMS)) {
      if (OLD_OUTFITS.includes(o)) continue;
      expect(cosmeticSources(bottom), o).toEqual(cosmeticSources(top));
      for (const e of Object.values(ENEMIES)) {
        const ct = e.drops.find((d) => d.item === top)?.chance, cb = e.drops.find((d) => d.item === bottom)?.chance;
        expect(cb, `${e.kind} ${o}`).toBe(ct);
      }
      for (const k of kindsOf(CHEST_FASHION)) expect(CHEST_FASHION[k]!.includes(bottom), `${k} ${o}`).toBe(CHEST_FASHION[k]!.includes(top));
    }
  });

  it('箱子時裝只放在世界生成真的會放的箱子種類（表上有、世界沒有 = 拿不到）', () => {
    const placed = placedChestKinds();
    expect([...placed].sort()).toEqual([...GENERATED_CHEST_KINDS].sort());
    for (const k of kindsOf(CHEST_FASHION)) expect(placed.has(k), `CHEST_FASHION.${k} 不會生成`).toBe(true);
    for (const k of kindsOf(CHEST_FASHION_CHANCE)) expect(placed.has(k), `CHEST_FASHION_CHANCE.${k} 不會生成`).toBe(true);
    // cosmeticSources 的 chest 只算會生成的箱子
    for (const id of VANITY_ITEMS) {
      const live = GENERATED_CHEST_KINDS.some((k) => (CHEST_FASHION_CHANCE[k] ?? 0) > 0 && (CHEST_FASHION[k] ?? []).includes(id));
      expect(cosmeticSources(id).includes('chest'), id).toBe(live);
    }
  });

  it('箱子池子裡的每件都真的開得出來；原本的箱子時裝留在原本的箱子種類', () => {
    const seen = new Set<ItemId>();
    for (const k of kindsOf(CHEST_FASHION)) {
      expect(CHEST_FASHION_CHANCE[k], k).toBeGreaterThan(0);
      expect(CHEST_FASHION[k]!.length, k).toBeGreaterThan(0);
      for (let i = 0; i < 400; i++) for (const s of chestLoot('src', i, 3, k, 0.6)) if (s && VANITY_ITEMS.includes(s.item)) seen.add(s.item);
    }
    for (const k of kindsOf(CHEST_FASHION)) for (const id of CHEST_FASHION[k]!) expect(seen.has(id), id).toBe(true);
    const deep: ChestKind[] = ['dungeon', 'treasure', 'secret', 'relic'];
    for (const k of deep) for (const id of ['maid_dress', 'maid_skirt', 'maid_headdress', 'witch_hat', 'feather_wings', 'ribbon_bow'] as ItemId[]) expect(CHEST_FASHION[k], k).toContain(id);
    for (const k of ['cabin', 'mineshaft', 'ruin', 'sky'] as ChestKind[]) for (const id of ['straw_hat', 'beret', 'explorer_vest', 'flower_crown'] as ItemId[]) expect(CHEST_FASHION[k], k).toContain(id);
  });
});
