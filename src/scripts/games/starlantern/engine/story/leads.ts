import { MEETINGS, type Meetable } from '../../data/meetings';
import type { RegionId } from '../../data/regions';
import { STAGES, type Stage } from '../../data/story/scenes';
import type { GameState } from '../state';
import { storyStage } from './events';

/** Where the guild points the party next: who is still out there, in which region and how deep (6c Task 16). */
export interface Lead { id: Meetable; region: RegionId; depth: number }

/**
 * The stage a lead opens at (lore ledger I-124). The main road's leads are open from the first day: it is always offered at
 * the gate, and spec §6 puts the healer there for that reason. The regions' rumours reach the guild once the party has left
 * the prologue (the main road's second floor reached, or Act 1's boss beaten), so the first lead is always the main road.
 */
export function leadOpen(m: { region: RegionId }, stage: Stage): boolean {
  const from: Stage = m.region === 'mainline' ? 'prologue' : 'act1';
  return STAGES.indexOf(stage) >= STAGES.indexOf(from);
}

const leadOf = (m: (typeof MEETINGS)[number]): Lead => ({ id: m.id, region: m.region, depth: m.depth });

/**
 * The next companion the guild points at: the first one in MEETINGS order (the story order, lore ledger I-124) who is not
 * met yet and whose lead is open at this stage; null once there is nobody left. Pure and drawn from no rng.
 */
export function nextLead(s: GameState): Lead | null {
  const stage = storyStage(s);
  const m = MEETINGS.find((x) => !s.party.recruited.includes(x.id) && leadOpen(x, stage));
  return m ? leadOf(m) : null;
}

/** The leads already followed: every companion met, in lead order, with where she was found. */
export function followedLeads(s: GameState): Lead[] {
  return MEETINGS.filter((m) => s.party.recruited.includes(m.id)).map(leadOf);
}
