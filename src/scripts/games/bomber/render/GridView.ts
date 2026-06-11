import { Container, Sprite } from 'pixi.js';
import type { BomberState, Grid, Tile } from '../engine/types';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';
import type { BomberTextures } from './assets';
import type { Layout } from './layout';

/**
 * 依 BomberState.grid 以 Sprite 繪製地板/牆/箱子。
 * 只有在 grid 參考變動時才重新指派貼圖（dirty tracking）；
 * 版面尺寸改變時（invalidate() + 任何 render 呼叫）強制重新定位所有格子。
 */
export class GridView {
  private sprites: Sprite[] = [];
  private decorPool: Sprite[] = [];
  private lastGrid: Grid | null = null;
  private lastCell = -1;
  private textures: BomberTextures;

  constructor(private layer: Container, textures: BomberTextures) {
    this.textures = textures;
    this._buildSprites();
  }

  /** 決定性 hash（樓層+座標）→ [0,1)：裝飾佈點不依賴引擎 rng、重繪穩定。 */
  private _hash(floor: number, x: number, y: number): number {
    let h = (x * 73856093) ^ (y * 19349663) ^ (floor * 83492791);
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000;
  }

  /** 建立固定 GRID_COLS×GRID_ROWS 個 Sprite（一次性建構）。 */
  private _buildSprites(): void {
    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      const sp = new Sprite(this.textures.floor);
      sp.anchor.set(0.5);
      this.layer.addChild(sp);
      this.sprites.push(sp);
    }
  }

  /** 生態區：1-3 石牢、4-6 墓窖、7-9 鍛造廠、10-12 冰窖、13+ 虛空。 */
  private _biomeIndex(floor: number): number {
    return Math.min(4, Math.floor((floor - 1) / 3));
  }

  private _tileTexture(tile: Tile, biome: number) {
    const set = this.textures.tileSets[biome] ?? this.textures.tileSets[0];
    if (tile === 'wall')  return set.wall;
    if (tile === 'crate') return set.crate;
    return set.floor;
  }

  render(state: BomberState, layout: Layout): void {
    const { cell, ox, oy } = layout;
    const gridChanged  = state.grid !== this.lastGrid;
    const layoutChanged = cell !== this.lastCell;

    if (!gridChanged && !layoutChanged) return;

    this.lastGrid = state.grid;
    this.lastCell = cell;

    const biome = this._biomeIndex(state.floor);
    const grid = state.grid;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const sp = this.sprites[row * GRID_COLS + col];
        // 更新貼圖（格子種類 or 版面變動時）
        if (gridChanged || layoutChanged) {
          const tile = grid[row]?.[col] ?? 'floor';
          sp.texture = this._tileTexture(tile, biome);
          // 地板棋盤格交錯微暗（增加深度，不影響牆/箱）
          sp.tint = tile === 'floor' && (row + col) % 2 === 1 ? 0xc8cadd : 0xffffff;
        }
        // 更新位置與尺寸（版面改變時必做；格子改變但 cell 不變也要確保位置正確）
        sp.width  = cell;
        sp.height = cell;
        sp.x = ox + col * cell + cell / 2;
        sp.y = oy + row * cell + cell / 2;
      }
    }

    // 地面裝飾：~12% 的 floor 格放生態區專屬小物件（決定性 hash，重繪穩定）
    let di = 0;
    for (let row = 1; row < GRID_ROWS - 1; row++) {
      for (let col = 1; col < GRID_COLS - 1; col++) {
        if ((grid[row]?.[col] ?? 'floor') !== 'floor') continue;
        const h = this._hash(state.floor, col, row);
        if (h >= 0.12) continue;
        const variant = h < 0.06 ? 0 : 1;
        const tex = this.textures.decorFrames[biome * 2 + variant];
        let sp = this.decorPool[di];
        if (!sp) {
          sp = new Sprite(tex);
          sp.anchor.set(0.5);
          this.layer.addChild(sp);
          this.decorPool.push(sp);
        }
        sp.texture = tex;
        sp.visible = true;
        const size = cell * 0.5;
        sp.width = size;
        sp.height = size;
        sp.x = ox + col * cell + cell / 2;
        sp.y = oy + row * cell + cell / 2;
        sp.alpha = 0.88;
        di++;
      }
    }
    for (let i = di; i < this.decorPool.length; i++) this.decorPool[i].visible = false;
  }

  /** 強制下一幀重繪（搬入新樓層或版面改變時呼叫）。 */
  invalidate(): void {
    this.lastGrid = null;
    this.lastCell = -1;
  }
}
