import { describe, expect, it } from 'vitest';
import { startCombat, type EnemyUnit, type Move, type PartyMember } from '../combat';
import type { Rng } from '../rng';
import { tacticalTargetChoices, tacticalUnitSummary } from './tacticalReadability.m56';

const rng: Rng = {
  next: () => 0,
  roll: () => 10,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const melee: Move = {
  id: 'm56-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}。',
};
const reach: Move = {
  id: 'm56-reach', name: '長槍刺擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}刺向{target}。',
};
const ranged: Move = {
  id: 'm56-ranged', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}。',
};
const volley: Move = { ...ranged, id: 'm56-volley', name: '箭雨', area: true };
const sweep: Move = { ...melee, id: 'm56-sweep', name: '橫掃', area: true };
const spell: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 6, bonusStat: 'int' }, narration: '{actor}以火球轟擊{target}。',
};
const heal: Move = {
  id: 'm56-heal', name: '治療', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 6, bonusStat: 'cha' }, narration: '{actor}治療{target}。',
};

function member(id: string, row: 'front' | 'back', moves: Move[]): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 14, con: 14 }, maxHp: 30, hp: 30, defense: 12, moves,
  };
}

function enemy(id: string, row: 'front' | 'back'): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 12, dex: 12, int: 8, cha: 8, con: 12 }, maxHp: 20, hp: 20, defense: 12,
    moves: [melee], intents: [{ weight: 1, moveId: melee.id }],
  };
}

function bridgeState() {
  return startCombat(
    rng,
    [member('front-hero', 'front', [melee, ranged, reach]), member('rear-mage', 'back', [spell, heal])],
    [enemy('enemy-front', 'front'), enemy('enemy-back', 'back')],
    'broken-stone-bridge',
  );
}

describe('M56 tactical readability source of truth', () => {
  it('keeps a protected rear enemy visible but disabled for melee with the engine reason', () => {
    const state = bridgeState();
    const actor = state.party[0];
    const choices = tacticalTargetChoices(state, actor, melee);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({ id: 'enemy-front', allowed: true });
    expect(choices[1].id).toBe('enemy-back');
    expect(choices[1].allowed).toBe(false);
    expect(choices[1].label).toContain('後排');
    expect(choices[1].label).toContain('前線保護');
    expect(choices[1].reason).toMatch(/前線|後排|突破/);
  });

  it('treats reach like close-combat geometry instead of presenting it as ranged sniping', () => {
    const state = bridgeState();
    const choices = tacticalTargetChoices(state, state.party[0], reach);
    expect(choices.find((choice) => choice.id === 'enemy-back')?.allowed).toBe(false);
  });

  it('shows ranged rear targeting as legal and previews the exact bridge cover penalty', () => {
    const state = bridgeState();
    const rear = tacticalTargetChoices(state, state.party[0], ranged).find((choice) => choice.id === 'enemy-back')!;
    expect(rear.allowed).toBe(true);
    expect(rear.coverHitModifier).toBe(-1);
    expect(rear.label).toContain('掩體 -1');
  });

  it('lets true spellcraft target the rear without falsely showing a projectile-cover penalty', () => {
    const state = bridgeState();
    const mage = state.party[1];
    const rear = tacticalTargetChoices(state, mage, spell).find((choice) => choice.id === 'enemy-back')!;
    expect(rear.allowed).toBe(true);
    expect(rear.coverHitModifier).toBe(0);
    expect(rear.label).not.toContain('掩體');
  });

  it('labels physical close-combat AoE as frontline-only instead of claiming to hit every enemy', () => {
    const state = bridgeState();
    const [choice] = tacticalTargetChoices(state, state.party[0], sweep);
    expect(choice.label).toContain('敵方前排全體');
    expect(choice.targetCount).toBe(1);
  });

  it('labels ranged AoE with all legal targets and reports covered targets without hiding them', () => {
    const state = bridgeState();
    const [choice] = tacticalTargetChoices(state, state.party[0], volley);
    expect(choice.label).toContain('敵方全體（2）');
    expect(choice.label).toContain('1 名受掩體影響');
    expect(choice.targetCount).toBe(2);
  });

  it('keeps ally support choices alive-only and includes row plus HP instead of enemy geometry', () => {
    const state = bridgeState();
    state.party[0].hp = 12;
    const choices = tacticalTargetChoices(state, state.party[1], heal);
    expect(choices).toHaveLength(2);
    expect(choices[0].label).toContain('前排');
    expect(choices[0].label).toContain('HP 12/30');
    expect(choices.every((choice) => choice.allowed)).toBe(true);
  });

  it('summarizes frontline, protected rear, and terrain cover symmetrically for visible cards', () => {
    const state = bridgeState();
    expect(tacticalUnitSummary(state, 'enemy', state.enemies[0])).toBe('前排｜正面接戰');
    expect(tacticalUnitSummary(state, 'enemy', state.enemies[1])).toBe('後排｜受前線保護｜掩體 -1');
    expect(tacticalUnitSummary(state, 'party', state.party[1])).toBe('後排｜受前線保護｜掩體 -1');
  });

  it('does not invent cover or mutate combat state while producing labels', () => {
    const state = startCombat(rng, [member('hero', 'front', [ranged])], [enemy('foe', 'front')]);
    const before = JSON.stringify(state);
    const label = tacticalUnitSummary(state, 'enemy', state.enemies[0]);
    tacticalTargetChoices(state, state.party[0], ranged);
    expect(label).toBe('前排｜正面接戰');
    expect(JSON.stringify(state)).toBe(before);
  });
});
