// npcs.ts — 據點居民（純資料 + 純函式，無 DOM）：五位原創居民的設定（名字、外觀、喜好、入住條件、商店 / 服務、台詞）、
// 心情計算、作息表、錢包（銅幣 / 銀幣找零）。居民的「活著」（走路、開門、睡覺）在 settlement.ts。
import type { Appearance } from './appearance';
import { T } from './tiles';
import type { ItemId } from './items';
import type { Inventory } from './inventory';
import type { SunTimes } from './calendar';

export type NpcKind = 'merchant' | 'smith' | 'cook' | 'cartographer' | 'gardener' | 'healer' | 'guide';
export const NPC_KINDS: readonly NpcKind[] = ['merchant', 'smith', 'cook', 'cartographer', 'gardener', 'healer', 'guide'];
/** 只能在旅途中招募的居民（邀請過才會搬來）：藥師 = 路上遇到的旅行藥師、嚮導 = 從洞穴救出來的探險者 */
export const RECRUIT_KINDS: readonly NpcKind[] = ['healer', 'guide'];

export interface ShopEntry { item: ItemId; n: number; price: number; }
/** 服務：forge = 在身邊就能鍛造（並打折）、cook = 在身邊就算料理站、reveal = 付錢打聽一處未發現的地點、
 *  heal = 治療 + 祝福（藥師）、guide = 下一步提示 + 標出沒領過的地標（嚮導） */
export type NpcService = 'forge' | 'cook' | 'reveal' | 'garden' | 'heal' | 'guide';
export interface NpcLook {
  app: Appearance;
  /** 紙娃娃部位（engine/doll.ts 的 look 字串；省略 = 基本服裝） */
  head?: string; body?: string; legs?: string; back?: string;
  belt?: 'compass' | 'depth' | 'map' | 'magnet';
  neck?: 'night' | 'fang' | 'heart' | 'magma';
}
export interface NpcNeed {
  /** 據點等級下限 */
  level: number;
  /** 只能招募：要先在旅途中邀請過 */
  recruit?: boolean;
  /** 據點範圍內要有這些 tile 之一（共 count 件） */
  tiles?: readonly number[];
  count?: number;
  zh: string;
}
export interface NpcDef {
  kind: NpcKind;
  name: string;
  title: string;
  intro: string;
  likes: readonly NpcKind[];
  dislikes: readonly NpcKind[];
  need: NpcNeed;
  shop: readonly ShopEntry[];
  /** 收購價（銅幣 / 件） */
  buys?: Partial<Record<ItemId, number>>;
  service?: { kind: NpcService; zh: string; price?: number };
  /** 白天上班的地方（據點裡最近的這種 tile） */
  work?: readonly number[];
  look: NpcLook;
  lines: { greet: readonly string[]; night: readonly string[]; rain: readonly string[]; happy: readonly string[]; sad: readonly string[]; homeless: readonly string[] };
}

const A = (o: Partial<Appearance>): Appearance => ({
  body: 0, blush: true, hair: 0, hairColor: 2, ahoge: false, eyes: 0, eyeShape: 0, skin: 1, outfit: 0, color1: 8, color2: 6, acc: 0, glasses: false, ...o,
});

export const NPCS: Record<NpcKind, NpcDef> = {
  merchant: {
    kind: 'merchant', name: '米拉', title: '旅行商人',
    intro: '背著大背包四處跑的商人，什麼都賣一點、什麼都收一點。',
    likes: ['cartographer', 'cook', 'smith'], dislikes: [],
    need: { level: 1, zh: '據點 Lv1（有一間可入住的房間）' },
    shop: [
      { item: 'torch', n: 10, price: 30 }, { item: 'rope', n: 20, price: 30 }, { item: 'healing_potion', n: 1, price: 80 },
      { item: 'wood', n: 20, price: 40 }, { item: 'gel', n: 5, price: 25 }, { item: 'bucket', n: 1, price: 250 },
      { item: 'recall_stone', n: 1, price: 400 },
    ],
    buys: { gel: 2, bone: 3, feather: 3, fang: 6, chitin: 6, stinger: 6, spore: 4, soggy_boot: 5, pumpkin: 8, cactus: 2, crystal: 12 },
    look: { app: A({ hair: 1, hairColor: 3, ahoge: true, eyes: 2, eyeShape: 0, skin: 1, outfit: 4, color1: 9, color2: 11, acc: 1 }), head: 'hat:beret', back: 'back:cape', belt: 'magnet' },
    lines: {
      greet: ['歡迎光臨～今天想買點什麼？', '這一帶的礦石品質不錯，你挖到的我都收喔。', '背包裡空間不夠？那就多賣點東西給我吧！', '我走過很多地方，這裡的爐火最暖和。'],
      night: ['晚上外面不安全，買完就待在屋裡吧。', '呼啊……要打烊了，明天再來？'],
      rain: ['下雨天生意清淡，給你算便宜一點……騙你的。', '雨聲聽起來像銅幣掉進錢袋的聲音。'],
      happy: ['住在這裡真的很棒！我給你打個折吧。', '鄰居們都好親切，連我的帳本都變輕了。'],
      sad: ['房間有點擠……心情不好，價格也只好高一點。', '最近客人好少，帳本都長灰塵了。'],
      homeless: ['我的房間不見了？沒有床我可沒辦法做生意。'],
    },
  },
  smith: {
    kind: 'smith', name: '阿焰', title: '鍛冶師',
    intro: '火氣跟爐火一樣旺的鍛冶師。在她身邊鍛造、洗煉都比較便宜。',
    likes: ['cook', 'merchant'], dislikes: ['gardener'],
    need: { level: 1, tiles: [T.ANVIL, T.FURNACE], count: 1, zh: '據點裡有熔爐或鐵砧' },
    shop: [
      { item: 'copper_bar', n: 1, price: 25 }, { item: 'iron_bar', n: 1, price: 50 }, { item: 'silver_bar', n: 1, price: 90 },
      { item: 'builder_hammer', n: 1, price: 60 }, { item: 'throwing_knife', n: 10, price: 60 },
    ],
    service: { kind: 'forge', zh: '鍛造（在她身邊不用鐵砧，費用打折）' },
    work: [T.ANVIL, T.FURNACE],
    look: { app: A({ hair: 5, hairColor: 8, ahoge: false, eyes: 4, eyeShape: 1, skin: 2, outfit: 0, color1: 9, color2: 3, acc: 0 }), neck: 'fang' },
    lines: {
      greet: ['要鍛什麼？刀刃、盔甲、還是你那把破鎬？', '詞條不滿意就拿來，我幫你重新敲一遍。', '火候是一切。急不來的。', '鐵砧不用自己扛，我這裡就是。'],
      night: ['爐火要熄了，明天一早再來。', '晚上敲鐵會被鄰居罵……我是說，會被罵得更兇。'],
      rain: ['雨天濕氣重，鋼會生鏽，記得擦乾。'],
      happy: ['心情好，手也順。今天的費用給你便宜點！', '有熱騰騰的飯吃，打鐵才有力氣。'],
      sad: ['住得不舒服，敲出來的東西也不會好看。', '旁邊那堆花草的味道……我受不了。'],
      homeless: ['沒地方睡，連鐵鎚都拿不穩了。'],
    },
  },
  cook: {
    kind: 'cook', name: '小麥', title: '廚師',
    intro: '總是笑咪咪的廚師。她在的地方就算是料理站。',
    likes: ['gardener', 'merchant'], dislikes: [],
    need: { level: 1, tiles: [T.FIREPLACE_L, T.CAMPFIRE], count: 1, zh: '據點裡有壁爐或營火' },
    shop: [
      { item: 'grilled_fish', n: 1, price: 30 }, { item: 'smoked_eel', n: 1, price: 60 }, { item: 'fish_stew', n: 1, price: 120 },
      { item: 'mushroom', n: 3, price: 20 },
    ],
    service: { kind: 'cook', zh: '料理（在她身邊就能做料理）' },
    work: [T.FIREPLACE_L, T.CAMPFIRE],
    look: { app: A({ hair: 2, hairColor: 2, ahoge: true, eyes: 5, eyeShape: 2, skin: 0, outfit: 5, color1: 11, color2: 0, acc: 0 }), head: 'hat:maid' },
    lines: {
      greet: ['肚子餓了嗎？今天的魚湯熬了三個小時喔。', '釣到的魚帶過來，我教你怎麼烤！', '吃飽了才有力氣往下挖嘛。', '香料不夠的話……蘑菇也可以頂一下。'],
      night: ['宵夜時間～不過只有一點點喔。', '要睡了，鍋子明天再洗……'],
      rain: ['下雨天最適合喝熱湯了。'],
      happy: ['大家都來吃飯，好開心！', '園丁送的香草好香，今天的料理特別好吃。'],
      sad: ['廚房太小了，鍋子都轉不開……', '最近沒什麼人來吃飯，有點寂寞。'],
      homeless: ['沒有家就沒有廚房……'],
    },
  },
  cartographer: {
    kind: 'cartographer', name: '詩織', title: '製圖師',
    intro: '戴著眼鏡、筆記本從不離身的製圖師。付點錢就告訴你某個沒去過的地方在哪。',
    likes: ['merchant'], dislikes: ['smith'],
    need: { level: 2, tiles: [T.BOOKSHELF, T.SHELF], count: 1, zh: '據點 Lv2，而且有書架或層架' },
    shop: [{ item: 'compass', n: 1, price: 300 }, { item: 'depth_meter', n: 1, price: 300 }, { item: 'rope', n: 30, price: 40 }],
    service: { kind: 'reveal', zh: '打聽一處還沒發現的地點（標在地圖上）', price: 100 },
    work: [T.BOOKSHELF, T.SHELF, T.TABLE],
    look: { app: A({ hair: 3, hairColor: 5, ahoge: false, eyes: 6, eyeShape: 2, skin: 0, outfit: 4, color1: 2, color2: 8, acc: 0, glasses: true }), back: 'back:cape', belt: 'map' },
    lines: {
      greet: ['這張地圖還有好多空白……你最近去過哪裡？', '往東邊走很遠，聽說有沙子做的海。', '深處的岩層會變色，那是熔岩的前兆。', '我可以幫你打聽沒去過的地方，代價是一點點銅幣。'],
      night: ['晚上是整理筆記的時間，請別打擾我……開玩笑的。', '星星的位置也是地圖的一部分喔。'],
      rain: ['雨天不適合出門畫圖，墨水會暈開。'],
      happy: ['安靜的房間、好看的書架，這裡真是理想的工作室。'],
      sad: ['太吵了，我沒辦法專心畫等高線。', '書都沒地方放……'],
      homeless: ['沒有房間，我的地圖會被雨淋濕的。'],
    },
  },
  gardener: {
    kind: 'gardener', name: '芽芽', title: '園丁',
    intro: '喜歡和植物說話的園丁。種子、盆栽、魚餌都找她。',
    likes: ['cook'], dislikes: ['smith'],
    need: { level: 2, tiles: [T.POTTED_PLANT], count: 2, zh: '據點 Lv2，而且有兩盆盆栽' },
    shop: [
      { item: 'potted_plant', n: 1, price: 40 }, { item: 'glow_mushroom', n: 2, price: 30 }, { item: 'pumpkin', n: 1, price: 40 },
      { item: 'worm', n: 5, price: 25 }, { item: 'flower_crown', n: 1, price: 150 },
    ],
    service: { kind: 'garden', zh: '照顧盆栽（據點裡每兩盆盆栽，舒適度 +1）' },
    work: [T.POTTED_PLANT],
    look: { app: A({ hair: 0, hairColor: 9, ahoge: true, eyes: 1, eyeShape: 0, skin: 1, outfit: 3, color1: 7, color2: 8, acc: 5 }), head: 'hat:straw' },
    lines: {
      greet: ['你好呀～今天的葉子也很有精神！', '盆栽放在有光的地方，它們會長得比較好。', '蚯蚓是好朋友，也是好魚餌。', '春天的時候，地上的花會開得特別多喔。'],
      night: ['植物也要睡覺的，噓——', '晚上會有怪怪的東西出來，關好門喔。'],
      rain: ['下雨了！大家都在喝水，好開心～'],
      happy: ['廚房飄來的香味，連花都開心了。'],
      sad: ['煙好多……葉子都黃掉了。', '這裡沒什麼植物，有點寂寞。'],
      homeless: ['我的盆栽們沒有家了……'],
    },
  },
  healer: {
    kind: 'healer', name: '薰', title: '藥師',
    intro: '在路上遇見的旅行藥師，被你的據點留了下來。治傷、賣藥水、為出門的人祈福；她住的據點回血特別快。',
    likes: ['gardener', 'cook'], dislikes: ['smith'],
    need: { level: 1, recruit: true, zh: '在地表遇到旅行藥師並邀請她（據點 Lv1）' },
    shop: [{ item: 'healing_potion', n: 1, price: 60 }, { item: 'healing_potion', n: 3, price: 160 }, { item: 'glow_mushroom', n: 3, price: 25 }, { item: 'life_core', n: 1, price: 800 }],
    service: { kind: 'heal', zh: '治療（回滿生命）/ 祝福 / 守護', price: 20 },
    work: [T.TABLE, T.POTTED_PLANT],
    look: { app: A({ hair: 3, hairColor: 6, ahoge: false, eyes: 1, eyeShape: 2, skin: 0, outfit: 2, color1: 0, color2: 6, acc: 5 }), head: 'hat:flower' },
    lines: {
      greet: ['今天也平安回來了呢。', '藥水我熬好了，放在架子上。', '受傷了不要逞強，先來找我。', '這裡的空氣很好，藥草長得特別快。'],
      night: ['晚上別出門了，傷口會好得比較慢。', '我還要再熬一鍋藥……'],
      rain: ['雨水洗過的藥草，藥效特別好。'],
      happy: ['能在這裡定居真是太好了。', '大家都很健康，這是最好的事。'],
      sad: ['房間有點吵，熬藥的火候都抓不準。'],
      homeless: ['沒有房間的話，藥箱只能淋雨了……'],
    },
  },
  guide: {
    kind: 'guide', name: '卡洛', title: '嚮導',
    intro: '被你從洞穴深處救出來的探險者。他把一身的探險經驗都教給你：下一步該做什麼、哪裡還有沒去過的地標。',
    likes: ['merchant', 'cartographer'], dislikes: [],
    need: { level: 1, recruit: true, zh: '在洞穴裡救出受困的探險者並邀請他（據點 Lv1）' },
    shop: [{ item: 'rope', n: 30, price: 30 }, { item: 'torch', n: 15, price: 30 }, { item: 'recall_stone', n: 1, price: 300 }, { item: 'explorer_map', n: 1, price: 1200 }],
    service: { kind: 'guide', zh: '下一步提示（免費）/ 標出附近沒領過的地標', price: 40 },
    work: [T.TABLE, T.BOOKSHELF],
    look: { app: A({ body: 1, blush: false, hair: 6, hairColor: 1, ahoge: true, eyes: 2, eyeShape: 1, skin: 2, outfit: 0, color1: 7, color2: 8, acc: 0 }), back: 'back:cape', belt: 'depth' },
    lines: {
      greet: ['要出發了嗎？我幫你看看地圖。', '我欠你一條命，你想去哪裡我都告訴你。', '洞穴裡的風聲，會告訴你哪裡有路。', '每一個地點都藏著點什麼，別只是路過。'],
      night: ['晚上的洞穴特別吵……我還是待在屋裡好了。'],
      rain: ['雨天的地表比洞裡還危險，小心滑倒。'],
      happy: ['住在這裡，我終於不用再半夜驚醒了。'],
      sad: ['房間好窄，讓我想起被困住的那幾天……'],
      homeless: ['我又無家可歸了嗎……'],
    },
  },
};

/** 招募型居民的個人身分（邀請時從那位旅行藥師 / 探險者帶過來：名字 + 外觀） */
export interface NpcIdent { name: string; look: NpcLook; }
/** 套上個人身分後的居民設定（沒有身分 → 原本的設定）；介紹文字換成這個人的名字 */
export function withIdent(kind: NpcKind, ident?: NpcIdent | null): NpcDef {
  const d = NPCS[kind];
  if (!ident) return d;
  return { ...d, name: ident.name, look: ident.look, intro: d.intro.replace(d.name, ident.name) };
}
const LOOK_BELTS = new Set(['compass', 'depth', 'map', 'magnet']);
const LOOK_NECKS = new Set(['night', 'fang', 'heart', 'magma']);
/** 存檔讀回的身分：壞掉的欄位丟掉（名字 1～12 字、外觀正規化、部位只收字串） */
export function validIdent(raw: unknown, normalize: (a: unknown) => Appearance): NpcIdent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { name?: unknown; look?: Record<string, unknown> };
  if (typeof o.name !== 'string' || !o.name.length || o.name.length > 12 || !o.look || typeof o.look !== 'object') return null;
  const s = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z]+:[a-z_]+$/.test(v) ? v : undefined);
  const look: NpcLook = { app: normalize(o.look.app) };
  for (const k of ['head', 'body', 'legs', 'back'] as const) { const v = s(o.look[k]); if (v) look[k] = v; }
  if (typeof o.look.belt === 'string' && LOOK_BELTS.has(o.look.belt)) look.belt = o.look.belt as NpcLook['belt'];
  if (typeof o.look.neck === 'string' && LOOK_NECKS.has(o.look.neck)) look.neck = o.look.neck as NpcLook['neck'];
  return { name: o.name, look };
}

// ── 心情 ────────────────────────────────────────────────
export interface MoodCtx {
  /** 自己房間的舒適度（沒有房間 = 0） */
  comfort: number;
  level: number;
  /** 同一個據點的其他居民 */
  neighbours: readonly NpcKind[];
  homeless: boolean;
}
export interface Mood { value: number; notes: string[]; }
export const CROWD_FREE = 3;
/** 心情 0..100：基本 50、房間舒適度、據點等級、喜歡 / 討厭的鄰居、太擠、無家可歸 */
export function npcMood(kind: NpcKind, c: MoodCtx): Mood {
  const d = NPCS[kind], notes: string[] = [];
  let v = 50;
  const room = Math.min(25, Math.round(c.comfort * 2));
  if (room) { v += room; notes.push(`房間舒適 +${room}`); }
  if (c.level > 1) { v += (c.level - 1) * 5; notes.push(`據點 Lv${c.level} +${(c.level - 1) * 5}`); }
  for (const n of c.neighbours) {
    if (d.likes.includes(n)) { v += 10; notes.push(`喜歡鄰居${NPCS[n].title} +10`); }
    if (d.dislikes.includes(n)) { v -= 10; notes.push(`討厭鄰居${NPCS[n].title} −10`); }
  }
  const crowd = Math.max(0, c.neighbours.length + 1 - CROWD_FREE);
  if (crowd) { v -= crowd * 5; notes.push(`太擠 −${crowd * 5}`); }
  if (c.homeless) { v -= 40; notes.push('沒有房間 −40'); }
  return { value: Math.max(0, Math.min(100, Math.round(v))), notes };
}
/** 心情 → 價格倍率（100 → 0.8、50 → 1.0、0 → 1.2） */
export function priceMul(mood: number): number {
  return Math.round((1.2 - Math.max(0, Math.min(100, mood)) * 0.004) * 100) / 100;
}
/** 鍛冶師的鍛造費用倍率：心情倍率再減 0.1（最低 0.7） */
export function forgeMul(mood: number): number { return Math.max(0.7, Math.round((priceMul(mood) - 0.1) * 100) / 100); }
export function moodLabel(v: number): string {
  return v >= 80 ? '非常開心' : v >= 60 ? '開心' : v >= 40 ? '普通' : v >= 20 ? '不太開心' : '很難過';
}
/** 售價（銅幣）：基本價 × 心情倍率，至少 1 */
export function shopPrice(base: number, mood: number): number { return Math.max(1, Math.round(base * priceMul(mood))); }

// ── 作息 ────────────────────────────────────────────────
export type NpcActivity = 'sleep' | 'home' | 'work';
/**
 * 一天的作息：夜晚睡覺（有床的話）、日出後一小段時間和日落前一小段在家、其他時間去上班（工作 tile 附近 / 據點中心）。
 * d = 一天的比例（0..1）。
 */
export function npcActivity(d: number, sun: SunTimes, night: boolean, hasBed: boolean): NpcActivity {
  if (night) return hasBed ? 'sleep' : 'home';
  if (d < sun.sunrise + sun.twilight + 0.06) return 'home';
  if (d > sun.sunset - 0.07) return 'home';
  return 'work';
}

// ── 台詞 ────────────────────────────────────────────────
export interface LineCtx { night: boolean; rain: boolean; mood: number; homeless: boolean; }
/** 依情境挑一句（n = 第幾次說話，輪流換句） */
export function npcLine(kind: NpcKind, c: LineCtx, n: number): string {
  const L = NPCS[kind].lines;
  const pool = c.homeless ? L.homeless
    : n % 3 === 1 && c.night ? L.night
      : n % 3 === 1 && c.rain ? L.rain
        : n % 3 === 2 && c.mood >= 70 ? L.happy
          : n % 3 === 2 && c.mood < 40 ? L.sad
            : L.greet;
  return pool[((n % pool.length) + pool.length) % pool.length];
}

// ── 錢包（銅幣 / 銀幣；1 銀 = 100 銅） ─────────────────────
export function walletOf(inv: Inventory): number { return inv.count('copper_coin') + inv.count('silver_coin') * 100; }
/** 付 amount 銅幣：先用銅幣，不夠就拆銀幣找零。錢不夠 → false（背包不變） */
export function pay(inv: Inventory, amount: number): boolean {
  if (amount <= 0) return true;
  if (walletOf(inv) < amount) return false;
  const cu = inv.count('copper_coin');
  if (cu >= amount) { inv.remove('copper_coin', amount); return true; }
  const rest = amount - cu, silver = Math.ceil(rest / 100), change = silver * 100 - rest;
  inv.remove('copper_coin', cu);
  inv.remove('silver_coin', silver);
  if (change > 0) inv.add('copper_coin', change);
  return true;
}
/** 收入 amount 銅幣（每 100 換成 1 銀幣，背包放不下的回傳剩餘銅幣） */
export function earn(inv: Inventory, amount: number): number {
  const s = Math.floor(amount / 100), c = amount % 100;
  const ls = s ? inv.add('silver_coin', s) : 0;
  return inv.add('copper_coin', c + ls * 100);
}
