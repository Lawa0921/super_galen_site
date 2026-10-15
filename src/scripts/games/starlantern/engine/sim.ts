import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import { SKILLS } from '../data/skills';
import { LIMIT_MAX, createBattle, resolveRound, type Action, type BattleState, type Outcome } from './battle';
import { expToNext, learnedSkills, newMember, newParty, statsOf } from './party';
import { mulberry32 } from './rng';
import type { CharacterId, Party } from './types';

export function partyAt(level: number): Party {
  const p = newParty();
  for (const id of Object.keys(p.roster) as CharacterId[]) {
    const m = { ...newMember(id), level };
    const s = statsOf(m);
    p.roster[id] = { ...m, hp: s.hp, tp: s.tp };
  }
  return p;
}

/** A plain player: ultimate when the gauge is full, heal when someone is under half HP, else the strongest affordable damage skill, else attack. */
function choose(s: BattleState, party: Party): Record<string, Action> {
  const out: Record<string, Action> = {};
  const foes = s.enemies.filter((e) => e.alive);
  const hurt = s.party.filter((c) => c.alive && c.hp < c.max.hp / 2).sort((a, b) => a.hp - b.hp)[0];
  for (const c of s.party.filter((x) => x.alive)) {
    const target = foes[0]?.key ?? '';
    const id = c.key as CharacterId;
    if (c.limit >= LIMIT_MAX) { out[c.key] = { kind: 'ultimate', target }; continue; }
    const skills = learnedSkills(id, party.roster[id].level).filter((sk) => !SKILLS[sk].passive && SKILLS[sk].tp <= c.tp);
    const heal = skills.find((sk) => SKILLS[sk].effects.some((e) => e.kind === 'heal'));
    if (hurt && heal) { out[c.key] = { kind: 'skill', skill: heal, target: hurt.key }; continue; }
    const dmg = skills
      .filter((sk) => SKILLS[sk].effects.some((e) => e.kind === 'damage'))
      .sort((a, b) => power(b) - power(a))[0];
    out[c.key] = dmg ? { kind: 'skill', skill: dmg, target } : { kind: 'attack', target };
  }
  return out;
}

function power(id: string): number {
  return SKILLS[id].effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
}

export function simBattle(party: Party, enemyIds: string[], boss: boolean, seed: number): { outcome: Outcome; rounds: number; hpLoss: number } {
  const rng = mulberry32(seed);
  let s = createBattle({ party, enemyIds, boss, inventory: {}, revealed: {} });
  const maxHp = s.party.reduce((n, c) => n + c.max.hp, 0);
  let rounds = 0;
  while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), rng); rounds++; }
  const left = s.party.reduce((n, c) => n + Math.max(0, c.hp), 0);
  return { outcome: s.outcome, rounds, hpLoss: 1 - left / maxHp };
}

export function winRate(level: number, groups: string[][], boss: boolean, seeds = 40): { rate: number; hpLoss: number } {
  let wins = 0, loss = 0, n = 0;
  for (const g of groups) for (let k = 1; k <= seeds; k++) {
    const r = simBattle(partyAt(level), g, boss, k * 7919);
    n++; loss += r.hpLoss; if (r.outcome === 'win') wins++;
  }
  return { rate: wins / n, hpLoss: loss / n };
}

export function groupExp(g: string[]): number {
  return g.reduce((n, id) => n + ENEMIES[id].exp, 0);
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
