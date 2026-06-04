import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { ActivePiece, GameState } from '../engine/types';
import { BOARD_WIDTH, VISIBLE_HEIGHT, BUFFER_ROWS } from '../engine/constants';
import { canPlace } from '../engine/board';
import { getCells } from '../engine/piece';
import { cellToPixel, pieceTint, GARBAGE_TINT, type Point } from './layout';

export interface BoardViewOptions {
  /** 盤面框 tint（P1 青 / P2 洋紅） */
  frameTint?: number;
}

/**
 * 依 GameState 繪製單一盤面：暗色底 + 鎖定格 + 幽靈落點 + 活動方塊 + 霓虹外框。
 * 方塊素材生在純黑底，故以 additive 混色（黑→透明、霓虹疊加）。
 */
export class BoardView {
  private wellFill = new Graphics();
  private cellLayer = new Container();
  private frame: Sprite;
  private pool: Sprite[] = [];
  private cellSize = 24;
  private origin: Point = { x: 0, y: 0 };

  constructor(
    private bgLayer: Container,
    private playLayer: Container,
    private blockTex: Texture,
    frameTex: Texture,
    private opts: BoardViewOptions = {},
  ) {
    this.frame = new Sprite(frameTex);
    this.frame.blendMode = 'add';
    this.frame.alpha = 0.6;
    if (opts.frameTint !== undefined) this.frame.tint = opts.frameTint;

    bgLayer.addChild(this.wellFill);
    playLayer.addChild(this.cellLayer);
    playLayer.addChild(this.frame);
  }

  setLayout(cellSize: number, origin: Point): void {
    this.cellSize = cellSize;
    this.origin = origin;
    this.redrawStatic();
  }

  /** 重畫不隨遊戲狀態改變的元素（暗底 + 外框定位）。 */
  private redrawStatic(): void {
    const w = this.cellSize * BOARD_WIDTH;
    const h = this.cellSize * VISIBLE_HEIGHT;
    this.wellFill
      .clear()
      .roundRect(this.origin.x, this.origin.y, w, h, this.cellSize * 0.25)
      .fill({ color: 0x05070f, alpha: 0.72 });

    // 外框略大於盤面，置中對齊；數值經視覺微調。
    const padX = this.cellSize * 1.15;
    const padY = this.cellSize * 0.7;
    const fw = w + padX * 2;
    const fh = h + padY * 2;
    this.frame.width = fw;
    this.frame.height = fh;
    this.frame.x = this.origin.x - padX;
    this.frame.y = this.origin.y - padY;
  }

  private getSprite(i: number): Sprite {
    let s = this.pool[i];
    if (!s) {
      s = new Sprite(this.blockTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.cellLayer.addChild(s);
      this.pool[i] = s;
    }
    return s;
  }

  private drawCell(i: number, cellX: number, cellY: number, tint: number, alpha: number): number {
    if (cellY < BUFFER_ROWS) return i; // 緩衝列不畫
    const s = this.getSprite(i);
    const p = cellToPixel(cellX, cellY, this.cellSize, this.origin);
    const size = this.cellSize * 0.96;
    s.width = size;
    s.height = size;
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

    // 鎖定格
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = board[y][x];
        if (!cell) continue;
        const tint = cell === 'G' ? GARBAGE_TINT : pieceTint(cell);
        i = this.drawCell(i, x, y, tint, 1);
      }
    }

    // 幽靈落點
    if (active) {
      const ghost = this.ghostCells(active, board);
      const tint = pieceTint(active.type);
      for (const c of getCells(ghost)) i = this.drawCell(i, c.x, c.y, tint, 0.22);
    }

    // 活動方塊
    if (active) {
      const tint = pieceTint(active.type);
      for (const c of getCells(active)) i = this.drawCell(i, c.x, c.y, tint, 1);
    }

    // 收起多餘的池物件
    for (let k = i; k < this.pool.length; k++) this.pool[k].visible = false;
  }
}
