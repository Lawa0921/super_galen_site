import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  legalEnemyTargetsForMove,
  partyAct,
  partyTargetAvailability,
  startCombat,
  targetCoverForecast,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { collapseEnemyFrontLine } from './enemyFormation.m54';
import { createConvoyDefenseEncounter } from './convoyDefense.m46';
import { tacticalTargetChoices, tacticalUnitSummary } from './tacticalReadability.m56';

const rng: Rng = {
  next: () => 0,
  roll: () => 4,
  d20: () => 20,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const sword: Move = {
  id: 'm57-sword', name: '長劍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}。',
};
const bow: Move = {
  id: 'm57-bow', name: '長弓', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}。',
};
const arrowStorm: Move = {
  ...bow, id: 'arrow-storm', name: '驟雨連射', area: true, damage: { dice: 1, sides: 4, bonusStat: 'dex' },
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '{actor}擲出火球轟向{target}。',
};
const meteor: Move = {
  ...fireball, id: 'meteor-fall', name: '隕石墜', area: true,
};
const lamentTouch: Move = {
  id: 'reliquary-lament-touch', name: '哀歌觸碰', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost',
  damage: { dice: 1, sides: 7, bonusStat: 'int' }, narration: '{actor}觸碰{target}。',
};

function member(id: string, row: 'front' | 'back', moves: Move[], hp = 30): PartyMember {
  return {
    id,
    name: id,
    formationRow: row,
    stats: { str: 16, dex: 16, int: 16, cha: 12, con: 14 },
    maxHp: 30,
    hp,
    defense: 12,
    moves,
  };
}

function convoyState() {
  return startCombat(
    rng,
    [
      member('front-sword', 'front', [sword], 30),
      member('rear-ranger', 'back', [bow, arrowStorm], 8),
      member('rear-mage', 'back', [fireball, meteor, lamentTouch], 6),
    ],
    createConvoyDefenseEncounter(),
  );
}

describe('M57 live line-of-effect integration at Split Banner Pass', () => {
  it('authors ruined battlements and keeps the arsonist behind a real frontline', () => {
    const state = convoyState();
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    expect(state.terrain?.id).toBe('ruined-battlements');
    expect(arsonist.formationRow).toBe('back');
    expect(tacticalUnitSummary(state, 'enemy', arsonist)).toContain('實體遮蔽');
    expect(state.enemies.filter((enemy) => enemy.hp > 0 && enemy.formationRow !== 'back')).toHaveLength(2);
  });

  it('blocks both a direct bow shot and a direct fireball from sniping the protected rear caster', () => {
    const state = convoyState();
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    const ranger = state.party.find((member) => member.id === 'rear-ranger')!;
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const liveBow = ranger.moves.find((move) => move.id === bow.id)!;
    const liveFireball = mage.moves.find((move) => move.id === fireball.id)!;
    expect(partyTargetAvailability(state, ranger, liveBow, arsonist).allowed).toBe(false);
    expect(partyTargetAvailability(state, mage, liveFireball, arsonist).allowed).toBe(false);
    const bowChoice = tacticalTargetChoices(state, ranger, liveBow).find((choice) => choice.id === arsonist.id)!;
    const fireChoice = tacticalTargetChoices(state, mage, liveFireball).find((choice) => choice.id === arsonist.id)!;
    expect(bowChoice.label).toContain('實體遮蔽');
    expect(fireChoice.label).toContain('實體遮蔽');
    expect(fireChoice.label).not.toContain('掩體 -2');
  });

  it('rejects a blocked spell before spending either the turn or mana', () => {
    const state = convoyState();
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    const liveFireball = mage.moves.find((move) => move.id === fireball.id)!;
    const beforeTurn = state.turnIndex;
    const beforeMana = mage.mystic!.current;
    const beforeHp = arsonist.hp;
    const result = partyAct(rng, state, mage.id, liveFireball.id, arsonist.id);
    expect(result.acted).toBe(false);
    expect(result.reason).toMatch(/直線作用線|實體|越頂|突破/);
    expect(state.turnIndex).toBe(beforeTurn);
    expect(mage.mystic!.current).toBe(beforeMana);
    expect(arsonist.hp).toBe(beforeHp);
  });

  it('lets Arrow Storm go overhead but still applies the enemy strong-cover penalty per rear target', () => {
    const state = convoyState();
    const ranger = state.party.find((member) => member.id === 'rear-ranger')!;
    const liveStorm = ranger.moves.find((move) => move.id === arrowStorm.id)!;
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    expect(legalEnemyTargetsForMove(state, liveStorm).map((enemy) => enemy.id)).toContain(arsonist.id);
    expect(targetCoverForecast(state, liveStorm, arsonist).hitModifier).toBe(-2);
    const [choice] = tacticalTargetChoices(state, ranger, liveStorm);
    expect(choice.label).toContain('越頂');
    expect(choice.label).toContain('受掩體影響');
    expect(choice.coverHitModifier).toBe(-2);
  });

  it('lets Meteor Fall go overhead without inventing a magical cover bonus or penalty', () => {
    const state = convoyState();
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const liveMeteor = mage.moves.find((move) => move.id === meteor.id)!;
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    expect(legalEnemyTargetsForMove(state, liveMeteor).map((enemy) => enemy.id)).toContain(arsonist.id);
    expect(targetCoverForecast(state, liveMeteor, arsonist).hitModifier).toBe(0);
    const [choice] = tacticalTargetChoices(state, mage, liveMeteor);
    expect(choice.label).toContain('越頂');
    expect(choice.coverHitModifier).toBe(0);
  });

  it('treats the pre-M57 Lament Touch as contact magic that cannot bypass a living screen', () => {
    const state = convoyState();
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const touch = mage.moves.find((move) => move.id === lamentTouch.id)!;
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    const availability = partyTargetAvailability(state, mage, touch, arsonist);
    expect(availability.allowed).toBe(false);
    expect(availability.reason).toMatch(/貼身|前排|突破/);
  });

  it('removes the rear obstruction once the enemy frontline is actually gone', () => {
    const state = convoyState();
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    for (const enemy of state.enemies) {
      if (enemy.id !== arsonist.id) enemy.hp = 0;
    }
    const collapse = collapseEnemyFrontLine(state.enemies);
    expect(collapse.promoted).toContain(arsonist.id);
    expect(arsonist.formationRow).toBe('front');
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const liveFireball = mage.moves.find((move) => move.id === fireball.id)!;
    expect(partyTargetAvailability(state, mage, liveFireball, arsonist).allowed).toBe(true);
  });

  it('applies the same solid obstruction to enemy direct magic instead of sniping the lowest-HP party rear', () => {
    const state = convoyState();
    const arsonist = state.enemies.find((enemy) => enemy.id === 'convoy-ash-arsonist')!;
    state.enemyIntents[arsonist.id] = 'convoy-ash-bolt';
    const front = state.party.find((member) => member.id === 'front-sword')!;
    const ranger = state.party.find((member) => member.id === 'rear-ranger')!;
    const mage = state.party.find((member) => member.id === 'rear-mage')!;
    const before = { front: front.hp, ranger: ranger.hp, mage: mage.hp };
    enemyAct(rng, state, arsonist.id);
    expect(front.hp).toBeLessThan(before.front);
    expect(ranger.hp).toBe(before.ranger);
    expect(mage.hp).toBe(before.mage);
  });
});
