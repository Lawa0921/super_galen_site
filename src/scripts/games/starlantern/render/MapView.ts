import { Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CONDITIONS } from '../data/conditions';
import type { Game } from '../engine/game';
import type { FloorMap, Tile } from '../engine/map';
import { art, tileKey, type GatherTileKey } from './artPaths';
import { pixelText } from './pixelText';
import { fogState } from './fog';
import { GATHER_GLYPH, MARKER_GLYPH, markersOf, type Marker, type MarkerKind } from './markers';
import type { TextureBank } from './textures';

/** The fog's own dark, under the fog art (and alone until that art lands). */
const FOG = 0x05060a;
/** Remembered tiles are drawn darker so the area around the party stands out. */
const MEMORY_TINT = 0x6a6e86;
/** Screen pixels per map cell; the view follows the party instead of shrinking the whole floor to fit. */
export const MAP_CELL = 48;
/** Fog reaches this many cells past the map edge so the view never shows bare black around a small floor. */
const FOG_PAD = 14;
const HOP_FRAMES = 10;
/** Tile kinds that stand on plain floor: the floor is drawn under them and a marker on top. */
const ON_FLOOR = new Set<Tile>(['fountain', 'trap', 'merchant', 'altar', 'elite', 'vault', 'key', 'rescue', 'glimmer', 'warden', 'gather']);
/** Text marker colours: danger in red, everything else in the UI gold. */
const GLYPH_FILL: Partial<Record<MarkerKind, number>> = { elite: 0xff8a6a, warden: 0xff8a6a, trap: 0xff7a6b, gather: 0x8fd18b };
/** A rich gathering point's glyph is gold (gathering spec §10.1). */
const GATHER_RICH_FILL = 0xe8c46a;
/**
 * A rich point's art (gathering spec §12: no art of its own, done in code): its tile warmed gold, over the same tile tinted
 * gold, spread a little past the cell and faint, as a glow.
 */
export const GATHER_RICH_TINT = 0xffe7a6;
export const GATHER_GLOW_TINT = 0xffc83d;
const GATHER_GLOW_SCALE = 1.22;
/** A rich point's tile tint: gold, or gold dimmed as any remembered cell is (both multiplied, per channel). */
export const gatherRichTint = (memory: boolean): number => {
  if (!memory) return GATHER_RICH_TINT;
  const ch = (c: number, s: number) => Math.round((((GATHER_RICH_TINT >> s) & 0xff) * ((c >> s) & 0xff)) / 255) << s;
  return ch(MEMORY_TINT, 16) | ch(MEMORY_TINT, 8) | ch(MEMORY_TINT, 0);
};
const GATHER_GLOW_ALPHA = 0.55;
/** A gathering point's tile: the ordinary kinds by kind, a land's spot by its land (gathering PR E). */
const gatherKey = (m: Marker): GatherTileKey | null => (m.type === 'spot' ? m.spot ?? null : m.type ?? null);
/** A marker's text glyph and its colour: a gathering point's by its kind, pale green or (rich) gold. */
const glyphOf = (m: Marker): { text: string; fill: number } => (m.kind === 'gather'
  ? { text: GATHER_GLYPH[m.type ?? 'spot'], fill: m.rich ? GATHER_RICH_FILL : GLYPH_FILL.gather! }
  : { text: MARKER_GLYPH[m.kind], fill: GLYPH_FILL[m.kind] ?? 0xe8c46a });

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
  /** Event markers: art with a gentle bob and glow once published, text glyphs until then. */
  private marks = new Container();
  private bobbing: { s: Sprite; y: number; phase: number; alpha?: number }[] = [];
  /** Text glyphs by `kind@x,y`, kept across draws; a marker that is gone is destroyed. */
  private glyphs = new Map<string, Text>();
  private clock = 0;
  private bright = 0;
  private marker = new Container();
  private icon = new Sprite();
  /** Art the last draw wanted but did not have: when one lands, the view draws itself again (no placeholder meanwhile). */
  private missing = new Set<string>();
  private last: { game: Game; size: { width: number; height: number } } | null = null;
  private target = { x: 0, y: 0 };
  private view = { width: 640, height: 296 };
  private hop = 0;
  /** The floor drawn last: a different one (next depth or a new run) lays a new fog and skips the slide. */
  private drawn: FloorMap | null = null;

  /** `calm`: reduced motion, no hop while walking. */
  constructor(private bank: TextureBank | null = null, private calm = false) {
    this.marker.addChild(this.icon);
    this.marks.label = 'markers';
    this.world.addChild(this.tiles, this.edges, this.marks, this.marker);
    this.root.addChild(this.world);
    this.bank?.onLoad?.((u) => { if (this.missing.has(u) && this.last) this.draw(this.last.game, this.last.size); });
  }

  /** A texture from the bank, noting a missing one so its arrival redraws the view. */
  private want(url: string): Texture | null {
    const t = this.bank?.get(url) ?? null;
    if (!t) this.missing.add(url);
    return t;
  }

  /** Sprites with a given label on the last draw (for tests). */
  countByLabel(label: string): number {
    return [...this.tiles.children, ...this.edges.children].filter((c) => c.label === label).length;
  }

  /** Tiles drawn for the cells the party has seen (for tests and diagnostics). */
  tileCount(): number {
    return this.tiles.children.length;
  }

  /** Cells drawn at full brightness (in sight) on the last draw (for tests). */
  brightCount(): number {
    return this.bright;
  }

  /** Text glyphs of the markers on the last draw (for tests). */
  markerGlyphs(): string[] {
    return this.marks.children.filter((c): c is Text => c instanceof Text).map((t) => t.text);
  }

  /** Labels of the markers on the last draw: `event-<kind>` for art, `glyph-<kind>` for text (for tests). */
  markerLabels(): string[] {
    return this.marks.children.map((c) => c.label);
  }

  /** Fog edges drawn on the last draw (for tests). */
  edgeCount(): number {
    return this.edges.children.length;
  }

  draw(game: Game, size: { width: number; height: number }): void {
    this.view = size;
    this.last = { game, size };
    this.missing.clear();
    const map = game.map();
    const cell = MAP_CELL;
    const seen = new Set(game.run?.explored[game.floor] ?? []);
    const terrain = game.terrain();
    const fresh = this.drawn !== map || !this.fogLayer;   // first draw or a new floor: no slide from elsewhere
    const fogArrived = this.fogLayer instanceof Graphics && !!this.want(art.fog);   // the art streamed in after the first draw
    if (fresh || fogArrived) this.layFog(map.width, map.height);
    this.drawn = map;
    const sight = game.run ? CONDITIONS[game.run.condition].sight : 1;
    for (const s of this.tiles.removeChildren()) s.destroy();
    this.bright = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const state = fogState(seen, game.pos, x, y, sight);
        if (state === 'hidden') continue;   // the fog layer underneath shows through
        if (state === 'visible') this.bright++;
        const raw = map.tiles[y][x];
        const t: Tile = ON_FLOOR.has(raw) ? 'floor' : raw;   // event tiles: floor first, the marker on top
        const opened = t === 'chest' && !!game.run?.opened.has(`${game.floor}:${x},${y}`);
        const wall = t === 'wall' ? this.wallSprite(map, terrain, x, y) : null;
        const tex = wall ? null : this.want(art.tile(terrain, tileKey(t, opened)));
        // A cell whose art has not landed is left to the fog underneath: no colour square stands in for it.
        if (wall || tex) {
          const s = wall ?? this.cellSprite(tex!, x, y, cell);
          if (!wall) s.label = t;
          if (state === 'memory') s.tint = MEMORY_TINT;
          this.tiles.addChild(s);
        }
      }
    }
    this.drawEdges(game, seen);
    this.drawWallShadows(game, seen);
    this.drawMarkers(game, seen, sight);
    const tex = this.want(art.party(game.facing));
    // No drawn dot stands in for the party's art; it shows once the art lands.
    this.icon.visible = !!tex;
    if (tex) {
      this.icon.texture = tex;
      const k = (cell * 0.95) / Math.max(tex.width, tex.height);
      this.icon.scale.set(k);
      this.icon.anchor.set(0.5, 1);
      this.icon.x = cell / 2; this.icon.y = cell * 0.95;
    }
    const tx = game.pos.x * cell, ty = game.pos.y * cell;
    const far = fresh || Math.abs(tx - this.marker.x) > cell * 1.5 || Math.abs(ty - this.marker.y) > cell * 1.5;
    if (far) { this.marker.x = tx; this.marker.y = ty; }
    else if (!this.calm && (tx !== this.target.x || ty !== this.target.y)) this.hop = HOP_FRAMES;
    this.target = { x: tx, y: ty };
    this.follow();
  }

  /**
   * Markers on seen cells: the event art when it has loaded, else a text glyph. A shut chest's own tile art is its marker;
   * an opened chest whose gear still waits keeps a glyph over its open tile.
   */
  private drawMarkers(game: Game, seen: ReadonlySet<string>, sight: number): void {
    for (const c of this.marks.removeChildren()) if (!(c instanceof Text)) c.destroy();   // glyphs are cached below
    this.bobbing = [];
    const keep = new Set<string>();
    const cell = MAP_CELL;
    const chestArt = !!this.bank?.get(art.tile(game.terrain(), 'chest'));
    for (const m of markersOf(game)) {
      if (m.kind === 'chest' && chestArt && !m.waiting) continue;
      const memory = fogState(seen, game.pos, m.x, m.y, sight) === 'memory';
      const cx = m.x * cell + cell / 2, cy = m.y * cell + cell / 2;
      // No art for these: a text marker. A warden's room wears the elite's tile (roster plan B5: no art of its own). A
      // gathering point wears its kind's (or its land's) tile (gathering PR E, E4), its text marker until that lands.
      const key = m.kind === 'gather' ? gatherKey(m) : null;
      const tex = m.kind === 'gather' ? (key ? this.bank?.get(art.gatherTile(key)) ?? null : null)
        : m.kind === 'chest' || m.kind === 'rescue' || m.kind === 'glimmer' ? null : this.bank?.get(art.eventTile(m.kind === 'warden' ? 'elite' : m.kind)) ?? null;
      if (tex) {
        const phase = (m.x * 7 + m.y * 13) % 10;
        if (m.kind === 'gather' && m.rich) {
          const glow = new Sprite(tex);
          glow.anchor.set(0.5);
          glow.width = cell * GATHER_GLOW_SCALE; glow.height = cell * GATHER_GLOW_SCALE;
          glow.x = cx; glow.y = cy;
          glow.label = 'gather-glow';
          glow.tint = GATHER_GLOW_TINT;
          glow.alpha = GATHER_GLOW_ALPHA * (memory ? 0.5 : 1);
          this.marks.addChild(glow);
          this.bobbing.push({ s: glow, y: cy, phase, alpha: glow.alpha });
        }
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.width = cell; s.height = cell;
        s.x = cx; s.y = cy;
        s.label = m.kind === 'gather' ? `gather-${key}` : `event-${m.kind}`;
        if (m.kind === 'gather' && m.rich) s.tint = gatherRichTint(memory);
        else if (memory) s.tint = MEMORY_TINT;
        this.marks.addChild(s);
        this.bobbing.push({ s, y: cy, phase });
        continue;
      }
      const g = glyphOf(m);
      const id = `${m.kind}:${g.text}:${g.fill}@${m.x},${m.y}`;
      keep.add(id);
      let t = this.glyphs.get(id);
      if (!t) {
        t = pixelText(g.text, 24, g.fill, 0x14100a);
        t.anchor.set(0.5);
        t.x = cx; t.y = cy;
        t.label = `glyph-${m.kind}`;
        this.glyphs.set(id, t);
      }
      t.alpha = memory ? 0.6 : 1;
      this.marks.addChild(t);
    }
    for (const [id, t] of this.glyphs) if (!keep.has(id)) { t.destroy(); this.glyphs.delete(id); }
  }

  /**
   * With the autotile art published: a wall whose south neighbour is open ground shows its brick face, any other wall its
   * seamless top. Without it, null (the single wall tile is drawn instead).
   */
  private wallSprite(map: FloorMap, terrain: number, x: number, y: number): Sprite | null {
    const top = this.want(art.wallTop(terrain));
    const face = this.want(art.wallFace(terrain));
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
      this.fogLayer.label = 'fog';
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
    this.clock += dt;
    for (const b of this.bobbing) {
      if (b.s.destroyed) continue;
      const w = this.clock * 0.05 + b.phase;
      b.s.y = this.calm ? b.y : b.y - 2 - Math.sin(w) * 2;
      b.s.alpha = (b.alpha ?? 1) * (0.88 + Math.sin(w * 0.8) * 0.12);
    }
    const lift = Math.sin((this.hop / HOP_FRAMES) * Math.PI) * MAP_CELL * 0.12;
    this.icon.y = MAP_CELL * 0.95 - lift;
    this.follow();
  }
}
