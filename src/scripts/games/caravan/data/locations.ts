import type { LocationDef } from '../expedition';
import { registerLocations } from '../expedition';
import type { SaveData } from '../save';

/**
 * M3 首批地點：貿易路線 2 條、迷宮 1 座、隱藏迷宮 1 座（旗標鏈 discover）。
 * M5 擴充：第三路線「霧嶺古道」（reputation≥40）、高階迷宮「鹽晶洞窟」（reputation≥60）、
 * 隱藏路線「古戰場」（旗標鏈 discover，見 data/events.ts ev_faded_banner→ev_mercenary_ruins）。
 */
export const LOCATIONS: Record<string, LocationDef> = {
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

  // ---- M5 內容擴充：第三路線／高階迷宮／隱藏路線 -----------------------
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
};

/**
 * 委託板可見地點：hidden 且未設 `discovered:<id>` 旗標的地點不列入；
 * minReputation 設定時 save.reputation 未達門檻也不列入（M5，兩條件各自獨立判斷）。
 */
export function visibleLocations(save: SaveData): LocationDef[] {
  return Object.values(LOCATIONS).filter((loc) => {
    if (loc.hidden && save.flags[`discovered:${loc.id}`] !== true) return false;
    if (loc.minReputation !== undefined && save.reputation < loc.minReputation) return false;
    return true;
  });
}

registerLocations(LOCATIONS);
