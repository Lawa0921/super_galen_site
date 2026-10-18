// appearance.ts — 角色外觀（純資料，無 DOM）：髮型 / 髮色 / 呆毛 / 瞳色 / 眼型 / 膚色 / 服裝（主色 + 副色）/ 頭飾 / 眼鏡。
// 只存選項索引；顏色與畫法在 render/avatarArt.ts（依索引查色階）。外觀存在存檔 header.appearance，
// 另外在 localStorage（APPEARANCE_KEY）存一份「預設外觀」給新世界用。壞值一律退回該欄預設（外觀壞掉不讓存檔壞掉）。

export interface Appearance {
  /** 體型：0 = 女、1 = 男（只改身形 / 臉型；任何髮型 / 服裝兩邊都能用） */
  body: number;
  /** 腮紅（女生預設有、男生預設沒有） */
  blush: boolean;
  hair: number;
  hairColor: number;
  /** 頭頂一撮翹起來的呆毛 */
  ahoge: boolean;
  eyes: number;
  eyeShape: number;
  skin: number;
  outfit: number;
  /** 服裝主色 / 副色（CLOTH_COLORS 索引） */
  color1: number;
  color2: number;
  /** 頭飾（ACCESSORIES 索引；0 = 沒有） */
  acc: number;
  glasses: boolean;
}

export interface AppearanceOption { id: string; zh: string; }
export interface OutfitOption extends AppearanceOption { colors: readonly [number, number]; }

export const BODY_TYPES: readonly AppearanceOption[] = [
  { id: 'female', zh: '女' },
  { id: 'male', zh: '男' },
];
export const HAIR_STYLES: readonly AppearanceOption[] = [
  { id: 'bob', zh: '鮑伯短髮' },
  { id: 'twintails', zh: '雙馬尾' },
  { id: 'ponytail', zh: '高馬尾' },
  { id: 'long', zh: '直長髮' },
  { id: 'hime', zh: '姬髮型' },
  { id: 'spiky', zh: '刺蝟頭' },
  { id: 'messy', zh: '亂翹短髮' },
  { id: 'braid', zh: '側邊辮子' },
  { id: 'odango', zh: '雙丸子頭' },
];
export const HAIR_COLORS: readonly AppearanceOption[] = [
  { id: 'black', zh: '烏黑' },
  { id: 'brown', zh: '深棕' },
  { id: 'chestnut', zh: '栗色' },
  { id: 'blonde', zh: '金色' },
  { id: 'silver', zh: '銀白' },
  { id: 'blue', zh: '湛藍' },
  { id: 'aqua', zh: '青綠' },
  { id: 'pink', zh: '櫻粉' },
  { id: 'red', zh: '緋紅' },
  { id: 'green', zh: '嫩綠' },
  { id: 'purple', zh: '紫藤' },
  { id: 'orange', zh: '橘色' },
];
export const EYE_COLORS: readonly AppearanceOption[] = [
  { id: 'blue', zh: '藍' },
  { id: 'green', zh: '翠綠' },
  { id: 'amber', zh: '琥珀' },
  { id: 'violet', zh: '紫羅蘭' },
  { id: 'red', zh: '紅' },
  { id: 'brown', zh: '茶色' },
  { id: 'teal', zh: '碧青' },
  { id: 'pink', zh: '桃紅' },
  { id: 'grey', zh: '銀灰' },
];
export const EYE_SHAPES: readonly AppearanceOption[] = [
  { id: 'round', zh: '圓眼' },
  { id: 'sharp', zh: '上揚眼' },
  { id: 'droopy', zh: '下垂眼' },
];
export const SKIN_TONES: readonly AppearanceOption[] = [
  { id: 'porcelain', zh: '白皙' },
  { id: 'light', zh: '淺色' },
  { id: 'tan', zh: '小麥' },
  { id: 'brown', zh: '褐色' },
  { id: 'deep', zh: '深色' },
];
export const CLOTH_COLORS: readonly AppearanceOption[] = [
  { id: 'white', zh: '白' },
  { id: 'black', zh: '黑' },
  { id: 'navy', zh: '藏青' },
  { id: 'red', zh: '紅' },
  { id: 'pink', zh: '粉紅' },
  { id: 'sky', zh: '天藍' },
  { id: 'teal', zh: '青綠' },
  { id: 'green', zh: '森綠' },
  { id: 'khaki', zh: '卡其' },
  { id: 'brown', zh: '棕' },
  { id: 'purple', zh: '紫' },
  { id: 'orange', zh: '橘' },
];
const C = (id: string): number => CLOTH_COLORS.findIndex((c) => c.id === id);
export const OUTFITS: readonly OutfitOption[] = [
  { id: 'explorer', zh: '探險家', colors: [C('khaki'), C('teal')] },
  { id: 'sailor', zh: '水手服', colors: [C('navy'), C('red')] },
  { id: 'miko', zh: '巫女風', colors: [C('red'), C('white')] },
  { id: 'hoodie', zh: '連帽衫', colors: [C('sky'), C('white')] },
  { id: 'coat', zh: '冒險大衣', colors: [C('brown'), C('orange')] },
  { id: 'maid', zh: '女僕圍裙', colors: [C('black'), C('white')] },
];
export const ACCESSORIES: readonly AppearanceOption[] = [
  { id: 'none', zh: '無' },
  { id: 'ribbon', zh: '蝴蝶結' },
  { id: 'catears', zh: '貓耳髮箍' },
  { id: 'clip', zh: '星星髮夾' },
  { id: 'hood', zh: '兜帽' },
  { id: 'flower', zh: '小花' },
];

const H = (id: string): number => HAIR_STYLES.findIndex((h) => h.id === id);
const O = (id: string): number => OUTFITS.findIndex((o) => o.id === id);
const HC = (id: string): number => HAIR_COLORS.findIndex((h) => h.id === id);
/** 兩種體型的典型預設：女 = 櫻粉雙馬尾 + 水手服 + 蝴蝶結；男 = 深棕亂翹短髮 + 冒險大衣、上揚眼、沒有腮紅 */
const BODY_DEFAULTS: readonly Readonly<Appearance>[] = [
  Object.freeze({ body: 0, blush: true, hair: H('twintails'), hairColor: HC('pink'), ahoge: true, eyes: 0, eyeShape: 0, skin: 0,
    outfit: O('sailor'), color1: OUTFITS[O('sailor')].colors[0], color2: OUTFITS[O('sailor')].colors[1], acc: 1, glasses: false }),
  Object.freeze({ body: 1, blush: false, hair: H('messy'), hairColor: HC('brown'), ahoge: true, eyes: 2, eyeShape: 1, skin: 1,
    outfit: O('coat'), color1: OUTFITS[O('coat')].colors[0], color2: OUTFITS[O('coat')].colors[1], acc: 0, glasses: false }),
];
export function bodyDefaults(body: number): Appearance { return { ...(BODY_DEFAULTS[body] ?? BODY_DEFAULTS[0]) }; }
export const DEFAULT_APPEARANCE: Readonly<Appearance> = BODY_DEFAULTS[0];

export type AppearanceKey = keyof Appearance;
export type AppearanceField =
  | { key: AppearanceKey; label: string; kind: 'list' | 'color'; options: readonly AppearanceOption[]; group: 'body' | 'hair' | 'face' | 'outfit' }
  | { key: AppearanceKey; label: string; kind: 'toggle'; options: readonly AppearanceOption[]; group: 'body' | 'hair' | 'face' | 'outfit' };
const ONOFF: readonly AppearanceOption[] = [{ id: 'off', zh: '無' }, { id: 'on', zh: '有' }];
/** 客製化畫面的欄位（順序 = 畫面上的順序） */
export const APPEARANCE_FIELDS: readonly AppearanceField[] = [
  { key: 'body', label: '體型', kind: 'list', options: BODY_TYPES, group: 'body' },
  { key: 'hair', label: '髮型', kind: 'list', options: HAIR_STYLES, group: 'hair' },
  { key: 'hairColor', label: '髮色', kind: 'color', options: HAIR_COLORS, group: 'hair' },
  { key: 'ahoge', label: '呆毛', kind: 'toggle', options: ONOFF, group: 'hair' },
  { key: 'acc', label: '頭飾', kind: 'list', options: ACCESSORIES, group: 'hair' },
  { key: 'eyes', label: '瞳色', kind: 'color', options: EYE_COLORS, group: 'face' },
  { key: 'eyeShape', label: '眼型', kind: 'list', options: EYE_SHAPES, group: 'face' },
  { key: 'skin', label: '膚色', kind: 'color', options: SKIN_TONES, group: 'face' },
  { key: 'glasses', label: '眼鏡', kind: 'toggle', options: ONOFF, group: 'face' },
  { key: 'blush', label: '腮紅', kind: 'toggle', options: ONOFF, group: 'face' },
  { key: 'outfit', label: '服裝', kind: 'list', options: OUTFITS, group: 'outfit' },
  { key: 'color1', label: '主色', kind: 'color', options: CLOTH_COLORS, group: 'outfit' },
  { key: 'color2', label: '副色', kind: 'color', options: CLOTH_COLORS, group: 'outfit' },
];

const BOOL_KEYS = new Set<AppearanceKey>(['ahoge', 'glasses', 'blush']);
function countOf(key: AppearanceKey): number {
  return APPEARANCE_FIELDS.find((f) => f.key === key)?.options.length ?? 1;
}

/** 任意值 → 合法外觀：每一欄獨立檢查，壞掉的欄退回預設 */
export function normalizeAppearance(raw: unknown): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_APPEARANCE) as AppearanceKey[]) {
    const v = o[k];
    if (BOOL_KEYS.has(k)) { if (typeof v === 'boolean') (out[k] as boolean) = v; continue; }
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < countOf(k)) (out[k] as number) = v as number;
  }
  return out;
}

export function appearanceKey(a: Appearance): string {
  return [a.body, a.blush ? 1 : 0, a.hair, a.hairColor, a.ahoge ? 1 : 0, a.eyes, a.eyeShape, a.skin, a.outfit, a.color1, a.color2, a.acc, a.glasses ? 1 : 0].join('.');
}
export function sameAppearance(a: Appearance, b: Appearance): boolean { return appearanceKey(a) === appearanceKey(b); }

/** 某一欄往前 / 往後一個選項（循環）；換服裝時換成該服裝的預設配色。回傳新物件。 */
export function stepAppearance(a: Appearance, key: AppearanceKey, dir: number): Appearance {
  const out = { ...a };
  if (BOOL_KEYS.has(key)) { (out[key] as boolean) = !a[key]; return out; }
  const n = countOf(key), d = dir < 0 ? -1 : 1;
  if (key === 'body') return switchBody(a, (((a.body + d) % n) + n) % n);
  (out[key] as number) = (((a[key] as number) + d) % n + n) % n;
  if (key === 'outfit') { out.color1 = OUTFITS[out.outfit].colors[0]; out.color2 = OUTFITS[out.outfit].colors[1]; }
  return out;
}
/** 直接設定某一欄（越界夾住）；換服裝時換成該服裝的預設配色 */
export function setAppearance(a: Appearance, key: AppearanceKey, value: number | boolean): Appearance {
  const out = { ...a };
  if (BOOL_KEYS.has(key)) { (out[key] as boolean) = Boolean(value); return out; }
  (out[key] as number) = Math.max(0, Math.min(countOf(key) - 1, Math.round(Number(value) || 0)));
  if (key === 'body') return switchBody(a, out.body);
  if (key === 'outfit') { out.color1 = OUTFITS[out.outfit].colors[0]; out.color2 = OUTFITS[out.outfit].colors[1]; }
  return out;
}

/** 換體型：還是另一邊的預設（沒改過）→ 換成這一邊的預設；改過 → 只換體型，其他（含腮紅）保留 */
function switchBody(a: Appearance, body: number): Appearance {
  if (body === a.body) return { ...a };
  if (sameAppearance(a, bodyDefaults(a.body))) return bodyDefaults(body);
  // 改過的外觀：只換體型，腮紅等其他選擇都保留
  return { ...a, body };
}

/**
 * 隨機外觀：先抽體型；髮型 / 服裝不鎖性別（全部都抽得到），但 65% 從該體型常見的那幾種裡挑，
 * 抽出來的角色比較像「典型」的男生 / 女生。服裝配色七成用該服裝的預設；頭飾 / 眼鏡偏少；腮紅女生多、男生少。
 */
export function randomAppearance(rand: () => number): Appearance {
  const pick = (n: number): number => Math.min(n - 1, Math.floor(rand() * n));
  const body = pick(BODY_TYPES.length);
  const typical = (ids: readonly string[], all: readonly AppearanceOption[]): number =>
    rand() < 0.65 ? Math.max(0, all.findIndex((o) => o.id === ids[pick(ids.length)])) : pick(all.length);
  const hair = typical(body === 1 ? ['messy', 'spiky', 'bob', 'ponytail'] : ['twintails', 'long', 'hime', 'bob', 'odango', 'braid', 'ponytail'], HAIR_STYLES);
  const outfit = typical(body === 1 ? ['explorer', 'hoodie', 'coat'] : ['sailor', 'miko', 'maid', 'hoodie', 'explorer', 'coat'], OUTFITS);
  const own = rand() < 0.7;
  return {
    body, blush: rand() < (body === 0 ? 0.85 : 0.15),
    hair, hairColor: pick(HAIR_COLORS.length), ahoge: rand() < 0.45,
    eyes: pick(EYE_COLORS.length), eyeShape: pick(EYE_SHAPES.length), skin: pick(SKIN_TONES.length),
    outfit,
    color1: own ? OUTFITS[outfit].colors[0] : pick(CLOTH_COLORS.length),
    color2: own ? OUTFITS[outfit].colors[1] : pick(CLOTH_COLORS.length),
    acc: rand() < (body === 1 ? 0.3 : 0.55) ? 1 + pick(ACCESSORIES.length - 1) : 0,
    glasses: rand() < 0.15,
  };
}

// ── 預設外觀（新世界用）：localStorage ──
export const APPEARANCE_KEY = 'delve.appearance';
export function loadDefaultAppearance(store: Storage | undefined): Appearance {
  try {
    const s = store?.getItem(APPEARANCE_KEY);
    return normalizeAppearance(s ? JSON.parse(s) : null);
  } catch { return normalizeAppearance(null); }
}
export function saveDefaultAppearance(store: Storage | undefined, a: Appearance): void {
  try { store?.setItem(APPEARANCE_KEY, JSON.stringify(normalizeAppearance(a))); } catch { /* 私密模式 */ }
}
