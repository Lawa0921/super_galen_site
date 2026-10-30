import {
  GATHER_NOISE, GATHER_NOISE_TOOL2, LIGHT_SHARE, RICH_NOISE, SPOT_RULES, isDeep, spotRegionOf, type GatherMode, type GatherType, type SpotRuleDef,
} from '../data/gather';
import { GATHER_TEXT, type GatherText } from '../data/gather.zh-TW';
import { danger, ENCOUNTER_MAX, ENCOUNTER_PACE, YELLOW_AT, type Danger } from './encounter';
import { POISON_TP_LOSS_PCT, trapDamage } from './events';
import { statsOf } from './party';
import type { Content } from './dungeon/rooms';
import type { Run } from './dungeon/run';
import type { GameState } from './state';
import type { CharacterId, Pos } from './types';

/**
 * Gathering (spec §5.3-§5.4, §9.2): the one formula for what a point yields and costs, the shade spot's sighting, who would
 * speak, and the save's shape. Pure: nothing here draws a number or changes its inputs (engine/gather.guard.test.ts).
 */

/** What the next ordinary step would do to the gauge (spec §5.4): `walk()`'s multiplier and this floor's rate. */
export interface StepRate { mod: number; rate: [number, number] }

/** Whether the next ordinary step meets a battle: never, perhaps, or surely. */
export type NextStep = 'never' | 'maybe' | 'sure';

/** One way of gathering a point, worked out in full: the preview and the result are both this (plan ruling 4). */
export interface GatherOutcome {
  qty: number;
  noise: number;
  gauge: { from: number; to: number };
  danger: { from: Danger; to: Danger };
  next: NextStep;
  /** The land's toll on each living recruited member (bench too): HP and TP lost, as they would really change. */
  toll?: Partial<Record<CharacterId, { hp?: number; tp?: number }>>;
}

/** The spot rule a point's material carries; none for an ordinary point. */
export function ruleOf(c: Content): SpotRuleDef | undefined {
  const r = c.gather?.type === 'spot' ? spotRegionOf(c.gather.item) : undefined;
  return r ? SPOT_RULES[r] : undefined;
}

/** The HP each living member loses to a scalding or fuming spot at `depth`: half a trap's, rounded up. */
export const spotHurt = (hurt: 'hurt' | 'poison', depth: number): number => Math.ceil(trapDamage(hurt, depth) / 2);

/** Spec §5.4's `next`: the least and most a step can add (as `advance` rounds them), against the gauge after gathering. */
export function nextStep(v: number, step: StepRate): NextStep {
  const gMin = Math.round(step.rate[0] * step.mod * ENCOUNTER_PACE);
  const gMax = Math.round(step.rate[1] * step.mod * ENCOUNTER_PACE);
  if (v + gMin >= ENCOUNTER_MAX) return 'sure';
  return v + gMax > YELLOW_AT ? 'maybe' : 'never';
}

/**
 * Spec §5.4: what gathering point `c` in `mode` would yield and cost now, with the gauge at `encounter`, at `depth`. The
 * goods: the point's, one more with a tool, the spot's extra, times the spot's multiplier; a light gather takes half,
 * rounded up. The noise: 30 (20 with the second tool), 15 more if rich, times the spot's and (light) half, rounded; the
 * gauge stops at ENCOUNTER_MAX − 1. The toll falls whichever way it is gathered.
 */
export function outcome(s: GameState, c: Content, mode: GatherMode, encounter: number, step: StepRate, depth: number): GatherOutcome {
  const g = c.gather!;
  const rule = ruleOf(c);
  const tool = s.gather?.tool ?? 0;
  const base = (g.qty + (tool >= 1 ? 1 : 0) + (rule?.qtyAdd ?? 0)) * (rule?.qtyMul ?? 1);
  const qty = mode === 'full' ? base : Math.ceil(base * LIGHT_SHARE);
  const noise = Math.round(((tool >= 2 ? GATHER_NOISE_TOOL2 : GATHER_NOISE) + (g.rich ? RICH_NOISE : 0)) * (rule?.noiseMul ?? 1) * (mode === 'light' ? LIGHT_SHARE : 1));
  const to = Math.min(ENCOUNTER_MAX - 1, encounter + noise);
  const out: GatherOutcome = {
    qty, noise, gauge: { from: encounter, to }, danger: { from: danger(encounter), to: danger(to) }, next: nextStep(to, step),
  };
  if (rule?.hurt || rule?.tp) {
    const n = rule.hurt ? spotHurt(rule.hurt, depth) : 0;
    const toll: NonNullable<GatherOutcome['toll']> = {};
    for (const id of s.party.recruited) {
      const m = s.party.roster[id];
      if (m.hp <= 0) continue;
      toll[id] = rule.hurt ? { hp: m.hp - Math.max(1, m.hp - n) } : { tp: Math.min(m.tp, Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100)) };
    }
    out.toll = toll;
  }
  return out;
}

/** The key of a point in `run.spotted`: `depth:x,y`. */
export const spotKey = (depth: number, at: Pos): string => `${depth}:${at.x},${at.y}`;

/** The gathering point content at `pos` on `depth`, if the floor is made and holds one there. */
export function gatherAt(run: Run, depth: number, pos: Pos): Content | undefined {
  return run.floors.get(depth)?.contents.find((c) => c.kind === 'gather' && c.at.x === pos.x && c.at.y === pos.y);
}

/**
 * Spec §5.3 (review L3): the shade spots on `depth` the party now sees, an explored cell no more than one step away in any
 * of the eight directions, go into `run.spotted` for the rest of the dive. Called after each reveal.
 */
export function spotGather(run: Run, depth: number, partyPos: Pos, explored: readonly string[]): void {
  const f = run.floors.get(depth);
  if (!f) return;
  const seen = new Set(explored);
  for (const c of f.contents) {
    if (c.kind !== 'gather' || !ruleOf(c)?.hidden) continue;
    if (Math.max(Math.abs(c.at.x - partyPos.x), Math.abs(c.at.y - partyPos.y)) > 1 || !seen.has(`${c.at.x},${c.at.y}`)) continue;
    (run.spotted ??= new Set()).add(spotKey(depth, c.at));
  }
}

/** Whether a point shows on the map: a shade spot once spotted, any other point always (on an explored cell, as any marker). */
export function visibleGather(run: Run, depth: number, c: Content): boolean {
  return !ruleOf(c)?.hidden || (run.spotted?.has(spotKey(depth, c.at)) ?? false);
}

/** A words slot to say: its path in GATHER_TEXT and the line's index. The screen looks the words up; the engine never does. */
export interface GatherLine { key: string; index: number }

/** Plan ruling 6: who would remark on which kinds of point, in this order; Rin speaks for any kind when none of them fits. */
export const REMARK_ORDER = ['sylvie', 'bobby', 'liz'] as const;
export const REMARK_TYPES: Record<(typeof REMARK_ORDER)[number], GatherType[]> = {
  sylvie: ['herb', 'fungus'],
  bobby: ['vein', 'crystal'],
  liz: ['crystal', 'spot'],
};

const gotTotal = (s: GameState): number => Object.values(s.gather?.got ?? {}).reduce((t, n) => t + n, 0);

/**
 * Plan ruling 6: the remark the first gathering of a dive draws, or none. On the field (in `party.grid`, standing): the first
 * of REMARK_ORDER whose kinds hold the point's, else Rin for any kind. That one's pool empty: none, and no one else is
 * asked. The line is the gathered total before this one, modulo the pool. Once a dive has had its remark, none.
 */
export function remarkFor(s: GameState, run: Run, c: Content, text: GatherText = GATHER_TEXT): GatherLine | undefined {
  if (run.gatherTalked || !c.gather) return undefined;
  const type = c.gather.type;
  const here = (id: CharacterId) => s.party.grid.includes(id) && (s.party.roster[id]?.hp ?? 0) > 0;
  const who = REMARK_ORDER.find((id) => here(id) && REMARK_TYPES[id].includes(type));
  let key: string, pool: string[];
  if (who) {
    const remarks = text.remarks[who] as Partial<Record<GatherType, string[]>>;
    key = `remarks.${who}.${type}`;
    pool = remarks[type] ?? [];
  } else if (here('rin')) {
    key = 'remarks.rin.any';
    pool = text.remarks.rin.any;
  } else return undefined;
  return pool.length ? { key, index: gotTotal(s) % pool.length } : undefined;
}

/**
 * Plan ruling 6: Lorne's inner voice on gathering `item`: `first` when nothing was ever gathered before, else `deep` when
 * `item` is the first deep material ever; `first` wins when both hold. An empty pool says nothing.
 */
export function innerFor(s: GameState, item: string, text: GatherText = GATHER_TEXT): GatherLine | undefined {
  const got = s.gather?.got ?? {};
  const slot = gotTotal(s) === 0 ? 'first' : isDeep(item) && !Object.keys(got).some((id) => isDeep(id) && got[id] > 0) ? 'deep' : null;
  if (!slot) return undefined;
  const pool = text.inner[slot];
  return pool.length ? { key: `inner.${slot}`, index: gotTotal(s) % pool.length } : undefined;
}
