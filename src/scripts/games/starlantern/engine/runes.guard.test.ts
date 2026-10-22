import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUNES, RUNE_NUMBERS, tiersOf, type RuneId, type RuneRef } from '../data/runes';
import { SKILLS } from '../data/skills';
import { CHARACTER_IDS } from '../data/characters';
import { T } from '../data/text.zh-TW';
import { fromMember, resolveRound, skillFor, type BattleState } from './battle';
import type { BattleEvent } from './combatant';
import { applyLasting } from './mechanics/runes';
import { runeStates } from './runes';
import { encounterTable } from './scaling';
import { kitParty, partyAt, setSimTrace, simBattle } from './sim';
import { constRng, makeBattle, makeCombatant } from './testing';
import type { Effect, SkillDef } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const tierOf = (id: RuneId): RuneRef['tier'] => (tiersOf(id).includes('magic') ? 'magic' : 'legendary');

/** What a rune may change on a skill, by kind (the rune table's row). */
type Touch = 'target' | 'hits' | 'element' | 'power' | 'buff' | 'turns' | 'tp' | 'hp' | 'effects' | 'perHit' | 'overflow' | 'rules';

/** Each rune on an example skill it fits, and what it may change there. */
const TOUCHES: Record<RuneId, { skill: string; may: Touch[] }> = {
  spread: { skill: 'fire-star', may: ['target', 'power'] },
  focus: { skill: 'flame-wave', may: ['target', 'power'] },
  bounce: { skill: 'fire-star', may: ['rules'] },
  multistrike: { skill: 'twin-slash', may: ['hits', 'power'] },
  heavy: { skill: 'twin-slash', may: ['hits', 'power'] },
  flame: { skill: 'aimed-shot', may: ['element', 'power', 'tp'] },
  rime: { skill: 'aimed-shot', may: ['element', 'power', 'tp'] },
  thunderclap: { skill: 'aimed-shot', may: ['element', 'power', 'tp'] },
  ignite: { skill: 'fire-star', may: ['perHit'] },
  jolt: { skill: 'thunder-star', may: ['perHit'] },
  tear: { skill: 'aimed-shot', may: ['perHit'] },
  frostbite: { skill: 'ice-star', may: ['effects'] },
  venom: { skill: 'fire-star', may: ['effects'] },
  aftermath: { skill: 'fire-star', may: ['perHit', 'power', 'tp'] },
  'on-crit': { skill: 'fire-star', may: ['rules'] },
  'on-kill': { skill: 'fire-star', may: ['rules'] },
  'on-struck': { skill: 'provoke', may: ['rules'] },
  regain: { skill: 'fire-star', may: ['perHit', 'power'] },
  thrift: { skill: 'fire-star', may: ['tp', 'power', 'buff'] },
  charge: { skill: 'fire-star', may: ['tp', 'power', 'buff'] },
  drain: { skill: 'fire-star', may: ['perHit', 'tp'] },
  extend: { skill: 'iron-wall', may: ['turns', 'tp'] },
  share: { skill: 'iron-wall', may: ['target', 'buff'] },
  lasting: { skill: 'war-dance', may: ['rules'] },
  dispel: { skill: 'moonlight', may: ['effects', 'power', 'buff', 'tp'] },
  'armor-break': { skill: 'aimed-shot', may: ['perHit', 'power', 'buff', 'tp'] },
  'twin-cast': { skill: 'fire-star', may: ['tp', 'rules'] },
  starwheel: { skill: 'fire-star', may: ['tp', 'rules'] },
  'blood-price': { skill: 'fire-star', may: ['tp', 'hp', 'rules'] },
  sync: { skill: 'fire-star', may: ['rules'] },
  'spill-shield': { skill: 'moonlight', may: ['overflow'] },
  reprise: { skill: 'fire-star', may: ['rules'] },
};

/** The kinds of change from `a` to `b` (names and words aside). */
function touched(a: SkillDef, b: SkillDef): Touch[] {
  const out = new Set<Touch>();
  if (a.target !== b.target) out.add('target');
  if (a.tp !== b.tp) out.add('tp');
  if ((a.hpCost ?? 0) !== (b.hpCost ?? 0)) out.add('hp');
  if (JSON.stringify(a.runeRules ?? {}) !== JSON.stringify(b.runeRules ?? {})) out.add('rules');
  if (a.effects.map((e) => e.kind).join() !== b.effects.map((e) => e.kind).join()) out.add('effects');
  a.effects.forEach((x, i) => {
    const y = b.effects[i] as Effect | undefined;
    if (!y || y.kind !== x.kind) return;
    const X = x as Record<string, unknown>, Y = y as Record<string, unknown>;
    if (x.kind === 'damage') {
      if ((X.hits ?? 1) !== (Y.hits ?? 1)) out.add('hits');
      if (X.element !== Y.element) out.add('element');
      if (X.power !== Y.power) out.add('power');
      for (const k of ['onHit', 'aftermath', 'armorBreak', 'drainPct', 'tpPerHit']) if (JSON.stringify(X[k]) !== JSON.stringify(Y[k])) out.add('perHit');
    }
    if ((x.kind === 'heal' || x.kind === 'device' || x.kind === 'barrier') && X.power !== Y.power) out.add('power');
    if (x.kind === 'heal' && X.overflowPct !== Y.overflowPct) out.add('overflow');
    if (x.kind === 'buff' && X.pct !== Y.pct) out.add('buff');
    if ('turns' in x && X.turns !== Y.turns) out.add('turns');
  });
  return [...out].sort();
}

const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8');

describe('rune guards (plan 8e Task 8)', () => {
  it('the bands field no runes', () => {
    const files = [
      ...readdirSync(HERE).filter((f) => /^balance.*\.test\.ts$/.test(f)),
      'parity.ts', '../data/policies.ts',
    ];
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) expect(source(f).includes('runes:'), f).toBe(false);
    for (const level of [5, 10, 20, 35, 50]) {
      for (const p of [partyAt(level, { ids: [...CHARACTER_IDS] }), kitParty(level, 1, 1, undefined, 0, { ids: [...CHARACTER_IDS] })]) {
        for (const id of CHARACTER_IDS) {
          const m = p.roster[id];
          expect(m.sockets, `${id} Lv${level}`).toBeUndefined();
          expect(fromMember(m, 0).runes, `${id} Lv${level}`).toBeUndefined();
        }
      }
    }
  });

  it('the sim never sets off a rune', () => {
    const acts = [T.rune.again(''), T.rune.reprise('')];
    let rounds = 0;
    setSimTrace({
      round: (_a, before, after) => {
        rounds++;
        for (const c of before.party) {
          expect(c.runes, c.key).toBeUndefined();
          expect(c.auras, c.key).toBeUndefined();
        }
        expect(after.log.some((e) => e.type === 'trigger')).toBe(false);
        expect(after.log.some((e) => e.type === 'act' && acts.some((w) => e.label.endsWith(w)))).toBe(false);
        expect(after.sync ?? after.reprises ?? after.triggers).toBeUndefined();
      },
      end: () => {},
    });
    try {
      encounterTable('mainline', 9).forEach((g, i) => simBattle(partyAt(35), g, false, (i + 1) * 7919, { depth: 9, region: 'mainline' }));
    } finally { setSimTrace(null); }
    expect(rounds).toBeGreaterThan(0);
  });

  it('every rune does its one thing', () => {
    for (const id of Object.keys(RUNES) as RuneId[]) {
      const { skill, may } = TOUCHES[id];
      const ref: RuneRef = { id, tier: tierOf(id) };
      expect(runeStates(SKILLS[skill], [ref])[0].miss, `${id} fits ${skill}`).toBeNull();
      const plain = skillFor({ powers: [] }, skill)!;
      const worn = skillFor({ powers: [], runes: { [skill]: [ref] } }, skill)!;
      const did = touched(plain, worn);
      expect(did.length, `${id} changes nothing`).toBeGreaterThan(0);
      for (const t of did) expect(may, `${id} touches ${t}`).toContain(t);
    }
    // 常駐 in battle: the party's aura and her max TP.
    const dancer = makeCombatant({ key: 'safira', side: 'party', defId: 'safira', runes: { 'war-dance': [{ id: 'lasting', tier: 'magic' }] } });
    const s = makeBattle([dancer], []);
    applyLasting(s);
    expect([s.party[0].auras?.length, s.party[0].max.tp]).toEqual([1, 14]);
    // A trigger in battle: its line.
    const rin = makeCombatant({ key: 'rin', side: 'party', defId: 'rin', nextCrit: true, runes: { 'rin-needle': [{ id: 'on-crit', tier: 'magic' }] } });
    const foe = makeCombatant({ key: 'e0', side: 'enemy', frozen: true, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } });
    const r: BattleState = resolveRound(makeBattle([rin], [foe]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r.log.some((e: BattleEvent) => e.type === 'trigger')).toBe(true);
  });

  it('rune words name no number the table does not hold', () => {
    for (const id of Object.keys(RUNES) as RuneId[]) {
      const { tier, fixed } = RUNE_NUMBERS[id];
      tiersOf(id).forEach((t, i) => {
        const held = [...Object.values(tier).map((v) => v[i]), ...Object.values(fixed).map(Math.abs)];
        for (const n of (RUNES[id].text(t).match(/\d+/g) ?? []).map(Number)) expect(held, `${id}@${t}: ${n}`).toContain(n);
      });
    }
  });
});
