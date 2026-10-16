import { ENEMIES } from '../data/enemies';
import { CONDITIONS } from '../data/conditions';
import { FLOORS } from '../data/floors';
import { REGIONS } from '../data/regions';
import { depthLevel } from './levels';
import { rarityWeights, rollTier } from './loot/drops';
import { itemLevel, rollItem } from './loot/item';
import { LIMIT_MAX, createBattle, resolveRound, skillCost, skillFor, type Action, type BattleScale, type BattleState, type Outcome } from './battle';
import { MAX_LEVEL, SLOTS, expToNext, learnedSkills, newMember, newParty, statsOf } from './party';
import { mulberry32 } from './rng';
import { scaleEnemy } from './scaling';
import type { BuffStat, CharacterId, GearSlot, Party, Rarity, SkillDef } from './types';

type Altar = { stat: BuffStat; pct: number }[];

/** A fresh party with everyone at `level`, held to the real level cap. */
export function partyAt(level: number): Party {
  level = Math.min(level, MAX_LEVEL);
  const p = newParty();
  for (const id of Object.keys(p.roster) as CharacterId[]) {
    const m = { ...newMember(id), level };
    const s = statsOf(m);
    p.roster[id] = { ...m, hp: s.hp, tp: s.tp };
  }
  return p;
}

/**
 * `partyAt(level)` with every slot of every member filled by a monster drop of that depth.
 * Without `rarity` each piece rolls its tier as a plain-condition monster drop would; a legendary-tier roll
 * counts as rare, since a special's power is not a stat and stays out of the expectation.
 */
export function kitParty(level: number, depth: number, seed: number, rarity?: Rarity): Party {
  const rng = mulberry32(seed);
  const p = partyAt(level);
  const ilvl = itemLevel(depth, 'monster');
  const weights = rarityWeights('monster', depthLevel(depth), 'plain');
  let uid = 1;
  for (const id of Object.keys(p.roster) as CharacterId[]) {
    const m = { ...p.roster[id], equip: { ...p.roster[id].equip } };
    for (const s of SLOTS) {
      const slot: GearSlot = s === 'ring1' || s === 'ring2' ? 'ring' : s;
      const tier = rarity ?? rollTier(rng, weights);
      m.equip[s] = rollItem(rng, { uid: uid++, ilvl, rarity: tier === 'legendaryTier' ? 'rare' : tier, slot });
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
    const skills = learnedSkills(id, party.roster[id].level).map((sk) => skillFor(c, sk))
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

function power(def: SkillDef): number {
  return def.effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
}

export function simBattle(party: Party, enemyIds: string[], boss: boolean, seed: number, scale?: BattleScale, altar?: Altar): { outcome: Outcome; rounds: number; hpLoss: number } {
  const rng = mulberry32(seed);
  let s = createBattle({ party, enemyIds, boss, inventory: {}, revealed: {}, scale, altar });
  const maxHp = s.party.reduce((n, c) => n + c.max.hp, 0);
  let rounds = 0;
  while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), rng); rounds++; }
  const left = s.party.reduce((n, c) => n + Math.max(0, c.hp), 0);
  return { outcome: s.outcome, rounds, hpLoss: 1 - left / maxHp };
}

/** With `kitSeed`, the party wears `kitParty(level, depth, kitSeed)` instead of nothing. */
export function winRate(level: number, groups: string[][], boss: boolean, seeds = 40, scale?: BattleScale, altar?: Altar, kitSeed?: number): { rate: number; hpLoss: number } {
  let wins = 0, loss = 0, n = 0;
  for (const g of groups) for (let k = 1; k <= seeds; k++) {
    const party = kitSeed === undefined ? partyAt(level) : kitParty(level, scale?.depth ?? 1, kitSeed);
    const r = simBattle(party, g, boss, k * 7919, scale, altar);
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
