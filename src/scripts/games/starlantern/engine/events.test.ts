import { describe, expect, it } from 'vitest';
import { ALTARS, ALTAR_STAT_CAP_PCT, POISON_TP_LOSS_PCT, VAULT_CHEST_MULT, altarAt, trapDamage } from './events';
import { RARE_MATERIALS } from './loot/drops';
import { FLOORS } from '../data/floors';
import { createBattle } from './battle';
import { Game, type MoveResult } from './game';
import { DELTA, posKey, tileAt, type Dir } from './map';
import { floorOf, type Portal } from './dungeon/run';
import { statsOf } from './party';
import { ITEMS } from '../data/items';
import { capacity, carried } from '../data/weights';
import { constRng } from './testing';
import type { Content } from './dungeon/rooms';
import type { Pos } from './types';

const MAIN: Portal = { region: 'mainline', condition: 'plain' };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** A game on depth 1 whose first floor holds every wanted kind of content; the rng value picks the run seed. */
function gameWith(...kinds: Content['kind'][]): Game {
  for (let i = 1; i < 400; i++) {
    const g = new Game(constRng(0.5 + i / 1000), null);
    g.state.dungeon.reached.mainline = 3;
    g.depart(MAIN, 1);
    const cs = floorOf(g.run!, 1).contents;
    if (kinds.every((k) => cs.some((c) => c.kind === k))) return g;
  }
  throw new Error(`no floor with ${kinds.join('+')}`);
}
const contentOf = (g: Game, kind: Content['kind']) => floorOf(g.run!, g.floor).contents.find((c) => c.kind === kind)!;
const stepOnto = (g: Game, at: Pos): MoveResult => {
  for (const dir of DIRS) {
    const from = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    if (tileAt(g.map(), from) !== 'wall') { g.pos = from; return g.move(dir); }
  }
  throw new Error(`no way onto ${posKey(at)}`);
};
/** Make the game's rng answer `v` from now on (traps roll hurt below 0.5, poison above). */
const rig = (g: Game, v: number) => { (g as unknown as { rng: () => number }).rng = () => v; };
const members = (g: Game) => g.state.party.recruited.map((id) => g.state.party.roster[id]);

describe('fountain', () => {
  it('the fountain heals 30% once per run', () => {
    const g = gameWith('fountain');
    const at = contentOf(g, 'fountain').at;
    for (const m of members(g)) { m.hp = 1; m.tp = 0; }
    expect(g.useFountain()).toBe(false);   // not standing on it
    expect(stepOnto(g, at)).toMatchObject({ kind: 'event' });
    expect(g.useFountain()).toBe(true);
    for (const m of members(g)) {
      expect(m.hp).toBe(1 + Math.floor(statsOf(m).hp * 0.3));
      expect(m.tp).toBe(Math.floor(statsOf(m).tp * 0.3));
    }
    const hp = members(g).map((m) => m.hp);
    expect(g.useFountain()).toBe(false);
    expect(members(g).map((m) => m.hp)).toEqual(hp);
  });
  it('a used fountain is plain floor afterwards, and a downed member is not healed', () => {
    const g = gameWith('fountain');
    const at = contentOf(g, 'fountain').at;
    const down = members(g)[0];
    down.hp = 0;
    stepOnto(g, at);
    g.useFountain();
    expect(down.hp).toBe(0);
    expect(tileAt(g.map(), at)).toBe('floor');
    expect(stepOnto(g, at)).toEqual({ kind: 'moved' });
  });
});

describe('trap', () => {
  it('a hurt trap takes HP from every living member, leaves TP, and is spent afterwards', () => {
    const g = gameWith('trap');
    rig(g, 0.1);
    const at = contentOf(g, 'trap').at;
    const before = members(g).map((m) => ({ hp: m.hp, tp: m.tp }));
    const r = stepOnto(g, at);
    expect(r).toEqual({ kind: 'trap', effect: 'hurt', amount: trapDamage('hurt', 1), tp: 0 });
    members(g).forEach((m, i) => expect([m.hp, m.tp]).toEqual([Math.max(1, before[i].hp - trapDamage('hurt', 1)), before[i].tp]));
    expect(tileAt(g.map(), at)).toBe('floor');
    const after = members(g).map((m) => m.hp);
    expect(stepOnto(g, at)).toEqual({ kind: 'moved' });
    expect(members(g).map((m) => m.hp)).toEqual(after);
  });
  it('a poison trap hurts less and drains 20% of max TP, and the result reports both', () => {
    const g = gameWith('trap');
    rig(g, 0.9);
    const before = members(g).map((m) => ({ hp: m.hp, tp: m.tp }));
    const r = stepOnto(g, contentOf(g, 'trap').at);
    expect(trapDamage('poison', 1)).toBeLessThan(trapDamage('hurt', 1));
    const drains = members(g).map((m, i) => before[i].tp - m.tp);
    members(g).forEach((m, i) => expect(m.hp).toBe(Math.max(1, before[i].hp - trapDamage('poison', 1))));
    members(g).forEach((m, i) => expect(drains[i]).toBe(Math.min(before[i].tp, Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100))));
    expect(Math.max(...drains)).toBeGreaterThan(0);
    expect(r).toEqual({ kind: 'trap', effect: 'poison', amount: trapDamage('poison', 1), tp: Math.max(...drains) });
  });
  it('never kills, and TP never goes below 0', () => {
    for (const v of [0.1, 0.9]) {
      const g = gameWith('trap');
      rig(g, v);
      for (const m of members(g)) { m.hp = 1; m.tp = 0; }
      stepOnto(g, contentOf(g, 'trap').at);
      expect(members(g).every((m) => m.hp === 1 && m.tp === 0)).toBe(true);
    }
  });
});

describe('merchant', () => {
  it('the merchant sells three items and charges the price', () => {
    const g = gameWith('merchant');
    const c = contentOf(g, 'merchant');
    expect(c.stock).toHaveLength(3);
    expect(new Set(c.stock).size).toBe(3);
    for (const id of c.stock!) expect(ITEMS[id].price).toBeGreaterThan(0);
    expect(floorOf(g.run!, 1).contents.find((x) => x.kind === 'merchant')!.stock).toEqual(c.stock);
    expect(stepOnto(g, c.at)).toMatchObject({ kind: 'event' });
    const id = c.stock![0];
    g.state.gold = ITEMS[id].price + 1;
    expect(g.buy(c.at, id).ok).toBe(true);
    expect(g.state.gold).toBe(1);
    expect(g.state.inventory[id]).toBeGreaterThanOrEqual(1);
    expect(g.buy(c.at, id)).toEqual({ ok: false, reason: 'gold' });
  });
  it('refuses items outside the stock and merchants that are not here', () => {
    const g = gameWith('merchant');
    const c = contentOf(g, 'merchant');
    stepOnto(g, c.at);
    g.state.gold = 9999;
    const other = Object.keys(ITEMS).find((i) => ITEMS[i].price > 0 && !c.stock!.includes(i))!;
    expect(g.buy(c.at, other)).toEqual({ ok: false, reason: 'invalid' });
    expect(g.buy({ x: c.at.x + 99, y: c.at.y }, c.stock![0])).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('altar', () => {
  it('has three to five altars', () => {
    expect(ALTARS.length).toBeGreaterThanOrEqual(3);
    expect(ALTARS.length).toBeLessThanOrEqual(5);
  });
  it('an altar applies its cost and its run-long buff, or nothing when declined', () => {
    const g = gameWith('altar');
    const at = contentOf(g, 'altar').at;
    stepOnto(g, at);
    const def = altarAt(g.run!, g.floor, at);
    const hp = members(g).map((m) => m.hp);
    expect(g.altar(at, false)).toBe(false);
    expect([g.run!.altarBuffs, g.state.gold, members(g).map((m) => m.hp)]).toEqual([[], 150, hp]);
    g.state.gold = 9999;
    expect(g.altar(at, true)).toBe(true);
    expect(g.run!.altarBuffs).toEqual([def.gain]);
    expect(g.state.gold).toBe(9999 - (def.cost.gold ?? 0));
    if (def.cost.hpPct) members(g).forEach((m, i) => expect(m.hp).toBeLessThan(hp[i]));
    expect(g.altar(at, true)).toBe(false);   // spent
    expect(g.run!.altarBuffs).toHaveLength(1);
    // the buff reaches every later fight of the run
    g.encounter = 99;
    const open = DIRS.find((d) => tileAt(g.map(), { x: g.pos.x + DELTA[d].x, y: g.pos.y + DELTA[d].y }) === 'floor')!;
    expect(g.move(open)).toEqual({ kind: 'battle' });
    const c = g.battle!.party[0];
    expect(c.max[def.gain.stat]).toBe(Math.floor(statsOf(g.state.party.roster[c.key as 'scarlet'])[def.gain.stat] * (1 + def.gain.pct / 100)));
  });
  it('a payment the party cannot make is refused and changes nothing', () => {
    const g = gameWith('altar');
    const at = contentOf(g, 'altar').at;
    stepOnto(g, at);
    const def = altarAt(g.run!, g.floor, at);
    g.state.gold = 0;
    for (const m of members(g)) m.hp = 1;
    // a gold altar cannot be paid with no gold; an HP altar cannot be paid when nobody can spare HP
    const paid = g.altar(at, true);
    expect(paid).toBe(!def.cost.gold && !def.cost.hpPct);
    expect(g.run!.altarBuffs).toEqual([]);
  });
  it('refuses an altar whose bonus would pass the per-stat cap, and accepts one that reaches it exactly', () => {
    const g = gameWith('altar');
    const at = contentOf(g, 'altar').at;
    stepOnto(g, at);
    const { gain } = altarAt(g.run!, g.floor, at);
    g.state.gold = 9999;
    g.run!.altarBuffs = [{ stat: gain.stat, pct: ALTAR_STAT_CAP_PCT - gain.pct + 1 }];
    expect(g.altar(at, true)).toBe(false);
    expect([g.state.gold, tileAt(g.map(), at)]).toEqual([9999, 'altar']);
    g.run!.altarBuffs = [{ stat: gain.stat, pct: ALTAR_STAT_CAP_PCT - gain.pct }];
    expect(g.altar(at, true)).toBe(true);
    expect(g.run!.altarBuffs.filter((b) => b.stat === gain.stat).reduce((n, b) => n + b.pct, 0)).toBe(ALTAR_STAT_CAP_PCT);
    expect(tileAt(g.map(), at)).toBe('floor');
  });
  it('createBattle applies altar buffs to the party only', () => {
    const g = gameWith('altar');
    const base = createBattle({ party: g.state.party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const b = createBattle({ party: g.state.party, enemyIds: ['slime'], inventory: {}, revealed: {}, altar: [{ stat: 'atk', pct: 10 }, { stat: 'atk', pct: 10 }] });
    expect(b.party[0].max.atk).toBe(Math.floor(base.party[0].max.atk * 1.2));
    expect(b.enemies[0].max).toEqual(base.enemies[0].max);
  });
});

describe('vault', () => {
  it('a vault that does not fit reports the weight it needs and stays shut', () => {
    const g = gameWith('vault', 'key');
    const vault = contentOf(g, 'vault').at;
    g.run!.keys.add(1);
    stepOnto(g, vault);
    g.run!.loot.items['star-stone'] = Math.floor((capacity(g.state.party) - carried(g.state, g.run!)) * 2);
    const r = g.openVault(vault);
    expect(r).toMatchObject({ kind: 'full' });
    expect((r as { need: number }).need).toBeGreaterThan(0);
    expect(tileAt(g.map(), vault)).toBe('vault');
  });
  it("the vault opens only with this floor's key", () => {
    const g = gameWith('vault', 'key');
    const vault = contentOf(g, 'vault').at;
    stepOnto(g, vault);
    expect(g.openVault(vault)).toBeNull();            // no key
    g.run!.keys.add(99);
    expect(g.openVault(vault)).toBeNull();            // another floor's key
    const key = contentOf(g, 'key').at;
    expect(stepOnto(g, key)).toEqual({ kind: 'key' });
    expect(g.run!.keys.has(1)).toBe(true);
    expect(tileAt(g.map(), key)).toBe('floor');
    stepOnto(g, vault);
    const chest = FLOORS[0].chestLoot[0];   // depth 1 is terrain 1, plain condition
    const held = g.run!.loot.items[chest.item] ?? 0;
    const r = g.openVault(vault) as Extract<MoveResult, { kind: 'vault' }>;
    expect(r.kind).toBe('vault');
    expect(r.loot[chest.item]).toBe(chest.qty * VAULT_CHEST_MULT);   // materials: three chests' worth
    const rare = Object.keys(r.loot).filter((id) => RARE_MATERIALS.includes(id));
    expect(rare.map((id) => r.loot[id])).toEqual([1]);   // exactly one rare material
    expect(Object.keys(r.loot)).toHaveLength(2);
    expect(r.gear).toHaveLength(1);
    expect(['common', 'magic']).not.toContain(r.gear[0].rarity);
    expect(g.run!.loot.items[chest.item]).toBe(held + chest.qty * VAULT_CHEST_MULT);
    expect(g.run!.loot.gear).toEqual(r.gear);
    expect(tileAt(g.map(), vault)).toBe('floor');
    expect(g.openVault(vault)).toBeNull();
  });
  it('a vault must be stood on to be opened', () => {
    const g = gameWith('vault', 'key');
    g.run!.keys.add(1);
    expect(g.openVault(contentOf(g, 'vault').at)).toBeNull();
  });
});

describe('elite', () => {
  it('an elite tile starts an elite fight, and a win turns the tile to floor', () => {
    const g = gameWith('elite');
    const at = contentOf(g, 'elite').at;
    expect(stepOnto(g, at)).toEqual({ kind: 'battle' });
    expect(g.phase).toBe('battle');
    expect(g.battle!.enemies[0].tint).toBe('elite');
    expect(tileAt(g.map(), at)).toBe('elite');
    for (const e of g.battle!.enemies) e.hp = 1;
    const r = g.submitRound(Object.fromEntries(g.battle!.party.map((c) => [c.key, { kind: 'attack' as const, target: 'e0' }])))!;
    expect(r.end!.outcome).toBe('win');
    expect(tileAt(g.map(), at)).toBe('floor');
  });
  it('the elite of a floor is always the same one', () => {
    const a = gameWith('elite'), b = gameWith('elite');
    stepOnto(a, contentOf(a, 'elite').at);
    stepOnto(b, contentOf(b, 'elite').at);
    expect(a.battle!.enemies.map((e) => e.defId)).toEqual(b.battle!.enemies.map((e) => e.defId));
  });
  it('fleeing leaves the elite where it stood', () => {
    let v = 0.7;
    const g = gameWith('elite');
    (g as unknown as { rng: () => number }).rng = () => v;
    const at = contentOf(g, 'elite').at;
    stepOnto(g, at);
    v = 0;
    const r = g.submitRound(Object.fromEntries(g.battle!.party.map((c) => [c.key, { kind: 'escape' as const }])))!;
    expect(r.end!.outcome).toBe('fled');
    expect(tileAt(g.map(), at)).toBe('elite');
  });
});

describe('one step triggers one thing', () => {
  it('stepping onto an event tile with a full gauge returns only the event and leaves the gauge alone', () => {
    for (const kind of ['fountain', 'merchant', 'altar'] as const) {
      const g = gameWith(kind);
      g.encounter = 99;
      const r = stepOnto(g, contentOf(g, kind).at);
      expect(r, kind).toMatchObject({ kind: 'event' });
      expect([g.phase, g.encounter], kind).toEqual(['map', 99]);
    }
    const t = gameWith('trap');
    t.encounter = 99;
    expect(stepOnto(t, contentOf(t, 'trap').at)).toMatchObject({ kind: 'trap' });
    expect([t.phase, t.encounter]).toEqual(['map', 99]);
    const v = gameWith('vault', 'key');
    v.encounter = 99;
    expect(stepOnto(v, contentOf(v, 'vault').at)).toMatchObject({ kind: 'event' });
    expect([v.phase, v.encounter]).toEqual(['map', 99]);
    const e = gameWith('elite');
    e.encounter = 99;
    expect(stepOnto(e, contentOf(e, 'elite').at)).toEqual({ kind: 'battle' });
    expect([e.phase, e.encounter, e.battle!.enemies[0].tint]).toEqual(['battle', 99, 'elite']);   // the elite fight, not a second random one
    const k = gameWith('key');
    k.encounter = 99;
    expect(stepOnto(k, contentOf(k, 'key').at)).toEqual({ kind: 'key' });
    expect([k.phase, k.encounter]).toEqual(['map', 99]);
  });
});

describe('fix round 1: weight at the merchant, picking up again', () => {
  it('a merchant purchase that would pass the carry limit is refused and changes nothing', () => {
    const g = gameWith('merchant');
    const c = contentOf(g, 'merchant');
    stepOnto(g, c.at);
    g.state.gold = 9999;
    g.run!.loot.items['old-coin'] = Math.ceil(capacity(g.state.party) - carried(g.state, g.run!));   // exactly full
    const id = c.stock![0];
    const inv = { ...g.state.inventory };
    expect(g.buy(c.at, id)).toEqual({ ok: false, reason: 'full' });
    expect(g.state.gold).toBe(9999);
    expect(g.state.inventory).toEqual(inv);
  });

  it('pickUpHere re-tries the chest under the party once there is room', () => {
    const g = gameWith('chest');
    const at = g.map().chests[0];
    g.run!.loot.items['old-coin'] = 999;
    const r = stepOnto(g, at);
    expect(r.kind).toBe('full');
    expect(g.pickUpHere()).toMatchObject({ kind: 'full' });   // still no room
    g.run!.loot.items['old-coin'] = 0;
    const { item = '', qty = 0 } = r as Extract<MoveResult, { kind: 'full' }>;   // a shut chest names its materials
    const before = (ITEMS[item] ? g.state.inventory[item] : g.run!.loot.items[item]) ?? 0;
    expect(g.pickUpHere()).toEqual({ kind: 'chest', item, qty });
    expect((ITEMS[item] ? g.state.inventory[item] : g.run!.loot.items[item]) ?? 0).toBe(before + qty);
    expect(g.pickUpHere()).toBeNull();   // opened: nothing left here
  });

  it('pickUpHere opens the vault under the party, and is null on plain floor', () => {
    const g = gameWith('vault');
    const c = contentOf(g, 'vault');
    g.run!.keys.add(1);
    stepOnto(g, c.at);
    expect(g.pickUpHere()).toMatchObject({ kind: 'vault' });
    expect(g.pickUpHere()).toBeNull();
  });
});
