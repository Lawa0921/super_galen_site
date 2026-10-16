import { Texture, TilingSprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import { fogState } from './fog';
import { MAP_CELL, MapView } from './MapView';
import type { TextureBank } from './textures';

const bank = { get: () => Texture.WHITE, has: () => true } as unknown as TextureBank;

function setup() {
  const game = new Game(constRng(0.99), null);
  expect(game.depart(1)).toEqual({ ok: true });
  const view = new MapView(bank);
  view.draw(game, { width: 640, height: 296 });
  return { game, view };
}

describe('MapView', () => {
  it('draws large cells and keeps the party in the middle of the view', () => {
    const { game, view } = setup();
    const world = view.root.children[0];
    const partyX = world.x + game.pos.x * MAP_CELL + MAP_CELL / 2;
    const partyY = world.y + game.pos.y * MAP_CELL + MAP_CELL / 2;
    expect(MAP_CELL).toBeGreaterThanOrEqual(40);
    expect(partyX).toBeCloseTo(320, 0);
    expect(partyY).toBeCloseTo(148, 0);
  });

  it('lays one seamless fog over the unexplored dark instead of a fog tile per cell', () => {
    const { game, view } = setup();
    const map = game.map();
    const seen = new Set(game.state.dungeon.explored[String(game.floor)] ?? []);
    let shown = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (fogState(seen, game.pos, x, y) !== 'hidden') shown++;
    const world = view.root.children[0] as unknown as { children: unknown[] };
    const fogs = world.children.filter((c) => c instanceof TilingSprite);
    expect(fogs).toHaveLength(1);
    expect(view.tileCount()).toBe(shown);
  });

  it('follows the party as it walks, easing the view along', () => {
    const { game, view } = setup();
    const world = view.root.children[0];
    const before = world.x;
    game.encounter = 0;
    const r = game.move('right');
    expect(['moved', 'blocked']).toContain(r.kind);
    view.draw(game, { width: 640, height: 296 });
    for (let i = 0; i < 60; i++) view.update(1);
    const partyX = world.x + game.pos.x * MAP_CELL + MAP_CELL / 2;
    expect(partyX).toBeCloseTo(320, 0);
    if (r.kind === 'moved') expect(world.x).toBeLessThan(before);
  });
});

describe('MapView fog edge', () => {
  it('softens the edge where explored cells meet the fog', () => {
    const { view } = setup();
    expect(view.edgeCount()).toBeGreaterThan(0);
  });
});

describe('MapView late fog art', () => {
  it('swaps the plain fog for the fog art once it has loaded', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(1);
    let loaded = false;
    const lateBank = { get: (u: string) => (u.includes('/map/fog') && !loaded ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
    const view = new MapView(lateBank);
    view.draw(game, { width: 640, height: 296 });
    const world = view.root.children[0] as unknown as { children: unknown[] };
    expect(world.children.some((c) => c instanceof TilingSprite)).toBe(false);
    loaded = true;
    view.draw(game, { width: 640, height: 296 });
    expect(world.children.some((c) => c instanceof TilingSprite)).toBe(true);
  });
});
