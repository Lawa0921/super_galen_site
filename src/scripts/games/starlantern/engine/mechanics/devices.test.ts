import { describe, expect, it } from 'vitest';
import { resolveRound, skillFor, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { newLedger } from '../ledger';
import type { Device } from '../mech';
import { patchSkill, pctOf } from '../skills';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { POWERS } from '../../data/gear';
import { DEVICE, devicePower } from './devices';
import { initMechs, memberWords, whyNot } from './index';

const MAX = { hp: 200, tp: 99, atk: 40, def: 20, mag: 40, res: 20, spd: 1 };
const bobby = (devices: Device[] = [], over: Partial<Combatant> = {}) =>
  makeCombatant({ key: 'bobby', side: 'party', defId: 'bobby', mech: { kind: 'devices', devices, cap: DEVICE.cap }, max: MAX, ...over });
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, max: MAX, ...over });
/** A foe that hits for next to nothing. */
const foe = (key = 'e0', over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 99 }, ...over });
const dev = (kind: Device['kind'], over: Partial<Device> = {}): Device => ({ skill: kind, kind, power: 50, level: 1, turns: 3, ...over });
const devicesOf = (s: BattleState) => { const m = s.party.find((c) => c.key === 'bobby')!.mech; return m?.kind === 'devices' ? m.devices : null; };
const round = (s: BattleState, acts: Record<string, Action> = {}, rng = constRng(0.5)) => resolveRound(s, acts, rng);
const acts = (s: BattleState, label: string) => s.log.filter((e) => e.type === 'act' && e.actor === 'bobby' && e.label === label).length;

describe("Bobby's devices", () => {
  it('a device runs at every round end, and a second of the same kind upgrades it', () => {
    let s = round(makeBattle([bobby()], [foe()]), { bobby: { kind: 'skill', skill: 'turret' } });
    const tp = (SKILLS.turret.effects[0] as { power: number }).power;
    expect(devicesOf(s)).toEqual([{ skill: 'turret', kind: 'turret', power: tp, level: 1, turns: 2 }]);
    expect(acts(s, '砲台')).toBe(1);
    expect(s.log.some((e) => e.type === 'damage' && e.target === 'e0')).toBe(true);
    s = round(s, { bobby: { kind: 'skill', skill: 'turret' } });
    expect(devicesOf(s)).toEqual([{ skill: 'turret', kind: 'turret', power: tp, level: 2, turns: 2 }]);
    expect(devicePower(s.party[0], devicesOf(s)![0])).toBe(Math.round(tp * 1.25));
    s = round(s, { bobby: { kind: 'skill', skill: 'turret' } });
    s = round(s, { bobby: { kind: 'skill', skill: 'turret' } });
    expect(devicesOf(s)![0].level).toBe(DEVICE.maxLevel);
  });

  it('two at most; a third kind replaces the one closest to running out (the older on a tie)', () => {
    const s = round(makeBattle([bobby([dev('turret', { turns: 3 }), dev('mine', { skill: 'shock-mine', turns: 1 })])], [foe()]), { bobby: { kind: 'skill', skill: 'barrier' } });
    expect(devicesOf(s)!.map((d) => [d.kind, d.turns])).toEqual([['turret', 2], ['shield', 2]]);
    const tie = round(makeBattle([bobby([dev('turret', { turns: 2 }), dev('mine', { skill: 'shock-mine', turns: 2 })])], [foe()]), { bobby: { kind: 'skill', skill: 'barrier' } });
    expect(tie.log.filter((e) => e.type === 'act' && e.actor === 'bobby').map((e) => e.type === 'act' && e.label)).toEqual(['護盾產生器', '地雷', '護盾產生器']);
    expect(devicesOf(tie)!.map((d) => d.kind)).toEqual(['mine', 'shield']);
  });

  it('the drone heals, the generator shields, the lowest first; the ledger credits Bobby', () => {
    const l = newLedger();
    const heal = (power: number, c: Combatant) => Math.floor((power / 100) * (c.max.mag * 2 + 10));
    const s0 = makeBattle([bobby([dev('drone', { skill: 'repair-drone', power: 45 }), dev('shield', { skill: 'barrier', power: 40 })]), P('noel', { hp: 50 }), P('selene', { hp: 120 })], [foe('e0', { sleep: 9 })]);
    const r = resolveRound(s0, {}, constRng(0.5), l);
    const b = s0.party[0];
    expect(r.party[1].hp).toBe(50 + heal(45, b));
    expect(r.party[1].shield).toEqual({ amount: heal(40, b), src: 'bobby' });
    expect(r.party[2].hp).toBe(120);
    expect(l.by.bobby.healing).toBe(heal(45, b));
    // On a shield already there the bigger amount stays, and Bobby's generator becomes its source (plan 8c Task 6).
    const big = round(makeBattle([bobby([dev('shield', { skill: 'barrier', power: 40 })]), P('noel', { hp: 50, shield: { amount: 999, src: 'chizuru' } })], [foe('e0', { sleep: 9 })]));
    expect(big.party[1].shield).toEqual({ amount: 999, src: 'bobby' });
  });

  it('the coil shocks at thirty percent (a boss at half)', () => {
    const shocked = (v: number, boss = false) => {
      const r = resolveRound(makeBattle([bobby([dev('coil', { skill: 'tesla-coil', power: 60 })])], [foe('e0', { sleep: 9, boss })]), {}, constRng(v));
      return (r.enemies[0].shock ?? 0) > 0;
    };
    expect([shocked(0.29), shocked(0.31)]).toEqual([true, false]);
    expect([shocked(0.14, true), shocked(0.16, true)]).toEqual([true, false]);
    // The mine strikes every foe with thunder.
    const r = round(makeBattle([bobby([dev('mine', { skill: 'shock-mine', power: 35 })])], [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9 })]));
    expect(r.log.filter((e) => e.type === 'damage' && e.element === 'thunder').map((e) => e.type === 'damage' && e.target)).toEqual(['e0', 'e1']);
  });

  it('overclock runs every device once more; the full overhaul raises them all and cures the party', () => {
    const s = round(makeBattle([bobby([dev('turret', { turns: 3 }), dev('mine', { skill: 'shock-mine', turns: 3 })])], [foe('e0', { sleep: 9 })]), { bobby: { kind: 'skill', skill: 'overclock' } });
    expect([acts(s, '砲台'), acts(s, '地雷')]).toEqual([2, 2]);
    expect(devicesOf(s)!.map((d) => d.turns)).toEqual([2, 2]);
    const t = round(makeBattle([bobby([dev('turret', { turns: 2, level: 3 }), dev('mine', { skill: 'shock-mine', turns: 1 })]), P('noel', { poison: true })], [foe('e0', { sleep: 9 })]),
      { bobby: { kind: 'skill', skill: 'emergency-repair' } });
    expect(devicesOf(t)!.map((d) => [d.level, d.turns])).toEqual([[3, 4], [2, 3]]);
    expect(t.party[1].poison).toBe(false);
  });

  it('the memory blueprint is +30% to every device', () => {
    expect(devicePower(bobby([], { keystones: ['blueprint'] }), dev('drone', { power: 45 }))).toBe(Math.round(45 * 1.3));
    expect(devicePower(bobby([], { keystones: ['blueprint'] }), dev('turret', { power: 70, level: 2 }))).toBe(Math.round(70 * 1.25 * 1.3));
  });

  it('legendary and tree rewrites still reach the turret', () => {
    const tp = (SKILLS.turret.effects[0] as { power: number }).power;
    expect(patchSkill(SKILLS.turret, POWERS['lg-bobby'].mod).effects).toEqual([{ kind: 'device', device: 'turret', power: tp, turns: 5 }]);
    // 雙管 at rank 2 (plan 8d Task 8): two barrels, each 60% of the turret's power.
    expect(skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-twin': 2 } }, 'turret')!.effects).toEqual([{ kind: 'device', device: 'turret', power: Math.round(tp * 0.6), turns: 3, hits: 2 }]);
  });

  it('when Bobby falls his devices go, and nothing runs', () => {
    const s0 = makeBattle([bobby([dev('turret')], { hp: 1 }), P('noel')], [foe('e0', { max: { hp: 99999, tp: 0, atk: 400, def: 20, mag: 1, res: 20, spd: 99 } })], { intents: { e0: { kind: 'attack', target: 'bobby' } } });
    const r = round(s0);
    expect(r.party[0].alive).toBe(false);
    expect(devicesOf(r)).toEqual([]);
    expect(acts(r, '砲台')).toBe(0);
  });

  it("Bobby's words: each device, its level and rounds; a shield's amount on whoever holds it", () => {
    const s = makeBattle([bobby([dev('turret', { level: 2, turns: 3 }), dev('shield', { skill: 'barrier', turns: 1 })]), P('noel', { shield: { amount: 12, src: 'bobby' } })], [foe()]);
    // Two characters a name, then its level and its rounds: two devices and an ailment fit one row (plan 8c final).
    expect(memberWords(s, s.party[0])).toEqual([{ tone: 'devices', text: '砲台2・3' }, { tone: 'devices', text: '盾機1・1' }]);
    expect(memberWords(s, s.party[1])).toEqual([{ tone: 'devices', text: '護盾12' }]);
  });

  it('超頻 with no device out is greyed with its reason; with one it is not', () => {
    const s = makeBattle([bobby()], [foe()]);
    expect(whyNot(s, s.party[0], SKILLS.overclock)).toBe('沒有裝置');
    const t = makeBattle([bobby([dev('turret')])], [foe()]);
    expect(whyNot(t, t.party[0], SKILLS.overclock)).toBeNull();
    // Only 超頻: a device skill or 全面整備 (it cures too) is never greyed for it.
    expect(whyNot(s, s.party[0], SKILLS.turret)).toBeNull();
    expect(whyNot(s, s.party[0], SKILLS['emergency-repair'])).toBeNull();
  });

  it('devices draw only what the old turret drew', () => {
    const draws = (devices: Device[]) => {
      let n = 0;
      resolveRound(makeBattle([bobby(devices)], [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9 })]), {}, () => { n++; return 0.5; });
      return n;
    };
    // The drone and the shield draw nothing; the turret picks its target and rolls its hit as before.
    expect(draws([dev('drone', { skill: 'repair-drone' }), dev('shield', { skill: 'barrier' })])).toBe(draws([]));
  });
});

describe("Bobby's nodes (plan 8d Task 8)", () => {
  const TURRET = (SKILLS.turret.effects[0] as { power: number }).power;
  const withRanks = (ranks: Record<string, number>, devices: Device[] = [], over: Partial<Combatant> = {}) => bobby(devices, { ranks, ...over });
  const cast = (s: BattleState, skill: string, rng = constRng(0.5)) => round(s, { bobby: { kind: 'skill', skill } }, rng);
  const draws = (devices: Device[]) => {
    let n = 0;
    resolveRound(makeBattle([bobby(devices)], [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9 })]), {}, () => { n++; return 0.5; });
    return n;
  };

  it('a twin barrel fires twice, a hit roll each, at the variant power', () => {
    const s = cast(makeBattle([withRanks({ turret: 1, 'bobby-turret-twin': 1 })], [foe('e0', { sleep: 9 })]), 'turret');
    expect(devicesOf(s)).toEqual([{ skill: 'turret', kind: 'turret', power: pctOf(TURRET, 55), level: 1, turns: 2, hits: 2 }]);
    expect(s.log.filter((e) => e.type === 'damage' && e.target === 'e0')).toHaveLength(2);
    // One pick for the target, then each barrel's hit rolls its own variance (no crit, no block here).
    expect(draws([dev('turret', { hits: 2 })]) - draws([dev('turret')])).toBe(1);
  });

  it('mass production upgrades past three; without it three is the top', () => {
    const top = (ranks: Record<string, number>) => {
      let s = makeBattle([withRanks({ turret: 1, ...ranks })], [foe('e0', { sleep: 9 })]);
      for (let i = 0; i < 7; i++) s = cast(s, 'turret');
      return devicesOf(s)![0].level;
    };
    expect(top({})).toBe(DEVICE.maxLevel);
    expect(top({ 'bobby-mass': 1 })).toBe(4);
    expect(top({ 'bobby-mass': 3 })).toBe(6);
    // 全面整備 raises to the same cap.
    const t = round(makeBattle([withRanks({ 'emergency-repair': 1, 'bobby-mass': 1 }, [dev('turret', { level: 3 })])], [foe('e0', { sleep: 9 })]), { bobby: { kind: 'skill', skill: 'emergency-repair' } });
    expect(devicesOf(t)![0].level).toBe(4);
  });

  it('the bench holds three', () => {
    const held = (ranks: Record<string, number>) => {
      const s = makeBattle([withRanks({ 'repair-drone': 1, ...ranks })], [foe('e0', { sleep: 9 })]);
      initMechs(s);
      devicesOf(s)!.push(dev('turret', { turns: 5 }), dev('mine', { skill: 'shock-mine', turns: 5 }));
      return devicesOf(cast(s, 'repair-drone'))!.map((d) => d.kind);
    };
    // Two slots: the drone takes the turret's (closest to running out, the older on a tie).
    expect(held({})).toEqual(['mine', 'drone']);
    expect(held({ 'bobby-bench': 1 })).toEqual(['turret', 'mine', 'drone']);
  });

  it('two turrets with the pair node: the second is a new one, the third cast upgrades the one closest to running out', () => {
    let s = makeBattle([withRanks({ turret: 1, 'bobby-turret-pair': 1 })], [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9 })]);
    s = cast(s, 'turret');
    s = cast(s, 'turret');
    // 雙砲台's turrets last five rounds (3 + 2).
    expect(devicesOf(s)!.map((d) => [d.kind, d.level, d.turns])).toEqual([['turret', 1, 3], ['turret', 1, 4]]);
    s = cast(s, 'turret');
    expect(devicesOf(s)!.map((d) => [d.kind, d.level, d.turns])).toEqual([['turret', 2, 4], ['turret', 1, 3]]);
    // Without the node a second cast is an upgrade, as before.
    let t = makeBattle([withRanks({ turret: 1 })], [foe('e0', { sleep: 9 })]);
    t = cast(cast(t, 'turret'), 'turret');
    expect(devicesOf(t)!.map((d) => d.level)).toEqual([2]);
    // Each turret picks its own target: two turrets draw one pick more than one.
    expect(draws([dev('turret'), dev('turret')]) - draws([dev('turret')])).toBe(draws([dev('turret')]) - draws([]));
  });

  it('with two turrets out, a cast upgrades the one closest to running out, the newer one too; on a tie the older (8d Task 8 review)', () => {
    const two = (a: number, b: number) => devicesOf(cast(makeBattle([withRanks({ turret: 1, 'bobby-turret-pair': 1 }, [dev('turret', { turns: a }), dev('turret', { turns: b })])],
      [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9 })]), 'turret'))!.map((d) => [d.level, d.turns]);
    // The newer (second) has 2 rounds left, the older 4: the newer is upgraded (its rounds start again at 5, 4 after the round).
    expect(two(4, 2)).toEqual([[1, 3], [2, 4]]);
    expect(two(2, 4)).toEqual([[2, 4], [1, 3]]);
    expect(two(3, 3)).toEqual([[2, 4], [1, 2]]);
  });

  it('with the pair node and both slots taken by other devices, the second turret upgrades the first', () => {
    const s = cast(makeBattle([withRanks({ turret: 1, 'bobby-turret-pair': 1 }, [dev('turret', { turns: 3 }), dev('mine', { skill: 'shock-mine', turns: 3 })])], [foe('e0', { sleep: 9 })]), 'turret');
    expect(devicesOf(s)!.map((d) => [d.kind, d.level])).toEqual([['turret', 2], ['mine', 1]]);
  });

  it('the aid drone cures: rank 1 poison only, rank 2 poison, burn and bleed, rank 3 every ailment', () => {
    const sick = () => P('noel', { hp: 50, poison: true, burn: { tick: 3, turns: 3, src: 'e0' }, bleed: [{ tick: 2, turns: 3, src: 'e0' }], shock: 2 });
    const after = (rank: number) => {
      let s = makeBattle([withRanks({ 'repair-drone': 1, 'bobby-drone-aid': rank }), sick()], [foe('e0', { sleep: 9 })]);
      s = cast(s, 'repair-drone');
      const n = s.party[1];
      return { poison: n.poison, burn: !!n.burn, bleed: !!n.bleed, shock: !!n.shock };
    };
    expect(after(1)).toEqual({ poison: false, burn: true, bleed: true, shock: true });
    expect(after(2)).toEqual({ poison: false, burn: false, bleed: false, shock: true });
    expect(after(3)).toEqual({ poison: false, burn: false, bleed: false, shock: false });
    // Without the node the drone only heals.
    const plain = cast(makeBattle([withRanks({ 'repair-drone': 1 }), sick()], [foe('e0', { sleep: 9 })]), 'repair-drone');
    expect(plain.party[1].poison).toBe(true);
  });

  it('the chain mine shocks each foe it hits by its chance; without it the mine draws nothing more', () => {
    const shocked = (v: number) => {
      const r = resolveRound(makeBattle([bobby([dev('mine', { skill: 'shock-mine', power: 35, shock: 0.2 })])], [foe('e0', { sleep: 9 })]), {}, constRng(v));
      return (r.enemies[0].shock ?? 0) > 0;
    };
    expect([shocked(0.19), shocked(0.21)]).toEqual([true, false]);
    const s = cast(makeBattle([withRanks({ 'shock-mine': 1, 'bobby-mine-chain': 2 })], [foe('e0', { sleep: 9 })]), 'shock-mine');
    expect(devicesOf(s)![0].shock).toBe(0.3);
    // A variance a foe for the strike; the chain's chance draws once more a foe hit, and only with the node.
    expect(draws([dev('mine', { skill: 'shock-mine' })]) - draws([])).toBe(2);
    expect(draws([dev('mine', { skill: 'shock-mine', shock: 0.2 })]) - draws([])).toBe(4);
  });

  it("the words give the real shot with both variants: 雙砲台's points are added to 雙管's percent (8d Task 8 review)", () => {
    const both = skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-twin': 2, 'bobby-turret-pair': 1 } }, 'turret')!;
    expect((both.effects[0] as { power: number }).power).toBe(pctOf(TURRET, 140));
    expect(both.desc).toContain(`每下威力 ${T.mult(140)}`);
    expect(both.desc).not.toContain(`威力 ${T.mult(60)}`);
    expect(both.desc).toContain('+80 個百分點');
    // Each alone says its own number.
    expect(skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-twin': 2 } }, 'turret')!.desc).toContain(`每下威力 ${T.mult(60)}`);
    expect(skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-pair': 1 } }, 'turret')!.desc).toContain('+80 個百分點');
  });

  it('the turret variants keep their names whole: 設置砲台・雙管・雙砲台', () => {
    const def = skillFor({ powers: [], ranks: { turret: 1, 'bobby-turret-twin': 1, 'bobby-turret-pair': 1 } }, 'turret')!;
    expect(def.name).toBe('設置砲台・雙管・雙砲台');
    expect(def.effects).toEqual([{ kind: 'device', device: 'turret', power: pctOf(TURRET, 55 + 80), turns: 5, hits: 2, twin: true }]);
  });
});
