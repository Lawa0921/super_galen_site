import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type BattleState } from '../battle';
import { hitAmount, type Combatant } from '../combatant';
import { mulberry32 } from '../rng';
import { choose, partyAt } from '../sim';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { echoDef, echoOf } from './echo';
import { pctOf } from '../skills';

const MAX = { hp: 300, tp: 99, atk: 40, def: 20, mag: 60, res: 20, spd: 10 };
const hero = (over: Partial<Combatant> = {}) => makeCombatant({ key: 'hero', side: 'party', defId: 'hero', max: { ...MAX, spd: 1 }, ...over });
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, max: { ...MAX, spd: 50 }, ...over });
const foe = () => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 20 } });

describe("the hero's echo", () => {
  it("echoes a companion's last skill at 70%, at her TP, named for it", () => {
    const s0 = makeBattle([hero(), P('noel', { mech: { kind: 'heat', heat: 3 } })], [foe()]);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    const rec = echoOf(r)!;
    expect(rec).toMatchObject({ by: 'noel', round: 1, cost: SKILLS['fire-star'].tp });
    expect((rec.def.effects[0] as { power: number }).power).toBe(174);   // 140 at heat 3: +24%
    expect((echoDef(rec).effects[0] as { power: number }).power).toBe(122);   // the plan's number: 174 at 70%
    expect(r.log).toContainEqual({ type: 'act', actor: 'hero', label: '殘響・火之星彈' });
    expect(r.party[0].tp).toBe(99 - SKILLS['fire-star'].tp);
    expect(r.log.filter((e) => e.type === 'damage' && e.target === 'e0')).toHaveLength(2);
    // What he really deals: a 122-power fire spell of his own (the draw at 0.5 is a variance of exactly 1, no crit).
    const at = r.log.findIndex((e) => e.type === 'act' && e.actor === 'hero');
    const dealt = r.log.slice(at).find((e) => e.type === 'damage' && e.target === 'e0') as { amount: number };
    const spec = { power: 122, element: 'fire', scale: 'mag', melee: false } as const;
    expect(dealt.amount).toBe(hitAmount(hero(), foe(), spec, { variance: 1, crit: false, blocked: false }).amount);
    expect(dealt.amount).not.toBe(hitAmount(hero(), foe(), { ...spec, power: 174 }, { variance: 1, crit: false, blocked: false }).amount);
    // His own echo is not a skill of hers to echo again; the record is still Noel's.
    expect(echoOf(r)!.by).toBe('noel');
  });

  it('he echoes what the menu showed when he chose it, though another companion casts before him that round', () => {
    // Round 1 is over: Noel's fire star is on record. In round 2 Selene (faster) casts her moonlight before the hero acts.
    const rec = { by: 'noel', round: 1, def: SKILLS['fire-star'], cost: SKILLS['fire-star'].tp };
    const s0 = makeBattle([hero(), P('noel'), P('selene', { max: { ...MAX, spd: 90 } })], [foe()], { round: 1, echo: rec });
    const acts = { selene: { kind: 'skill', skill: 'moonlight', target: 'noel' }, hero: { kind: 'echo', target: 'e0', rec } } as const;
    const r = resolveRound(s0, acts, constRng(0.5));
    expect(r.log).toContainEqual({ type: 'act', actor: 'hero', label: '殘響・火之星彈' });
    expect(r.party[0].tp).toBe(99 - SKILLS['fire-star'].tp);
    expect(r.log.filter((e) => e.type === 'damage' && e.target === 'e0')).toHaveLength(1);
    expect(echoOf(r)!.def.id).toBe('moonlight');   // the record moved on; his choice did not
  });

  it("echoing Scarlet's 挑釁 after his steady 守勢 leaves him taunting but no longer steady (8d Task 8 review)", () => {
    const rec = { by: 'scarlet', round: 1, def: SKILLS.provoke, cost: SKILLS.provoke.tp };
    const s0 = makeBattle([hero({ taunt: 2, steady: true }), P('scarlet')], [foe()], { round: 1, echo: rec });
    const r = resolveRound(s0, { hero: { kind: 'echo', target: 'e0', rec } }, constRng(0.5));
    expect(r.log).toContainEqual({ type: 'act', actor: 'hero', label: '殘響・挑釁' });
    expect(r.party[0].taunt).toBeGreaterThan(0);
    expect(r.party[0].steady).toBeUndefined();
  });

  it("a variant's mechanic extra is not copied: 挑釁・高喊 and 箭雨・覆蓋 are echoed as their plain part (8d final review)", () => {
    // 高喊: 挑釁 also stores embers. The record keeps the taunt and drops the embers effect, and says it dropped something.
    const rs = resolveRound(makeBattle([hero(), P('scarlet', { ranks: { provoke: 1, 'scarlet-provoke-shout': 1 }, mech: { kind: 'embers', embers: 0 } })], [foe()]),
      { scarlet: { kind: 'skill', skill: 'provoke' } }, constRng(0.5));
    const rec = echoOf(rs)!;
    expect(rec.def.name).toBe('挑釁・高喊');
    expect(rec.def.effects).toEqual(SKILLS.provoke.effects);
    expect(rec.dropped).toBe(true);
    // 覆蓋: 箭雨 also adds aim. The record keeps the arrows, drops the aim.
    const rain = resolveRound(makeBattle([hero(), P('sylvie', { ranks: { 'arrow-rain': 1, 'sylvie-rain-cover': 1 }, mech: { kind: 'aim', target: null, stacks: 0 } })], [foe()]),
      { sylvie: { kind: 'skill', skill: 'arrow-rain', target: 'e0' } }, constRng(0.5));
    const rr = echoOf(rain)!;
    expect(rr.def.name).toBe('箭雨・覆蓋');
    expect(rr.def.effects).toEqual(SKILLS['arrow-rain'].effects);
    expect(rr.dropped).toBe(true);
    // A plain skill drops nothing; a skill that is all mechanic (a device) is still never recorded.
    const plain = resolveRound(makeBattle([hero(), P('noel', { mech: { kind: 'heat', heat: 0 } })], [foe()]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(echoOf(plain)!.dropped).toBeUndefined();
    const turret = resolveRound(makeBattle([hero(), P('bobby', { mech: { kind: 'devices', devices: [], cap: 2 } })], [foe()]), { bobby: { kind: 'skill', skill: 'turret' } }, constRng(0.5));
    expect(echoOf(turret)).toBeNull();
    // A skill that is a mechanic in itself (8c's choice, e.g. 暗記's mark or 釘足箭's delay) stays unechoed: only a variant's extras drop.
    const pin = resolveRound(makeBattle([hero(), P('sylvie', { mech: { kind: 'aim', target: null, stacks: 0 } })], [foe()]), { sylvie: { kind: 'skill', skill: 'pin-shot', target: 'e0' } }, constRng(0.5));
    expect(echoOf(pin)).toBeNull();
  });

  it('short of TP he loses the turn, as with a skill', () => {
    const s0 = makeBattle([hero({ tp: 1 }), P('noel')], [foe()]);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    expect(r.log).toContainEqual({ type: 'no-tp', actor: 'hero' });
    expect(r.log.some((e) => e.type === 'act' && e.actor === 'hero')).toBe(false);
  });

  it("only this round's or the last round's, and only plain skills of a companion", () => {
    const s: BattleState = { ...makeBattle([hero(), P('noel')], [foe()], { round: 3 }), echo: { by: 'noel', round: 1, def: SKILLS['fire-star'], cost: 5 } };
    expect(echoOf(s)).toBeNull();
    expect(echoOf({ ...s, echo: { ...s.echo!, round: 2 } })).not.toBeNull();
    expect(echoOf({ ...s, round: 2 }, 3)).toBeNull();
    // A barrier, a device, the moon, the coins and his own skills are never recorded.
    const recorded = (key: string, skill: string, over: Partial<Combatant> = {}) => {
      const r = resolveRound(makeBattle([hero(), P(key, over)], [foe()]), { [key]: { kind: 'skill', skill, target: 'e0' } }, constRng(0.5));
      return echoOf(r)?.def.id ?? null;
    };
    expect(recorded('chizuru', 'ward', { mech: { kind: 'barrier' } })).toBeNull();
    expect(recorded('bobby', 'turret', { mech: { kind: 'devices', devices: [], cap: 2 } })).toBeNull();
    expect(recorded('selene', 'full-moon-night')).toBeNull();
    expect(recorded('liz', 'fortune-strike', { mech: { kind: 'coins', coins: 3 } })).toBeNull();
    expect(recorded('selene', 'moonlight')).toBe('moonlight');
    const own = resolveRound(makeBattle([hero()], [foe()]), { hero: { kind: 'skill', skill: 'hero-slash', target: 'e0' } }, constRng(0.5));
    expect(echoOf(own)).toBeNull();
  });

  it('the sim never echoes', () => {
    const party = partyAt(20, { ids: ['hero', 'noel', 'rin', 'chizuru', 'selene'] });
    let s = createBattle({ party, enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    const rng = mulberry32(7919);
    let seen = 0;
    for (let r = 0; r < 12 && s.outcome === 'ongoing'; r++) {
      const acts = choose(s, party);
      expect(Object.values(acts).some((a) => a.kind === 'echo')).toBe(false);
      s = resolveRound(s, acts, rng);
      seen++;
    }
    expect(seen).toBeGreaterThan(1);
  });

  it("an echo of a skill Safira's duet lifted keeps the lift: it plays the skill as it was cast (8d Task 7 ruling)", () => {
    const safira = makeCombatant({ key: 'safira', side: 'party', defId: 'safira', mech: { kind: 'beat', beat: 4, last: 'attack' }, ranks: { 'blade-dance': 1, 'safira-duet': 1 }, max: { ...MAX, spd: 90 } });
    const fight = (ranks: Record<string, number>) => resolveRound(makeBattle([{ ...safira, ranks: { 'blade-dance': 1, ...ranks } }, P('noel'), hero()], [foe()], { round: 1 }),
      { safira: { kind: 'skill', skill: 'blade-dance', target: 'e0' }, noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    const power = (r: BattleState) => (echoOf(r)!.def.effects[0] as { power: number }).power;
    const fire = (SKILLS['fire-star'].effects[0] as { power: number }).power;
    const lifted = fight({ 'safira-duet': 1 }), plain = fight({});
    expect(power(lifted)).toBe(pctOf(fire, 120));                        // recorded as Noel cast it, under the duet
    expect(power(plain)).toBe(fire);
    expect((echoDef(echoOf(lifted)!).effects[0] as { power: number }).power).toBe(pctOf(pctOf(fire, 120), 70));
    // The hero's echo lands that much: more than the plain one.
    const heroHit = (r: BattleState) => r.log.filter((e, i) => e.type === 'damage' && r.log.slice(0, i).some((x) => x.type === 'act' && x.actor === 'hero')).map((e) => (e as { amount: number }).amount)[0];
    expect(heroHit(lifted)).toBeGreaterThan(heroHit(plain));
  });
});

describe("the hero's echo of a skill with runes (plan 8e Task 3)", () => {
  const blood = { id: 'blood-price', tier: 'legendary' } as const;
  const twin = { id: 'twin-cast', tier: 'legendary' } as const;

  it('echo keeps her runes but not her trigger', () => {
    const noel = P('noel', { runes: { 'fire-star': [{ id: 'spread', tier: 'magic' }, { id: 'on-crit', tier: 'magic' }] } });
    const r = resolveRound(makeBattle([hero(), noel], [foe()]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    const rec = echoOf(r)!;
    expect(rec.def.target).toBe('enemies');
    expect((rec.def.effects[0] as { power: number }).power).toBe(84);
    expect(rec.def.runeRules?.trigger).toBeUndefined();
    expect(rec.def).not.toHaveProperty('runeRules');
  });

  it('echo pays the plain price of a blood-price skill', () => {
    const noel = P('noel', { runes: { 'fire-star': [blood] } });
    const r = resolveRound(makeBattle([hero(), noel], [foe()]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    // She paid HP, not TP (the foe her blow woke hits back too).
    const struck = r.log.reduce((a, e) => a + (e.type === 'damage' && e.target === 'noel' ? e.amount : 0), 0);
    expect(r.party[1].tp).toBe(99);
    expect(r.party[1].hp).toBe(300 - Math.floor(300 * 0.12) - struck);
    const rec = echoOf(r)!;
    expect([rec.cost, rec.def.tp, rec.def.hpCost]).toEqual([4, 4, undefined]);
    expect(rec.def).not.toHaveProperty('hpCost');
    expect(rec.def.runeRules?.plain).toBeUndefined();
    // The hero echoes it for 4 TP and no HP.
    const s1 = makeBattle([hero(), P('noel')], [foe()], { round: 1, echo: rec });
    const e = resolveRound(s1, { hero: { kind: 'echo', target: 'e0', rec } }, constRng(0.5));
    const hit = e.log.reduce((a, x) => a + (x.type === 'damage' && x.target === 'hero' ? x.amount : 0), 0);
    expect([e.party[0].tp, e.party[0].hp]).toEqual([99 - 4, 300 - hit]);
  });

  it('echo of a twin-cast skill is one cast at the single price', () => {
    const noel = P('noel', { runes: { 'fire-star': [twin] } });
    const r = resolveRound(makeBattle([hero(), noel], [foe()]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(r.party[1].tp).toBe(99 - 8);
    const rec = echoOf(r)!;
    expect([rec.cost, rec.def.tp]).toEqual([4, 4]);
    expect(rec.def.runeRules?.twice).toBeUndefined();
    // Her TP discount counts once, on the plain price: 4 at -25% is 3.
    const cheap = P('noel', { runes: { 'fire-star': [twin] }, x: { tpCost: 25 } });
    const c = resolveRound(makeBattle([hero(), cheap], [foe()]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(c.party[1].tp).toBe(99 - 6);
    expect(echoOf(c)!.cost).toBe(3);
  });
});

describe("the hero's echo and step ⑧ (plan 8h Task 2)", () => {
  const sync = { id: 'sync', tier: 'legendary' } as const;
  const pierce = (SKILLS.pierce.effects[0] as { power: number }).power;   // 170
  /** Round 1: Noel (fastest) casts her fire star with 同步, then Chizuru her 貫槍; round 2: the hero echoes it. */
  const fight = (noelRunes: boolean, extra: Partial<BattleState> = {}) => {
    const noel = P('noel', { max: { ...MAX, spd: 90 }, ...(noelRunes ? { runes: { 'fire-star': [sync] } } : {}) });
    const chizuru = P('chizuru', { max: { ...MAX, spd: 80 } });
    const s0 = makeBattle([hero(), noel, chizuru], [foe()], extra);
    const r1 = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, chizuru: { kind: 'skill', skill: 'pierce', target: 'e0' } }, constRng(0.5));
    const r2 = resolveRound(r1, { hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    return { r1, r2 };
  };
  const heroHits = (r: BattleState) => r.log.filter((e, i) => e.type === 'damage' && r.log.slice(0, i).some((x) => x.type === 'act' && x.actor === 'hero')).map((e) => (e as { amount: number }).amount);

  it('the echo does not copy a sync', () => {
    const { r1, r2 } = fight(true);
    // Chizuru's 貫槍 was lifted 30% (her hit is bigger than without the sync) ...
    const chizuruHit = (r: BattleState) => (r.log.find((e, i) => e.type === 'damage' && r.log.slice(0, i).some((x) => x.type === 'act' && x.actor === 'chizuru')) as { amount: number }).amount;
    expect(chizuruHit(r1)).toBeGreaterThan(chizuruHit(fight(false).r1));
    // ... but the record is 貫槍 as she would have cast it with no sync: 170, and the echo 119.
    expect((echoOf(r1)!.def.effects[0] as { power: number }).power).toBe(pierce);
    expect((echoDef(echoOf(r1)!).effects[0] as { power: number }).power).toBe(119);
    const spec = { power: 119, element: 'phys', scale: 'atk', melee: true } as const;
    expect(heroHits(r2)).toEqual([hitAmount(hero(), foe(), spec, { variance: 1, crit: false, blocked: false }).amount]);
  });

  it('the echo keeps a duet but not a sync', () => {
    // A duet (20%) stands over the round as well, Noel's own (so her fire star leaves it for Chizuru): the record keeps
    // the duet's lift only.
    const { r1 } = fight(true, { duet: { pct: 20, by: 'noel' } });
    expect((echoOf(r1)!.def.effects[0] as { power: number }).power).toBe(pctOf(pierce, 120));
  });

  it('the echo never carries the abyss bonus', () => {
    // In an abyss fight (+20%) the echo of a plain skill lands at its record x 70%, nothing more.
    const rec = { by: 'chizuru', round: 1, def: SKILLS.pierce, cost: SKILLS.pierce.tp };
    const r = resolveRound(makeBattle([hero()], [foe()], { round: 1, echo: rec, abyss: 20 }), { hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    const spec = { power: pctOf(pierce, 70), element: 'phys', scale: 'atk', melee: true } as const;
    expect(heroHits(r)).toEqual([hitAmount(hero(), foe(), spec, { variance: 1, crit: false, blocked: false }).amount]);
  });
});
