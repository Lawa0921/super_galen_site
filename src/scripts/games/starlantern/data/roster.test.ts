import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Effect, SkillDef, UltimateDef } from '../engine/types';
import { allArtUrls, art } from '../render/artPaths';
import { POWERS } from './gear';
import { SKILLS } from './skills';
import { NODES } from './trees';
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
 * the recorded ones: the turret is a device now (Task 6), for the same rounds; its power 70 → 38 is Task 6's parity
 * retune (controller ruling 1, retune.md).
 */
const KEPT_EFFECT_EXCEPTIONS: Record<string, Effect[]> = { turret: [{ kind: 'device', device: 'turret', power: 38, turns: 3 }] };

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

/** Spec §8: the 15 companion skills replaced by new ones (old id → new id), character by character. */
const REPLACED: Readonly<Record<string, string>> = {
  // Chizuru
  'sacred-sake': 'purify-ward', 'thunder-thrust': 'exorcism-thrust',
  // Selene
  blessing: 'moon-recall', sanctuary: 'full-moon-night',
  // Liz
  'triple-slash': 'pickpocket', 'shadow-flurry': 'jackpot', 'venom-edge': 'appraise',
  // Sylvie
  'snare-shot': 'sunder-arrow', 'fire-arrow': 'scatter-shot', 'storm-volley': 'deluge-volley',
  // Scarlet
  'guardian-roar': 'cover', fortress: 'atoning-flame',
  // Safira
  'veil-dance': 'clap', sirocco: 'mirage-step',
  // Bobby
  'repair-kit': 'repair-drone',
};

describe('the converged roster (plan 8c Task 7)', () => {
  const roster = (): Roster => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Roster;
  const companions = () => Object.values(SKILLS).filter((d) => d.owner !== 'hero');

  it('84 companion skills: 54 kept, 15 changed, 15 replaced', () => {
    const r = roster();
    const old = Object.values(r.SKILLS).filter((d) => d.owner !== 'hero');
    expect(Object.keys(REPLACED)).toHaveLength(15);
    for (const [was, now] of Object.entries(REPLACED)) {
      expect(r.SKILLS[was]?.owner, was).toBeDefined();
      expect(SKILLS[was], `${was} is gone`).toBeUndefined();
      expect(SKILLS[now]?.owner, now).toBe(r.SKILLS[was].owner);
      expect(allArtUrls(), `${now} has its icon (art step 9)`).toContain(art.skillIcon(now, 16));
    }
    // The changed ones: every other old companion skill, still there under its id, its identity, its mechanic tag or its
    // words not as recorded (星墜一矢 keeps its effects and gains the aim it spends).
    const changed = old.filter((d) => !KEPT.includes(d.id) && !(d.id in REPLACED));
    expect(changed).toHaveLength(15);
    const concept = (d: SkillDef) => ({ ...identity(d), mech: d.mech, desc: d.desc });
    for (const d of changed) {
      expect(SKILLS[d.id]?.owner, d.id).toBe(d.owner);
      expect(concept(SKILLS[d.id]), `${d.id} is changed`).not.toEqual(concept(d));
    }
    expect(companions()).toHaveLength(84);
    expect(new Set(companions().map((d) => d.id))).toEqual(new Set([...KEPT, ...changed.map((d) => d.id), ...Object.values(REPLACED)]));
    // Each of the 15 is gone and its successor is a node of the same character (a version 8 save's tree is respent on
    // load since plan 8d, so the save no longer renames them).
    for (const [was, now] of Object.entries(REPLACED)) {
      expect(SKILLS[was], was).toBeUndefined();
      expect(NODES[was], was).toBeUndefined();
      expect(NODES[now]?.owner, now).toBe(r.SKILLS[was].owner);
    }
  });

  it('each concept belongs to one character', () => {
    /** The owners of the companion skills with an effect that `test` holds for. */
    const owners = (test: (e: Effect, d: SkillDef) => boolean) =>
      [...new Set(companions().filter((d) => d.effects.some((e) => test(e, d))).map((d) => d.owner))].sort();
    const ownSide = (d: SkillDef) => d.target === 'self' || d.target === 'ally' || d.target === 'allies';
    const foeSide = (d: SkillDef) => d.target === 'enemy' || d.target === 'enemies';
    const guards = (e: Effect) => e.kind === 'buff' && (e.stat === 'def' || e.stat === 'res') && e.pct > 0;
    // Guarding: a positive def / res buff on the party is Scarlet's, and only on herself; barriers are Chizuru's.
    expect(owners((e, d) => guards(e) && ownSide(d))).toEqual(['scarlet']);
    for (const d of companions().filter((x) => x.effects.some(guards))) expect(d.target, d.id).toBe('self');
    expect(owners((e) => e.kind === 'barrier' || e.kind === 'barrier-boost')).toEqual(['chizuru']);
    // Healing is Selene's; devices are Bobby's.
    expect(owners((e) => e.kind === 'heal')).toEqual(['selene']);
    expect(owners((e) => e.kind === 'device' || e.kind === 'overclock' || e.kind === 'tune-up')).toEqual(['bobby']);
    // The party's atk / spd is Safira's; a speed buff on oneself is Liz's (and Safira's 蜃樓步, her finale, spec §8.7).
    expect(owners((e, d) => e.kind === 'buff' && (e.stat === 'atk' || e.stat === 'spd') && e.pct > 0 && d.target === 'allies')).toEqual(['safira']);
    expect(owners((e, d) => e.kind === 'buff' && e.stat === 'spd' && e.pct > 0 && d.target === 'self')).toEqual(['liz', 'safira']);
    expect(companions().filter((d) => d.owner === 'safira' && d.target === 'self' && d.effects.some((e) => e.kind === 'buff' && e.stat === 'spd')).map((d) => d.id)).toEqual(['mirage-step']);
    // Weakening foes: atk is Liz's, def is Sylvie's; poison is Rin's, sleep is Selene's; drawing blows is Scarlet's.
    expect(owners((e, d) => e.kind === 'buff' && e.stat === 'atk' && e.pct < 0 && foeSide(d))).toEqual(['liz']);
    expect(owners((e, d) => e.kind === 'buff' && e.stat === 'def' && e.pct < 0 && foeSide(d))).toEqual(['sylvie']);
    expect(owners((e) => e.kind === 'inflict' && e.status === 'poison')).toEqual(['rin']);
    expect(owners((e) => e.kind === 'inflict' && e.status === 'sleep')).toEqual(['selene']);
    expect(owners((e) => e.kind === 'taunt' || e.kind === 'cover' || e.kind === 'challenge')).toEqual(['scarlet']);
    // Each strikes with her own elements (a device's: the mine and the coil are thunder, the turret physical).
    const elements: Record<string, string[]> = {};
    const elementOf = (e: Effect): string | null =>
      e.kind === 'damage' ? e.element : e.kind === 'device' ? (e.device === 'mine' || e.device === 'coil' ? 'thunder' : e.device === 'turret' ? 'phys' : null) : null;
    for (const d of companions()) for (const e of d.effects) {
      const el = elementOf(e);
      const list = (elements[d.owner] ??= []);
      if (el && !list.includes(el)) list.push(el);
    }
    for (const k of Object.keys(elements)) elements[k].sort();
    expect(elements).toEqual({
      noel: ['fire', 'ice', 'thunder'], scarlet: ['fire', 'phys'], selene: ['ice'], bobby: ['phys', 'thunder'],
      chizuru: ['phys'], liz: ['phys'], sylvie: ['phys'], safira: ['phys'], rin: ['phys'],
    });
  });

  it('every legendary power names a living skill', () => {
    const r = roster();
    expect(Object.keys(POWERS).sort()).toEqual(Object.keys(r.POWERS).sort());
    const moved: Record<string, string> = { 'shade-silent-blade': 'rin-needle', 'mire-whisper-gloves': 'rin-venom-needle' };
    for (const [id, p] of Object.entries(POWERS)) {
      expect(SKILLS[p.skill], `${id} → ${p.skill}`).toBeDefined();
      expect(p.skill, id).toBe(moved[id] ?? (r.POWERS[id] as { skill: string }).skill);
    }
    expect(Object.keys(POWERS).filter((id) => !(id in moved))).toHaveLength(12);
  });
});
