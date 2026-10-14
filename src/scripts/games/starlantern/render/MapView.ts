import { Container, Graphics } from 'pixi.js';
import type { Game } from '../engine/game';
import type { Tile } from '../engine/map';

const COLORS: Record<Tile, number> = {
  wall: 0x2a2d3a, floor: 0x5b6150, door: 0x9c6644, up: 0x8ecae6, down: 0x219ebc, chest: 0xe9c46a, entrance: 0x90be6d, boss: 0xd62828,
};
const FOG = 0x05060a;

export class MapView {
  readonly root = new Container();
  private tiles = new Graphics();
  private marker = new Graphics();
  private target = { x: 0, y: 0 };

  constructor() {
    this.root.addChild(this.tiles, this.marker);
  }

  draw(game: Game, size: { width: number; height: number }): void {
    const map = game.map();
    const seen = new Set(game.state.dungeon.explored[String(game.floor)] ?? []);
    const cell = Math.max(8, Math.floor(Math.min(size.width / map.width, size.height / map.height)));
    this.root.x = Math.floor((size.width - cell * map.width) / 2);
    this.root.y = Math.floor((size.height - cell * map.height) / 2);
    this.tiles.clear();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        let t = map.tiles[y][x];
        if (t === 'chest' && game.state.dungeon.opened.includes(`${game.floor}:${x},${y}`)) t = 'floor';
        this.tiles.rect(x * cell, y * cell, cell, cell).fill(seen.has(`${x},${y}`) ? COLORS[t] : FOG);
      }
    }
    this.marker.clear().circle(cell / 2, cell / 2, cell * 0.35).fill(0xffd166).stroke({ width: 2, color: 0x1d1d1d });
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    this.target = { x: tx, y: ty };
  }

  /** Slide the marker toward its tile; called from the Pixi ticker. */
  update(dt: number): void {
    const k = Math.min(1, 0.35 * dt);
    this.marker.x += (this.target.x - this.marker.x) * k;
    this.marker.y += (this.target.y - this.marker.y) * k;
  }
}
