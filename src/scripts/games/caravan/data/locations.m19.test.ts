import { describe, expect, it } from 'vitest';
import { newGame } from '../save';
import { LOCATIONS, visibleLocations } from './locations';
import { ENCOUNTERS } from './enemies';
import { TOWNS } from './towns';

const CONTRACT_IDS = ['guild-salt-convoy', 'free-trader-frontier'] as const;

describe('M19 高階戰術契約', () => {
  it('聲望 70 前不可見，達標後兩張契約同時出現在委託板', () => {
    const save = newGame(1000);
    save.reputation = 69;
    expect(visibleLocations(save).map((loc) => loc.id)).not.toEqual(
      expect.arrayContaining(CONTRACT_IDS)
    );

    save.reputation = 70;
    expect(visibleLocations(save).map((loc) => loc.id)).toEqual(
      expect.arrayContaining(CONTRACT_IDS)
    );
  });

  it('兩張契約都是可完成的公開商路，且有有效目的地與遭遇引用', () => {
    for (const id of CONTRACT_IDS) {
      const loc = LOCATIONS[id];
      expect(loc.kind).toBe('route');
      expect(loc.hidden).not.toBe(true);
      expect(loc.legs).toBeGreaterThanOrEqual(7);
      expect(loc.destinationTownId).toBeTruthy();
      expect(TOWNS[loc.destinationTownId!]).toBeDefined();
      expect(loc.encounterTable.length).toBeGreaterThan(0);
      for (const entry of loc.encounterTable) {
        expect(entry.weight).toBeGreaterThan(0);
        expect(ENCOUNTERS[entry.encounterId]).toBeDefined();
      }
    }
  });

  it('鹽晶護運確實要求聖與打擊覆蓋，不是只有名稱寫推薦', () => {
    const loc = LOCATIONS['guild-salt-convoy'];
    const weaknesses = new Set(
      loc.encounterTable.flatMap((entry) =>
        ENCOUNTERS[entry.encounterId]().flatMap((enemy) => enemy.weaknesses ?? [])
      )
    );
    expect(weaknesses).toEqual(expect.objectContaining(new Set(['holy', 'blunt'])));
  });

  it('自由商旅環線與鹽晶護運的敵群及目的地不同，避免兩個按鈕實際上是同一關', () => {
    const guild = LOCATIONS['guild-salt-convoy'];
    const free = LOCATIONS['free-trader-frontier'];
    const guildEncounters = new Set(guild.encounterTable.map((entry) => entry.encounterId));
    const freeEncounters = new Set(free.encounterTable.map((entry) => entry.encounterId));

    expect(free.destinationTownId).not.toBe(guild.destinationTownId);
    expect(free.legs).not.toBe(guild.legs);
    expect([...freeEncounters]).not.toEqual([...guildEncounters]);
    expect(freeEncounters.has('enc_ruins_undead')).toBe(true);
    expect(guildEncounters.has('enc_salt_crystals')).toBe(true);
  });
});
