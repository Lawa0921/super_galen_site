import type { StatBlock } from '../types';
import type { Move } from '../combat';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  value: number;
  /** 可裝備物品的效果設定（M5 裝備三欄系統）；未設定＝純消耗/交易品 */
  equip?: {
    slot: 'weapon' | 'armor' | 'trinket';
    /** 裝備所需等級門檻；未標＝無門檻 */
    minLevel?: number;
    /** 穿戴時屬性加值 */
    bonus?: Partial<StatBlock>;
    /** armor/trinket 常用：防禦加值 */
    defense?: number;
    /** 生命上限加值 */
    maxHp?: number;
    /** weapon 專用：取代職業的武器招（moves[0]，見 jobs.ts memberFromRecord） */
    move?: Move;
  };
}

/** M3 首批物品：12 種（藥草/繃帶/火把/哥布林耳環/礦石/蛛絲/boss 遺寶×2/雜項 4） */
export const ITEMS: Record<string, ItemDef> = {
  herb: {
    id: 'herb',
    name: '藥草',
    desc: '山野常見的藥草，搗碎外敷可止血鎮痛，旅人隨身必備。',
    value: 5,
  },
  bandage: {
    id: 'bandage',
    name: '繃帶',
    desc: '浸過藥水的紗布，是戰場急救的最後一道防線。',
    value: 8,
  },
  torch: {
    id: 'torch',
    name: '火把',
    desc: '浸油麻布纏繞的木棒，能照亮迷宮最深的暗處，也能嚇退夜行的野獸。',
    value: 6,
  },
  'goblin-earring': {
    id: 'goblin-earring',
    name: '哥布林耳環',
    desc: '哥布林戰士佩戴的骨製耳環，樣式粗獷，商人願意為這種戰利品出好價錢。',
    value: 15,
  },
  ore: {
    id: 'ore',
    name: '礦石',
    desc: '從礦坑深處挖出的鐵礦原石，未經冶煉，鍛造師搶著要。',
    value: 12,
  },
  'spider-silk': {
    id: 'spider-silk',
    name: '蛛絲',
    desc: '礦坑蜘蛛吐出的絲線，堅韌如鋼，紡織坊高價收購。',
    value: 18,
  },
  'overseer-ledger': {
    id: 'overseer-ledger',
    name: '監工的密帳',
    desc: '記錄著非法奴役礦工帳目的皮革帳本，城裡的商會會為它付出重金。',
    value: 60,
    // M5：終審移交轉裝備——精算帳目的直覺化為智力加持
    equip: { slot: 'trinket', bonus: { int: 1 } },
  },
  'den-idol': {
    id: 'den-idol',
    name: '巢穴圖騰',
    desc: '哥布林部族供奉的骨雕圖騰，紋路詭異，收藏家趨之若鶩。',
    value: 70,
    // M5：終審移交轉裝備——圖騰的庇護化為防禦與生命加持
    equip: { slot: 'trinket', defense: 1, maxHp: 3 },
  },
  'dried-rations': {
    id: 'dried-rations',
    name: '乾糧',
    desc: '壓縮乾燥的行軍糧，難吃但耐放，長途跋涉的必備品。',
    value: 4,
  },
  'silver-locket': {
    id: 'silver-locket',
    name: '銀懷錶',
    desc: '刻著陌生家徽的銀製懷錶，錶蓋內側還留著一撮髮絲，不知是誰的遺物。',
    value: 25,
  },
  'tattered-map': {
    id: 'tattered-map',
    name: '破損地圖',
    desc: '邊緣燒焦的羊皮地圖，殘存的墨跡似乎標記著某處地標。',
    value: 10,
  },
  'spice-pouch': {
    id: 'spice-pouch',
    name: '香料包',
    desc: '異域香料混合的小布包，遠方城鎮的廚師願意高價收購。',
    value: 14,
  },
};
