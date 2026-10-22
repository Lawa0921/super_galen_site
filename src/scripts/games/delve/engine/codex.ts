// codex.ts — 裝備圖鑑（存檔內容）：見過的詞條（含最高階）、傳奇詞條、每種基底拿過的最高稀有度。
import { AFFIXES, affixDef, isAffixId, gearSlot, type AffixId, type Gear } from './gear';
import { isItemId, type ItemId } from './items';

export interface CodexJSON { affixes: Partial<Record<AffixId, number>>; items: Partial<Record<ItemId, number>>; }

export class Codex {
  /** 詞條 → 見過的最高階 */
  readonly affixes = new Map<AffixId, number>();
  /** 基底道具 → 拿過的最高稀有度 */
  readonly items = new Map<ItemId, number>();

  /** 記下一件裝備；回傳這次新發現的詞條 */
  observe(item: ItemId, g: Gear | undefined): AffixId[] {
    if (!gearSlot(item)) return [];
    const r = g?.rarity ?? 0;
    if ((this.items.get(item) ?? -1) < r) this.items.set(item, r);
    const fresh: AffixId[] = [];
    for (const a of g?.affixes ?? []) {
      const best = this.affixes.get(a.id);
      if (best === undefined) fresh.push(a.id);
      if (best === undefined || best < a.tier) this.affixes.set(a.id, a.tier);
    }
    return fresh;
  }
  stats(): { affixes: number; affixTotal: number; uniques: number; uniqueTotal: number; items: number } {
    const uniques = AFFIXES.filter((d) => d.kind === 'unique');
    return {
      affixes: [...this.affixes.keys()].filter((id) => affixDef(id).kind !== 'unique').length,
      affixTotal: AFFIXES.length - uniques.length,
      uniques: uniques.filter((d) => this.affixes.has(d.id)).length,
      uniqueTotal: uniques.length,
      items: this.items.size,
    };
  }
  toJSON(): CodexJSON {
    return { affixes: Object.fromEntries(this.affixes) as CodexJSON['affixes'], items: Object.fromEntries(this.items) as CodexJSON['items'] };
  }
  load(j: unknown): void {
    this.affixes.clear(); this.items.clear();
    if (!j || typeof j !== 'object') return;
    const o = j as Partial<CodexJSON>;
    for (const [k, v] of Object.entries(o.affixes ?? {})) if (isAffixId(k) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5) this.affixes.set(k, v as number);
    for (const [k, v] of Object.entries(o.items ?? {})) if (isItemId(k) && gearSlot(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5) this.items.set(k, v as number);
  }
}
