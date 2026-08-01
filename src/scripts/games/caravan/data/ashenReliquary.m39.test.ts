import { describe, expect, it } from 'vitest';
import { newGame, type SaveData } from '../save';
import {
  ashenReliquaryState,
  resolveAshenReliquary,
  type ReliquaryEndingId,
  type ReliquaryRouteId,
} from './ashenReliquary';
import { fantasyMandateAgenda } from './fantasyMandates';
import { retentionMandateAgenda } from './retentionMandates';

function preparedSave(): SaveData {
  const save = newGame(3900, { job: 'mage', trait: 'learned', allocation: { int: 3 } });
  save.marketSeed = 12000;
  save.reputation = 60;
  save.gold = 2000;
  save.wagonLevel = 5;
  save.inventory = {
    ...save.inventory,
    torch: 20,
    herb: 20,
    bandage: 20,
    'dried-rations': 40,
    'tattered-map': 20,
    'spice-pouch': 20,
    'war-tonic': 20,
    ore: 20,
  };
  save.protagonist.stats = { str: 30, dex: 30, int: 30, cha: 30, con: 30 };
  save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  save.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } } as never;
  return save;
}

function completePrelude(save: SaveData): void {
  resolveAshenReliquary(save, 1, 'read-runes');
  resolveAshenReliquary(save, 2, 'decode-lament');
}

function finish(save: SaveData, route: ReliquaryRouteId): ReliquaryEndingId {
  completePrelude(save);
  return resolveAshenReliquary(save, 3, route).ending!;
}

function seedWithDomain(save: SaveData, domain: string): void {
  for (let seed = 12000; seed < 12100; seed++) {
    save.marketSeed = seed;
    if (retentionMandateAgenda(save).mandates.some((mandate) => mandate.domain === domain)) return;
  }
  throw new Error(`找不到包含 ${domain} 的測試週期`);
}

describe('M39 Ashen Reliquary world quest', () => {
  it('is deterministic and read-only while previewing all nine routes', () => {
    const save = preparedSave();
    const before = JSON.stringify(save);
    const first = ashenReliquaryState(save);
    const second = ashenReliquaryState(save);
    expect(first).toEqual(second);
    expect(first.unlocked).toBe(true);
    expect(first.currentStage).toBe(1);
    expect(first.stages.flatMap((stage) => stage.routes)).toHaveLength(9);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('does not unlock low-reputation mundane companies without knowledge access', () => {
    const save = preparedSave();
    save.reputation = 0;
    save.flags = {};
    expect(ashenReliquaryState(save).unlocked).toBe(false);
    const snapshot = JSON.stringify(save);
    expect(() => resolveAshenReliquary(save, 1, 'read-runes')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('enforces stage order and exactly one route per act', () => {
    const save = preparedSave();
    const snapshot = JSON.stringify(save);
    expect(() => resolveAshenReliquary(save, 2, 'decode-lament')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);

    resolveAshenReliquary(save, 1, 'read-runes');
    const afterFirst = JSON.stringify(save);
    expect(() => resolveAshenReliquary(save, 1, 'shield-march')).toThrow();
    expect(JSON.stringify(save)).toBe(afterFirst);
    expect(ashenReliquaryState(save).currentStage).toBe(2);
  });

  it('revalidates stale resources before mutation', () => {
    const save = preparedSave();
    const route = ashenReliquaryState(save).stages[0].routes.find((entry) => entry.id === 'read-runes')!;
    expect(route.eligible).toBe(true);
    save.inventory.torch = 0;
    const snapshot = JSON.stringify(save);
    expect(() => resolveAshenReliquary(save, 1, 'read-runes')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('creates one irreversible ending and awards its unique relic once', () => {
    const save = preparedSave();
    const ending = finish(save, 'seal-reliquary');
    expect(ending).toBe('sealed');
    expect(save.flags['world-quest:ashen-reliquary:completed']).toBe(true);
    expect(save.flags['ashen-reliquary:ending:sealed']).toBe(true);
    expect(save.flags['relic:saint-ember']).toBe(true);
    expect(ashenReliquaryState(save).currentStage).toBeNull();
    const snapshot = JSON.stringify(save);
    expect(() => resolveAshenReliquary(save, 3, 'claim-ember')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('disables corrupt multiple endings instead of stacking world-state benefits', () => {
    const save = preparedSave();
    finish(save, 'seal-reliquary');
    save.flags['ashen-reliquary:ending:claimed'] = true;
    const state = ashenReliquaryState(save);
    expect(state.ending).toBeNull();
    expect(state.warnings.length).toBeGreaterThan(0);
    expect(fantasyMandateAgenda(save).reliquaryEnding).toBeNull();
    expect(fantasyMandateAgenda(save).mandates).toEqual(retentionMandateAgenda(save).mandates);
  });

  it('turns each ending into a different mandate tradeoff', () => {
    const sealed = preparedSave();
    finish(sealed, 'seal-reliquary');
    const sealedBase = retentionMandateAgenda(sealed);
    const sealedAgenda = fantasyMandateAgenda(sealed);
    expect(sealedAgenda.mandates.every((mandate, index) =>
      mandate.reward.gold === Math.max(0, sealedBase.mandates[index].reward.gold - 2)
    )).toBe(true);

    const claimed = preparedSave();
    finish(claimed, 'claim-ember');
    seedWithDomain(claimed, 'relic');
    const claimedBase = retentionMandateAgenda(claimed);
    const claimedAgenda = fantasyMandateAgenda(claimed);
    const baseRelic = claimedBase.mandates.find((mandate) => mandate.domain === 'relic')!;
    const changedRelic = claimedAgenda.mandates.find((mandate) => mandate.domain === 'relic')!;
    expect(changedRelic.routes.find((route) => route.id === 'expertise')!.score)
      .toBe(baseRelic.routes.find((route) => route.id === 'expertise')!.score + 2);
    expect(claimedAgenda.mandates.every((mandate, index) => {
      const field = mandate.routes.find((route) => route.id === 'field')!;
      const baseField = claimedBase.mandates[index].routes.find((route) => route.id === 'field')!;
      return (field.inventoryCost['dried-rations'] ?? 0) === (baseField.inventoryCost['dried-rations'] ?? 0) + 1;
    })).toBe(true);

    const shattered = preparedSave();
    finish(shattered, 'shatter-vessel');
    seedWithDomain(shattered, 'escort');
    const shatteredBase = retentionMandateAgenda(shattered);
    const shatteredAgenda = fantasyMandateAgenda(shattered);
    const baseEscort = shatteredBase.mandates.find((mandate) => mandate.domain === 'escort')!;
    const changedEscort = shatteredAgenda.mandates.find((mandate) => mandate.domain === 'escort')!;
    expect(changedEscort.routes.find((route) => route.id === 'field')!.score)
      .toBe(baseEscort.routes.find((route) => route.id === 'field')!.score + 1);
  });

  it('keeps pre-M39 saves exactly compatible when the quest has no ending', () => {
    const save = preparedSave();
    expect(fantasyMandateAgenda(save).mandates).toEqual(retentionMandateAgenda(save).mandates);
    expect(fantasyMandateAgenda(save).reliquaryEnding).toBeNull();
  });
});
