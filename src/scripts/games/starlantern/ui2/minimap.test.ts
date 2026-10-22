import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { floorOf } from '../engine/dungeon/run';
import { constRng } from '../engine/testing';
import { MINIMAP_COLORS, MINIMAP_H, MINIMAP_W, Minimap, minimapLayout, type Minimap2D } from './minimap';

interface Call { style: string; x: number; y: number; w: number; h: number }

/** A stand-in 2D context that records every filled rectangle with the fill style it was drawn in. */
function fakeCtx(): { ctx: Minimap2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '' as string,
    clearRect() { calls.length = 0; },
    fillRect(x: number, y: number, w: number, h: number) { calls.push({ style: String(this.fillStyle), x, y, w, h }); },
  };
  return { ctx: ctx as unknown as Minimap2D, calls };
}

const PLAIN = { region: 'mainline', condition: 'plain' } as const;
const count = (calls: Call[], ...styles: string[]) => calls.filter((c) => styles.includes(c.style)).length;
const CELL_STYLES = [MINIMAP_COLORS.floor, MINIMAP_COLORS.floorMemory, MINIMAP_COLORS.wall, MINIMAP_COLORS.wallMemory];

describe('Minimap', () => {
  it('is a 120×88 canvas', () => {
    const m = new Minimap(fakeCtx().ctx);
    expect(m.el.tagName).toBe('CANVAS');
    expect(m.el.classList.contains('slx-minimap')).toBe(true);
    expect([m.el.width, m.el.height]).toEqual([MINIMAP_W, MINIMAP_H]);
    expect([MINIMAP_W, MINIMAP_H]).toEqual([120, 88]);
  });

  it('the minimap shows explored cells and the player', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(PLAIN, 1);
    const { ctx, calls } = fakeCtx();
    const m = new Minimap(ctx);
    m.draw(game);
    const seen = game.run!.explored[1].length;
    expect(count(calls, ...CELL_STYLES)).toBe(seen);
    const party = calls.filter((c) => c.style === MINIMAP_COLORS.party);
    expect(party).toHaveLength(1);
    const { scale, ox, oy } = minimapLayout(game.map().width, game.map().height);
    expect(party[0].x).toBeCloseTo(ox + game.pos.x * scale, 5);
    expect(party[0].y).toBeCloseTo(oy + game.pos.y * scale, 5);
    // walking reveals more, and the dot follows
    for (let i = 0; i < 4; i++) game.move('right');
    m.draw(game);
    expect(count(calls, ...CELL_STYLES)).toBe(game.run!.explored[1].length);
    expect(game.run!.explored[1].length).toBeGreaterThanOrEqual(seen);
    expect(calls.filter((c) => c.style === MINIMAP_COLORS.party)[0].x).toBeCloseTo(ox + game.pos.x * scale, 5);
    // cells next to the party are bright, the rest remembered
    expect(count(calls, MINIMAP_COLORS.floor, MINIMAP_COLORS.wall)).toBeLessThanOrEqual(9);
    expect(count(calls, MINIMAP_COLORS.floorMemory, MINIMAP_COLORS.wallMemory)).toBeGreaterThan(0);
  });

  it('marks discovered stairs and events, never unexplored ones', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(PLAIN, 1);
    const { ctx, calls } = fakeCtx();
    const m = new Minimap(ctx);
    m.draw(game);
    expect(count(calls, MINIMAP_COLORS.stairs, MINIMAP_COLORS.event, MINIMAP_COLORS.boss)).toBe(0);
    const map = game.map();
    const all: string[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) all.push(`${x},${y}`);
    game.run!.explored[1] = all;
    m.draw(game);
    expect(count(calls, MINIMAP_COLORS.stairs)).toBe(map.down ? 1 : 0);
    expect(count(calls, MINIMAP_COLORS.event)).toBe(floorOf(game.run!, 1).contents.filter((c) => c.kind !== 'trap').length);
  });

  it('an opened chest keeps its event dot while its gear waits, and loses it once the gear is taken', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(PLAIN, 1);
    const map = game.map();
    const all: string[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) all.push(`${x},${y}`);
    game.run!.explored[1] = all;
    const chest = floorOf(game.run!, 1).contents.find((c) => c.kind === 'chest')!.at;
    const { ctx, calls } = fakeCtx();
    const m = new Minimap(ctx);
    m.draw(game);
    const events = count(calls, MINIMAP_COLORS.event);
    // Open it with its gear left waiting (as a full bag would), then take the gear.
    game.run!.opened.add(`1:${chest.x},${chest.y}`);
    game.run!.waiting[`1:${chest.x},${chest.y}`] = { uid: 5, base: 'iron-sword', rarity: 'rare', ilvl: 1, affixes: [], enhance: 0 };
    m.draw(game);
    expect(count(calls, MINIMAP_COLORS.event)).toBe(events);
    delete game.run!.waiting[`1:${chest.x},${chest.y}`];
    m.draw(game);
    expect(count(calls, MINIMAP_COLORS.event)).toBe(events - 1);
  });

  it('fits any floor size inside the canvas', () => {
    for (const [w, h] of [[20, 15], [40, 30], [61, 45], [200, 40], [10, 120]]) {
      const { scale, ox, oy } = minimapLayout(w, h);
      expect(ox).toBeGreaterThanOrEqual(0);
      expect(oy).toBeGreaterThanOrEqual(0);
      expect(ox + w * scale).toBeLessThanOrEqual(MINIMAP_W + 1e-9);
      expect(oy + h * scale).toBeLessThanOrEqual(MINIMAP_H + 1e-9);
    }
  });

  it('draws nothing (and does not throw) without a 2D context', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(PLAIN, 1);
    expect(() => new Minimap(null).draw(game)).not.toThrow();
  });
});
