import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { ActivePiece, GameState } from '../engine/types';
import { BOARD_WIDTH, VISIBLE_HEIGHT, BUFFER_ROWS } from '../engine/constants';
import { canPlace } from '../engine/board';
import { getCells } from '../engine/piece';
import { cellToPixel, pieceTint, GARBAGE_TINT, type Point } from './layout';

export interface BoardViewOptions {
  /** 邊框 / 格線顏色（P1 青 / P2 洋紅） */
  frameTint?: number;
}

/**
 * 依 GameState 繪製單一盤面：暗底 + 科技格線/邊框（Graphics 銳利線）
 * + 鎖定格 + 幽靈落點 + 活動方塊（像素方塊素材，additive 混色 + 最近鄰）。
 */
export class BoardView {
  private wellFill = new Graphics();
  private grid = new Graphics();
  private cellLayer = new Container();
  private pool: Sprite[] = [];
  private cellSize = 24;
  private origin: Point = { x: 0, y: 0 };
  private tintColor: number;

  constructor(
    private bgLayer: Container,
    private playLayer: Container,
    private blockTex: Texture,
    _frameTex: Texture,
    opts: BoardViewOptions = {},
  ) {
    this.tintColor = opts.frameTint ?? 0x36e6ff;
    bgLayer.addChild(this.wellFill);
    playLayer.addChild(this.grid);
    playLayer.addChild(this.cellLayer);
  }

  setLayout(cellSize: number, origin: Point): void {
    this.cellSize = cellSize;
    this.origin = origin;
    this.redrawStatic();
  }

  /** 暗底 + 格線 + 邊框 + 角括號（科技 HUD 風，銳利線）。 */
  private redrawStatic(): void {
    const cs = this.cellSize;
    const ox = this.origin.x;
    const oy = this.origin.y;
    const w = cs * BOARD_WIDTH;
    const h = cs * VISIBLE_HEIGHT;
    const c = this.tintColor;

    this.wellFill.clear().rect(ox, oy, w, h).fill({ color: 0x04060e, alpha: 0.82 });

    const g = this.grid.clear();
    // 內部格線（淡）
    for (let x = 1; x < BOARD_WIDTH; x++) g.moveTo(ox + x * cs, oy).lineTo(ox + x * cs, oy + h);
    for (let y = 1; y < VISIBLE_HEIGHT; y++) g.moveTo(ox, oy + y * cs).lineTo(ox + w, oy + y * cs);
    g.stroke({ width: 1, color: c, alpha: 0.1 });

    // 外框
    g.rect(ox, oy, w, h).stroke({ width: 2, color: c, alpha: 0.85 });

    // 四角科技括號
    const b = Math.max(10, cs * 0.9);
    const t = 4;
    const corners: Array<[number, number, number, number]> = [
      [ox, oy, 1, 1],
      [ox + w, oy, -1, 1],
      [ox, oy + h, 1, -1],
      [ox + w, oy + h, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      g.moveTo(cx, cy + sy * b).lineTo(cx, cy).lineTo(cx + sx * b, cy);
    }
    g.stroke({ width: t, color: c, alpha: 1 });
  }

  private getSprite(i: number): Sprite {
    let s = this.pool[i];
    if (!s) {
      s = new Sprite(this.blockTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.roundPixels = true;
      this.cellLayer.addChild(s);
      this.pool[i] = s;
    }
    return s;
  }

  private drawCell(i: number, cellX: number, cellY: number, tint: number, alpha: number): number {
    if (cellY < BUFFER_ROWS) return i; // 緩衝列不畫
    const s = this.getSprite(i);
    const p = cellToPixel(cellX, cellY, this.cellSize, this.origin);
    s.width = this.cellSize;
    s.height = this.cellSize;
    s.x = p.x + this.cellSize / 2;
    s.y = p.y + this.cellSize / 2;
    s.tint = tint;
    s.alpha = alpha;
    s.visible = true;
    return i + 1;
  }

  private ghostCells(active: ActivePiece, board: GameState['board']): ActivePiece {
    let dist = 0;
    while (canPlace(board, { ...active, y: active.y + dist + 1 })) dist++;
    return { ...active, y: active.y + dist };
  }

  render(state: GameState): void {
    let i = 0;
    const { board, active } = state;

    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = board[y][x];
        if (!cell) continue;
        const tint = cell === 'G' ? GARBAGE_TINT : pieceTint(cell);
        i = this.drawCell(i, x, y, tint, 1);
      }
    }

    if (active) {
      const ghost = this.ghostCells(active, board);
      const tint = pieceTint(active.type);
      for (const cl of getCells(ghost)) i = this.drawCell(i, cl.x, cl.y, tint, 0.2);
    }

    if (active) {
      const tint = pieceTint(active.type);
      for (const cl of getCells(active)) i = this.drawCell(i, cl.x, cl.y, tint, 1);
    }

    for (let k = i; k < this.pool.length; k++) this.pool[k].visible = false;
  }
}
