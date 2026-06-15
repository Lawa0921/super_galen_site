import { describe, it, expect } from 'vitest';
import {
  abilityRatio,
  suddenDeathHud,
  formatCountdown,
  panelLayout,
  HUD_PANEL_W,
  HUD_PANEL_EDGE,
  HUD_PANEL_MIN_W,
  HUD_SD_RESERVE_HALF,
  HUD_SD_MARGIN,
} from './versusHud';
import {
  SUDDEN_DEATH_AT_MS,
  RING_INTERVAL_MS,
  MAX_COLLAPSE_RING,
} from '../versus/versusMatch';

describe('abilityRatio (recharge fill 0→1)', () => {
  it('full cooldown → 0 (just used)', () => {
    expect(abilityRatio(9000, 9000)).toBe(0);
  });

  it('zero cooldown → 1 (ready)', () => {
    expect(abilityRatio(0, 9000)).toBe(1);
  });

  it('half cooldown → 0.5', () => {
    expect(abilityRatio(4500, 9000)).toBeCloseTo(0.5, 6);
  });

  it('clamps over-full cooldown to 0', () => {
    expect(abilityRatio(12000, 9000)).toBe(0);
  });

  it('clamps negative cooldown to 1', () => {
    expect(abilityRatio(-500, 9000)).toBe(1);
  });

  it('maxMs <= 0 → 1 (treated as ready / no cooldown)', () => {
    expect(abilityRatio(5000, 0)).toBe(1);
    expect(abilityRatio(5000, -1)).toBe(1);
  });
});

describe('suddenDeathHud (deterministic, elapsedMs only)', () => {
  it('before sudden death: phase=pre, counts seconds down to 120s', () => {
    const r0 = suddenDeathHud(0);
    expect(r0.phase).toBe('pre');
    expect(r0.ring).toBe(0);
    expect(r0.secondsToNext).toBe(SUDDEN_DEATH_AT_MS / 1000); // 120

    // 119.0s remaining → ceil(1000ms) = 1
    const r119 = suddenDeathHud(SUDDEN_DEATH_AT_MS - 1000);
    expect(r119.phase).toBe('pre');
    expect(r119.secondsToNext).toBe(1);

    // 119.5s elapsed → 0.5s remaining → ceil = 1
    const rHalf = suddenDeathHud(SUDDEN_DEATH_AT_MS - 500);
    expect(rHalf.phase).toBe('pre');
    expect(rHalf.secondsToNext).toBe(1);
  });

  it('at 120s exactly: phase=collapsing, ring 1, counts to ring 2', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(1);
    // next collapse at 123s → 3s away → ceil = 3
    expect(r.secondsToNext).toBe(RING_INTERVAL_MS / 1000);
  });

  it('at 123s: ring 2 has just collapsed, counts to ring 3', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + RING_INTERVAL_MS);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(2);
    expect(r.secondsToNext).toBe(RING_INTERVAL_MS / 1000);
  });

  it('at 126s: last ring (3) collapsed → phase=final', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + (MAX_COLLAPSE_RING - 1) * RING_INTERVAL_MS);
    expect(r.phase).toBe('final');
    expect(r.ring).toBe(MAX_COLLAPSE_RING);
  });

  it('past the last ring: stays final, ring stays at max', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + 10 * RING_INTERVAL_MS);
    expect(r.phase).toBe('final');
    expect(r.ring).toBe(MAX_COLLAPSE_RING);
  });

  it('mid-collapse interval: ring stays, secondsToNext counts down to next ring', () => {
    // 1.0s into the first collapse interval → 2.0s until ring 2 → ceil = 2
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + 1000);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(1);
    expect(r.secondsToNext).toBe(2);
  });

  it('is pure: same elapsed → same result', () => {
    const t = SUDDEN_DEATH_AT_MS + 1500;
    expect(suddenDeathHud(t)).toEqual(suddenDeathHud(t));
  });
});

describe('formatCountdown (M:SS, clamps negatives)', () => {
  it('120 → 2:00', () => {
    expect(formatCountdown(120)).toBe('2:00');
  });

  it('99 → 1:39', () => {
    expect(formatCountdown(99)).toBe('1:39');
  });

  it('60 → 1:00', () => {
    expect(formatCountdown(60)).toBe('1:00');
  });

  it('45 → 0:45', () => {
    expect(formatCountdown(45)).toBe('0:45');
  });

  it('5 → 0:05 (zero-pads seconds)', () => {
    expect(formatCountdown(5)).toBe('0:05');
  });

  it('0 → 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('negative clamps to 0:00', () => {
    expect(formatCountdown(-1)).toBe('0:00');
    expect(formatCountdown(-37)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatCountdown(90.9)).toBe('1:30');
    expect(formatCountdown(5.4)).toBe('0:05');
  });
});

describe('panelLayout (width-aware, 4-player never overlaps center SD timer)', () => {
  const SD_LEFT_EDGE = (stageW: number) =>
    stageW / 2 - HUD_SD_RESERVE_HALF - HUD_SD_MARGIN;

  it('2 players: full-width corner panels, no shrink', () => {
    const lay = panelLayout(800, 2);
    expect(lay.length).toBe(2);
    // seat 0 left corner, seat 1 right corner, both PANEL_W
    expect(lay[0].panelW).toBe(HUD_PANEL_W);
    expect(lay[1].panelW).toBe(HUD_PANEL_W);
    expect(lay[0].x).toBe(HUD_PANEL_EDGE);
    expect(lay[1].x).toBe(800 - HUD_PANEL_EDGE - HUD_PANEL_W);
  });

  it('2 players stays full-width even at narrow widths (corners kept as-is)', () => {
    const lay = panelLayout(640, 2);
    expect(lay[0].panelW).toBe(HUD_PANEL_W);
    expect(lay[1].panelW).toBe(HUD_PANEL_W);
  });

  it('4 players at a wide stage: full-width panels, left inner edge clears SD box', () => {
    const stageW = 1280;
    const lay = panelLayout(stageW, 4);
    expect(lay.length).toBe(4);
    // left group = seats 0,2 ; right group = seats 1,3
    const leftInnerEdge = Math.max(
      lay[0].x + lay[0].panelW,
      lay[2].x + lay[2].panelW,
    );
    expect(leftInnerEdge).toBeLessThanOrEqual(SD_LEFT_EDGE(stageW));
  });

  it('4 players at narrow ~700px: panels shrink so left inner edge still clears SD box', () => {
    const stageW = 700;
    const lay = panelLayout(stageW, 4);
    const leftInnerEdge = Math.max(
      lay[0].x + lay[0].panelW,
      lay[2].x + lay[2].panelW,
    );
    expect(leftInnerEdge).toBeLessThanOrEqual(SD_LEFT_EDGE(stageW));
    // and panels must have shrunk below full width to achieve it
    expect(lay[0].panelW).toBeLessThan(HUD_PANEL_W);
  });

  // Below ~540px the SD box + two min-width panels per side physically can't
  // coexist (the MIN_W floor wins); the guarantee is documented to hold from
  // there up. That floor is well below the flagged concern band (≲882px) and
  // below the 628px mutual-overlap threshold, so it fully covers the issue.
  const FOUR_PLAYER_MIN_W = 540;

  it('4 players never overlaps the center SD box across a wide range of widths', () => {
    for (let stageW = FOUR_PLAYER_MIN_W; stageW <= 1600; stageW += 17) {
      const lay = panelLayout(stageW, 4);
      const sdLeft = SD_LEFT_EDGE(stageW);
      const sdRight = stageW - sdLeft;
      const leftInnerEdge = Math.max(
        lay[0].x + lay[0].panelW,
        lay[2].x + lay[2].panelW,
      );
      const rightInnerEdge = Math.min(lay[1].x, lay[3].x);
      expect(leftInnerEdge).toBeLessThanOrEqual(sdLeft + 1e-6);
      expect(rightInnerEdge).toBeGreaterThanOrEqual(sdRight - 1e-6);
    }
  });

  it('4 players clears SD box at the documented minimum width (540px)', () => {
    const lay = panelLayout(FOUR_PLAYER_MIN_W, 4);
    const leftInnerEdge = Math.max(
      lay[0].x + lay[0].panelW,
      lay[2].x + lay[2].panelW,
    );
    expect(leftInnerEdge).toBeLessThanOrEqual(SD_LEFT_EDGE(FOUR_PLAYER_MIN_W) + 1e-6);
    expect(lay[0].panelW).toBe(HUD_PANEL_MIN_W); // pinned at the floor here
  });

  it('symmetric: right group mirrors the left group', () => {
    const stageW = 760;
    const lay = panelLayout(stageW, 4);
    // seat 0 (left) mirrors seat 1 (right); seat 2 mirrors seat 3
    expect(lay[1].x).toBeCloseTo(stageW - lay[0].x - lay[0].panelW, 6);
    expect(lay[3].x).toBeCloseTo(stageW - lay[2].x - lay[2].panelW, 6);
    expect(lay[1].panelW).toBeCloseTo(lay[0].panelW, 6);
    expect(lay[3].panelW).toBeCloseTo(lay[2].panelW, 6);
  });

  it('3 players: 2 left (seats 0,2), 1 right (seat 1), still clears SD box when narrow', () => {
    const stageW = 700;
    const lay = panelLayout(stageW, 3);
    expect(lay.length).toBe(3);
    const leftInnerEdge = Math.max(
      lay[0].x + lay[0].panelW,
      lay[2].x + lay[2].panelW,
    );
    expect(leftInnerEdge).toBeLessThanOrEqual(SD_LEFT_EDGE(stageW) + 1e-6);
  });

  it('panel width never goes below a sane minimum', () => {
    const lay = panelLayout(420, 4);
    expect(lay[0].panelW).toBeGreaterThanOrEqual(60);
  });
});
