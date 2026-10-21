import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { constRng, fullParty, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castCost, castDef, fieldWords } from './index';
import { MOON, type MoonPhase } from './moon';

const selene = (over: Partial<Combatant> = {}) => makeCombatant({
  key: 'selene', side: 'party', defId: 'selene', max: { hp: 200, tp: 99, atk: 20, def: 20, mag: 40, res: 20, spd: 50 }, ...over,
});
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over });
const foe = () => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } });
const at = (phase: MoonPhase, extra: Partial<BattleState> = {}) => makeBattle([selene(), P('noel')], [foe()], { moon: { phase }, ...extra });
const round = (s: BattleState, acts: Record<string, Action> = {}) => resolveRound(s, acts, constRng(0.5));
const first = (def: { effects: { kind: string }[] }) => def.effects[0] as { power?: number; chance?: number };

describe("Selene's moon", () => {
  it('the moon turns each round, from the first quarter, only with Selene there', () => {
    const party = fullParty(['hero', 'rin', 'chizuru', 'noel', 'selene']);
    let s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(s.moon).toEqual({ phase: 'first' });
    const seen: MoonPhase[] = [];
    for (let i = 0; i < 4; i++) { s.enemies[0].hp = 99999; s.enemies[0].max.hp = 99999; s.enemies[0].sleep = 9; s = round(s, Object.fromEntries(s.party.map((c) => [c.key, { kind: 'defend' }]))); seen.push(s.moon!.phase); }
    expect(seen).toEqual(['full', 'waning', 'new', 'first']);
    expect(MOON.order).toEqual(['first', 'full', 'waning', 'new']);
    const without = createBattle({ party: fullParty(['hero', 'rin', 'chizuru', 'noel']), enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(without.moon).toBeUndefined();
  });

  it('each phase helps only Selene', () => {
    expect(first(castDef(at('full'), selene(), SKILLS.moonlight)).power).toBe(Math.round((120 * (100 + MOON.pct)) / 100));
    expect(first(castDef(at('full'), P('hero'), SKILLS.moonlight)).power).toBe(120);   // not hers: unchanged
    expect(first(castDef(at('first'), selene(), SKILLS.moonlight)).power).toBe(120);
    expect(first(castDef(at('waning'), selene(), SKILLS['moon-arrow'])).power).toBe(Math.round((155 * (100 + MOON.pct)) / 100));   // 月影箭 155 (8d Task 5)
    expect(first(castDef(at('new'), selene(), SKILLS.dream)).chance).toBeCloseTo(Math.min(1, 0.6 * (1 + MOON.pct / 100)), 10);
    expect(castCost(at('first'), selene(), 'moon-rain')).toBe(Math.ceil((9 * (100 - MOON.pct)) / 100));
    expect(castCost(at('full'), selene(), 'moon-rain')).toBe(9);
    expect(castCost(at('first'), P('hero'), 'moon-rain')).toBe(9);
    expect(castCost(at('first'), selene(), 'moon-recall')).toBe(0);
    // No moon (a bare test fight): nothing changes.
    expect(castDef(makeBattle([selene()], [foe()]), selene(), SKILLS.moonlight)).toBe(SKILLS.moonlight);
  });

  it('recall steps the moon back and ends a held full moon', () => {
    const cast = (skill: string): Record<string, Action> => ({ selene: { kind: 'skill', skill } });
    // At full: recall → first quarter, and the round's end turns it to full again (that phase stays a round longer).
    const recalled = round(at('full'), cast('moon-recall'));
    expect(recalled.moon).toEqual({ phase: 'full' });
    expect(recalled.log.some((e) => e.type === 'act' && e.label === SKILLS['moon-recall'].name)).toBe(true);
    // Full-moon night: full, held through 3 round ends, then on to the waning moon.
    let s = round(at('new'), cast('full-moon-night'));
    const phases = [s.moon!.phase];
    for (let i = 0; i < 3; i++) { s = round(s); phases.push(s.moon!.phase); }
    expect(phases).toEqual(['full', 'full', 'full', 'waning']);
    // A recall while it is held ends the hold.
    const held = round(round(at('new'), cast('full-moon-night')), cast('moon-recall'));
    expect(held.moon).toEqual({ phase: 'full' });   // back to first quarter, then the round's end moves on
  });

  it('the tide deepens every phase (plan 8d Task 5, 盈月)', () => {
    const tide = (phase: MoonPhase) => { const c = selene({ ranks: { 'selene-tide': 1 } }); return { s: makeBattle([c, P('noel')], [foe()], { moon: { phase } }), c }; };
    expect(MOON.pct).toBe(30);
    const full = tide('full');
    expect(first(castDef(full.s, full.c, SKILLS.moonlight)).power).toBe(168);          // pctOf(120, 140)
    const nu = tide('new');
    expect(first(castDef(nu.s, nu.c, SKILLS.dream)).chance).toBeCloseTo(0.84, 10);     // 0.6 x 1.4
    const fq = tide('first');
    expect(castCost(fq.s, fq.c, 'moon-rain')).toBe(6);                                 // ceil(9 x 0.6)
    const wan = tide('waning');
    expect(first(castDef(wan.s, wan.c, SKILLS['moon-arrow'])).power).toBe(217);        // pctOf(155, 140)
    // Its higher ranks deepen it further; without it every phase is the 30% it was.
    const t3 = selene({ ranks: { 'selene-tide': 3 } });
    expect(first(castDef(makeBattle([t3], [foe()], { moon: { phase: 'full' } }), t3, SKILLS.moonlight)).power).toBe(192);   // pctOf(120, 160)
    expect(castCost(makeBattle([t3], [foe()], { moon: { phase: 'first' } }), t3, 'moon-rain')).toBe(4);                      // ceil(9 x 0.4)
    expect(first(castDef(at('full'), selene(), SKILLS.moonlight)).power).toBe(156);
  });

  it('the new-moon night holds the new moon (plan 8d Task 5, 新月之夜)', () => {
    const night = selene({ ranks: { 'full-moon-night': 1, 'selene-new-night': 1 } });
    let s = round(makeBattle([night, P('noel')], [foe()], { moon: { phase: 'full' } }), { selene: { kind: 'skill', skill: 'full-moon-night' } });
    const phases = [s.moon!.phase];
    for (let i = 0; i < 3; i++) { s = round(s); phases.push(s.moon!.phase); }
    expect(phases).toEqual(['new', 'new', 'new', 'first']);
    // Its ranks hold it longer: 4 round ends at rank 2.
    const two = selene({ ranks: { 'full-moon-night': 1, 'selene-new-night': 2 } });
    let s2 = round(makeBattle([two], [foe()], { moon: { phase: 'waning' } }), { selene: { kind: 'skill', skill: 'full-moon-night' } });
    const p2 = [s2.moon!.phase];
    for (let i = 0; i < 4; i++) { s2 = round(s2); p2.push(s2.moon!.phase); }
    expect(p2).toEqual(['new', 'new', 'new', 'new', 'first']);
  });

  it('the field bar names the barrier and the moon', () => {
    const s = at('full', { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 3, src: 'chizuru' }] });
    expect(fieldWords(s).map((w) => w.text)).toEqual(['守之結界3', '月相：滿月→下弦']);
    const boosted = at('new', { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru', boost: 2 }] });
    expect(fieldWords(boosted).map((w) => w.text)).toEqual(['守之結界・加倍2', '月相：新月→上弦']);
    const purify = makeBattle([selene()], [foe()], { barriers: [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 2, src: 'chizuru' }] });
    expect(fieldWords(purify).map((w) => [w.tone, w.text])).toEqual([['purify', '淨之結界2']]);
    expect(fieldWords(makeBattle([selene()], [foe()]))).toEqual([]);
  });
});
