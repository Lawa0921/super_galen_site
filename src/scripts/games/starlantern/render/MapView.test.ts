import { Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { DELTA, tileAt } from '../engine/map';
import { mulberry32 } from '../engine/rng';
import { floorOf } from '../engine/dungeon/run';
import { constRng, withGatherLive, withRosterLive } from '../engine/testing';
import { fogState } from './fog';
import { GATHER_GLOW_TINT, GATHER_RICH_TINT, MAP_CELL, MapView, gatherRichTint } from './MapView';
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

  it('the map draws a warden on the elite tile', () => {
    withRosterLive(['false-moon'], () => {
      const game = new Game(constRng(0.99), null);
      game.state.dungeon.reached.mainline = 8;
      game.depart({ region: 'mainline', condition: 'plain' }, 8);
      const room = floorOf(game.run!, 8).contents.find((c) => c.kind === 'warden')!;
      expect(room).toBeDefined();
      exploreAll(game);
      expect(markersOf(game)).toContainEqual({ kind: 'warden', x: room.at.x, y: room.at.y });
      // With the event art: the elite's tile, under its own label; plain floor under it.
      const urls: string[] = [];
      const spy = { get: (u: string) => { urls.push(u); return Texture.WHITE; }, has: () => true } as unknown as TextureBank;
      const view = new MapView(spy);
      view.draw(game, SIZE);
      expect(view.markerLabels()).toContain('event-warden');
      expect(urls).toContain(art.eventTile('elite'));
      expect(urls.some((u) => u.includes('event-warden'))).toBe(false);
      expect(urls.some((u) => /\/tiles\/f\d-warden/.test(u))).toBe(false);
      // Without it, the elite's glyph.
      const plain = new MapView(noEventArt);
      plain.draw(game, SIZE);
      expect(plain.markerGlyphs()).toContain(MARKER_GLYPH.elite);
      expect(MARKER_GLYPH.warden).toBe(MARKER_GLYPH.elite);
      // Beaten, it is floor and unmarked.
      expect(stepOnto(game, room.at).kind).toBe('battle');
      for (const e of game.battle!.enemies) { e.hp = 0; e.alive = false; }
      game.submitRound({});
      expect(markersOf(game).some((m) => m.kind === 'warden')).toBe(false);
    });
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

describe('MapView gathering points (gathering plan Task B1)', () => {
  const SIZE = { width: 640, height: 296 };
  /** No event art at all: markers are text glyphs. */
  const noEventArt = { get: (u: string) => (u.includes('/tiles/event-') || u.includes('/tiles/gather-') || u.endsWith('-chest.png') ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
  const KINDS = [
    { type: 'vein', item: 'copper-ore' }, { type: 'herb', item: 'stanch-herb' }, { type: 'fungus', item: 'cap-mushroom' },
    { type: 'crystal', item: 'quartz-chip' }, { type: 'spot', item: 'scrap-iron' },
  ] as const;
  /** A game with gathering on, every cell seen, and one point of each kind (the last rich) on plain floor. */
  function planted(): { game: Game; at: { x: number; y: number }[] } {
    const game = withGatherLive(() => { const g = new Game(constRng(0.99), null); g.depart({ region: 'iron', condition: 'plain' }, 1); return g; }, { open: true });
    const f = floorOf(game.run!, game.floor);
    f.contents = f.contents.filter((c) => c.kind !== 'gather');
    const m = game.map();
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.tiles[y][x] === 'gather') m.tiles[y][x] = 'floor';
    const at: { x: number; y: number }[] = [];
    for (let y = 0; y < m.height && at.length < KINDS.length; y++) for (let x = 0; x < m.width && at.length < KINDS.length; x++) {
      if (m.tiles[y][x] !== 'floor' || (x === game.pos.x && y === game.pos.y)) continue;
      const k = KINDS[at.length];
      m.tiles[y][x] = 'gather';
      f.contents.push({ kind: 'gather', at: { x, y }, room: 0, gather: { ...k, qty: 1, ...(at.length === KINDS.length - 1 ? { rich: true as const } : {}) } });
      at.push({ x, y });
    }
    game.run!.explored[game.floor] = m.tiles.flatMap((row, y) => row.map((_, x) => `${x},${y}`));
    return { game, at };
  }
  const glyphTexts = (view: MapView): Text[] => {
    const world = view.root.children[0] as Container;
    const marks = world.children.find((c) => c.label === 'markers') as Container;
    return marks.children.filter((c): c is Text => c instanceof Text && c.label === 'glyph-gather');
  };

  it("a point wears its kind's glyph", () => {
    const { game, at } = planted();
    const view = new MapView(noEventArt);
    view.draw(game, SIZE);
    const texts = glyphTexts(view);
    expect(texts.map((t) => t.text).sort()).toEqual(['礦', '草', '菇', '晶', '採'].sort());
    for (const t of texts) expect([t.style.fontSize, t.style.fontWeight]).toEqual([24, 'normal']);
    const fill = (t: Text) => t.style.fill;
    expect(texts.filter((t) => t.text !== '採').map(fill)).toEqual([0x8fd18b, 0x8fd18b, 0x8fd18b, 0x8fd18b]);   // pale green
    // remembered cells are dim: a glyph out of sight is half transparent, in sight it is whole
    for (const t of texts) {
      const p = at.find((c) => Math.abs(c.x * MAP_CELL + MAP_CELL / 2 - t.x) < 1 && Math.abs(c.y * MAP_CELL + MAP_CELL / 2 - t.y) < 1)!;
      expect(t.alpha).toBe(fogState(seenOf(game), game.pos, p.x, p.y) === 'memory' ? 0.6 : 1);
    }
    expect(texts.some((t) => t.alpha === 0.6)).toBe(true);
    // the cell under a point is plain floor art, as under any event
    expect(view.countByLabel('gather')).toBe(0);
  });

  it('a rich point is gold', () => {
    const { game } = planted();
    const view = new MapView(noEventArt);
    view.draw(game, SIZE);
    const rich = glyphTexts(view).find((t) => t.text === '採')!;
    expect(rich.style.fill).toBe(0xe8c46a);
  });

  /** Gathering art here (gathering plan Task E4); no event art, so only the points wear art. */
  const gatherArt = { get: (u: string) => (u.includes('/tiles/event-') || u.endsWith('-chest.png') ? null : Texture.WHITE), has: () => true } as unknown as TextureBank;
  const markSprites = (view: MapView): Sprite[] => {
    const world = view.root.children[0] as Container;
    const marks = world.children.find((c) => c.label === 'markers') as Container;
    return marks.children.filter((c): c is Sprite => c instanceof Sprite && c.label.startsWith('gather-'));
  };

  it("a point wears its tile once the art is here: a spot its land's, no glyph", () => {
    const { game } = planted();
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return gatherArt.get(u); }, has: () => true } as unknown as TextureBank;
    const view = new MapView(spy);
    view.draw(game, SIZE);
    expect(glyphTexts(view)).toEqual([]);
    const tiles = markSprites(view).filter((s) => s.label !== 'gather-glow');
    expect(tiles.map((s) => s.label).sort()).toEqual(['gather-crystal', 'gather-fungus', 'gather-herb', 'gather-iron', 'gather-vein']);
    for (const s of tiles) expect([s.width, s.height]).toEqual([MAP_CELL, MAP_CELL]);
    expect(urls).toContain(art.gatherTile('iron'));   // the iron fortress's spot wears the scrap heap
    expect(urls).not.toContain(art.gatherTile('spot' as never));
  });

  it('a rich point is tinted gold over a gold glow drawn in code, no art of its own', () => {
    const { game } = planted();
    const view = new MapView(gatherArt);
    view.draw(game, SIZE);
    const all = markSprites(view);
    const rich = all.find((s) => s.label === 'gather-iron')!;
    const glow = all.filter((s) => s.label === 'gather-glow');
    expect(glow).toHaveLength(1);   // only the rich point glows
    const p = { x: Math.floor(rich.x / MAP_CELL), y: Math.floor(rich.y / MAP_CELL) };
    const memory = fogState(seenOf(game), game.pos, p.x, p.y) === 'memory';
    expect(rich.tint).toBe(gatherRichTint(memory));   // gold; out of sight, gold dimmed as any remembered cell
    expect(gatherRichTint(false)).toBe(GATHER_RICH_TINT);
    expect(gatherRichTint(true)).not.toBe(GATHER_RICH_TINT);
    expect(glow[0].tint).toBe(GATHER_GLOW_TINT);
    expect(glow[0].texture).toBe(rich.texture);   // the point's own tile, tinted and spread: no glow image
    expect(glow[0].width).toBeGreaterThan(MAP_CELL);
    expect(glow[0].alpha).toBeLessThan(1);
    expect(all.indexOf(glow[0])).toBeLessThan(all.indexOf(rich));   // under the point
    for (const s of all.filter((x) => x !== rich && x !== glow[0])) expect([GATHER_RICH_TINT, gatherRichTint(true)]).not.toContain(s.tint);
  });

  it('without its art a point keeps its glyph and asks only for its tile', () => {
    const { game } = planted();
    const urls: string[] = [];
    const spy = { get: (u: string) => { urls.push(u); return noEventArt.get(u); }, has: () => true } as unknown as TextureBank;
    new MapView(spy).draw(game, SIZE);
    expect(urls.filter((u) => /gather/.test(u)).sort()).toEqual(['crystal', 'fungus', 'herb', 'iron', 'vein'].map((k) => art.gatherTile(k as never)).sort());
  });
});
