import type { LocationDef } from '../expedition';
import { registerLocations } from '../expedition';
import type { SaveData } from '../save';

/** M3 首批地點：貿易路線 2 條、迷宮 1 座、隱藏迷宮 1 座（旗標鏈 discover） */
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
};

/** hidden 且未設 `discovered:<id>` 旗標的地點，不列入委託板 */
export function visibleLocations(save: SaveData): LocationDef[] {
  return Object.values(LOCATIONS).filter((loc) => {
    if (!loc.hidden) return true;
    return save.flags[`discovered:${loc.id}`] === true;
  });
}

registerLocations(LOCATIONS);
