// sites.ts — 地標發現物的獎勵與文案（純函式）：每件地標只能領一次（Discovery.landmarks 記住），內容由種子 + 位置決定。
//   每件都會給：經驗 + 一段發現文字；大多數另外給道具 / 銅幣，並附一條「線索」（把附近另一處沒去過的地點標在地圖上）。
import { Rng } from './rng';
import { T } from './tiles';
import type { ItemId } from './items';

export interface LandmarkReward {
  title: string;
  text: string;
  items: { item: ItemId; n: number }[];
  coins: number;
  xp: number;
  /** 附帶線索（標出附近一處沒去過的地點） */
  clue: boolean;
  /** 附帶的祝福 buff（菇之圖騰） */
  buff?: 'bless' | 'minesong';
}

const PACK_NOTES = [
  '行囊裡夾著一張字條：「往下走的人，記得留一根火把給回來的路。」',
  '一本泡過水的筆記：「第三天，我聽見牆壁後面有風聲——那裡一定還有路。」',
  '地圖的一角被撕掉了，剩下的部分畫著一個紅色的叉。',
  '「如果有人撿到這個背包：裡面的東西拿去用吧，我已經用不到了。」',
];
const CAIRN_NOTES = [
  '石堆是旅人留下的路標，最上面那顆石頭下壓著一張手繪的地圖。',
  '石堆旁插著褪色的布旗，旗桿上刻著：「此處安全，可歇腳。」',
  '有人在石堆裡藏了一小袋銅幣，還有一行字：「給迷路的人。」',
];
const STATUE_NOTES = [
  '石像的眼睛閃著青光。底座刻著：「守望者看著來時路，也看著未竟之地。」',
  '你拂去石像上的苔蘚，發現它的翅膀下藏著一個小石匣。',
];

/** 地標 tile + 所屬地點 → 獎勵（depth = 0 地表 .. 1 世界底部） */
export function landmarkReward(seed: string, tile: number, site: string, depth: number, idx: number): LandmarkReward {
  const rng = new Rng(`${seed}:landmark:${idx}`);
  const pick = <V>(a: readonly V[]): V => a[rng.int(0, a.length)];
  const xp = 40 + Math.round(depth * 80);
  switch (tile) {
    case T.ORE_CART: {
      const hall = site === 'dwarf_hall';
      const ore: ItemId = hall ? 'gold_ore' : depth > 0.35 ? 'silver_ore' : depth > 0.18 ? 'iron_ore' : 'copper_ore';
      return { title: hall ? '矮人的礦車' : '滿載的礦車', text: hall ? '矮人的礦車裝滿了剛開採的金礦。「拿去吧，」車斗上刻著，「算是見面禮。」' : '礦工丟下的礦車還裝得滿滿的——大概是走得太匆忙了。',
        items: [{ item: ore, n: rng.int(8, 15) }, ...(hall ? [{ item: 'magma_rock' as ItemId, n: 4 }] : [])], coins: 0, xp: xp + 20, clue: !hall };
    }
    case T.GUARDIAN_STATUE:
      return { title: '守望石像', text: pick(STATUE_NOTES), items: [{ item: 'gear_shard', n: rng.int(2, 5) }], coins: rng.int(40, 100), xp: xp + 30, clue: true };
    case T.GEODE:
      return { title: '巨晶之心', text: '你輕輕敲下巨晶外圍的碎片——裡面閃著星塵般的光。', items: [{ item: 'crystal', n: rng.int(4, 8) }, { item: 'stardust', n: 1 }], coins: 0, xp: xp + 40, clue: false };
    case T.SPORE_TOTEM:
      return { title: '菇之圖騰', text: '圖騰頂端的菇傘灑下藍色的孢子，你覺得身體暖洋洋的。（得到祝福）', items: [{ item: 'glow_mushroom', n: rng.int(4, 8) }, { item: 'spore', n: rng.int(2, 5) }], coins: 0, xp, clue: false, buff: 'bless' };
    case T.HONEY_JAR:
      return { title: '蜂王蜜罐', text: '蜜罐上的蠟封完好無缺。罐子裡的蜂蜜金黃得發亮。', items: [{ item: 'honey_bucket', n: 1 }, { item: 'crispy_honey', n: rng.int(3, 7) }], coins: 0, xp: xp + 20, clue: false };
    case T.CAIRN:
      return { title: '旅人石堆', text: pick(CAIRN_NOTES), items: rng.chance(2) ? [{ item: 'torch', n: 8 }] : [{ item: 'rope', n: 15 }], coins: rng.int(30, 90), xp, clue: true };
    case T.RELIC_PACK:
    default:
      return { title: '遺落的行囊', text: pick(PACK_NOTES), items: [pick([{ item: 'healing_potion' as ItemId, n: 2 }, { item: 'rope' as ItemId, n: 20 }, { item: 'recall_stone' as ItemId, n: 1 }]), { item: 'torch', n: 10 }],
        coins: rng.int(40, 140), xp: xp + 10, clue: true };
  }
}

/** 每種發現地點：外觀辨識特徵 + 裡面可以發現什麼（日誌 / 文件用，和世界生成一致） */
export const SITE_GUIDE: readonly { kind: string; zh: string; look: string; find: string }[] = [
  { kind: 'village', zh: '村落', look: '茅草屋頂 + 木骨灰泥牆的小屋、村子兩端 12 格高的紅金旗桿、廣場燈柱', find: '村民（雜貨商 / 鐵匠 / 醫者 / 嚮導 / 村長）、委託板' },
  { kind: 'dwarf_hall', zh: '矮人地廳', look: '鑿石磚拱頂大廳、符文石牆、熔爐火光、橫貫的礦車軌道', find: '矮人（礦石商 / 符文匠 / 長老）、深岩升階、滿載金礦的礦車' },
  { kind: 'cabin', zh: '小屋', look: '地底的木板小屋、火把、蜘蛛網', find: '箱子、遺落的行囊（暖光提燈）' },
  { kind: 'mineshaft', zh: '礦坑', look: '木樑框架、火把、整條礦車軌道', find: '滿載的礦車、（一半）箱子' },
  { kind: 'ruin', zh: '遺跡', look: '傾頹的石磚屋、青色發光的守望石像', find: '箱子、守望石像（碎晶 + 線索）' },
  { kind: 'sky_island', zh: '浮空島', look: '雲上的小島、垂下的繩梯、守望石像', find: '珍寶箱、守望石像' },
  { kind: 'cavern', zh: '大洞窟', look: '螢光菇 / 水晶 / 一般石廳', find: '巨晶之心 / 菇之圖騰 / 遺落的行囊' },
  { kind: 'crystal_cave', zh: '水晶洞', look: '滿牆發光水晶、巨晶之心的白光', find: '水晶、星塵' },
  { kind: 'mushroom_biome', zh: '蘑菇林', look: '藍色螢光菇林、發光的菇之圖騰', find: '螢光菇、孢子、祝福' },
  { kind: 'hive', zh: '蜂巢', look: '琥珀色蜂巢殼、蜂蜜、蜂王蜜罐', find: '一桶蜂蜜、酥蜜塊' },
  { kind: 'lake', zh: '湖 / 綠洲 / 冰湖', look: '水面、岸邊插著紅布旗的旅人石堆', find: '專屬魚種、石堆（銅幣 + 線索）' },
  { kind: 'chasm', zh: '裂谷 / 峽谷 / 天坑', look: '大地裂口、邊緣的旅人石堆、深處的發光裝飾', find: '石堆（線索）、最深裂谷底的珍寶' },
  { kind: 'underground_lake', zh: '地下湖', look: '黑色水面、岸邊的提燈光', find: '遺落的行囊、地底魚種' },
  { kind: 'secret_room', zh: '密室', look: '礦坑盡頭的裂紋石（一敲就碎）', find: '珍寶箱、陶罐' },
  { kind: 'dungeon', zh: '地下城', look: '三色地城磚、入口塔、旗幟與蠟燭', find: '鑰匙、金寶箱、古碑、首領' },
];
