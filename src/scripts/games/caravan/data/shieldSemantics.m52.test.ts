import { describe, expect, it } from 'vitest';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { setOffhandId } from './offhandShields.m52';

function bulwark(): CompanionRecord {
  return {
    id: 'bulwark-test',
    name: '守衛',
    job: 'swordsman',
    level: 5,
    xp: 750,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 16 },
    maxHp: 30,
    injuredForTrips: 0,
    specialization: 'bulwark',
    equipment: { weapon: 'salt-crystal-blade', armor: null, trinket: null },
  };
}

function bulwarkMove(record: CompanionRecord) {
  const member = memberFromRecord(record);
  return member.moves.find((move) => move.id === 'shield-bash');
}

describe('M52 bulwark shield semantics', () => {
  it('keeps the compatibility id but does not invent a shield when none is ready', () => {
    const record = bulwark();
    const move = bulwarkMove(record)!;
    expect(move.id).toBe('shield-bash');
    expect(move.name).toBe('壁壘猛擊');
    expect(move.narration).not.toContain('盾');
    expect(move.applyStatus?.kind).toBe('stun');
  });

  it('surfaces the shield-specific name and narration only with a ready shield', () => {
    const record = bulwark();
    setOffhandId(record, 'oak-buckler');
    const move = bulwarkMove(record)!;
    expect(move.id).toBe('shield-bash');
    expect(move.name).toBe('盾牆猛擊');
    expect(move.narration).toContain('盾');
    expect(move.applyStatus?.kind).toBe('stun');
  });

  it('falls back to equipment-neutral semantics when a two-handed weapon stows the shield', () => {
    const record = bulwark();
    record.equipment.weapon = 'swordsaint-bokken';
    setOffhandId(record, 'salt-rim-kite-shield');
    const move = bulwarkMove(record)!;
    expect(move.id).toBe('shield-bash');
    expect(move.name).toBe('壁壘猛擊');
    expect(move.narration).not.toContain('盾');
  });
});
