// src/scripts/games/bomber/render/versusHud.ts
//
// Pure, deterministic helpers for the Versus HUD (no Date.now / Math.random).
// Tested in versusHud.test.ts. The Pixi view (VersusHudView) consumes these.

import {
  SUDDEN_DEATH_AT_MS,
  RING_INTERVAL_MS,
  MAX_COLLAPSE_RING,
} from '../versus/versusMatch';

/**
 * Ability recharge fill ratio in [0,1]: 0 = just used (full cooldown),
 * 1 = ready. `ratio = 1 - cooldownMs/maxMs`, clamped.
 *
 * `maxMs <= 0` is treated as "ready" (1) — defensive against an unset / zero
 * cooldown so the indicator never shows a permanently-charging arc.
 */
export function abilityRatio(cooldownMs: number, maxMs: number): number {
  if (maxMs <= 0) return 1;
  const r = 1 - cooldownMs / maxMs;
  if (r <= 0) return 0;
  if (r >= 1) return 1;
  return r;
}

export type SuddenDeathPhase = 'pre' | 'collapsing' | 'final';

export interface SuddenDeathHud {
  /** 'pre' before 120s; 'collapsing' while rings still falling; 'final' after the last ring. */
  phase: SuddenDeathPhase;
  /** Whole seconds (ceil) until the next event (sudden death start, or next ring collapse). 0 when final. */
  secondsToNext: number;
  /** Current/most-recent collapsed ring (0 before sudden death; clamps at MAX_COLLAPSE_RING). */
  ring: number;
}

/**
 * Deterministic sudden-death HUD state, driven purely by `state.elapsedMs`.
 *
 * Matches the engine collapse schedule exactly (versusMatch.stepSuddenDeath):
 *   collapseTime(r) = SUDDEN_DEATH_AT_MS + (r - 1) * RING_INTERVAL_MS, for r in 1..MAX_COLLAPSE_RING.
 *
 * Phases (with SUDDEN_DEATH_AT_MS=120000, RING_INTERVAL_MS=3000, MAX_COLLAPSE_RING=3):
 * - elapsed < 120000          → 'pre',        ring 0, secondsToNext = ceil((120000-elapsed)/1000)
 * - 120000 ≤ elapsed < 126000 → 'collapsing', ring = current collapsed ring (1..2),
 *                                secondsToNext = ceil(time to next ring)
 * - elapsed ≥ 126000          → 'final',       ring = MAX_COLLAPSE_RING, secondsToNext 0
 *   (the last ring (3) collapsed at 126000; the engine collapses no further ring)
 */
export function suddenDeathHud(elapsedMs: number): SuddenDeathHud {
  if (elapsedMs < SUDDEN_DEATH_AT_MS) {
    return {
      phase: 'pre',
      ring: 0,
      secondsToNext: Math.ceil((SUDDEN_DEATH_AT_MS - elapsedMs) / 1000),
    };
  }

  // due = which ring number "should" have collapsed by now (engine formula).
  const due = 1 + Math.floor((elapsedMs - SUDDEN_DEATH_AT_MS) / RING_INTERVAL_MS);
  const ring = Math.min(MAX_COLLAPSE_RING, due);

  // After the last scheduled ring has collapsed there is nothing more to count to.
  if (due >= MAX_COLLAPSE_RING) {
    return { phase: 'final', ring: MAX_COLLAPSE_RING, secondsToNext: 0 };
  }

  // Time until the NEXT ring collapses: collapseTime(ring+1) - elapsed.
  const nextCollapseAt = SUDDEN_DEATH_AT_MS + ring * RING_INTERVAL_MS;
  return {
    phase: 'collapsing',
    ring,
    secondsToNext: Math.ceil((nextCollapseAt - elapsedMs) / 1000),
  };
}

/** Per-player accent tints (P1 warm / P2 cool / P3 / P4). Mirrors VersusEntityView. */
export const HUD_PLAYER_TINTS = [0xffffff, 0x9fd8ff, 0xffd6a0, 0xc0ffc0] as const;
