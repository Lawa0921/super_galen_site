import { Texture, TilingSprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { DELTA, tileAt } from '../engine/map';
import { mulberry32 } from '../engine/rng';
import { floorOf } from '../engine/dungeon/run';
import { constRng } from '../engine/testing';
import { fogState } from './fog';
import { MAP_CELL, MapView, tileColor } from './MapView';
import { MARKER_GLYPH } from './markers';
import type { TextureBank } from './textures';

const bank = { get: () => Texture.WHITE, has: () => true } as unknown as TextureBank;
const MAIN = { region: 'mainline', condition: 'plain' } as const;
const seenOf = (game: Game) => new Set(game.run!.explored[game.floor] ?? []);
/** Walk up to the room's top wall so walls are in sight (the entrance sits mid-room). */
const toTopWall = (game: Game) => { for (let i = 0; i < 8 && game.move('up').kind === 'moved'; i++); };

function setup() {
  const game = new Game(constRng(0.99), null);
  expect(game.depart(MAIN, 1)).toEqual({ ok: true });
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
    const seen = seenOf(game);
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
    game.depart(MAIN, 1);
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

describe('MapView wall autotiling', () => {
  it('draws walls as a continuous top with a brick face only where a wall looks onto open ground, plus a shadow at its foot', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    toTopWall(game);
    const view = new MapView(bank);   // the bank has every texture, including wall-top and wall-face
    view.draw(game, { width: 640, height: 296 });
    const map = game.map();
    const seen = seenOf(game);
    const shown = (x: number, y: number) => fogState(seen, game.pos, x, y) !== 'hidden';
    let faces = 0, tops = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (!shown(x, y) || map.tiles[y][x] !== 'wall') continue;
      const below = y + 1 < map.height ? map.tiles[y + 1][x] : 'wall';
      if (below !== 'wall') faces++; else tops++;
    }
    expect(faces).toBeGreaterThan(0);
    expect(view.countByLabel('wall-face')).toBe(faces);
    expect(view.countByLabel('wall-top')).toBe(tops);
    expect(view.countByLabel('wall-shadow')).toBeGreaterThan(0);
  });

  it('falls back to the single wall tile while the new wall art is not published', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    toTopWall(game);
    const oldBank = { get: (u: string) => (u.includes('wall-top') || u.includes('wall-face') ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
    const view = new MapView(oldBank);
    view.draw(game, { width: 640, height: 296 });
    expect(view.countByLabel('wall-face')).toBe(0);
    expect(view.countByLabel('wall')).toBeGreaterThan(0);
  });
});

describe('MapView tile colours', () => {
  it('draws the floor under tile kinds that have no art or colour of their own', () => {
    for (const t of ['fountain', 'trap', 'merchant', 'altar', 'elite', 'vault', 'key'] as const) {
      expect(tileColor(t, false), t).toBe(tileColor('floor', false));
    }
    expect(tileColor('chest', true)).toBe(tileColor('floor', false));
    expect(tileColor('boss', false)).not.toBe(tileColor('floor', false));
  });
});

describe('MapView runs', () => {
  const urls: string[] = [];
  const spyBank = { get: (u: string) => { urls.push(u); return Texture.WHITE; }, has: () => true } as unknown as TextureBank;
  const fogWidth = (view: MapView) => {
    const world = view.root.children[0] as unknown as { children: unknown[] };
    return (world.children.find((c) => c instanceof TilingSprite) as TilingSprite).width;
  };

  it('draws each depth in its terrain art: the mainline cycles, a region keeps its own', () => {
    const game = new Game(constRng(0.99), null);
    game.state.dungeon.reached.mainline = 2;
    game.depart(MAIN, 2);
    urls.length = 0;
    new MapView(spyBank).draw(game, { width: 640, height: 296 });
    const tiles = () => urls.filter((u) => u.includes('/tiles/'));
    expect(tiles().length).toBeGreaterThan(0);
    expect(tiles().every((u) => u.includes('/tiles/f2-'))).toBe(true);
    game.returnToTown();
    game.depart({ region: 'storm', condition: 'plain' }, 1);
    urls.length = 0;
    new MapView(spyBank).draw(game, { width: 640, height: 296 });
    expect(tiles().every((u) => u.includes('/tiles/f3-'))).toBe(true);
  });

  it('shows a chest opened in this run as open', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    const chest = floorOf(game.run!, 1).contents.find((c) => c.kind === 'chest')!.at;
    const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(game.map(), { x: chest.x - DELTA[d].x, y: chest.y - DELTA[d].y }) !== 'wall')!;
    game.pos = { x: chest.x - DELTA[dir].x, y: chest.y - DELTA[dir].y };
    expect(game.move(dir).kind).toBe('chest');
    urls.length = 0;
    new MapView(spyBank).draw(game, { width: 640, height: 296 });
    expect(urls.some((u) => u.endsWith('-chest-open.png'))).toBe(true);
  });

  it('lays a new fog for a new run even at the same depth', () => {
    const game = new Game(mulberry32(5), null);
    const view = new MapView(bank);
    game.depart(MAIN, 1);
    const first = game.map().width;
    view.draw(game, { width: 640, height: 296 });
    expect(fogWidth(view)).toBe((first + 28) * MAP_CELL);
    for (let i = 0; i < 20 && game.map().width === first; i++) { game.returnToTown(); game.depart(MAIN, 1); }
    expect(game.map().width).not.toBe(first);
    view.draw(game, { width: 640, height: 296 });
    expect(fogWidth(view)).toBe((game.map().width + 28) * MAP_CELL);
  });
});

describe('MapView event markers', () => {
  const SIZE = { width: 640, height: 296 };
  /** Every texture but the event art and the chest tile, so markers fall back to text glyphs. */
  const noEventArt = { get: (u: string) => (u.includes('/tiles/event-') || u.endsWith('-chest.png') ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
  const exploreAll = (game: Game) => {
    const m = game.map();
    const all: string[] = [];
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) all.push(`${x},${y}`);
    game.run!.explored[game.floor] = all;
  };
  const stepOnto = (game: Game, at: { x: number; y: number }) => {
    const dir = (['up', 'down', 'left', 'right'] as const).find((d) => !['wall', 'trap'].includes(tileAt(game.map(), { x: at.x - DELTA[d].x, y: at.y - DELTA[d].y })))!;
    game.pos = { x: at.x - DELTA[dir].x, y: at.y - DELTA[dir].y };
    return game.move(dir);
  };

  it('markers are drawn for seen contents and never for an untriggered trap', () => {
    const game = new Game(constRng(0.99), null);
    game.depart({ region: 'mainline', condition: 'calm' }, 1);   // 靜謐: one extra trap
    const contents = floorOf(game.run!, 1).contents;
    const trap = contents.find((c) => c.kind === 'trap')!;
    expect(trap).toBeDefined();
    const view = new MapView(noEventArt);
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).toEqual([]);   // nothing seen yet away from the entrance
    exploreAll(game);
    view.draw(game, SIZE);
    const want = contents.filter((c) => c.kind !== 'trap').map((c) => MARKER_GLYPH[c.kind as keyof typeof MARKER_GLYPH]);
    expect(view.markerGlyphs().sort()).toEqual(want.sort());
    expect(view.markerGlyphs()).not.toContain('陷');
    expect(stepOnto(game, trap.at).kind).toBe('trap');
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).toContain('陷');
  });

  it('draws the event art instead of a glyph once it has loaded, and plain floor under every event tile', () => {
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return Texture.WHITE; }, has: () => true } as unknown as TextureBank;
    const game = new Game(constRng(0.99), null);
    game.depart({ region: 'mainline', condition: 'calm' }, 1);
    exploreAll(game);
    const view = new MapView(spy);
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).toEqual([]);
    const labels = view.markerLabels();
    for (const c of floorOf(game.run!, 1).contents) {
      if (c.kind === 'trap') expect(labels).not.toContain('event-trap');
      else if (c.kind !== 'chest') expect(labels).toContain(`event-${c.kind}`);
    }
    const tileUrls = urls.filter((u) => /\/tiles\/f\d-/.test(u));
    expect(tileUrls.some((u) => /-(fountain|trap|merchant|altar|elite|vault|key)\.png$/.test(u))).toBe(false);
  });

  it('a spent chest shows its open tile and no marker', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    const chest = floorOf(game.run!, 1).contents.find((c) => c.kind === 'chest')!.at;
    exploreAll(game);
    const view = new MapView(noEventArt);
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).toContain('箱');
    expect(stepOnto(game, chest).kind).toBe('chest');
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).not.toContain('箱');
  });
});

describe('MapView under 濃霧', () => {
  it('draws only the party\'s own cell bright; every other seen cell is remembered', () => {
    const fog = new Game(constRng(0.99), null);
    fog.depart({ region: 'mainline', condition: 'fog' }, 1);
    const view = new MapView(bank);
    view.draw(fog, { width: 640, height: 296 });
    expect(view.tileCount()).toBeGreaterThan(1);   // the reveal radius is unchanged
    expect(view.brightCount()).toBe(1);
    const plain = new Game(constRng(0.99), null);
    plain.depart(MAIN, 1);
    const v2 = new MapView(bank);
    v2.draw(plain, { width: 640, height: 296 });
    expect(v2.brightCount()).toBeGreaterThan(1);
  });
});
