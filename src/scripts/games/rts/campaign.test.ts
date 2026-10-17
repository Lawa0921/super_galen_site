import { describe, expect, it } from 'vitest';
import { addBuilding, addUnit, buildings, destroyEntity, tier, units } from './state';
import { issueCommand } from './commands';
import { UNITS } from './catalog';
import { updateVisibility } from './visibility';
import { createGame, stepGame } from './simulation';

const CAMPAIGN_TICKS = 1800 * 20;

function advanceTicks(state: ReturnType<typeof createGame>, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) stepGame(state);
}

async function advanceTicksYielding(state: ReturnType<typeof createGame>, ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    stepGame(state);
    if (i % 500 === 499) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function expectLedgerBalance(
  state: ReturnType<typeof createGame>,
  team: 0 | 1,
  opening: { gold: number; wood: number },
): void {
  const transactions = state.economyLog.filter((row) => row.team === team);
  expect(state.teams[team].gold).toBeCloseTo(opening.gold + transactions.reduce((sum, row) => sum + row.gold, 0), 6);
  expect(state.teams[team].wood).toBeCloseTo(opening.wood + transactions.reduce((sum, row) => sum + row.wood, 0), 6);
}

describe('full RTS simulation campaigns', () => {
  it.each(['river', 'pass'] as const)('default opponent gathers, develops and wins naturally on %s', async (mapId) => {
    const state = createGame(mapId);
    expect(state.aiEnabled).toEqual([false, true]);

    let lowestGold = state.teams[1].gold;
    let lowestWood = state.teams[1].wood;
    let steps = 0;
    for (; steps < CAMPAIGN_TICKS && state.status === 'playing'; steps += 1) {
      stepGame(state);
      lowestGold = Math.min(lowestGold, state.teams[1].gold);
      lowestWood = Math.min(lowestWood, state.teams[1].wood);
      if (steps % 2400 === 2399) {
        console.info(`[campaign:${mapId}:progress] ticks=${steps + 1} time=${state.time.toFixed(2)} tier=${tier(state, 1)} gold=${state.teams[1].gold.toFixed(2)} wood=${state.teams[1].wood.toFixed(2)} units=${units(state, 1).length} buildings=${buildings(state, 1).length} kills=${state.teams[1].stats.kills} status=${state.status}`);
      }
      if (steps % 500 === 499) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const ledger = state.economyLog.filter((row) => row.team === 1);
    const townhall = buildings(state, 1).find((building) => building.kind === 'townhall');
    expect(state.status).toBe('won');
    expect(state.winner).toBe(1);
    expect(state.endReason).toBe('elimination');
    expect(state.tick).toBeLessThanOrEqual(CAMPAIGN_TICKS);
    expect(townhall?.tier).toBeGreaterThanOrEqual(2);
    expect(state.teams[1].stats.gatheredGold).toBeGreaterThan(0);
    expect(state.teams[1].stats.gatheredWood).toBeGreaterThan(0);
    expect(state.teams[1].stats.unitsTrained).toBeGreaterThan(0);
    expect(state.teams[1].stats.buildingsBuilt).toBeGreaterThan(0);
    expect(state.teams[1].stats.kills).toBeGreaterThan(0);
    expect(ledger.some((row) => row.reason === 'deposit:gold')).toBe(true);
    expect(ledger.some((row) => row.reason === 'deposit:wood')).toBe(true);
    expect(ledger.some((row) => row.reason.startsWith('build:'))).toBe(true);
    expect(ledger.some((row) => row.reason.startsWith('train:'))).toBe(true);
    expect(ledger.some((row) => row.reason === 'upgrade:2')).toBe(true);
    expect(lowestGold).toBeGreaterThanOrEqual(0);
    expect(lowestWood).toBeGreaterThanOrEqual(0);
    expectLedgerBalance(state, 1, { gold: 500, wood: 200 });

    console.info(`[campaign:${mapId}] ticks=${steps} time=${state.time.toFixed(2)} tier=${townhall?.tier} gold=${state.teams[1].gold.toFixed(2)} wood=${state.teams[1].wood.toFixed(2)} gathered=${state.teams[1].stats.gatheredGold}/${state.teams[1].stats.gatheredWood} trained=${state.teams[1].stats.unitsTrained} kills=${state.teams[1].stats.kills}`);
  }, 120_000);

  it('funds and completes tier III in a contested match without injected resources',async()=>{
    // An undefended base can fall before tier III. Exercise late technology
    // against an active opponent rather than delaying a legitimate early win.
    const state=createGame('pass',1);state.aiEnabled=[true,true];
    for(let i=0;i<16000&&state.status==='playing'&&tier(state,1)<3;i++){
      stepGame(state);if(i%500===499)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    expect(tier(state,1)).toBe(3);
    const payments=state.economyLog.filter(row=>row.team===1&&row.reason==='upgrade:3');
    expect(payments).toHaveLength(1);expect(payments[0]).toMatchObject({gold:-420,wood:-240});
    expectLedgerBalance(state,1,{gold:500,wood:200});
    expect(state.teams.every(team=>team.gold>=0&&team.wood>=0)).toBe(true);
    console.info(`[campaign:contested-tech] time=${state.time} tier=${tier(state,1)}`);
  },120_000);

  it('reaches a real time-limit draw after 36,000 active ticks and excludes paused steps', async () => {
    const state = createGame('river', 29);
    state.aiEnabled = [false, false];
    state.resources.forEach((resource) => { resource.remaining = 0; });

    state.paused = true;
    advanceTicks(state, 120);
    expect(state.time).toBe(0);
    expect(state.tick).toBe(0);
    expect(state.status).toBe('playing');

    state.paused = false;
    await advanceTicksYielding(state, CAMPAIGN_TICKS);
    expect(state.tick).toBe(CAMPAIGN_TICKS);
    expect(state.time).toBe(1800);
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
    expect(state.endReason).toBe('time-limit');
    console.info(`[campaign:draw] ticks=${state.tick} time=${state.time} reason=${state.endReason}`);
  }, 120_000);

  it('pays to revive the dead unique hero with earned XP, level and learned skills intact', () => {
    const state = createGame('river', 41);
    state.aiEnabled = [false, false];

    // Scenario fixture: a completed altar enables the normal paid train/recruit flow.
    const altar = addBuilding(state, 0, 'altar', { x: 28, z: 48 }, true);
    expect(issueCommand(state, 0, { type: 'train', buildingId: altar.id, unit: 'commander' })).toEqual({ ok: true });
    advanceTicks(state, UNITS.commander.duration * 20);
    const firstHero = units(state, 0).find((unit) => unit.kind === 'commander');
    expect(firstHero).toBeDefined();

    // Scenario fixture: weakened neutral raiders let this test earn XP through combat quickly.
    for (let index = 0; index < 3; index += 1) {
      const raider = addUnit(state, -1, 'neutral-raider', { x: firstHero!.x + 1.4, z: firstHero!.z + index * 0.15 });
      raider.hp = 1;
      updateVisibility(state);
      expect(issueCommand(state, 0, { type: 'attack', unitIds: [firstHero!.id], targetId: raider.id })).toEqual({ ok: true });
      for (let tick = 0; tick < 40 && raider.alive; tick += 1) stepGame(state);
      expect(raider.alive).toBe(false);
    }

    expect(state.teams[0].hero.xp).toBe(105);
    expect(state.teams[0].hero.level).toBe(2);
    expect(issueCommand(state, 0, { type: 'learn', heroId: firstHero!.id, skill: 'cleave' })).toEqual({ ok: true });
    expect(issueCommand(state, 0, { type: 'learn', heroId: firstHero!.id, skill: 'mend' })).toEqual({ ok: true });
    let savedProgress = structuredClone(state.teams[0].hero);
    expect(issueCommand(state, 0, { type: 'train', buildingId: altar.id, unit: 'commander' }).ok).toBe(false);

    // Scenario fixture: six nearby guards make the hero's death a real combat event.
    const attackers = Array.from({ length: 6 }, (_, index) => {
      const angle = index * Math.PI / 3;
      return addUnit(state, 1, 'guard', {
        x: firstHero!.x + Math.cos(angle) * 1.15,
        z: firstHero!.z + Math.sin(angle) * 1.15,
      });
    });
    updateVisibility(state);
    expect(issueCommand(state, 1, { type: 'attack', unitIds: attackers.map((unit) => unit.id), targetId: firstHero!.id })).toEqual({ ok: true });
    for (let tick = 0; tick < 500 && firstHero!.alive; tick += 1) {
      // The hero may earn another kill while fighting the fixture attackers.
      // Death and revival must preserve the last living progress, including it.
      savedProgress = structuredClone(state.teams[0].hero);
      stepGame(state);
    }
    expect(firstHero!.alive).toBe(false);
    expect(state.teams[0].stats.unitsLost).toBe(1);
    expect(state.teams[0].hero).toEqual(savedProgress);

    // Remove the fixture attackers so they cannot occupy the altar's spawn ring.
    attackers.forEach((unit) => destroyEntity(state, unit));
    const balanceBeforeRevive = { gold: state.teams[0].gold, wood: state.teams[0].wood };
    expect(issueCommand(state, 0, { type: 'train', buildingId: altar.id, unit: 'commander' })).toEqual({ ok: true });
    expect(state.teams[0].gold).toBe(balanceBeforeRevive.gold - UNITS.commander.cost.gold);
    expect(state.teams[0].wood).toBe(balanceBeforeRevive.wood - UNITS.commander.cost.wood);
    expect(state.teams[0].reservedSupply).toBe(UNITS.commander.supply);
    advanceTicks(state, UNITS.commander.duration * 20);

    const revived = units(state, 0).filter((unit) => unit.kind === 'commander');
    expect(revived).toHaveLength(1);
    expect(revived[0].id).not.toBe(firstHero!.id);
    expect(revived[0].maxHp).toBe(UNITS.commander.hp + (savedProgress.level - 1) * 60);
    expect(state.teams[0].hero).toEqual(savedProgress);
    expect(state.teams[0].reservedSupply).toBe(0);
    expect(state.teams[0].stats.unitsTrained).toBe(2);
  }, 120_000);

  it('loses paid unit, research and upgrade queues on destruction without refund or completion', async () => {
    // Scenario fixture: extra treasury and completed prerequisite buildings isolate queue loss.
    const unitState = createGame('river', 53);
    unitState.aiEnabled = [false, false];
    unitState.teams[0].gold = 1000;
    unitState.teams[0].wood = 500;
    const barracks = addBuilding(unitState, 0, 'barracks', { x: 26, z: 25 }, true);
    expect(issueCommand(unitState, 0, { type: 'train', buildingId: barracks.id, unit: 'guard' })).toEqual({ ok: true });
    const unitBalanceAfterPayment = { gold: unitState.teams[0].gold, wood: unitState.teams[0].wood };
    expect(unitState.teams[0].reservedSupply).toBe(UNITS.guard.supply);
    destroyEntity(unitState, barracks);
    await advanceTicksYielding(unitState, (UNITS.guard.duration + 1) * 20);
    expect(unitState.teams[0].gold).toBe(unitBalanceAfterPayment.gold);
    expect(unitState.teams[0].wood).toBe(unitBalanceAfterPayment.wood);
    expect(unitState.teams[0].reservedSupply).toBe(0);
    expect(units(unitState, 0).some((unit) => unit.kind === 'guard')).toBe(false);
    expect(unitState.teams[0].stats.unitsTrained).toBe(0);
    expectLedgerBalance(unitState, 0, { gold: 1000, wood: 500 });

    const researchState = createGame('river', 59);
    researchState.aiEnabled = [false, false];
    researchState.teams[0].gold = 1000;
    researchState.teams[0].wood = 500;
    const forge = addBuilding(researchState, 0, 'forge', { x: 26, z: 25 }, true);
    expect(issueCommand(researchState, 0, { type: 'research', buildingId: forge.id, research: 'weapons1' })).toEqual({ ok: true });
    const researchBalanceAfterPayment = { gold: researchState.teams[0].gold, wood: researchState.teams[0].wood };
    destroyEntity(researchState, forge);
    await advanceTicksYielding(researchState, 21 * 20);
    expect(researchState.teams[0].gold).toBe(researchBalanceAfterPayment.gold);
    expect(researchState.teams[0].wood).toBe(researchBalanceAfterPayment.wood);
    expect(researchState.teams[0].research).not.toContain('weapons1');
    expectLedgerBalance(researchState, 0, { gold: 1000, wood: 500 });

    const upgradeState = createGame('river', 61);
    upgradeState.aiEnabled = [false, false];
    upgradeState.teams[0].gold = 1000;
    upgradeState.teams[0].wood = 500;
    const hall = buildings(upgradeState, 0).find((building) => building.kind === 'townhall')!;
    addBuilding(upgradeState, 0, 'barracks', { x: 26, z: 25 }, true);
    addBuilding(upgradeState, 0, 'forge', { x: 36, z: 25 }, true);
    expect(issueCommand(upgradeState, 0, { type: 'train', buildingId: hall.id, unit: 'worker' })).toEqual({ ok: true });
    expect(issueCommand(upgradeState, 0, { type: 'upgrade', buildingId: hall.id })).toEqual({ ok: true });
    const upgradeBalanceAfterPayment = { gold: upgradeState.teams[0].gold, wood: upgradeState.teams[0].wood };
    expect(upgradeState.teams[0].reservedSupply).toBe(UNITS.worker.supply);
    destroyEntity(upgradeState, hall);
    await advanceTicksYielding(upgradeState, 52 * 20);
    expect(upgradeState.teams[0].gold).toBe(upgradeBalanceAfterPayment.gold);
    expect(upgradeState.teams[0].wood).toBe(upgradeBalanceAfterPayment.wood);
    expect(upgradeState.teams[0].reservedSupply).toBe(0);
    expect(hall.tier).toBe(1);
    expect(hall.queue).toHaveLength(0);
    expect(buildings(upgradeState, 0).some((building) => building.kind === 'townhall' && building.tier >= 2)).toBe(false);
    expect(units(upgradeState, 0).filter((unit) => unit.kind === 'worker')).toHaveLength(5);
    expect(upgradeState.teams[0].stats.unitsTrained).toBe(0);
    expectLedgerBalance(upgradeState, 0, { gold: 1000, wood: 500 });
  }, 120_000);
});
