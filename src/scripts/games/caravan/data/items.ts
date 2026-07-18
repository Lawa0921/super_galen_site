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

/**
 * M3 首批物品：12 種（藥草/繃帶/火把/哥布林耳環/礦石/蛛絲/boss 遺寶×2/雜項 4）。
 * M5 擴充 +11：資源品「鹽」1、裝備 10（武器 4／護甲 4／飾品新 2，另飾品既有 2 個
 * boss 遺寶已於 Task 1 轉裝備）——ITEMS 總數 23。
 */
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

  // -------------------------------------------------------------------
  // M5 內容擴充：裝備 10 種（武器 4／護甲 4／飾品 2 新，另 2 舊遺寶已於
  // Task 1 轉裝備）＋ 資源品 1（鹽，鹽晶洞窟／鹽泉城經濟循環）
  // -------------------------------------------------------------------
  salt: {
    id: 'salt',
    name: '鹽',
    desc: '鹽晶洞窟深處結晶而成的粗鹽，顆粒剔透泛著微光，鹽泉城的商賈與藥師都對這種天然鹽晶趨之若鶩。',
    value: 16,
  },

  // ---- 武器 4（各職業 Lv2 升級武器，帶新招） ---------------------------
  'salt-crystal-blade': {
    id: 'salt-crystal-blade',
    name: '鹽晶劍',
    desc: '以鹽晶洞窟深處的礦脈淬鍊而成，劍鋒帶著粗糲的結晶紋理，劈砍時偶有鹽粒迸濺，卻絲毫不損其鋒利。',
    value: 90,
    equip: {
      slot: 'weapon',
      minLevel: 2,
      bonus: { str: 1 },
      move: {
        id: 'crystal-shatter-slash', name: '結晶爆斬', kind: 'attack', target: 'enemy', hitStat: 'str',
        damage: { dice: 1, sides: 12, bonusStat: 'str' },
        narration: '{actor}揮劍劈開凝結的鹽晶，碎屑迸射刺向{target}，造成 {amount} 點傷害！',
      },
    },
  },
  'ridge-mist-bow': {
    id: 'ridge-mist-bow',
    name: '山嵐反曲弓',
    desc: '取材自霧嶺古道的堅韌山木，弓身纏著防潮的皮條，即使在最潮濕的迷霧裡也能穩定發箭。',
    value: 85,
    equip: {
      slot: 'weapon',
      minLevel: 2,
      bonus: { dex: 1 },
      move: {
        id: 'wind-splitting-volley', name: '破風連矢', kind: 'attack', target: 'enemy', hitStat: 'dex',
        damage: { dice: 2, sides: 6, bonusStat: 'dex' },
        narration: '{actor}連珠箭雨破風而出，狠狠釘向{target}，造成 {amount} 點傷害！',
      },
    },
  },
  'ghostflame-staff': {
    id: 'ghostflame-staff',
    name: '亡靈焚魂杖',
    desc: '古戰場亡靈遺留之物，杖頭殘留著幽綠鬼火，握在手中隱隱傳來低語，彷彿仍未忘記戰場上的執念。',
    value: 95,
    equip: {
      slot: 'weapon',
      minLevel: 2,
      bonus: { int: 1 },
      move: {
        id: 'soulfire-burst', name: '焚魂爆焰', kind: 'attack', target: 'enemy', hitStat: 'int',
        damage: { dice: 2, sides: 8, bonusStat: 'int' },
        narration: '{actor}引動杖中怨靈之焰，狂暴地灼燒{target}，造成 {amount} 點傷害！',
      },
    },
  },
  'brine-blessed-mace': {
    id: 'brine-blessed-mace',
    name: '鹽泉聖錘',
    desc: '鹽泉城祭壇以鹵水加持過的權杖，錘擊落下時會揚起細白鹽霧，據說能滌淨邪祟。',
    value: 88,
    equip: {
      slot: 'weapon',
      minLevel: 2,
      bonus: { cha: 1 },
      move: {
        id: 'brine-light-smite', name: '鹽光聖擊', kind: 'attack', target: 'enemy', hitStat: 'cha',
        damage: { dice: 1, sides: 10, bonusStat: 'cha' },
        narration: '{actor}以聖錘重擊，鹹澀的聖光爆裂在{target}身上，造成 {amount} 點傷害！',
      },
    },
  },

  // ---- 護甲 4（皮／鎖／法袍／聖袍） -------------------------------------
  'ridgeleather-vest': {
    id: 'ridgeleather-vest',
    name: '山嵐輕皮甲',
    desc: '霧嶺獵人慣穿的輕便皮甲，內襯防潮油布，便於在起霧的山道間長途跋涉。',
    value: 45,
    equip: { slot: 'armor', defense: 2, bonus: { dex: 1 } },
  },
  'saltforged-mail': {
    id: 'saltforged-mail',
    name: '鹽鍛鎖甲',
    desc: '以鹽泉城特有的鍛法打造，鎖環表面覆著一層防鏽的鹽膜，即使常年泡在鹵水裡也不易腐朽。',
    value: 60,
    equip: { slot: 'armor', defense: 3, maxHp: 2 },
  },
  'ashveil-robe': {
    id: 'ashveil-robe',
    name: '灰燼法袍',
    desc: '取自古戰場焚後餘燼染製的法袍，灰黑色澤中隱約可見未散的硝煙氣息，據說能助施法者凝神。',
    value: 50,
    equip: { slot: 'armor', defense: 1, bonus: { int: 1 } },
  },
  'brinewarded-vestment': {
    id: 'brinewarded-vestment',
    name: '鹽泉聖袍',
    desc: '鹽泉城神殿代代相傳的聖袍，浸過泉水加持的布料能安撫穿者心神，抵禦邪異侵擾。',
    value: 65,
    equip: { slot: 'armor', defense: 2, maxHp: 4 },
  },

  // ---- 飾品 2 新（既有 overseer-ledger/den-idol 見上方，共 4） -----------
  'wanderers-compass': {
    id: 'wanderers-compass',
    name: '游商的羅盤',
    desc: '那名神秘商人臨別時塞進你手裡的羅盤，指針從不指向北方，卻總能在迷途時引你找到最想去的地方。',
    value: 80,
    equip: { slot: 'trinket', bonus: { cha: 1, dex: 1 } },
  },
  'salt-crystal-core': {
    id: 'salt-crystal-core',
    name: '鹽晶核心',
    desc: '鹽晶洞主體內凝結多年的核心，觸手冰涼，隱隱透出脈動般的微光，據說蘊藏著洞窟本身的意志。',
    value: 75,
    equip: { slot: 'trinket', bonus: { con: 1 }, defense: 1 },
  },
};
