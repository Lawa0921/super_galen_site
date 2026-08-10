import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  partyAct,
  startCombat,
  targetCoverForecast,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { createReliquaryEncounter } from './ashenReliquaryCombat';

function scriptedRng(values: number[] = [20, 19, 18, 17, 1]): Rng {
  let index = 0;
  const take = () => values[index++ % Math.max(1, values.length)] ?? 10;
  return {
    next: () => 0,
    roll: take,
    d20: take,
    pick: (items) => items[0],
    weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
  };
}

const sword: Move = {
  id: 'm55-sword', name: '長劍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 1, bonusStat: 'str' }, narration: '{actor}斬向{target}，造成 {amount} 點傷害！',
};
const arrow: Move = {
  id: 'm55-arrow', name: '獵弓箭', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 1, bonusStat: 'dex' }, narration: '{actor}射向{target}，造成 {amount} 點傷害！',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 1, bonusStat: 'int' }, narration: '{actor}以火球轟擊{target}，造成 {amount} 點傷害！',
};

function frontliner(): PartyMember {
  return {
    id: 'front', name: '前衛', formationRow: 'front',
    stats: { str: 16, dex: 10, int: 8, cha: 8, con: 16 }, maxHp: 50, hp: 50, defense: 12, moves: [sword],
  };
}
function ranger(): PartyMember {
  return {
    id: 'ranger', name: '弓手', formationRow: 'back',
    stats: { str: 10, dex: 16, int: 8, cha: 8, con: 12 }, maxHp: 30, hp: 30, defense: 12, moves: [arrow],
  };
}
function mage(): PartyMember {
  return {
    id: 'mage', name: '法師', formationRow: 'back',
    stats: { str: 8, dex: 12, int: 16, cha: 10, con: 10 }, maxHp: 28, hp: 28, defense: 12, moves: [fireball],
  };
}

function forceTurn(state: ReturnType<typeof startCombat>, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

describe('M55 live battlefield cover integration', () => {
  it('authors the Ashen Reliquary bridge as a real broken-stone battlefield and publishes it in the log', () => {
    const encounter = createReliquaryEncounter(1);
    const state = startCombat(scriptedRng(), [frontliner(), ranger()], encounter);
    expect(state.terrain?.id).toBe('broken-stone-bridge');
    expect(state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')?.formationRow).toBe('back');
    expect(state.log.some((entry) => entry.text.includes('地形：斷裂石橋'))).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('物理遠程命中 -1'))).toBe(true);
  });

  it('turns the same borderline player arrow from an open-ground hit into a covered miss', () => {
    const openRanger = ranger();
    const open = startCombat(scriptedRng(), [frontliner(), openRanger], createReliquaryEncounter(1), 'open-ground');
    const openSquire = open.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    forceTurn(open, openRanger.id);
    partyAct(scriptedRng([9, 1]), open, openRanger.id, arrow.id, openSquire.id);
    expect(openSquire.hp).toBeLessThan(openSquire.maxHp);

    const bridgeRanger = ranger();
    const bridge = startCombat(scriptedRng(), [frontliner(), bridgeRanger], createReliquaryEncounter(1));
    const bridgeSquire = bridge.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    forceTurn(bridge, bridgeRanger.id);
    partyAct(scriptedRng([9, 1]), bridge, bridgeRanger.id, arrow.id, bridgeSquire.id);
    expect(bridgeSquire.hp).toBe(bridgeSquire.maxHp);
    expect(bridge.log.some((entry) => entry.text.includes('遮蔽投射線'))).toBe(true);
  });

  it('applies the same bridge cover when the enemy throws a physical spear at the player rear', () => {
    const openFront = frontliner();
    const openRear = ranger();
    openRear.maxHp = openRear.hp = 20;
    const open = startCombat(scriptedRng(), [openFront, openRear], createReliquaryEncounter(1), 'open-ground');
    const openSquire = open.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    forceTurn(open, openSquire.id);
    open.enemyIntents[openSquire.id] = 'reliquary-cinder-spear';
    enemyAct(scriptedRng([10, 1]), open, openSquire.id);
    expect(openRear.hp).toBeLessThan(20);

    const bridgeFront = frontliner();
    const bridgeRear = ranger();
    bridgeRear.maxHp = bridgeRear.hp = 20;
    const bridge = startCombat(scriptedRng(), [bridgeFront, bridgeRear], createReliquaryEncounter(1));
    const bridgeSquire = bridge.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    forceTurn(bridge, bridgeSquire.id);
    bridge.enemyIntents[bridgeSquire.id] = 'reliquary-cinder-spear';
    enemyAct(scriptedRng([10, 1]), bridge, bridgeSquire.id);
    expect(bridgeRear.hp).toBe(20);
  });

  it('keeps genuine magic on its own geometry instead of treating a spell like an arrow', () => {
    const caster = mage();
    const state = startCombat(scriptedRng(), [frontliner(), caster], createReliquaryEncounter(1));
    const squire = state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    expect(targetCoverForecast(state, fireball, squire)).toMatchObject({ applies: false, hitModifier: 0 });
    forceTurn(state, caster.id);
    partyAct(scriptedRng([9, 1]), state, caster.id, fireball.id, squire.id);
    expect(squire.hp).toBeLessThan(squire.maxHp);
  });

  it('removes rear cover the moment the screen falls and the squire is forced to the frontline', () => {
    const front = frontliner();
    const back = ranger();
    const state = startCombat(scriptedRng(), [front, back], createReliquaryEncounter(1));
    const knight = state.enemies.find((enemy) => enemy.id === 'reliquary-ash-knight')!;
    const squire = state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    expect(targetCoverForecast(state, arrow, squire).hitModifier).toBe(-1);

    knight.hp = 1;
    forceTurn(state, front.id);
    partyAct(scriptedRng([20, 1]), state, front.id, sword.id, knight.id);
    expect(knight.hp).toBe(0);
    expect(squire.formationRow).toBe('front');
    expect(targetCoverForecast(state, arrow, squire)).toMatchObject({ applies: false, hitModifier: 0 });
    expect(state.log.some((entry) => entry.text.includes('敵方前線崩潰'))).toBe(true);
  });

  it('keeps Guard interception distinct from cover by resolving the redirected shot against the frontline guardian', () => {
    const guard = frontliner();
    const rear = ranger();
    rear.maxHp = rear.hp = 20;
    const state = startCombat(scriptedRng(), [guard, rear], createReliquaryEncounter(1));
    const squire = state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    state.guarding[guard.id] = true;
    forceTurn(state, squire.id);
    state.enemyIntents[squire.id] = 'reliquary-cinder-spear';
    const before = state.log.length;
    enemyAct(scriptedRng([20, 1]), state, squire.id);
    const newLog = state.log.slice(before).map((entry) => entry.text);
    expect(newLog.some((line) => line.includes('替弓手攔下攻擊'))).toBe(true);
    expect(newLog.some((line) => line.includes('遮蔽投射線'))).toBe(false);
    expect(rear.hp).toBe(20);
  });

  it('rejects contradictory terrain authorship instead of silently choosing one battlefield', () => {
    const enemy = (id: string, terrain: EnemyUnit['battlefieldTerrainId']): EnemyUnit => ({
      id, name: id, battlefieldTerrainId: terrain,
      stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 }, maxHp: 10, hp: 10, defense: 10,
      moves: [sword], intents: [{ weight: 1, moveId: sword.id }],
    });
    expect(() => startCombat(scriptedRng(), [frontliner()], [
      enemy('one', 'broken-stone-bridge'),
      enemy('two', 'ruined-battlements'),
    ])).toThrow(/互相衝突的戰場地形/);
  });
});
