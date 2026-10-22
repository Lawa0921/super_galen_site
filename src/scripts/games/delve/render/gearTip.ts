// gearTip.ts — 裝備說明（純函式）：稀有度 / 物品等級 / 強化 / 詞條 / 傳奇效果，以及與目前裝備中那件的比較（綠升紅降）。
// 也提供能力總覽（裝備數值面板）的列。HUD 只負責把 TipLine 轉成 DOM。
import { ITEMS, type ItemId } from '../engine/items';
import type { Stack } from '../engine/inventory';
import {
  RARITIES, STAT_KEYS, STAT_LABEL, STAT_UNIT, affixDef, affixText, armorDefense, gearName, gearSlot, pickSpeed, rarityOf, weaponDamage,
  type Gear, type GearTotals, type StatKey,
} from '../engine/gear';
import { itemTooltip } from './tooltip';

export type Tone = 'name' | 'rarity' | 'base' | 'affix' | 'unique' | 'head' | 'up' | 'down' | 'note';
export interface TipLine { text: string; tone: Tone; rarity?: number; }

const fmt = (v: number): string => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

/** 比較用的數值向量：基礎（傷害 / 防禦 / 挖掘力）+ 每種詞條屬性 + 傳奇詞條（有 = 1） */
export function gearSummary(st: Stack): Map<string, { v: number; unit: string }> {
  const m = new Map<string, { v: number; unit: string }>();
  const d = ITEMS[st.item], g = st.gear;
  if (d.weapon) m.set('傷害', { v: weaponDamage(st.item, g), unit: '' });
  if (d.armor) m.set('防禦', { v: armorDefense(st.item, g), unit: '' });
  if (d.pick) m.set('挖掘力', { v: pickSpeed(st.item, g), unit: '' });
  for (const a of g?.affixes ?? []) {
    const def = affixDef(a.id);
    if (def.kind === 'unique') { m.set(def.word, { v: 1, unit: '' }); continue; }
    if (def.stat === 'mine' && d.pick) continue; // 已算進挖掘力
    const key = STAT_LABEL[def.stat], prev = m.get(key)?.v ?? 0;
    const val = gearSlot(st.item) === 'accessory' && g ? a.value * (1 + 0.08 * g.plus) : a.value;
    m.set(key, { v: prev + val, unit: STAT_UNIT[def.stat] });
  }
  return m;
}

/** hovered − equipped 的差（只列有差的；正 = 綠、負 = 紅） */
export function compareLines(st: Stack, cmp: Stack): TipLine[] {
  const a = gearSummary(st), b = gearSummary(cmp), out: TipLine[] = [];
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  for (const k of keys) {
    const x = a.get(k), y = b.get(k), d = (x?.v ?? 0) - (y?.v ?? 0);
    if (Math.abs(d) < 0.05) continue;
    const unit = x?.unit ?? y?.unit ?? '';
    const isUnique = k.endsWith('的');
    const text = isUnique ? `${d > 0 ? '獲得' : '失去'}「${k.slice(0, -1)}」` : `${k} ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit}`;
    out.push({ text, tone: d > 0 ? 'up' : 'down' });
  }
  if (!out.length) out.push({ text: '數值相同', tone: 'note' });
  return out;
}

function plusLine(item: ItemId, g: Gear): string | null {
  if (!g.plus) return null;
  const d = ITEMS[item];
  if (d.weapon) return `強化 +${g.plus}：基礎傷害 +${Math.round(g.plus * 6)}%（${fmt(weaponDamage(item, g))}）`;
  if (d.armor) return `強化 +${g.plus}：防禦 ${armorDefense(item, g)}`;
  if (d.pick) return `強化 +${g.plus}：挖掘速度 +${g.plus * 5}%`;
  return `強化 +${g.plus}：詞條數值 +${g.plus * 8}%`;
}

/**
 * 一格道具的完整說明。cmp = 目前裝備中、裝上會換掉的那件（有就附比較）；
 * o.head 換掉比較標題（例：飾品和最弱的那件比）、o.note 在最後加一行提示（例：會裝進空槽）。
 */
export function gearTooltip(st: Stack, cmp?: Stack | null, o: { head?: string; note?: string } = {}): TipLine[] {
  const item = st.item, d = ITEMS[item];
  const base = itemTooltip(item);
  if (!gearSlot(item)) return base.map((t, i) => ({ text: t, tone: i === 0 ? 'name' : 'base' }));
  const g = st.gear, r = rarityOf(g), R = RARITIES[r];
  const out: TipLine[] = [{ text: gearName(item, g), tone: 'name', rarity: r }];
  const meta = [R.zh, `物品等級 ${g?.ilvl ?? 1}`];
  if (g?.locked) meta.push('已鎖定');
  out.push({ text: meta.join('・'), tone: 'rarity', rarity: r });
  for (const t of base.slice(1)) out.push({ text: t, tone: 'base' });
  if (g) {
    const p = plusLine(item, g);
    if (p) out.push({ text: p, tone: 'affix' });
    for (const a of g.affixes) {
      const def = affixDef(a.id);
      if (def.kind === 'unique') out.push({ text: `★ ${def.word.slice(0, -1)}：${def.desc ?? ''}`, tone: 'unique', rarity: 4 });
      else out.push({ text: `◆ ${affixText(a, item, g)}（T${a.tier}）`, tone: 'affix' });
    }
  }
  if (cmp && cmp !== st) {
    out.push({ text: o.head ?? `與裝備中的「${gearName(cmp.item, cmp.gear)}」比較：`, tone: 'head' });
    out.push(...compareLines(st, cmp));
  }
  if (o.note) out.push({ text: o.note, tone: 'note' });
  return out;
}

/** 能力總覽（裝備數值面板）：[標籤, 值] 列；詞條只列非 0 的 */
export function statRows(o: { defense: number; hp: number; maxHp: number; damageMul: number; crit: number; gear: GearTotals; setBonus: string | null }): [string, string][] {
  const rows: [string, string][] = [
    ['防禦', String(o.defense)],
    ['生命', `${o.hp}/${o.maxHp}`],
    ['傷害', `×${o.damageMul.toFixed(2)}`],
    ['暴擊', `+${Math.round(o.crit * 100)}%`],
  ];
  const skip = new Set<StatKey>(['def', 'hp', 'dmg', 'crit']);
  for (const k of STAT_KEYS) {
    const v = o.gear[k];
    if (!v || skip.has(k)) continue;
    if (k === 'djump') { rows.push([STAT_LABEL[k], '可以']); continue; }
    if (k === 'undying') { rows.push([STAT_LABEL[k], `冷卻 ${v} 秒`]); continue; }
    rows.push([STAT_LABEL[k], `+${fmt(v)}${STAT_UNIT[k]}`]);
  }
  if (o.setBonus) rows.push(['套裝', o.setBonus]);
  return rows;
}
