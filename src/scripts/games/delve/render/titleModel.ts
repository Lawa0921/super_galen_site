// titleModel.ts — 標題畫面的純邏輯（無 DOM）：存檔摘要、遊玩時間、世界名骰子、選單鍵盤移動、
// 音量偏好（遊戲廳共用 arcade-sfx-vol）、世界生成進度標籤、像素抖動轉場門檻、背景鏡頭。
import { dateOf, SEASON_NAMES } from '../engine/calendar';
import { bayer } from './pixel';
import type { CharacterMeta, SaveSummary, SlotMeta } from '../save/storage';
import type { AnySave, WorldData } from '../save/worldSave';
import type { SaveData } from '../save/serialize';
import type { DelveCharacter } from '../save/character';

export type { SaveSummary };

export interface SummarySource {
  seed: string; time: number; tick: number; peaceful: boolean;
  discovery: { stats(): { completion: number; depthRecord: number } };
  /** 等級系統（engine/levels.ts Progression） */
  levels?: { level: number };
}

/** nick = 角色暱稱（拆存檔之後才有；沒給就不放這個欄位） */
export function summarizeGame(g: SummarySource, nick?: string): SaveSummary {
  const s = g.discovery.stats();
  return {
    seed: g.seed, time: g.time, playSec: Math.floor(g.tick / 60), depth: s.depthRecord, completion: s.completion, peaceful: g.peaceful,
    ...(g.levels ? { level: g.levels.level } : {}), ...(nick !== undefined ? { nick } : {}),
  };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function validSummary(s: unknown): s is SaveSummary {
  const o = s as Partial<SaveSummary> | null;
  return Boolean(o) && typeof o === 'object' && num(o!.time) && num(o!.playSec) && num(o!.depth) && num(o!.completion);
}

export function formatPlayTime(sec: number): string {
  const s = num(sec) && sec > 0 ? Math.floor(sec) : 0;
  if (s < 60) return '不到 1 分鐘';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} 小時 ${r} 分` : `${h} 小時`;
}

export function savedAgo(savedAt: number, now: number): string {
  const d = Math.max(0, now - savedAt);
  if (d < 60_000) return '剛剛';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分鐘前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小時前`;
  return `${Math.floor(d / 86_400_000)} 天前`;
}

/** 「繼續」按鈕下的兩行摘要 */
export function continueLines(meta: { seed: string; savedAt: number; summary?: SaveSummary }, now: number): string[] {
  const s = meta.summary;
  if (!validSummary(s)) return [`「${meta.seed}」`, `上次存檔 ${savedAgo(meta.savedAt, now)}`];
  const d = dateOf(s.time);
  const facts = [`遊玩 ${formatPlayTime(s.playSec)}`];
  if (num(s.level) && s.level >= 1) facts.unshift(`等級 ${Math.floor(s.level)}`);
  if (typeof s.nick === 'string' && s.nick.trim()) facts.unshift(s.nick.trim());
  if (s.depth > 0) facts.push(`最深 ${Math.floor(s.depth)} 格`);
  facts.push(`完成度 ${Math.round(Math.max(0, Math.min(1, s.completion)) * 100)}%`);
  if (s.peaceful) facts.push('和平');
  // 每一項內部用不換行空白：窄畫面只會在「 · 」處換行（「完成度 1%」不會被拆開）
  return [`「${meta.seed}」 第${d.year}年 ${SEASON_NAMES[d.season]} ${d.dayOfSeason}日`, facts.map((f) => f.replace(/ /g, '\u00a0')).join(' · ')];
}

/** 一行摘要：每一項內部用不換行空白，窄畫面只會在「 · 」處換行 */
const joinFacts = (facts: string[]): string => facts.map((f) => f.replace(/ /g, ' ')).join(' · ');

/** 世界列表的一行：世界名 · 遊玩時間 · 最深 · 完成度 · 和平 · 上次遊玩多久前（沒有摘要的舊存檔只有名稱與時間） */
export function worldLine(m: SlotMeta, now: number): string {
  const s = m.summary, facts = [`「${m.seed}」`];
  if (validSummary(s)) {
    facts.push(`遊玩 ${formatPlayTime(s.playSec)}`);
    if (s.depth > 0) facts.push(`最深 ${Math.floor(s.depth)} 格`);
    facts.push(`完成度 ${Math.round(Math.max(0, Math.min(1, s.completion)) * 100)}%`);
    if (s.peaceful) facts.push('和平');
  }
  facts.push(savedAgo(m.savedAt, now));
  return joinFacts(facts);
}

/** 角色列表的一行：暱稱 · Lv · 上次遊玩多久前（rev 0 = 建立後還沒進過任何世界 → 從未遊玩） */
export function characterLine(c: CharacterMeta, now: number): string {
  return joinFacts([c.nick, `Lv ${Math.max(1, Math.floor(c.level))}`, c.rev > 0 ? savedAgo(c.savedAt, now) : '從未遊玩']);
}

/**
 * 「繼續冒險」指向的世界：worlds 是 listWorlds 的結果（新到舊），取第一個「記錄的角色還在」的世界；
 * 沒有 charId 的槽 = 還沒轉換的舊存檔（main），照樣算。挑法同 planContinue()（不帶 slot），但只看清單、不解碼存檔。
 */
export function continueSlot(worlds: readonly SlotMeta[], chars: readonly { id: string }[]): SlotMeta | null {
  const ids = new Set(chars.map((c) => c.id));
  return worlds.find((m) => (m.charId ? ids.has(m.charId) : true)) ?? null;
}

export type ImportPlan =
  | { kind: 'store' }
  | { kind: 'legacy'; data: SaveData }
  | { kind: 'world'; world: WorldData; character: DelveCharacter }
  | { kind: 'nochar' };
/**
 * 匯入檔（已解碼）怎麼處理：有 IndexedDB → 另開新存檔槽、不進遊戲（B4，importWorld）；
 * 沒有 IndexedDB（沒有列表可放）→ 直接開局：舊合併檔走舊存檔路徑，世界檔用內嵌角色（沒有 → nochar）。
 */
export function importPlan(hasIdb: boolean, decoded: AnySave): ImportPlan {
  if (hasIdb) return { kind: 'store' };
  if (decoded.kind === 'legacy') return { kind: 'legacy', data: decoded.data };
  const character = decoded.data.header.character;
  return character ? { kind: 'world', world: decoded.data, character } : { kind: 'nochar' };
}

// ── 世界名骰子：地名風的兩段組合（也是種子）──
const NAME_A = ['青苔', '琥珀', '赤岩', '霜牙', '螢光', '黑曜', '銅脈', '迴音', '沉睡', '翡翠', '灰燼', '深藍', '古樹', '銀霧', '燈芯', '晨星'];
const NAME_B = ['深谷', '洞窟', '礦坑', '高原', '裂谷', '森林', '湖畔', '荒原', '峽灣', '岩窟', '丘陵', '地脈'];
export function rollWorldName(rand: () => number): string {
  const a = NAME_A[Math.floor(rand() * NAME_A.length) % NAME_A.length];
  const b = NAME_B[Math.floor(rand() * NAME_B.length) % NAME_B.length];
  const n = 1 + Math.floor(rand() * 99);
  return `${a}${b}${n}`;
}

/** 選單鍵盤移動：visible[i] = 第 i 項看得到；回傳新索引（不是移動鍵 / 沒有可選項 → null） */
export function menuMove(visible: readonly boolean[], cur: number, key: string): number | null {
  const idx = visible.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  if (key === 'Home') return idx[0];
  if (key === 'End') return idx[idx.length - 1];
  const at = idx.indexOf(cur);
  if (key === 'ArrowDown') return at < 0 ? idx[0] : idx[(at + 1) % idx.length];
  if (key === 'ArrowUp') return at < 0 ? idx[idx.length - 1] : idx[(at - 1 + idx.length) % idx.length];
  return null;
}

// ── 音量：和遊戲廳（ArcadeBgm）共用同一個 localStorage key 與 window.__arcadeAudio / arcade-audio-change ──
export const VOLUME_KEY = 'arcade-sfx-vol';
export const DEFAULT_VOLUME = 0.6;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export function readVolume(store: Storage | undefined): number {
  try {
    const v = parseFloat(store?.getItem(VOLUME_KEY) ?? '');
    return Number.isFinite(v) ? clamp01(v) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
export function writeVolume(store: Storage | undefined, v: number): void {
  try { store?.setItem(VOLUME_KEY, String(clamp01(v))); } catch { /* 私密模式 */ }
}

export function zoomPrefLabel(z: number): string {
  if (z === 0) return '預設';
  return z > 0 ? `放大 +${z}` : `縮小 −${-z}`;
}

// ── 世界生成進度：generateWorldSteps 每段的名字 → 標籤 ──
const STAGES: [RegExp, string][] = [
  [/^caves|洞穴系統|填掉/, '挖掘洞穴'],
  [/^礦脈群/, '埋下礦脈'],
  [/^樹木/, '種下樹木'],
  [/^液體/, '引入泉水'],
  [/熔岩/, '點燃熔岩深淵'],
  [/^深度層|^L:|土石|花崗岩/, '堆疊地層'],
  [/生態區|沙地|海灘/, '劃分生態區'],
  [/^Terrain|重新量地表/, '雕出地形'],
  [/^Grass|^Spawn|裝飾/, '鋪上草地'],
  [/礦坑|密室|小屋|遺跡|地城/, '建造遺跡與地城'],
  [/浮空島/, '升起浮空島'],
  [/珍寶|古碑/, '藏好寶物'],
];
/** 所有可能出現的生成階段標籤（預先載入點陣字的字形子集用） */
export const GEN_STAGE_LABELS: readonly string[] = [...STAGES.map((s) => s[1]), '塑造世界'];
export function genStageLabel(stage: string): string {
  for (const [re, label] of STAGES) if (re.test(stage)) return label;
  return '塑造世界';
}
/** 第 i 段（共 n 段）完成時的進度（0..1，單調） */
export function genProgress(i: number, n: number): number {
  if (n <= 0) return 1;
  return Math.max(0, Math.min(1, i / n));
}

/**
 * 像素抖動轉場：格 (x, y) 在轉場進度 t 超過這個門檻時蓋上（0 < 門檻 ≤ 1）。
 * 由左往右掃（x / w 佔 60%），邊緣用 4×4 Bayer 抖動（佔 40%）→ 一道顆粒狀的斜邊掃過畫面。
 */
export function wipeThreshold(x: number, y: number, w: number): number {
  return Math.min(1, wipeLead(x, y, w) + bayer(x, y) * 0.4);
}
/** 轉場掃描的前緣位置（不含抖動；0.02..0.6）：t 剛超過它時這格開始有機會被蓋上 */
export function wipeLead(x: number, y: number, w: number): number {
  const sweep = Math.max(0, Math.min(1, (x + y * 0.35) / Math.max(1, w * 1.1)));
  return 0.02 + sweep * 0.58;
}

/** 背景鏡頭水平位置：在 [x0, x1] 之間以 speed（px/s）來回 */
export function panX(t: number, x0: number, x1: number, speed: number): number {
  const span = Math.max(1, x1 - x0), d = (t * speed) % (2 * span);
  return Math.round(d <= span ? x0 + d : x1 - (d - span));
}

/** 背景鏡頭垂直位置：鏡頭底下各欄的平均地表落在畫面 horizon 比例的高度（世界 px） */
export function titleCamY(surface: ArrayLike<number>, tile: number, camX: number, viewW: number, viewH: number, horizon: number): number {
  const n = surface.length;
  if (!n) return 0;
  const a = Math.max(0, Math.min(n - 1, Math.floor(camX / tile))), b = Math.max(a + 1, Math.min(n, Math.ceil((camX + viewW) / tile)));
  let s = 0;
  for (let i = a; i < b; i++) s += surface[i];
  return Math.round((s / (b - a)) * tile - viewH * horizon);
}

/** 現實日期 → 遊戲日期：月份 → 季節（3–5 春、6–8 夏、9–11 秋、12–2 冬）、當季第幾天（1..7）；本地時間 → 時刻 */
export function realDate(d: Date): { season: number; day: number; hour: number } {
  const m = d.getMonth();
  const season = m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3;
  const first = season === 3 ? 11 : season * 3 + 2;
  const inSeason = (m - first + 12) % 12;
  const day = 1 + Math.min(6, Math.floor(((inSeason * 31 + d.getDate() - 1) / 93) * 7));
  return { season, day, hour: d.getHours() + d.getMinutes() / 60 };
}

/** 開場鏡頭下降：t 秒時的 y（easeInOutCubic，dur 秒後停在 y1） */
export function descentY(t: number, y0: number, y1: number, dur: number): number {
  const u = Math.max(0, Math.min(1, dur > 0 ? t / dur : 1));
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return Math.round(y0 + (y1 - y0) * e);
}

/** 標題場景的焦點（洞窟中心在畫面上的比例位置）：寬螢幕選單在左 → 焦點偏右；直式字標在上、選單在下 → 焦點中上 */
export function focusFor(w: number, h: number): { x: number; y: number } {
  if (h < 520 && w > h) return { x: 0.5, y: 0.58 };
  if (w >= 900 && w > h) return { x: 0.68, y: 0.56 };
  if (h > w) return { x: 0.5, y: 0.52 };
  return { x: 0.5, y: 0.5 };
}
