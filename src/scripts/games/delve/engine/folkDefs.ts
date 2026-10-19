// folkDefs.ts — 世界上的 NPC（村民 / 矮人 / 旅人 / 受困探險者）的純資料：職能、商店、服務、好感度分級、名字、台詞、外觀產生器。
//   和 npcs.ts（據點居民）分開：居民靠「心情」調價，這些人靠「好感度」（交易 / 委託 / 救援累積）調價、解鎖商品與服務。
import type { Appearance } from './appearance';
import type { ItemId } from './items';
import { Rng } from './rng';

export type FolkRole =
  /** 村落：雜貨商、鐵匠、醫者、嚮導、村長（委託） */
  | 'trader' | 'smith' | 'healer' | 'guide' | 'elder'
  /** 矮人地廳：礦石商、符文匠、長老（委託） */
  | 'ore_trader' | 'runesmith' | 'dwarf_elder'
  /** 路上遇見：行商、旅行藥師；洞穴裡：受困探險者 */
  | 'peddler' | 'herbalist' | 'stranded';
export type FolkRace = 'human' | 'dwarf';
export type FolkOrigin = 'village' | 'hall' | 'road' | 'cave';

/** 服務：heal 治療、bless 祝福（回血 buff）、ward 守護（減傷 buff）、minesong 礦工之歌（挖掘 buff）、forge 鍛造（身邊就是鐵砧、依好感度打折）、
 *  deepforge 深岩升階（用錠代替星塵升稀有度）、hint 下一步提示、scout 標出附近沒去過的地點、invite 邀請到據點入住、rescue 救援 */
export type FolkService = 'heal' | 'bless' | 'ward' | 'minesong' | 'forge' | 'deepforge' | 'hint' | 'scout' | 'invite' | 'rescue';

export interface FolkShopEntry { item: ItemId; n: number; price: number; /** 好感度等級門檻（0 陌生 .. 3 摯友） */ tier?: number; }
export interface FolkServiceDef { kind: FolkService; zh: string; price?: number; tier?: number; }
export interface FolkRoleDef {
  role: FolkRole;
  race: FolkRace;
  title: string;
  intro: string;
  shop: readonly FolkShopEntry[];
  buys?: Partial<Record<ItemId, number>>;
  services: readonly FolkServiceDef[];
  /** 會派委託 */
  quests?: boolean;
  lines: readonly string[];
}

/** 好感度 0..100 的分級：門檻、名字、價格倍率 */
export const AFF_TIERS: readonly { min: number; zh: string; mul: number }[] = [
  { min: 0, zh: '陌生', mul: 1 },
  { min: 25, zh: '熟識', mul: 0.92 },
  { min: 55, zh: '信任', mul: 0.85 },
  { min: 85, zh: '摯友', mul: 0.78 },
];
export const AFF_MAX = 100;
export function affTier(a: number): number {
  let t = 0;
  for (let i = 0; i < AFF_TIERS.length; i++) if (a >= AFF_TIERS[i].min) t = i;
  return t;
}
export function affMul(a: number): number { return AFF_TIERS[affTier(a)].mul; }
/** 好感度來源：交易（每天每人最多 AFF_TRADE_DAILY）、每天第一次說話、委託、救援 */
export const AFF_TRADE = 2;
export const AFF_TRADE_DAILY = 6;
export const AFF_TALK = 1;
export const AFF_QUEST = 15;
export const AFF_RESCUE = 30;

/** buff 長度（遊戲秒）與效果 */
export const BUFFS = {
  bless: { zh: '祝福', desc: '回血 +2／秒', secs: 240, regen: 2 },
  ward: { zh: '守護', desc: '受到的傷害 −20%', secs: 240, dmgMul: 0.8 },
  minesong: { zh: '礦工之歌', desc: '挖掘速度 +30%', secs: 300, mine: 1.3 },
} as const;
export type BuffKind = keyof typeof BUFFS;

export const ROLES: Record<FolkRole, FolkRoleDef> = {
  trader: {
    role: 'trader', race: 'human', title: '雜貨商', intro: '村裡的雜貨鋪老闆。日用品、食物、建材都有，也收你帶回來的戰利品。',
    shop: [
      { item: 'torch', n: 10, price: 25 }, { item: 'rope', n: 20, price: 25 }, { item: 'wood', n: 30, price: 40 },
      { item: 'grilled_fish', n: 1, price: 25 }, { item: 'worm', n: 5, price: 20 }, { item: 'bed', n: 1, price: 90 },
      { item: 'bucket', n: 1, price: 220, tier: 1 }, { item: 'recall_stone', n: 1, price: 360, tier: 2 },
      { item: 'thatch', n: 20, price: 40, tier: 1 }, { item: 'timber', n: 20, price: 60, tier: 1 },
    ],
    buys: { gel: 2, bone: 3, feather: 3, fang: 6, chitin: 6, stinger: 6, spore: 4, pumpkin: 8, mushroom: 3, cactus: 2, soggy_boot: 5 },
    services: [], lines: ['今天的貨剛到，看看吧！', '打怪帶回來的東西我都收，價錢公道。', '跟村裡的人混熟了，價錢自然好談。', '天黑前記得回村子裡。'],
  },
  smith: {
    role: 'smith', race: 'human', title: '村鐵匠', intro: '村裡的鐵匠。在鐵匠身邊鍛造不用鐵砧，熟了之後還會算你便宜。',
    shop: [
      { item: 'copper_bar', n: 1, price: 22 }, { item: 'iron_bar', n: 1, price: 45 }, { item: 'throwing_knife', n: 10, price: 50 },
      { item: 'iron_pickaxe', n: 1, price: 260, tier: 1 }, { item: 'silver_bar', n: 1, price: 80, tier: 1 }, { item: 'gear_shard', n: 3, price: 150, tier: 2 },
    ],
    services: [{ kind: 'forge', zh: '鍛造裝備（洗煉 / 強化 / 升階；好感度越高越便宜）' }],
    lines: ['武器鈍了？拿來我看看。', '詞條不滿意就重敲，敲到滿意為止。', '火候到了，鐵自己會說話。'],
  },
  healer: {
    role: 'healer', race: 'human', title: '醫者', intro: '溫柔的村醫。幫你治傷、賣藥水，熟了之後還會為你祈福。',
    shop: [
      { item: 'healing_potion', n: 1, price: 70 }, { item: 'glow_mushroom', n: 2, price: 25 },
      { item: 'healing_potion', n: 3, price: 190, tier: 1 }, { item: 'life_core', n: 1, price: 900, tier: 3 },
    ],
    services: [
      { kind: 'heal', zh: '治療（回滿生命）', price: 30 },
      { kind: 'bless', zh: '祝福：回血 +2／秒（4 分鐘）', price: 80, tier: 1 },
      { kind: 'ward', zh: '守護：受到的傷害 −20%（4 分鐘）', price: 140, tier: 2 },
    ],
    lines: ['又受傷了？過來，我看看。', '藥水要省著用，但不要捨不得用。', '平安回來就好。'],
  },
  guide: {
    role: 'guide', race: 'human', title: '嚮導', intro: '走遍這片土地的嚮導。告訴你下一步該做什麼，也會把沒去過的地方標在你的地圖上。',
    shop: [{ item: 'compass', n: 1, price: 260 }, { item: 'depth_meter', n: 1, price: 260 }, { item: 'rope', n: 30, price: 35 }, { item: 'explorer_map', n: 1, price: 1500, tier: 3 }],
    services: [
      { kind: 'hint', zh: '請教下一步該做什麼（免費）' },
      { kind: 'scout', zh: '標出附近一處沒去過的地點', price: 60 },
    ],
    lines: ['往深處走之前，先準備好繩子和火把。', '地圖上的空白，就是冒險的地方。', '我年輕的時候，也在洞裡迷路過三天。'],
  },
  elder: {
    role: 'elder', race: 'human', title: '村長', intro: '村子的長者。村裡大小事都歸村長管，委託板上的工作也是村長貼的。',
    shop: [{ item: 'candle', n: 3, price: 30 }, { item: 'painting', n: 1, price: 120, tier: 1 }, { item: 'banner', n: 1, price: 60 }],
    services: [], quests: true,
    lines: ['年輕人，有空幫村子一點忙嗎？', '委託板上的工作，做完了來找我領報酬。', '這個村子是靠大家互相幫忙撐起來的。'],
  },
  ore_trader: {
    role: 'ore_trader', race: 'dwarf', title: '礦石商', intro: '在地廳做礦石買賣的矮人。地表的商人可拿不到這裡的深層貨。',
    shop: [
      { item: 'iron_ore', n: 10, price: 60 }, { item: 'silver_ore', n: 8, price: 110 }, { item: 'gold_ore', n: 6, price: 180 },
      { item: 'obsidian', n: 5, price: 160, tier: 1 }, { item: 'magma_rock', n: 6, price: 200, tier: 1 },
      { item: 'molten_bar', n: 1, price: 260, tier: 2 }, { item: 'stardust', n: 1, price: 320, tier: 2 }, { item: 'miner_helmet', n: 1, price: 600, tier: 3 },
    ],
    buys: { crystal: 14, copper_ore: 2, iron_ore: 3, silver_ore: 5, gold_ore: 8, obsidian: 10, chitin: 7, ember: 9 },
    services: [{ kind: 'minesong', zh: '礦工之歌：挖掘速度 +30%（5 分鐘）', price: 90, tier: 1 }],
    lines: ['哈！地表人也敢下來這麼深？', '好礦石要用耳朵聽，敲下去的聲音會告訴你。', '熔岩那一帶的石頭，可是一等一的好貨。'],
  },
  runesmith: {
    role: 'runesmith', race: 'dwarf', title: '符文匠', intro: '矮人的符文鍛造師。符文匠的熔爐能用深層的錠取代星塵，把裝備升上一階。',
    shop: [{ item: 'gold_bar', n: 1, price: 140 }, { item: 'molten_bar', n: 1, price: 280, tier: 1 }, { item: 'gear_shard', n: 5, price: 220, tier: 1 }, { item: 'dwarf_brick', n: 30, price: 80, tier: 1 }, { item: 'brazier', n: 1, price: 90 }, { item: 'rail', n: 20, price: 40 }],
    services: [
      { kind: 'forge', zh: '鍛造裝備（符文匠的熔爐就是鐵砧；好感度越高越便宜）' },
      { kind: 'deepforge', zh: '深岩升階：用金錠 / 熔岩錠代替星塵，把裝備升一階', tier: 1 },
    ],
    lines: ['符文不是刻上去的，是敲進去的。', '星塵？那是地表人的玩意兒。我們用熔岩錠。', '你的裝備……嗯，還有成長的空間。'],
  },
  dwarf_elder: {
    role: 'dwarf_elder', race: 'dwarf', title: '地廳長老', intro: '矮人地廳的長老，鬍子比年紀還長。地廳裡的委託都由長老發派。',
    shop: [{ item: 'lantern', n: 1, price: 140 }, { item: 'barrel', n: 2, price: 50 }, { item: 'dwarf_wall', n: 30, price: 70, tier: 1 }],
    services: [], quests: true,
    lines: ['地底的事，就交給地底的人。不過……人手不夠的時候例外。', '深處的怪物越來越多了，礦工們都不敢下礦坑。', '幫地廳做事的人，矮人不會忘記。'],
  },
  peddler: {
    role: 'peddler', race: 'human', title: '行商', intro: '扛著大行囊四處走的行商。貨不多但都很少見，錯過就要等下次了。',
    shop: [], // 每次遇見依種子換貨（peddlerStock）
    buys: { gel: 3, bone: 4, feather: 4, fang: 7, crystal: 13, spore: 5, ember: 9 },
    services: [], lines: ['旅途中碰面就是緣分，看看我的貨吧！', '這些可是從很遠的地方帶來的。', '天黑前我就要上路了，要買要快喔。'],
  },
  herbalist: {
    role: 'herbalist', race: 'human', title: '旅行藥師', intro: '背著藥箱四處行醫的藥師。如果你有一個安穩的據點，這位藥師說不定願意留下來。',
    shop: [{ item: 'healing_potion', n: 1, price: 75 }, { item: 'mushroom', n: 3, price: 15 }, { item: 'glow_mushroom', n: 3, price: 30 }],
    services: [
      { kind: 'heal', zh: '治療（回滿生命）', price: 35 },
      { kind: 'bless', zh: '祝福：回血 +2／秒（4 分鐘）', price: 90 },
      { kind: 'invite', zh: '邀請這位藥師到你的據點入住（成為據點的藥師）' },
    ],
    lines: ['路上採的藥草，正好派上用場。', '一直漂泊也有點累了……', '如果有個能好好熬藥的房間就好了。'],
  },
  stranded: {
    role: 'stranded', race: 'human', title: '受困的探險者', intro: '在洞穴深處迷路、受了傷的探險者。把這位探險者帶回地表、村子或據點，會得到好好的答謝。',
    shop: [], services: [{ kind: 'rescue', zh: '救援：讓對方跟著你走（帶到地表 / 村子 / 據點）' }, { kind: 'invite', zh: '邀請這位探險者到你的據點入住（成為據點的嚮導）' }],
    lines: ['救、救命……有人嗎？', '火把快燒完了……', '謝謝你！我跟緊你。'],
  },
};

// ── 名字 ─────────────────────────────────────────────────
const HUMAN_NAMES = ['艾琳', '托比', '諾拉', '溫斯', '莉卡', '巴德', '雪菈', '葛雷', '莫莉', '提歐', '琪雅', '羅文', '貝絲', '漢克', '露露', '艾倫', '可可', '奧斯', '蜜拉', '凱爾'];
const DWARF_NAMES = ['布洛姆', '朵菈', '葛倫德', '塔希', '魯克', '薇格', '歐瑪', '伯恩', '岡妲', '索林克', '赫芙', '杜瓦'];
const DWARF_EPITHETS = ['鐵砧', '煤鬚', '深脈', '灰岩', '銅爐', '石拳', '火眼', '晶耳'];
export function folkName(race: FolkRace, rng: Rng): string {
  if (race === 'dwarf') return `${DWARF_EPITHETS[rng.int(0, DWARF_EPITHETS.length)]}・${DWARF_NAMES[rng.int(0, DWARF_NAMES.length)]}`;
  return HUMAN_NAMES[rng.int(0, HUMAN_NAMES.length)];
}

// ── 外觀 ─────────────────────────────────────────────────
export interface FolkLook {
  app: Appearance;
  head?: string; body?: string; legs?: string; back?: string;
  belt?: 'compass' | 'depth' | 'map' | 'magnet';
  neck?: 'night' | 'fang' | 'heart' | 'magma';
  /** 矮人：變矮 + （男性）大鬍子 */
  dwarf?: boolean;
  beard?: boolean;
}
const A = (o: Partial<Appearance>): Appearance => ({
  body: 0, race: 0, blush: true, hair: 0, hairColor: 2, ahoge: false, eyes: 0, eyeShape: 0, skin: 1, outfit: 0, color1: 8, color2: 6, acc: 0, glasses: false, ...o,
});
/** 依職能 + 種子產生外觀（同一個人永遠同一個樣子） */
export function folkLook(role: FolkRole, rng: Rng): FolkLook {
  const pick = <T>(a: readonly T[]): T => a[rng.int(0, a.length)];
  const body = rng.int(0, 2);
  const def = ROLES[role];
  if (def.race === 'dwarf') {
    // 矮人：大地色系的衣服、紅 / 橘 / 棕 / 黑髮、膚色偏深、礦工頭燈盔或兜帽；男性有大鬍子
    const app = A({
      body, blush: body === 0, hair: body ? pick([5, 6]) : pick([7, 2, 8]), hairColor: pick([8, 11, 1, 0, 4]), ahoge: false,
      eyes: pick([2, 5, 8]), eyeShape: 1, skin: pick([2, 3, 4]), outfit: pick([4, 0]), color1: pick([9, 8, 11]), color2: pick([3, 2, 7]), acc: role === 'runesmith' ? 4 : 0,
    });
    return { app, head: role === 'runesmith' ? undefined : 'hat:miner', dwarf: true, beard: body === 1 || role === 'dwarf_elder', neck: role === 'runesmith' ? 'magma' : undefined };
  }
  const app = A({
    body, blush: body === 0, hair: rng.int(0, 9), hairColor: rng.int(0, 12), ahoge: rng.chance(3), eyes: rng.int(0, 9), eyeShape: rng.int(0, 3), skin: rng.int(0, 5),
    outfit: rng.int(0, 6), color1: rng.int(0, 12), color2: rng.int(0, 12), acc: 0, glasses: rng.chance(6),
  });
  switch (role) {
    case 'trader': return { app: { ...app, outfit: 4, color1: 9, color2: 11 }, head: 'hat:beret' };
    case 'smith': return { app: { ...app, outfit: 0, color1: 1, color2: 3 }, neck: 'fang' };
    case 'healer': return { app: { ...app, outfit: 2, color1: 0, color2: 7, acc: 5 } };
    case 'guide': return { app: { ...app, outfit: 0, color1: 7, color2: 8 }, back: 'back:cape', belt: 'compass' };
    case 'elder': return { app: { ...app, hairColor: 4, glasses: true, outfit: 4, color1: 10, color2: 0 } };
    case 'peddler': return { app: { ...app, outfit: 4, color1: 8, color2: 3 }, head: 'hat:straw', back: 'back:cape' };
    case 'herbalist': return { app: { ...app, outfit: 3, color1: 6, color2: 0 }, head: 'hat:flower' };
    case 'stranded': return { app: { ...app, outfit: 0, color1: 8, color2: 6 }, belt: 'depth' };
    default: return { app };
  }
}

/** 行商的貨（每次遇見換一批：種子 + 第幾次遇見；都是平常很難買到的東西） */
const PEDDLER_POOL: readonly FolkShopEntry[] = [
  { item: 'gear_shard', n: 4, price: 160 }, { item: 'stardust', n: 1, price: 380 }, { item: 'recall_stone', n: 1, price: 320 },
  { item: 'life_core', n: 1, price: 950 }, { item: 'golden_crate', n: 1, price: 600 }, { item: 'iron_crate', n: 1, price: 220 },
  { item: 'flaming_arrow', n: 30, price: 120 }, { item: 'sunbeetle', n: 3, price: 150 }, { item: 'firefly', n: 5, price: 90 },
  { item: 'travel_coat', n: 1, price: 280 }, { item: 'feather_wings', n: 1, price: 700 }, { item: 'witch_hat', n: 1, price: 260 },
  { item: 'bucket', n: 1, price: 200 }, { item: 'sponge', n: 1, price: 420 }, { item: 'healing_potion', n: 2, price: 140 },
];
export function peddlerStock(seed: string, visit: number): FolkShopEntry[] {
  const rng = new Rng(`${seed}:peddler:${visit}`);
  const pool = [...PEDDLER_POOL];
  const out: FolkShopEntry[] = [];
  for (let k = 0; k < 5 && pool.length; k++) out.push(pool.splice(rng.int(0, pool.length), 1)[0]);
  return out;
}
