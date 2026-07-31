import type { DamageElement, EnemyUnit } from '../combat';
import type { LocationDef } from '../expedition';
import { registerLocations } from '../expedition';
import type { SaveData } from '../save';
import { ENCOUNTERS } from './enemies';

/**
 * M3 首批地點：貿易路線 2 條、迷宮 1 座、隱藏迷宮 1 座（旗標鏈 discover）。
 * M5 擴充：第三路線「霧嶺古道」（reputation≥40）、高階迷宮「鹽晶洞窟」（reputation≥60）、
 * 隱藏路線「古戰場」（旗標鏈 discover，見 data/events.ts ev_faded_banner→ev_mercenary_ruins）。
 * M19 擴充：兩張聲望 70 的高階戰術契約，讓戰技配置與押貨目的形成真正取捨。
 * M20 修正：高階契約改用三人精英編成，不再重用早期兩人遭遇造成難度倒退。
 * M21 情報：由實際遭遇工廠推導敵群規模、弱點與抗性，避免委託文字和戰鬥資料漂移。
 */

/**
 * 將既有敵人提升為高階契約精英：保留原招式、弱點與美術，只提高耐久、護勢、
 * 防禦與掉落。複製所有可變欄位，避免精英遭遇污染一般路線的工廠產物。
 */
function elite(unit: EnemyUnit, suffix: string): EnemyUnit {
  const hpBonus = Math.max(5, Math.ceil(unit.maxHp * 0.35));
  return {
    ...unit,
    id: `${unit.id}-${suffix}`,
    name: `精英${unit.name}`,
    stats: { ...unit.stats },
    maxHp: unit.maxHp + hpBonus,
    hp: unit.maxHp + hpBonus,
    defense: unit.defense + 1,
    moves: unit.moves.map((move) => ({ ...move })),
    intents: unit.intents.map((intent) => ({ ...intent })),
    weaknesses: unit.weaknesses ? [...unit.weaknesses] : undefined,
    resists: unit.resists ? [...unit.resists] : undefined,
    maxPoise: Math.max(3, (unit.maxPoise ?? 2) + 1),
    poise: undefined,
    statuses: [],
    loot: unit.loot
      ? {
          ...unit.loot,
          gold: [Math.ceil(unit.loot.gold[0] * 1.5), Math.ceil(unit.loot.gold[1] * 1.5)],
        }
      : undefined,
  };
}

function encounterUnits(id: string): EnemyUnit[] {
  const factory = ENCOUNTERS[id];
  if (!factory) throw new Error(`高階契約引用不存在的遭遇「${id}」`);
  return factory();
}

/** 鹽晶護運：亡魂＋傀儡＋山賊，聖／打可覆蓋主力威脅。 */
ENCOUNTERS.enc_elite_salt_convoy = () => {
  const salt = encounterUnits('enc_salt_crystals');
  const ridge = encounterUnits('enc_ridge_bandits');
  return [elite(salt[0], 'convoy'), elite(salt[1], 'convoy'), elite(ridge[0], 'convoy')];
};

/** 邊境環線：山賊＋亡靈＋哥布林，斬／刺可處理三種不同位置與防禦型態。 */
ENCOUNTERS.enc_elite_frontier_raiders = () => {
  const ridge = encounterUnits('enc_ridge_bandits');
  const ruins = encounterUnits('enc_ruins_undead');
  return [elite(ridge[0], 'frontier'), elite(ridge[1], 'frontier'), elite(ruins[1], 'frontier')];
};

ENCOUNTERS.enc_elite_frontier_horde = () => {
  const ruins = encounterUnits('enc_ruins_undead');
  const goblins = encounterUnits('enc_goblin_raiders');
  return [elite(ruins[1], 'horde'), elite(goblins[0], 'horde'), elite(goblins[1], 'horde')];
};

export interface LocationIntel {
  enemyCountMin: number;
  enemyCountMax: number;
  weaknesses: DamageElement[];
  resists: DamageElement[];
  averageHp: number;
  averageDefense: number;
  averagePoise: number;
}

/**
 * 從地點的所有隨機遭遇推導玩家出發前可用的可信情報。
 * 每次都呼叫全新的遭遇工廠，不讀寫註冊表內的可變敵人狀態。
 */
export function locationIntel(location: LocationDef): LocationIntel {
  const encounters = location.encounterTable.map((entry) => {
    const factory = ENCOUNTERS[entry.encounterId];
    if (!factory) throw new Error(`locationIntel: 遭遇「${entry.encounterId}」不存在`);
    return factory();
  });
  const units = encounters.flat();
  const weaknesses = new Set<DamageElement>();
  const resists = new Set<DamageElement>();
  for (const unit of units) {
    for (const element of unit.weaknesses ?? []) weaknesses.add(element);
    for (const element of unit.resists ?? []) resists.add(element);
  }
  const average = (values: number[]): number =>
    values.length === 0 ? 0 : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  return {
    enemyCountMin: encounters.length === 0 ? 0 : Math.min(...encounters.map((units) => units.length)),
    enemyCountMax: encounters.length === 0 ? 0 : Math.max(...encounters.map((units) => units.length)),
    weaknesses: [...weaknesses].sort(),
    resists: [...resists].sort(),
    averageHp: average(units.map((unit) => unit.maxHp)),
    averageDefense: average(units.map((unit) => unit.defense)),
    averagePoise: average(units.map((unit) => unit.maxPoise ?? 0)),
  };
}

export const LOCATIONS: Record<string, LocationDef> = {
  'endless-road': {
    id: 'endless-road',
    name: '無盡遠路',
    kind: 'route',
    legs: 4,
    endless: true,
    minReputation: 40,
    destinationTownId: 'riverbend-town',
    encounterTable: [
      { weight: 35, encounterId: 'enc_wolf_pair' },
      { weight: 30, encounterId: 'enc_bandit_raid' },
      { weight: 20, encounterId: 'enc_goblin_raiders' },
      { weight: 15, encounterId: 'enc_ridge_bandits' },
    ],
  },
  'riverside-road': {
    id: 'riverside-road',
    name: '臨水道',
    kind: 'route',
    legs: 4,
    encounterTable: [
      { weight: 60, encounterId: 'enc_wolf_pair' },
      { weight: 40, encounterId: 'enc_bandit_raid' },
    ],
    destinationTownId: 'riverbend-town',
  },
  'blackwood-trail': {
    id: 'blackwood-trail',
    name: '黑森林徑',
    kind: 'route',
    legs: 5,
    encounterTable: [
      { weight: 50, encounterId: 'enc_wolf_pair' },
      { weight: 50, encounterId: 'enc_goblin_raiders' },
    ],
    destinationTownId: 'woodside-settlement',
  },
  'abandoned-mine': {
    id: 'abandoned-mine',
    name: '廢棄礦坑',
    kind: 'dungeon',
    floors: 4,
    roomsPerFloor: [2, 3],
    depthHpBonus: 2,
    bossEncounterId: 'enc_mine_overseer',
    encounterTable: [
      { weight: 70, encounterId: 'enc_mine_spiders' },
      { weight: 30, encounterId: 'enc_bandit_raid' },
    ],
  },
  'goblin-den': {
    id: 'goblin-den',
    name: '哥布林巢穴',
    kind: 'dungeon',
    hidden: true,
    floors: 3,
    roomsPerFloor: [2, 3],
    depthHpBonus: 3,
    bossEncounterId: 'enc_goblin_den_chief',
    encounterTable: [{ weight: 100, encounterId: 'enc_goblin_raiders' }],
  },
  'misty-ridge-trail': {
    id: 'misty-ridge-trail',
    name: '霧嶺古道',
    kind: 'route',
    legs: 6,
    minReputation: 40,
    encounterTable: [
      { weight: 60, encounterId: 'enc_ridge_bandits' },
      { weight: 40, encounterId: 'enc_wolf_pair' },
    ],
    destinationTownId: 'salt-spring-city',
  },
  'salt-crystal-cavern': {
    id: 'salt-crystal-cavern',
    name: '鹽晶洞窟',
    kind: 'dungeon',
    floors: 5,
    roomsPerFloor: [2, 3],
    depthHpBonus: 3,
    minReputation: 60,
    bossEncounterId: 'enc_salt_cavern_boss',
    encounterTable: [{ weight: 100, encounterId: 'enc_salt_crystals' }],
  },
  'battlefield-ruins': {
    id: 'battlefield-ruins',
    name: '古戰場',
    kind: 'route',
    hidden: true,
    legs: 3,
    encounterTable: [{ weight: 100, encounterId: 'enc_ruins_undead' }],
  },
  'guild-salt-convoy': {
    id: 'guild-salt-convoy',
    name: '商會特許．鹽晶護運 → 鹽泉城〔精英×3｜弱聖打｜抗斬刺〕',
    kind: 'route',
    legs: 7,
    minReputation: 70,
    destinationTownId: 'salt-spring-city',
    encounterTable: [{ weight: 100, encounterId: 'enc_elite_salt_convoy' }],
  },
  'free-trader-frontier': {
    id: 'free-trader-frontier',
    name: '自由商旅．邊境環線 → 林邊聚落〔精英×3｜弱斬刺〕',
    kind: 'route',
    legs: 8,
    minReputation: 70,
    destinationTownId: 'woodside-settlement',
    encounterTable: [
      { weight: 55, encounterId: 'enc_elite_frontier_raiders' },
      { weight: 45, encounterId: 'enc_elite_frontier_horde' },
    ],
  },
};

export function visibleLocations(save: SaveData): LocationDef[] {
  return Object.values(LOCATIONS).filter((loc) => {
    if (loc.hidden && save.flags[`discovered:${loc.id}`] !== true) return false;
    if (loc.minReputation !== undefined && save.reputation < loc.minReputation) return false;
    return true;
  });
}

registerLocations(LOCATIONS);
