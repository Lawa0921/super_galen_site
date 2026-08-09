import { ITEMS, type ItemDef } from './items';
import { TWO_HANDED_WEAPONS } from './offhandShields.m52';

/**
 * M53：長柄武器不是刀劍／弓的數值升級，而是第三種交戰距離。
 * - 後排可隔著前線刺擊，不吃近戰 -2。
 * - 被迫進入前排時因槍桿難以完全展開，吃 reach 專屬 -1。
 * - 全部視為雙手武器，因此不能同時兌現 M52 盾牌守勢。
 */
export const M53_POLEARM_ITEMS: Record<string, ItemDef> = {
  'ashwood-war-spear': {
    id: 'ashwood-war-spear',
    name: '白蠟木戰矛',
    desc: '以韌性極佳的白蠟木作長桿，裝上窄葉鋼矛頭的商路護衛兵器。站在第二列時能越過前排肩線刺擊，真正被逼近身後反而難以完全施展。',
    value: 62,
    equip: {
      slot: 'weapon',
      move: {
        id: 'second-rank-thrust',
        name: '越肩突刺',
        kind: 'attack',
        target: 'enemy',
        hitStat: 'str',
        element: 'pierce',
        engagement: 'reach',
        armorPiercing: 1,
        damage: { dice: 1, sides: 8, bonusStat: 'str' },
        narration: '{actor}讓長矛越過前線肩側直刺{target}，造成 {amount} 點傷害！',
      },
    },
  },
  'saltsteel-pike': {
    id: 'saltsteel-pike',
    name: '鹽鋼長槍',
    desc: '鹽泉城軍匠以鹽鍛鋼打造的長槍，細長四稜槍尖專為找尋甲片與鎖環間隙。它能從第二列維持威脅，但重量與長度讓貼身混戰更吃技巧。',
    value: 128,
    equip: {
      slot: 'weapon',
      minLevel: 3,
      move: {
        id: 'saltsteel-line-thrust',
        name: '破列槍刺',
        kind: 'attack',
        target: 'enemy',
        hitStat: 'str',
        element: 'pierce',
        engagement: 'reach',
        armorPiercing: 2,
        damage: { dice: 1, sides: 10, bonusStat: 'str' },
        narration: '{actor}沉腰送出鹽鋼長槍，槍尖穿過陣線直取{target}，造成 {amount} 點傷害！',
      },
    },
  },
};

for (const [id, item] of Object.entries(M53_POLEARM_ITEMS)) {
  ITEMS[id] = item;
  TWO_HANDED_WEAPONS.add(id);
}
