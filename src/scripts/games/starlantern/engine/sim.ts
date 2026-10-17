import { CHARACTER_IDS, LEGACY_CHARACTER_IDS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { CONDITIONS } from '../data/conditions';
import { FLOORS } from '../data/floors';
import { REGIONS } from '../data/regions';
import { depthLevel } from './levels';
import { rarityWeights, rollTier } from './loot/drops';
import { itemLevel, rollItem } from './loot/item';
import { LIMIT_MAX, createBattle, resolveRound, skillCost, skillFor, type Action, type BattleScale, type BattleState, type Outcome } from './battle';
import { LEGACY_LINEUP, MAX_LEVEL, SLOTS, expToNext, gainExp, newMember, partyWith, statsOf } from './party';
import { defaultTalents, defaultTree, heroTalents, heroTree, learnedSkills } from './progression';
import { HERO_BUILDS, type HeroBuild } from '../data/hero';
import { mulberry32 } from './rng';
import { depthClearExp, encounterTable, scaleEnemy } from './scaling';
import { genFloor } from './dungeon/gen';
import { terrainOf } from './dungeon/run';
import { advance } from './encounter';
import { DELTA, posKey, tileAt, type FloorMap } from './map';
import type { BuffStat, CharacterId, GearSlot, Party, Pos, Rarity, Row, SkillDef } from './types';

/** The eight members as CHARACTER_IDS ordered them before Rin: kitParty drew their gear in this order, and still does. */
export const LEGACY_KIT_ORDER: CharacterId[] = LEGACY_CHARACTER_IDS;
/** The order kitParty draws gear in: the legacy eight first so their draws never move, newer members after, the hero always last. */
export const KIT_ORDER: CharacterId[] = [
  ...LEGACY_KIT_ORDER,
  ...CHARACTER_IDS.filter((id) => !LEGACY_KIT_ORDER.includes(id) && (id as string) !== 'hero'),
  ...CHARACTER_IDS.filter((id) => (id as string) === 'hero'),
];

type Altar = { stat: BuffStat; pct: number }[];

/** Who the simulation fields: the members (default the legacy five), the hero's build, row and memories, and a forced abyss bonus. */
export interface Lineup { ids?: CharacterId[]; heroBuild?: HeroBuild; heroRow?: Row; memories?: number; abyss?: number }

/** A fresh party with everyone at `level`, held to the real level cap, each with the default tree and talents of that level; the hero follows his build. */
export function partyAt(level: number, lineup: Lineup = {}): Party {
  level = Math.min(level, MAX_LEVEL);
  const build = lineup.heroBuild ?? 'balanced';
  const p = partyWith(lineup.ids ?? LEGACY_LINEUP, lineup.heroRow ?? HERO_BUILDS[build].row);
  for (const id of Object.keys(p.roster) as CharacterId[]) {
    const hero = (id as string) === 'hero';
    const m = {
      ...newMember(id), level,
      tree: hero ? heroTree(level, build, lineup.memories ?? 0) : defaultTree(id, level),
      talents: hero ? heroTalents(level, build) : defaultTalents(id, level),
    };
    const s = statsOf(m);
    p.roster[id] = { ...m, hp: s.hp, tp: s.tp };
  }
  return p;
}

/**
 * `partyAt(level)` with every slot of every member filled by a monster drop of that depth.
 * Without `rarity` each piece rolls its tier as a plain-condition monster drop would; a legendary-tier roll
 * counts as rare, since a special's power is not a stat and stays out of the expectation.
 * Every piece is at enhance level `enhance` (default +0); the balance tests pass `expectedEnhance(depth)` explicitly.
 */
export function kitParty(level: number, depth: number, seed: number, rarity?: Rarity, enhance = 0, lineup: Lineup = {}): Party {
  const rng = mulberry32(seed);
  const p = partyAt(level, lineup);
  const ilvl = itemLevel(depth, 'monster');
  const weights = rarityWeights('monster', depthLevel(depth), 'plain');
  let uid = 1;
  for (const id of KIT_ORDER) {
    const m = { ...p.roster[id], equip: { ...p.roster[id].equip } };
    for (const s of SLOTS) {
      const slot: GearSlot = s === 'ring1' || s === 'ring2' ? 'ring' : s;
      const tier = rarity ?? rollTier(rng, weights);
      const rarityOf = tier === 'legendaryTier' ? 'rare' : tier;
      const first = rollItem(rng, { uid: uid++, ilvl, rarity: rarityOf, slot });
      // The hero always draws a weapon like everyone, then swaps it for his build's; he draws last, so the extra roll moves no one else.
      m.equip[s] = { ...(s === 'weapon' && (id as string) === 'hero' ? rollItem(rng, { uid: first.uid, ilvl, rarity: rarityOf, slot, base: HERO_BUILDS[lineup.heroBuild ?? 'balanced'].weapon }) : first), enhance };
    }
    const st = statsOf(m);
    p.roster[id] = { ...m, hp: st.hp, tp: st.tp };
  }
  return p;
}

/** A plain player: ultimate when the gauge is full, heal when someone is under half HP, else the strongest affordable damage skill, else attack. */
export function choose(s: BattleState, party: Party): Record<string, Action> {
  const out: Record<string, Action> = {};
  const foes = s.enemies.filter((e) => e.alive);
  const hurt = s.party.filter((c) => c.alive && c.hp < c.max.hp / 2).sort((a, b) => a.hp - b.hp)[0];
  for (const c of s.party.filter((x) => x.alive)) {
    const target = foes[0]?.key ?? '';
    const id = c.key as CharacterId;
    if (c.limit >= LIMIT_MAX) { out[c.key] = { kind: 'ultimate', target }; continue; }
    // Each skill as this member casts it (worn powers) and at the TP they pay for it.
    const skills = learnedSkills(party.roster[id]).flatMap((sk) => skillFor(c, sk) ?? [])
      .filter((sk) => !sk.passive && skillCost(c, sk.id) <= c.tp);
    const heal = skills.find((sk) => sk.effects.some((e) => e.kind === 'heal'));
    if (hurt && heal) { out[c.key] = { kind: 'skill', skill: heal.id, target: hurt.key }; continue; }
    const dmg = skills
      .filter((sk) => sk.effects.some((e) => e.kind === 'damage'))
      .sort((a, b) => power(b) - power(a))[0];
    out[c.key] = dmg ? { kind: 'skill', skill: dmg.id, target } : { kind: 'attack', target };
  }
  return out;
}

/** The playtest bot's player (全員攻擊): every living member attacks the first living enemy, nothing else. */
export function attackAll(s: BattleState): Record<string, Action> {
  const target = s.enemies.find((e) => e.alive)?.key ?? '';
  return Object.fromEntries(s.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'attack', target } as Action]));
}

/** Who picks the party's actions in a simulated fight: `skill` is `choose`, `attack` is `attackAll`. */
export type SimAi = 'skill' | 'attack';

function power(def: SkillDef): number {
  return def.effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
}

export function simBattle(party: Party, enemyIds: string[], boss: boolean, seed: number, scale?: BattleScale, altar?: Altar, ai: SimAi = 'skill', abyss?: number): { outcome: Outcome; rounds: number; hpLoss: number } {
  const rng = mulberry32(seed);
  let s = createBattle({ party, enemyIds, boss, inventory: {}, revealed: {}, scale, altar, abyss });
  const maxHp = s.party.reduce((n, c) => n + c.max.hp, 0);
  let rounds = 0;
  while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, ai === 'attack' ? attackAll(s) : choose(s, party), rng); rounds++; }
  const left = s.party.reduce((n, c) => n + Math.max(0, c.hp), 0);
  return { outcome: s.outcome, rounds, hpLoss: 1 - left / maxHp };
}

/**
 * With `kitSeed`, the party wears `kitParty(level, depth, kitSeed, undefined, kitEnhance)` instead of nothing (`kitEnhance`
 * default +0); `ai` picks the player (default the skill player).
 */
export function winRate(level: number, groups: string[][], boss: boolean, seeds = 40, scale?: BattleScale, altar?: Altar, kitSeed?: number, ai: SimAi = 'skill', kitEnhance = 0, lineup: Lineup = {}): { rate: number; hpLoss: number } {
  let wins = 0, loss = 0, n = 0;
  for (const g of groups) for (let k = 1; k <= seeds; k++) {
    const party = kitSeed === undefined ? partyAt(level, lineup) : kitParty(level, scale?.depth ?? 1, kitSeed, undefined, kitEnhance, lineup);
    const r = simBattle(party, g, boss, k * 7919, scale, altar, ai, lineup.abyss);
    n++; loss += r.hpLoss; if (r.outcome === 'win') wins++;
  }
  return { rate: wins / n, hpLoss: loss / n };
}

/** Exp of one group; with `scale`, as met at that depth and region (no elite). */
export function groupExp(g: string[], scale?: BattleScale): number {
  if (!scale) return g.reduce((n, id) => n + ENEMIES[id].exp, 0);
  const cond = CONDITIONS[scale.condition ?? 'plain'];
  return g.reduce((n, id) => n + scaleEnemy(ENEMIES[id], scale.depth, REGIONS[scale.region], false, cond).exp, 0);
}

export function avgExp(floor: number): number {
  const gs = FLOORS[floor - 1].encounters;
  return gs.reduce((n, g) => n + groupExp(g), 0) / gs.length;
}

export function fightsToLevel(exp: number, from: number, to: number): number {
  let need = 0;
  for (let l = from; l < to; l++) need += expToNext(l);
  return Math.ceil(need / exp);
}

/** Every open cell's BFS distance from `from` (only walls block). */
function bfs(map: FloorMap, from: Pos): Map<string, number> {
  const dist = new Map([[posKey(from), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const d of Object.values(DELTA)) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (tileAt(map, n) === 'wall' || dist.has(posKey(n))) continue;
      dist.set(posKey(n), dist.get(posKey(p))! + 1);
      queue.push(n);
    }
  }
  return dist;
}

/**
 * Encounters met clearing one mainline depth on foot (balance test 12): `rooms` walks to the nearest unvisited room
 * centre (ties to the lower room id) until all are visited, then to the stairs; `direct` walks straight to the stairs.
 * Each step fills the encounter gauge once at the depth's rate.
 * Every depth is measured as a non-boss floor (`boss: false`), boss depths (mainline 3, every 5th) too: boss floors are
 * out of scope here, since the boss pays its own exp (balance test 6) on top of the fights and clear grant counted here.
 */
export function clearFights(depth: number, seed: number, route: 'rooms' | 'direct'): number {
  const { map, rooms } = genFloor(seed, { depth, boss: false });
  const rate = FLOORS[terrainOf('mainline', depth) - 1].rate;
  const rng = mulberry32(seed);
  const centre = (r: (typeof rooms)[number]): Pos => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
  let pos = map.entrance, gauge = 0, fights = 0;
  const walkTo = (to: Pos) => {
    const steps = bfs(map, pos).get(posKey(to))!;
    for (let i = 0; i < steps; i++) {
      const g = advance(gauge, rng, rate, 1);
      gauge = g.value;
      if (g.encounter) fights++;
    }
    pos = to;
  };
  if (route === 'rooms') {
    const left = new Set(rooms.map((r) => r.id));
    while (left.size) {
      const dist = bfs(map, pos);
      const next = rooms.filter((r) => left.has(r.id))
        .sort((a, b) => dist.get(posKey(centre(a)))! - dist.get(posKey(centre(b)))! || a.id - b.id)[0];
      walkTo(centre(next));
      left.delete(next.id);
    }
  }
  walkTo(map.down!);
  return fights;
}

/**
 * The level a lone member reaches by clearing one mainline depth (its fights by `clearFights`, averaged over 40 maps,
 * at the depth's average group exp, plus the depth-clear exp), from Lv1 at depth 1 and from the depth level deeper.
 */
export function depthPace(depth: number, route: 'rooms' | 'direct'): number {
  const start = depth === 1 ? 1 : depthLevel(depth);
  let fights = 0;
  for (let k = 1; k <= 40; k++) fights += clearFights(depth, k * 7919, route);
  fights /= 40;
  const table = encounterTable('mainline', depth);
  const perFight = table.reduce((n, g) => n + groupExp(g, { depth, region: 'mainline' }), 0) / table.length;
  const exp = Math.round(fights * perFight) + depthClearExp(depth);
  return gainExp({ ...newMember('noel'), level: start }, exp).member.level;
}
