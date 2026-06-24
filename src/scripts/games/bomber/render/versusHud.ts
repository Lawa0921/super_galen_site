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

/**
 * Format a whole-second countdown as `M:SS` (e.g. 120→"2:00", 99→"1:39",
 * 45→"0:45", 5→"0:05", 0→"0:00"). Negative inputs clamp to "0:00"; fractional
 * seconds are floored. Pure — used for the sudden-death pre-phase timer.
 */
export function formatCountdown(seconds: number): string {
  const total = seconds <= 0 ? 0 : Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Per-player accent tints (P1 warm / P2 cool / P3 / P4). Mirrors VersusEntityView. */
export const HUD_PLAYER_TINTS = [0xffffff, 0x9fd8ff, 0xffd6a0, 0xc0ffc0] as const;

// ─── panel layout (pure, width-aware) ─────────────────────────────────────────
// These constants are the single source of truth for the HUD panel geometry; the
// Pixi view (VersusHudView) consumes panelLayout() rather than hard-coding x/width.

/** Default (full) per-player panel width. */
export const HUD_PANEL_W = 150;
/** Gap between two panels in the same (left/right) group. */
export const HUD_PANEL_GAP = 8;
/** Distance from the stage edge to the outer panel. */
export const HUD_PANEL_EDGE = 6;
/**
 * Half-width reserved for the centered sudden-death box. The SD box is
 * `max(120, text+24)` wide and the widest text ("SUDDEN DEATH 2:00") renders
 * around ~250px, so ~125 half-width; 130 leaves a little headroom. Panels are
 * laid so their inner edge never crosses `stageW/2 ∓ HUD_SD_RESERVE_HALF`.
 */
export const HUD_SD_RESERVE_HALF = 130;
/** Extra clearance between a panel's inner edge and the SD reserve. */
export const HUD_SD_MARGIN = 6;
/** Panels never shrink below this width (keeps text legible). */
export const HUD_PANEL_MIN_W = 60;

export interface PanelSlot {
  /** Left x of the panel root. */
  x: number;
  /** Panel width for this layout (== HUD_PANEL_W unless shrunk for narrow 4-player). */
  panelW: number;
}

/**
 * Deterministic top-edge panel layout for `playerCount` players (2–4).
 *
 * Seats alternate left/right groups (even seats 0,2 → left; odd seats 1,3 →
 * right), so 2 players sit at the two top corners and 3–4 fan inward — never
 * overlapping the top-center sudden-death timer.
 *
 * Width-aware: when a group holds 2 panels (3–4 players) on a narrow stage, the
 * panel width is shrunk uniformly so the group's inner edge stays clear of the
 * centered SD box. 1-panel groups (2-player corners) keep the full width as-is.
 *
 * Returns one slot per seat, indexed by seat (0..playerCount-1). The layout is
 * symmetric: the right group mirrors the left group about the stage center.
 */
export function panelLayout(stageWidth: number, playerCount: number): PanelSlot[] {
  const n = Math.max(0, playerCount);
  // Group sizes: left = even seats, right = odd seats.
  const leftCount = Math.ceil(n / 2);
  const rightCount = Math.floor(n / 2);
  const maxGroup = Math.max(leftCount, rightCount);

  // Available run from the stage edge to the SD reserve, for one half.
  const available =
    stageWidth / 2 - HUD_SD_RESERVE_HALF - HUD_SD_MARGIN - HUD_PANEL_EDGE;

  // Only shrink when a group holds ≥2 panels; single-panel groups (2-player
  // corners) keep full width regardless of stage width.
  let panelW = HUD_PANEL_W;
  if (maxGroup >= 2) {
    const fit = (available - (maxGroup - 1) * HUD_PANEL_GAP) / maxGroup;
    panelW = Math.max(HUD_PANEL_MIN_W, Math.min(HUD_PANEL_W, fit));
  }

  const slots: PanelSlot[] = [];
  let leftK = 0;
  let rightK = 0;
  for (let seat = 0; seat < n; seat++) {
    if (seat % 2 === 0) {
      // left group, fans rightward from the edge
      slots[seat] = {
        x: HUD_PANEL_EDGE + leftK * (panelW + HUD_PANEL_GAP),
        panelW,
      };
      leftK++;
    } else {
      // right group, mirrors the left from the right edge
      slots[seat] = {
        x: stageWidth - HUD_PANEL_EDGE - panelW - rightK * (panelW + HUD_PANEL_GAP),
        panelW,
      };
      rightK++;
    }
  }
  return slots;
}
