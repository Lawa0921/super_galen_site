import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from './enemies';
import { LOCATIONS } from './locations';

const ELITE_ENCOUNTERS = [
  'enc_elite_salt_convoy',
  'enc_elite_frontier_raiders',
  'enc_elite_frontier_horde',
] as const;

describe('M20 高階契約難度誠信', () => {
  it('聲望 70 契約只引用專屬精英遭遇，不再混入早期兩人遭遇', () => {
    for (const id of ['guild-salt-convoy', 'free-trader-frontier'] as const) {
      const loc = LOCATIONS[id];
      expect(loc.minReputation).toBe(70);
      expect(loc.encounterTable.length).toBeGreaterThan(0);
      for (const entry of loc.encounterTable) {
        expect(entry.encounterId).toMatch(/^enc_elite_/);
        expect(ELITE_ENCOUNTERS).toContain(entry.encounterId);
      }
    }
  });

  it.each(ELITE_ENCOUNTERS)('%s 每場固定三名精英，且 id 唯一', (encounterId) => {
    const units = ENCOUNTERS[encounterId]();
    expect(units).toHaveLength(3);
    expect(new Set(units.map((unit) => unit.id)).size).toBe(3);
    for (const unit of units) {
      expect(unit.name.startsWith('精英')).toBe(true);
      expect(unit.maxHp).toBeGreaterThanOrEqual(14);
      expect(unit.defense).toBeGreaterThanOrEqual(13);
      expect(unit.maxPoise).toBeGreaterThanOrEqual(3);
    }
  });

  it('精英遭遇每次建立全新可變物件，不會因上一場受傷或中狀態污染下一場', () => {
    const first = ENCOUNTERS.enc_elite_salt_convoy();
    const second = ENCOUNTERS.enc_elite_salt_convoy();

    first[0].hp = 1;
    first[0].statuses = [{ kind: 'poison', remaining: 2, potency: 3 }];
    first[0].moves[0].name = '被污染的招式';

    expect(second[0].hp).toBe(second[0].maxHp);
    expect(second[0].statuses).toEqual([]);
    expect(second[0].moves[0].name).not.toBe('被污染的招式');
  });

  it('精英契約不偷渡地下城 Boss 規則或 Boss 級一次性掉落', () => {
    for (const encounterId of ELITE_ENCOUNTERS) {
      for (const unit of ENCOUNTERS[encounterId]()) {
        expect(unit.enrage).toBeUndefined();
        expect(unit.loot?.itemChance ?? 0).toBeLessThan(0.8);
        expect(unit.maxHp).toBeLessThan(38);
      }
    }
  });

  it('契約名稱宣告的推薦屬性確實覆蓋專屬精英池', () => {
    const saltWeaknesses = new Set(
      ENCOUNTERS.enc_elite_salt_convoy().flatMap((unit) => unit.weaknesses ?? [])
    );
    expect(saltWeaknesses.has('holy')).toBe(true);
    expect(saltWeaknesses.has('blunt')).toBe(true);

    const frontierWeaknesses = new Set(
      [
        ...ENCOUNTERS.enc_elite_frontier_raiders(),
        ...ENCOUNTERS.enc_elite_frontier_horde(),
      ].flatMap((unit) => unit.weaknesses ?? [])
    );
    expect(frontierWeaknesses.has('slash')).toBe(true);
    expect(frontierWeaknesses.has('pierce')).toBe(true);
  });
});
