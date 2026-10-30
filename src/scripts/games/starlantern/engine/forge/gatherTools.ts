import { TOOL_LEVELS } from '../../data/gather';
import type { Cost } from '../../data/forge';
import type { GameState } from '../state';
import { canPay, pay, type ForgeResult } from './cost';

/** Gathering spec §6.3: what making the gathering tool of `level` costs; null for a level there is not. */
export function toolCost(level: number): Cost | null {
  return TOOL_LEVELS.find((t) => t.level === level)?.cost ?? null;
}

/**
 * Makes the gathering tool of `level` (spec §6.3, §11 item 4): once each, the second only on the first. It is no item: it
 * is `gather.tool`, never sold, dismantled or worn out. Draws nothing; never touches `sold`. Refusals, in order: invalid
 * (no such level, already held, or the level before it missing), gold/mats.
 */
export function craftTool(s: GameState, level: 1 | 2): ForgeResult<{ level: 1 | 2 }> {
  const t = TOOL_LEVELS.find((x) => x.level === level);
  const held = s.gather?.tool ?? 0;
  if (!t || held >= t.level || held !== t.needs) return { ok: false, reason: 'invalid' };
  const lacking = canPay(s, t.cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, t.cost);
  n.gather = { tool: t.level, got: n.gather?.got ?? {} };
  return { ok: true, state: n, out: { level: t.level } };
}
