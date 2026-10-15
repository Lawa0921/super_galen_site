import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../engine/game';
import type { Tile } from '../engine/map';
import { art, tileKey } from './artPaths';
import { fogState } from './fog';
import type { TextureBank } from './textures';

const COLORS: Record<Tile, number> = {
  wall: 0x2a2d3a, floor: 0x5b6150, door: 0x9c6644, up: 0x8ecae6, down: 0x219ebc, chest: 0xe9c46a, entrance: 0x90be6d, boss: 0xd62828,
};
const FOG = 0x05060a;
/** Remembered tiles are drawn darker so the area around the party stands out. */
const MEMORY_TINT = 0x6a6e86;

function dim(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  return (Math.floor(r * 0.45) << 16) | (Math.floor(g * 0.45) << 8) | Math.floor(b * 0.5);
}
const HOP_FRAMES = 10;

export class MapView {
  readonly root = new Container();
  private tiles = new Container();
  private blocks = new Graphics();
  private fog = new Graphics();
  private marker = new Container();
  private dot = new Graphics();
  private icon = new Sprite();
  private target = { x: 0, y: 0 };
  private cell = 0;
  private hop = 0;

  constructor(private bank: TextureBank | null = null) {
    this.marker.addChild(this.dot, this.icon);
    this.root.addChild(this.blocks, this.tiles, this.fog, this.marker);
  }

  draw(game: Game, size: { width: number; height: number }): void {
    const map = game.map();
    const seen = new Set(game.state.dungeon.explored[String(game.floor)] ?? []);
    const cell = Math.max(8, Math.floor(Math.min(size.width / map.width, size.height / map.height)));
    this.cell = cell;
    this.root.x = Math.floor((size.width - cell * map.width) / 2);
    this.root.y = Math.floor((size.height - cell * map.height) / 2);
    this.blocks.clear();
    this.fog.clear();
    for (const s of this.tiles.removeChildren()) s.destroy();
    const fogTex = this.bank?.get(art.fog) ?? null;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[y][x];
        const opened = t === 'chest' && game.state.dungeon.opened.includes(`${game.floor}:${x},${y}`);
        const state = fogState(seen, game.pos, x, y);
        if (state === 'hidden') {
          if (fogTex) this.tiles.addChild(this.cellSprite(fogTex, x, y, cell));
          else this.fog.rect(x * cell, y * cell, cell, cell).fill(FOG);
          continue;
        }
        const tex = this.bank?.get(art.tile(game.floor, tileKey(t, opened))) ?? null;
        if (tex) {
          const s = this.cellSprite(tex, x, y, cell);
          if (state === 'memory') s.tint = MEMORY_TINT;
          this.tiles.addChild(s);
        } else {
          const color = COLORS[opened ? 'floor' : t];
          this.blocks.rect(x * cell, y * cell, cell, cell).fill(state === 'memory' ? dim(color) : color);
        }
      }
    }
    const tex = this.bank?.get(art.party(game.facing)) ?? null;
    this.dot.clear();
    this.icon.visible = !!tex;
    if (tex) {
      this.icon.texture = tex;
      const k = (cell * 0.9) / Math.max(tex.width, tex.height);
      this.icon.scale.set(k);
      this.icon.anchor.set(0.5, 1);
      this.icon.x = cell / 2; this.icon.y = cell * 0.95;
    } else {
      this.dot.circle(cell / 2, cell / 2, cell * 0.35).fill(0xffd166).stroke({ width: 2, color: 0x1d1d1d });
    }
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    else if (tx !== this.target.x || ty !== this.target.y) this.hop = HOP_FRAMES;
    this.target = { x: tx, y: ty };
  }

  private cellSprite(tex: Texture, x: number, y: number, cell: number): Sprite {
    const s = new Sprite(tex);
    s.x = x * cell; s.y = y * cell; s.width = cell; s.height = cell;
    return s;
  }

  /** Slide toward the tile with a small hop; called from the Pixi ticker. */
  update(dt: number): void {
    const k = Math.min(1, 0.35 * dt);
    this.marker.x += (this.target.x - this.marker.x) * k;
    this.marker.y += (this.target.y - this.marker.y) * k;
    this.hop = Math.max(0, this.hop - dt);
    const lift = Math.sin((this.hop / HOP_FRAMES) * Math.PI) * this.cell * 0.12;
    this.dot.y = -lift;
    this.icon.y = this.cell * 0.95 - lift;
  }
}
