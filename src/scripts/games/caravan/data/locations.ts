import type { Element as DamageElement, EnemyUnit } from '../combat';
import type { LocationDef } from '../expedition';
import { registerLocations } from '../expedition';
import type { SaveData } from '../save';
import { ENCOUNTERS } from './enemies';

/** 將既有敵人提升為高階契約精英，並複製所有可變欄位。 */
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
      ? { ...unit.loot, gold: [Math.ceil(unit.loot.gold[0] * 1.5), Math.ceil(unit.loot.gold[1] * 1.5)] }
      : undefined,
  };
}

function encounterUnits(id: string): EnemyUnit[] {
  const factory = ENCOUNTERS[id];
  if (!factory) throw new Error(`高階契約引用不存在的遭遇「${id}」`);
  return factory();
}

ENCOUNTERS.enc_elite_salt_convoy = () => {
  const salt = encounterUnits('enc_salt_crystals');
  const ridge = encounterUnits('enc_ridge_bandits');
  return [elite(salt[0], 'convoy'), elite(salt[1], 'convoy'), elite(ridge[0], 'convoy')];
};

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

/** 從地點的實際遭遇工廠推導可信的出發前情報。 */
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
    enemyCountMin: encounters.length === 0 ? 0 : Math.min(...encounters.map((group) => group.length)),
    enemyCountMax: encounters.length === 0 ? 0 : Math.max(...encounters.map((group) => group.length)),
    weaknesses: [...weaknesses].sort(),
    resists: [...resists].sort(),
    averageHp: average(units.map((unit) => unit.maxHp)),
    averageDefense: average(units.map((unit) => unit.defense)),
    averagePoise: average(units.map((unit) => unit.maxPoise ?? 0)),
  };
}

export const LOCATIONS: Record<string, LocationDef> = {
  'endless-road': {
    id: 'endless-road', name: '無盡遠路', kind: 'route', legs: 4, endless: true,
    minReputation: 40, destinationTownId: 'riverbend-town',
    encounterTable: [
      { weight: 35, encounterId: 'enc_wolf_pair' },
      { weight: 30, encounterId: 'enc_bandit_raid' },
      { weight: 20, encounterId: 'enc_goblin_raiders' },
      { weight: 15, encounterId: 'enc_ridge_bandits' },
    ],
  },
  'riverside-road': {
    id: 'riverside-road', name: '臨水道', kind: 'route', legs: 4,
    encounterTable: [
      { weight: 60, encounterId: 'enc_wolf_pair' },
      { weight: 40, encounterId: 'enc_bandit_raid' },
    ],
    destinationTownId: 'riverbend-town',
  },
  'blackwood-trail': {
    id: 'blackwood-trail', name: '黑森林徑', kind: 'route', legs: 5,
    encounterTable: [
      { weight: 50, encounterId: 'enc_wolf_pair' },
      { weight: 50, encounterId: 'enc_goblin_raiders' },
    ],
    destinationTownId: 'woodside-settlement',
  },
  'abandoned-mine': {
    id: 'abandoned-mine', name: '廢棄礦坑', kind: 'dungeon', floors: 4,
    roomsPerFloor: [2, 3], depthHpBonus: 2, bossEncounterId: 'enc_mine_overseer',
    encounterTable: [
      { weight: 70, encounterId: 'enc_mine_spiders' },
      { weight: 30, encounterId: 'enc_bandit_raid' },
    ],
  },
  'goblin-den': {
    id: 'goblin-den', name: '哥布林巢穴', kind: 'dungeon', hidden: true, floors: 3,
    roomsPerFloor: [2, 3], depthHpBonus: 3, bossEncounterId: 'enc_goblin_den_chief',
    encounterTable: [{ weight: 100, encounterId: 'enc_goblin_raiders' }],
  },
  'misty-ridge-trail': {
    id: 'misty-ridge-trail', name: '霧嶺古道', kind: 'route', legs: 6, minReputation: 40,
    encounterTable: [
      { weight: 60, encounterId: 'enc_ridge_bandits' },
      { weight: 40, encounterId: 'enc_wolf_pair' },
    ],
    destinationTownId: 'salt-spring-city',
  },
  'salt-crystal-cavern': {
    id: 'salt-crystal-cavern', name: '鹽晶洞窟', kind: 'dungeon', floors: 5,
    roomsPerFloor: [2, 3], depthHpBonus: 3, minReputation: 60,
    bossEncounterId: 'enc_salt_cavern_boss',
    encounterTable: [{ weight: 100, encounterId: 'enc_salt_crystals' }],
  },
  'battlefield-ruins': {
    id: 'battlefield-ruins', name: '古戰場', kind: 'route', hidden: true, legs: 3,
    encounterTable: [{ weight: 100, encounterId: 'enc_ruins_undead' }],
  },
  'guild-salt-convoy': {
    id: 'guild-salt-convoy',
    name: '商會特許．鹽晶護運 → 鹽泉城〔精英×3｜弱聖打｜抗斬刺〕',
    kind: 'route', legs: 7, minReputation: 70, destinationTownId: 'salt-spring-city',
    encounterTable: [{ weight: 100, encounterId: 'enc_elite_salt_convoy' }],
  },
  'free-trader-frontier': {
    id: 'free-trader-frontier',
    name: '自由商旅．邊境環線 → 林邊聚落〔精英×3｜弱斬刺〕',
    kind: 'route', legs: 8, minReputation: 70, destinationTownId: 'woodside-settlement',
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
