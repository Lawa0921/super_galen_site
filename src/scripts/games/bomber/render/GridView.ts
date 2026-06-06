import { Container, Graphics } from 'pixi.js';
import type { BomberState, Grid } from '../engine/types';
import type { Layout } from './layout';

/** 顏色常數 */
const COLOR_FLOOR = 0x1a1f2e;
const COLOR_FLOOR_BORDER = 0x2a3248;
const COLOR_WALL = 0x4a5568;
const COLOR_WALL_BEVEL_LIGHT = 0x6b7a94;
const COLOR_WALL_BEVEL_DARK = 0x2d3748;
const COLOR_CRATE = 0x8b5e3c;
const COLOR_CRATE_LINE = 0x6b4423;

/**
 * 依 BomberState.grid 繪製地板/牆/箱子。
 * 只有在 grid 參考變動時才重繪（搬新樓層或箱子被炸）。
 */
export class GridView {
  private gfx = new Graphics();
  private lastGrid: Grid | null = null;

  constructor(private layer: Container) {
    layer.addChild(this.gfx);
  }

  render(state: BomberState, layout: Layout): void {
    // 只在 grid 改變時重繪（箱子被炸後 game 會回傳新 grid 參考）
    if (state.grid === this.lastGrid) return;
    this.lastGrid = state.grid;
    this.redraw(state.grid, layout);
  }

  private redraw(grid: Grid, layout: Layout): void {
    const { cell, ox, oy } = layout;
    const g = this.gfx.clear();

    for (let row = 0; row < grid.length; row++) {
      const tiles = grid[row];
      for (let col = 0; col < tiles.length; col++) {
        const tile = tiles[col];
        const x = ox + col * cell;
        const y = oy + row * cell;
        this.drawTile(g, tile, x, y, cell);
      }
    }
  }

  private drawTile(g: Graphics, tile: 'floor' | 'wall' | 'crate', x: number, y: number, cell: number): void {
    if (tile === 'floor') {
      // 深色地板底色 + 細邊框
      g.rect(x, y, cell, cell).fill({ color: COLOR_FLOOR });
      g.rect(x, y, cell, cell).stroke({ width: 1, color: COLOR_FLOOR_BORDER, alpha: 0.5 });
    } else if (tile === 'wall') {
      // 深石板底色
      g.rect(x, y, cell, cell).fill({ color: COLOR_WALL });
      // 左上亮邊（立體感）
      g.moveTo(x + 2, y + cell - 2).lineTo(x + 2, y + 2).lineTo(x + cell - 2, y + 2);
      g.stroke({ width: 2, color: COLOR_WALL_BEVEL_LIGHT, alpha: 0.6 });
      // 右下暗邊
      g.moveTo(x + cell - 2, y + 2).lineTo(x + cell - 2, y + cell - 2).lineTo(x + 2, y + cell - 2);
      g.stroke({ width: 2, color: COLOR_WALL_BEVEL_DARK, alpha: 0.8 });
    } else {
      // 褐色箱子底色
      g.rect(x + 1, y + 1, cell - 2, cell - 2).fill({ color: COLOR_CRATE });
      // 箱子邊框
      g.rect(x + 1, y + 1, cell - 2, cell - 2).stroke({ width: 1, color: COLOR_CRATE_LINE, alpha: 0.9 });
      // 十字紋理（木箱感）
      const pad = Math.max(3, Math.floor(cell * 0.2));
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      // 水平線
      g.moveTo(x + pad, cy).lineTo(x + cell - pad, cy);
      g.stroke({ width: 1, color: COLOR_CRATE_LINE, alpha: 0.7 });
      // 垂直線
      g.moveTo(cx, y + pad).lineTo(cx, y + cell - pad);
      g.stroke({ width: 1, color: COLOR_CRATE_LINE, alpha: 0.7 });
      // 四個對角斜線
      g.moveTo(x + pad, y + pad).lineTo(cx - 2, cy - 2);
      g.moveTo(x + cell - pad, y + pad).lineTo(cx + 2, cy - 2);
      g.moveTo(x + pad, y + cell - pad).lineTo(cx - 2, cy + 2);
      g.moveTo(x + cell - pad, y + cell - pad).lineTo(cx + 2, cy + 2);
      g.stroke({ width: 1, color: COLOR_CRATE_LINE, alpha: 0.5 });
    }
  }

  /** 強制下一幀重繪（搬入新樓層時呼叫）。 */
  invalidate(): void {
    this.lastGrid = null;
  }
}
