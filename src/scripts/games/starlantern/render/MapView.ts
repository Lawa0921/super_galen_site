import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Game } from '../engine/game';
import type { FloorMap, Tile } from '../engine/map';
import { art, tileKey } from './artPaths';
import { fogState } from './fog';
import type { TextureBank } from './textures';

const COLORS: Partial<Record<Tile, number>> = {
  wall: 0x2a2d3a, floor: 0x5b6150, door: 0x9c6644, up: 0x8ecae6, down: 0x219ebc, chest: 0xe9c46a, entrance: 0x90be6d, boss: 0xd62828,
};
const FOG = 0x05060a;
/** Fill colour for a tile without art; kinds with no colour of their own (fountain, trap, ...) show plain floor. */
export function tileColor(t: Tile, opened: boolean): number {
  return COLORS[opened ? 'floor' : t] ?? COLORS.floor!;
}
/** Remembered tiles are drawn darker so the area around the party stands out. */
const MEMORY_TINT = 0x6a6e86;
/** Screen pixels per map cell; the view follows the party instead of shrinking the whole floor to fit. */
export const MAP_CELL = 48;
/** Fog reaches this many cells past the map edge so the view never shows bare black around a small floor. */
const FOG_PAD = 14;
const HOP_FRAMES = 10;

function dim(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  return (Math.floor(r * 0.45) << 16) | (Math.floor(g * 0.45) << 8) | Math.floor(b * 0.5);
}

/**
 * The labyrinth from above: large cells, one seamless fog over everything unexplored, and a camera that keeps the party
 * in the middle of the view, easing along as it walks.
 */
export class MapView {
  readonly root = new Container();
  private world = new Container();
  private fogLayer: TilingSprite | Graphics | null = null;
  private tiles = new Container();
  /** Dark gradients along explored cells that border the fog, so the edge fades instead of cutting off. */
  private edges = new Container();
  private edgeTex: Texture | null = null;
  private marker = new Container();
  private dot = new Graphics();
  private icon = new Sprite();
  private target = { x: 0, y: 0 };
  private view = { width: 640, height: 296 };
  private hop = 0;
  /** The floor drawn last: a different one (next depth or a new run) lays a new fog and skips the slide. */
  private drawn: FloorMap | null = null;

  /** `calm`: reduced motion, no hop while walking. */
  constructor(private bank: TextureBank | null = null, private calm = false) {
    this.marker.addChild(this.dot, this.icon);
    this.world.addChild(this.tiles, this.edges, this.marker);
    this.root.addChild(this.world);
  }

  /** Sprites with a given label on the last draw (for tests). */
  countByLabel(label: string): number {
    return [...this.tiles.children, ...this.edges.children].filter((c) => c.label === label).length;
  }

  /** Tiles drawn for the cells the party has seen (for tests and diagnostics). */
  tileCount(): number {
    return this.tiles.children.length;
  }

  /** Fog edges drawn on the last draw (for tests). */
  edgeCount(): number {
    return this.edges.children.length;
  }

  draw(game: Game, size: { width: number; height: number }): void {
    this.view = size;
    const map = game.map();
    const cell = MAP_CELL;
    const seen = new Set(game.run?.explored[game.floor] ?? []);
    const terrain = game.terrain();
    const fresh = this.drawn !== map || !this.fogLayer;   // first draw or a new floor: no slide from elsewhere
    const fogArrived = this.fogLayer instanceof Graphics && !!this.bank?.get(art.fog);   // the art streamed in after the first draw
    if (fresh || fogArrived) this.layFog(map.width, map.height);
    this.drawn = map;
    for (const s of this.tiles.removeChildren()) s.destroy();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const state = fogState(seen, game.pos, x, y);
        if (state === 'hidden') continue;   // the fog layer underneath shows through
        const t = map.tiles[y][x];
        const opened = t === 'chest' && !!game.run?.opened.has(`${game.floor}:${x},${y}`);
        const wall = t === 'wall' ? this.wallSprite(map, terrain, x, y) : null;
        const tex = wall ? null : this.bank?.get(art.tile(terrain, tileKey(t, opened))) ?? null;
        if (wall || tex) {
          const s = wall ?? this.cellSprite(tex!, x, y, cell);
          if (!wall) s.label = t;
          if (state === 'memory') s.tint = MEMORY_TINT;
          this.tiles.addChild(s);
        } else {
          const color = tileColor(t, opened);
          const g = new Graphics().rect(x * cell, y * cell, cell, cell).fill(state === 'memory' ? dim(color) : color);
          this.tiles.addChild(g);
        }
      }
    }
    this.drawEdges(game, seen);
    this.drawWallShadows(game, seen);
    const tex = this.bank?.get(art.party(game.facing)) ?? null;
    this.dot.clear();
    this.icon.visible = !!tex;
    if (tex) {
      this.icon.texture = tex;
      const k = (cell * 0.95) / Math.max(tex.width, tex.height);
      this.icon.scale.set(k);
      this.icon.anchor.set(0.5, 1);
      this.icon.x = cell / 2; this.icon.y = cell * 0.95;
    } else {
      this.dot.circle(cell / 2, cell / 2, cell * 0.35).fill(0xffd166).stroke({ width: 2, color: 0x1d1d1d });
    }
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = fresh || Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    else if (!this.calm && (tx !== this.target.x || ty !== this.target.y)) this.hop = HOP_FRAMES;
    this.target = { x: tx, y: ty };
    this.follow();
  }

  /**
   * With the autotile art published: a wall whose south neighbour is open ground shows its brick face, any other wall its
   * seamless top. Without it, null (the single wall tile is drawn instead).
   */
  private wallSprite(map: FloorMap, terrain: number, x: number, y: number): Sprite | null {
    const top = this.bank?.get(art.wallTop(terrain)) ?? null;
    const face = this.bank?.get(art.wallFace(terrain)) ?? null;
    if (!top || !face) return null;
    const below = y + 1 < map.height ? map.tiles[y + 1][x] : 'wall';
    const s = this.cellSprite(below === 'wall' ? top : face, x, y, MAP_CELL);
    s.label = below === 'wall' ? 'wall-top' : 'wall-face';
    return s;
  }

  /** Soft shadows on open ground where a wall stands to the north (strong) or to the side (light). */
  private drawWallShadows(game: Game, seen: ReadonlySet<string>): void {
    const map = game.map();
    const cell = MAP_CELL;
    const tex = this.edgeTexture();
    const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.tiles[y][x] === 'wall';
    const add = (cx: number, cy: number, rot: number, len: number, alpha: number) => {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0);
      sp.width = cell; sp.height = len;
      sp.rotation = rot;
      sp.x = cx; sp.y = cy;
      sp.alpha = alpha;
      sp.label = 'wall-shadow';
      if (tex === Texture.WHITE) sp.tint = 0x050812;
      this.edges.addChildAt(sp, 0);
    };
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (isWall(x, y) || fogState(seen, game.pos, x, y) === 'hidden') continue;
        const px = x * cell, py = y * cell;
        if (isWall(x, y - 1)) add(px + cell / 2, py, 0, Math.round(cell * 0.4), 0.55);
        if (isWall(x - 1, y)) add(px, py + cell / 2, -Math.PI / 2, Math.round(cell * 0.18), 0.35);
        if (isWall(x + 1, y)) add(px + cell, py + cell / 2, Math.PI / 2, Math.round(cell * 0.18), 0.35);
      }
    }
  }

  /** A tiny dark-to-clear strip, made once; edges are sprites of it turned to face the fog. */
  private edgeTexture(): Texture {
    if (this.edgeTex) return this.edgeTex;
    let tex = Texture.WHITE;
    try {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 16;
      const g = c.getContext('2d');
      if (g) {
        const grad = g.createLinearGradient(0, 0, 0, 16);
        grad.addColorStop(0, 'rgba(5,8,18,0.92)');
        grad.addColorStop(1, 'rgba(5,8,18,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 1, 16);
        tex = Texture.from(c);
      }
    } catch { /* no canvas (tests): a plain strip still marks the edge */ }
    this.edgeTex = tex;
    return tex;
  }

  private drawEdges(game: Game, seen: ReadonlySet<string>): void {
    const map = game.map();
    const cell = MAP_CELL;
    const band = Math.round(cell * 0.45);
    const tex = this.edgeTexture();
    const hidden = (x: number, y: number) => x < 0 || y < 0 || x >= map.width || y >= map.height || fogState(seen, game.pos, x, y) === 'hidden';
    // The strip runs dark at its top; rotate it so the dark side lies against the fog.
    const strip = (cx: number, cy: number, rot: number) => {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0);
      sp.width = cell; sp.height = band;
      sp.rotation = rot;
      sp.x = cx; sp.y = cy;
      if (tex === Texture.WHITE) { sp.tint = 0x050812; sp.alpha = 0.5; }
      this.edges.addChild(sp);
    };
    for (const c of this.edges.removeChildren()) c.destroy();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (hidden(x, y)) continue;
        const px = x * cell, py = y * cell;
        if (hidden(x, y - 1)) strip(px + cell / 2, py, 0);
        if (hidden(x, y + 1)) strip(px + cell / 2, py + cell, Math.PI);
        if (hidden(x - 1, y)) strip(px, py + cell / 2, -Math.PI / 2);
        if (hidden(x + 1, y)) strip(px + cell, py + cell / 2, Math.PI / 2);
      }
    }
  }

  /** One fog layer for the whole floor and a margin around it: the fog art tiles seamlessly at its own size. */
  private layFog(w: number, h: number): void {
    this.fogLayer?.destroy();
    const cell = MAP_CELL;
    const x = -FOG_PAD * cell, y = -FOG_PAD * cell;
    const width = (w + FOG_PAD * 2) * cell, height = (h + FOG_PAD * 2) * cell;
    const fogTex = this.bank?.get(art.fog) ?? null;
    if (fogTex) {
      const f = new TilingSprite({ texture: fogTex, width, height });
      f.x = x; f.y = y;
      this.fogLayer = f;
    } else {
      this.fogLayer = new Graphics().rect(x, y, width, height).fill(FOG);
    }
    this.world.addChildAt(this.fogLayer, 0);
  }

  private cellSprite(tex: Texture, x: number, y: number, cell: number): Sprite {
    const s = new Sprite(tex);
    s.x = x * cell; s.y = y * cell; s.width = cell; s.height = cell;
    return s;
  }

  /** Keep the party marker in the middle of the view. */
  private follow(): void {
    this.world.x = Math.round(this.view.width / 2 - (this.marker.x + MAP_CELL / 2));
    this.world.y = Math.round(this.view.height / 2 - (this.marker.y + MAP_CELL / 2));
  }

  /** Slide toward the tile with a small hop, the view following; called from the Pixi ticker. */
  update(dt: number): void {
    const k = Math.min(1, 0.35 * dt);
    this.marker.x += (this.target.x - this.marker.x) * k;
    this.marker.y += (this.target.y - this.marker.y) * k;
    if (Math.abs(this.target.x - this.marker.x) < 0.5) this.marker.x = this.target.x;
    if (Math.abs(this.target.y - this.marker.y) < 0.5) this.marker.y = this.target.y;
    this.hop = Math.max(0, this.hop - dt);
    const lift = Math.sin((this.hop / HOP_FRAMES) * Math.PI) * MAP_CELL * 0.12;
    this.dot.y = -lift;
    this.icon.y = MAP_CELL * 0.95 - lift;
    this.follow();
  }
}
