import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Effect, SkillDef, UltimateDef } from '../engine/types';
import { SKILLS } from './skills';
import { HERO_ULTIMATES, RIN_DAWN, ULTIMATES } from './ultimates';

/**
 * The roster as it stood after plan 8b (engine/__fixtures__/roster-8b.json, recorded once at 8c Task 1): every skill,
 * every ultimate, every legendary power and each tree's shape. Plan 8c reshapes the companions' 84 skills into
 * 54 kept / 15 changed / 15 replaced (spec §8); this file holds the kept ones, the hero's and the ultimates in place.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', '__fixtures__', 'roster-8b.json');

interface Roster {
  SKILLS: Record<string, SkillDef>;
  ULTIMATES: Record<string, UltimateDef>;
  RIN_DAWN: UltimateDef;
  HERO_ULTIMATES: UltimateDef[];
  POWERS: Record<string, unknown>;
  trees: Record<string, { id: string; maxRank: number }[][]>;
}

/** Spec §8: the 54 companion skills marked 保留, character by character. */
const KEPT: readonly string[] = [
  // Noel
  'fire-star', 'flame-wave', 'inferno', 'ice-star', 'frost-bind', 'blizzard', 'thunder-star', 'judgement',
  // Chizuru
  'sweep', 'spiral-spear', 'thousand-spear', 'pierce', 'heaven-spear',
  // Liz
  'twin-slash', 'stealth', 'treasure-sense', 'quickstep', 'phantom-step', 'smoke-bomb',
  // Sylvie
  'aimed-shot', 'heart-shot', 'arrow-rain',
  // Scarlet
  'provoke', 'unbreakable', 'flame-burst', 'blaze-ring', 'crimson-end', 'iron-wall',
  // Selene
  'moonlight', 'moon-rain', 'full-moon', 'cleanse', 'rebirth', 'dream', 'moon-arrow', 'lunar-eclipse',
  // Safira
  'blade-dance', 'sand-cyclone', 'thousand-shadows', 'war-dance', 'desert-festival', 'mirage', 'shadow-step',
  // Bobby
  'turret', 'cannon', 'tinker',
  // Rin
  'rin-needle', 'rin-fan', 'rin-venom-needle', 'rin-storm', 'rin-backstab', 'rin-shadowless', 'rin-execute', 'rin-deathblow',
];

/**
 * A kept skill whose effects are rewritten in a mechanic's form (plan 8c ruling 4), by id: what they must be instead of
 * the recorded ones. Task 6 adds `turret: [{ kind: 'device', device: 'turret', power: 70, turns: 3 }]`.
 */
const KEPT_EFFECT_EXCEPTIONS: Record<string, Effect[]> = {};

/** Every number read only for its sign: a kept skill may be retuned (controller ruling 1), never turned around. */
const shape = (v: unknown): unknown =>
  typeof v === 'number' ? Math.sign(v)
    : Array.isArray(v) ? v.map(shape)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
        : v;

/** What a kept skill is: its name, owner and target, each effect's kind, element, scale and the like, and its passive. */
const identity = (d: SkillDef, effects: Effect[] = d.effects) =>
  ({ name: d.name, owner: d.owner, target: d.target, effects: shape(effects), passive: shape(d.passive) });

const strict = (d: SkillDef) => ({ name: d.name, owner: d.owner, tp: d.tp, hpCost: d.hpCost, target: d.target, effects: d.effects });

describe('the roster against plan 8b', () => {
  const roster = (): Roster => {
    expect(existsSync(FIXTURE), `${FIXTURE} is recorded at plan 8c Task 1`).toBe(true);
    return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Roster;
  };

  it("the 54 kept companion skills, the hero's 21 and every ultimate stay as they were", () => {
    const r = roster();
    const companions = Object.values(r.SKILLS).filter((d) => d.owner !== 'hero');
    expect(companions).toHaveLength(84);
    expect(new Set(KEPT).size).toBe(54);
    for (const id of KEPT) {
      const was = r.SKILLS[id];
      expect(was?.owner, id).not.toBe('hero');
      expect(SKILLS[id], id).toBeDefined();
      const exception = KEPT_EFFECT_EXCEPTIONS[id];
      if (exception) expect(SKILLS[id].effects, id).toEqual(exception);
      expect(identity(SKILLS[id], exception ? was.effects : SKILLS[id].effects), id).toEqual(identity(was));
    }
    const hero = Object.values(r.SKILLS).filter((d) => d.owner === 'hero');
    expect(hero).toHaveLength(21);
    expect(Object.values(SKILLS).filter((d) => d.owner === 'hero').map((d) => d.id)).toEqual(hero.map((d) => d.id));
    for (const d of hero) expect(strict(SKILLS[d.id]), d.id).toEqual(strict(d));
    expect(ULTIMATES).toEqual(r.ULTIMATES);
    expect(RIN_DAWN).toEqual(r.RIN_DAWN);
    expect(HERO_ULTIMATES).toEqual(r.HERO_ULTIMATES);
  });

  it('a retuned number passes, a changed identity does not', () => {
    const was = SKILLS['fire-star'];
    const damage = was.effects[0];
    expect(damage.kind).toBe('damage');
    const retuned = { ...was, tp: was.tp + 1, effects: [{ ...damage, power: 999 }] } as SkillDef;
    expect(identity(retuned)).toEqual(identity(was));
    expect(identity({ ...was, effects: [{ ...damage, element: 'ice' }] } as SkillDef)).not.toEqual(identity(was));
    expect(identity({ ...was, target: 'enemies' })).not.toEqual(identity(was));
    expect(identity({ ...was, name: '火' })).not.toEqual(identity(was));
  });
});
