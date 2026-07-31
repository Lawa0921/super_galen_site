import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from './enemies';
import { LOCATIONS, locationIntel } from './locations';

const salt = LOCATIONS['guild-salt-convoy'];
const frontier = LOCATIONS['free-trader-frontier'];

describe('M21 契約情報', () => {
  it('鹽晶護運標籤與實際三人精英敵情一致', () => {
    const intel = locationIntel(salt);
    expect(salt.name).toContain('→ 鹽泉城');
    expect(salt.name).toContain('精英×3');
    expect(intel.enemyCountMin).toBe(3);
    expect(intel.enemyCountMax).toBe(3);
    expect(intel.weaknesses).toEqual(expect.arrayContaining(['holy', 'blunt']));
    expect(intel.resists).toEqual(expect.arrayContaining(['slash', 'pierce']));
    expect(intel.averageHp).toBeGreaterThan(18);
    expect(intel.averageDefense).toBeGreaterThanOrEqual(14);
    expect(intel.averagePoise).toBeGreaterThanOrEqual(3);
  });

  it('邊境環線標籤涵蓋所有隨機敵群的規模與核心弱點', () => {
    const intel = locationIntel(frontier);
    expect(frontier.name).toContain('→ 林邊聚落');
    expect(frontier.name).toContain('精英×3');
    expect(intel.enemyCountMin).toBe(3);
    expect(intel.enemyCountMax).toBe(3);
    expect(intel.weaknesses).toEqual(expect.arrayContaining(['slash', 'pierce']));
    expect(intel.averageHp).toBeGreaterThan(14);
  });

  it('情報掃描不會把受傷或狀態污染到下一場遭遇', () => {
    const first = ENCOUNTERS.enc_elite_salt_convoy();
    first[0].hp = 1;
    first[0].statuses = [{ kind: 'poison', remaining: 3, potency: 9 }];

    locationIntel(salt);
    const second = ENCOUNTERS.enc_elite_salt_convoy();
    expect(second[0].hp).toBe(second[0].maxHp);
    expect(second[0].statuses).toEqual([]);
    expect(second[0]).not.toBe(first[0]);
  });

  it('不存在的遭遇引用會明確失敗，不產生看似正常的空情報', () => {
    expect(() => locationIntel({
      id: 'broken-intel',
      name: '毀損情報',
      kind: 'route',
      legs: 1,
      encounterTable: [{ weight: 1, encounterId: 'enc_missing' }],
    })).toThrow('enc_missing');
  });
});
