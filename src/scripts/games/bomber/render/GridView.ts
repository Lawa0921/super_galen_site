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
  private lastGrid: Grid | null = null;
  private lastCell = -1;
  private textures: BomberTextures;

  constructor(private layer: Container, textures: BomberTextures) {
    this.textures = textures;
    this._buildSprites();
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

  private _tileTexture(tile: Tile) {
    if (tile === 'wall')  return this.textures.wall;
    if (tile === 'crate') return this.textures.crate;
    return this.textures.floor;
  }

  render(state: BomberState, layout: Layout): void {
    const { cell, ox, oy } = layout;
    const gridChanged  = state.grid !== this.lastGrid;
    const layoutChanged = cell !== this.lastCell;

    if (!gridChanged && !layoutChanged) return;

    this.lastGrid = state.grid;
    this.lastCell = cell;

    const grid = state.grid;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const sp = this.sprites[row * GRID_COLS + col];
        // 更新貼圖（格子種類 or 版面變動時）
        if (gridChanged || layoutChanged) {
          const tile = grid[row]?.[col] ?? 'floor';
          sp.texture = this._tileTexture(tile);
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
  }

  /** 強制下一幀重繪（搬入新樓層或版面改變時呼叫）。 */
  invalidate(): void {
    this.lastGrid = null;
    this.lastCell = -1;
  }
}
