import { Container, Graphics, Text, Texture, TilingSprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { DELTA, tileAt } from '../engine/map';
import { mulberry32 } from '../engine/rng';
import { floorOf } from '../engine/dungeon/run';
import { constRng } from '../engine/testing';
import { fogState } from './fog';
import { MAP_CELL, MapView } from './MapView';
import { MARKER_GLYPH, markersOf } from './markers';
import { PIXEL_FONT } from './pixelText';
import { chestHasGear } from '../engine/loot/drops';
import type { TextureBank } from './textures';
import { art } from './artPaths';

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

describe('MapView without art (no placeholder)', () => {
  /** Every Graphics under the view but the fog's own plain layer. */
  const graphics = (c: Container): Graphics[] => c.children.flatMap((x) => [...(x instanceof Graphics && x.label !== 'fog' ? [x] : []), ...graphics(x as Container)]);

  it('draws no colour square for a tile and no dot for the party while their art has not loaded, then streams it in', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    const listeners: ((u: string) => void)[] = [];
    let loaded = false;
    const late = {
      get: (u: string) => (loaded || u.includes('/map/fog') ? Texture.WHITE : null), has: () => loaded,
      onLoad: (fn: (u: string) => void) => { listeners.push(fn); return () => {}; },
    } as unknown as TextureBank;
    const view = new MapView(late);
    view.draw(game, { width: 640, height: 296 });
    expect(graphics(view.root)).toEqual([]);
    expect(view.countByLabel('floor')).toBe(0);
    // The art lands: the view redraws itself with it, no step needed.
    loaded = true;
    for (const fn of listeners) fn(art.tile(game.terrain(), 'floor'));
    expect(view.countByLabel('floor')).toBeGreaterThan(0);
    expect(graphics(view.root)).toEqual([]);
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
    // Every glyph is the pixel font at 24px, normal weight (legibility Task 4).
    const glyphs = view.root.children.flatMap(function all(c): Text[] { return c instanceof Text ? [c] : c instanceof Container ? c.children.flatMap(all) : []; });
    expect(glyphs.length).toBeGreaterThan(0);
    for (const t of glyphs) expect([t.style.fontFamily, t.style.fontSize, t.style.fontWeight], t.text).toEqual([PIXEL_FONT, 24, 'normal']);
  });

  it('draws the event art instead of a glyph once it has loaded, and plain floor under every event tile', () => {
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return Texture.WHITE; }, has: () => true } as unknown as TextureBank;
    const game = new Game(constRng(0.99), null);
    game.depart({ region: 'mainline', condition: 'calm' }, 1);
    exploreAll(game);
    const view = new MapView(spy);
    view.draw(game, SIZE);
    expect(view.markerGlyphs().filter((g) => g !== MARKER_GLYPH.glimmer)).toEqual([]);   // a glimmer has no art, only its glyph
    const labels = view.markerLabels();
    for (const c of floorOf(game.run!, 1).contents) {
      if (c.kind === 'trap') expect(labels).not.toContain('event-trap');
      else if (c.kind !== 'chest' && c.kind !== 'glimmer') expect(labels).toContain(`event-${c.kind}`);
    }
    const tileUrls = urls.filter((u) => /\/tiles\/f\d-/.test(u));
    expect(tileUrls.some((u) => /-(fountain|trap|merchant|altar|elite|vault|key)\.png$/.test(u))).toBe(false);
  });

  it('a seen rescue room shows the 救 marker and asks for no art', () => {
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return u.includes('/tiles/event-') ? null : Texture.WHITE; }, has: () => true } as unknown as TextureBank;
    const game = new Game(constRng(0.99), null);
    game.state.dungeon.reached.mainline = 3;
    expect(game.depart(MAIN, 2)).toEqual({ ok: true });
    const f = floorOf(game.run!, 2);
    f.map.tiles[1][1] = 'altar';   // a real event tile beside it, to prove the spy sits on the path that asks for art
    f.contents.push({ kind: 'altar', at: { x: 1, y: 1 }, room: 0 });
    exploreAll(game);
    const view = new MapView(spy);
    view.draw(game, SIZE);
    expect(markersOf(game).map((m) => m.kind)).toContain('rescue');
    expect(view.markerGlyphs()).toContain(MARKER_GLYPH.rescue);
    expect(urls).not.toContain(art.eventTile('rescue' as never));
    expect(urls).toContain(art.eventTile('altar'));
  });

  it('a seen glimmer shows the 憶 marker and asks for no art', () => {
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return u.includes('/tiles/event-') ? null : Texture.WHITE; }, has: () => true } as unknown as TextureBank;
    const game = new Game(constRng(0.99), null);
    expect(game.depart(MAIN, 1)).toEqual({ ok: true });
    const f = floorOf(game.run!, 1);
    f.map.tiles[1][1] = 'altar';   // a real event tile beside it, to prove the spy sits on the path that asks for art
    f.contents.push({ kind: 'altar', at: { x: 1, y: 1 }, room: 0 });
    const glimmer = f.contents.find((c) => c.kind === 'glimmer')!;
    expect(glimmer).toBeDefined();
    const mark = () => markersOf(game).filter((m) => m.kind === 'glimmer');
    expect(mark()).toEqual([]);   // not seen yet
    exploreAll(game);
    const view = new MapView(spy);
    view.draw(game, SIZE);
    expect(mark()).toEqual([{ kind: 'glimmer', x: glimmer.at.x, y: glimmer.at.y }]);
    expect(view.markerGlyphs()).toContain(MARKER_GLYPH.glimmer);
    expect(MARKER_GLYPH.glimmer).toBe('憶');
    expect(urls).not.toContain(art.eventTile('glimmer' as never));
    expect(urls).toContain(art.eventTile('altar'));
    game.map().tiles[glimmer.at.y][glimmer.at.x] = 'floor';   // what stepping on it does
    expect(mark()).toEqual([]);
  });

  it('the 救 marker shows only on a seen rescue room, and goes once the room is floor', () => {
    const game = new Game(constRng(0.99), null);
    game.state.dungeon.reached.mainline = 3;
    expect(game.depart(MAIN, 2)).toEqual({ ok: true });
    const at = floorOf(game.run!, 2).contents.find((c) => c.kind === 'rescue')!.at;
    const rescues = () => markersOf(game).filter((m) => m.kind === 'rescue');
    expect(rescues()).toEqual([]);   // not seen yet
    exploreAll(game);
    expect(rescues()).toEqual([{ kind: 'rescue', x: at.x, y: at.y }]);
    game.map().tiles[at.y][at.x] = 'floor';   // what a win does to the room
    expect(rescues()).toEqual([]);
  });

  it('keeps each marker glyph across draws and drops the ones that are spent', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    exploreAll(game);
    const chest = floorOf(game.run!, 1).contents.find((c) => c.kind === 'chest')!.at;
    const view = new MapView(noEventArt);
    view.draw(game, SIZE);
    const marks = view.root.children[0] as unknown as { children: { label: string; children: unknown[] }[] };
    const layer = () => (marks.children.find((c) => c.label === 'markers') as unknown as { children: Text[] });
    const first = [...layer().children];
    view.draw(game, SIZE);
    expect(layer().children).toHaveLength(first.length);
    expect(layer().children.every((t, i) => t === first[i])).toBe(true);   // the same Text objects, not new ones
    const box = first.find((t) => t.text === '箱')!;
    expect(stepOnto(game, chest).kind).toBe('chest');
    view.draw(game, SIZE);
    expect(layer().children).not.toContain(box);
    expect(box.destroyed).toBe(true);
  });

  it('an opened chest whose gear still waits keeps its 箱 marker, even over the chest tile art; taking the gear removes it', () => {
    const game = new Game(constRng(0.99), null);
    game.depart(MAIN, 1);
    const m = game.map();
    let chest: { x: number; y: number } | null = null;
    for (let y = 1; y < m.height - 1 && !chest; y++) for (let x = 1; x < m.width - 1 && !chest; x++) {
      if (m.tiles[y][x] !== 'floor' || (x === game.pos.x && y === game.pos.y) || !chestHasGear(game.run!, 1, { x, y })) continue;
      m.tiles[y][x] = 'chest';
      floorOf(game.run!, 1).contents.push({ kind: 'chest', at: { x, y }, room: 0 });
      chest = { x, y };
    }
    game.state.bag = Array.from({ length: 60 }, (_, i) => ({ uid: 100 + i, base: 'cloth-robe', rarity: 'common' as const, ilvl: 1, affixes: [], enhance: 0 }));
    game.state.nextUid = 1000;
    exploreAll(game);
    // Chest tile art present (so a shut chest needs no marker), event art absent (so markers are text glyphs).
    const chestArt = { get: (u: string) => (u.includes('/tiles/event-') ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
    const view = new MapView(chestArt);
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).not.toContain('箱');
    const opened = stepOnto(game, chest!);
    expect(opened).toMatchObject({ kind: 'chest', waiting: { bag: true } });
    expect(markersOf(game)).toContainEqual({ kind: 'chest', x: chest!.x, y: chest!.y, waiting: true });
    view.draw(game, SIZE);
    expect(view.markerGlyphs().filter((g) => g === '箱')).toHaveLength(1);
    game.state.bag.pop();
    expect(game.pickUpHere()!.kind).toBe('pickup');
    expect(markersOf(game).some((k) => k.x === chest!.x && k.y === chest!.y)).toBe(false);
    view.draw(game, SIZE);
    expect(view.markerGlyphs()).not.toContain('箱');
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
    expect([view.tileCount(), view.brightCount()]).toEqual([1, 1]);   // fog reveals only the cell the party stands on
    const dir = (['up', 'down', 'left', 'right'] as const).find((d) => tileAt(fog.map(), { x: fog.pos.x + DELTA[d].x, y: fog.pos.y + DELTA[d].y }) === 'floor')!;
    expect(fog.move(dir).kind).toBe('moved');
    view.draw(fog, { width: 640, height: 296 });
    expect([view.tileCount(), view.brightCount()]).toEqual([2, 1]);   // the cell left behind is remembered, dimmed
    const plain = new Game(constRng(0.99), null);
    plain.depart(MAIN, 1);
    const v2 = new MapView(bank);
    v2.draw(plain, { width: 640, height: 296 });
    expect(v2.brightCount()).toBeGreaterThan(1);
  });
});
