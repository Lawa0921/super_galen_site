import { STORY } from '../../data/story.zh-TW';
import type { GameState } from '../state';

/**
 * What the bellkeeper may say in town today (story depth Task 4). He is in town once his arrival scene has played (her
 * choice, then her confession, only queue it; final review I-1). Once the finale is won he speaks of what came after;
 * until then his `oath` lines, each one whose townsfolk fragment, if it names one, is back (the boy at the gate waits for
 * Glen's piece, controller ruling b).
 */
export function bellkeeperPool(s: GameState): string[] {
  if (!s.story.seen.includes('bellkeeper-arrives')) return [];
  if (s.story.finaleCleared) return [...STORY.bellkeeper.after];
  return STORY.bellkeeper.oath.filter((l) => !l.if?.returned || s.story.returned.includes(l.if.returned)).map((l) => l.text);
}
