import type { ActivePiece, PieceType, Point, Rotation } from './types';
import { SHAPES, SPAWN } from './constants';

/** 回傳活動方塊在盤面上的 4 個絕對 cell 座標 */
export function getCells(piece: ActivePiece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((c) => ({
    x: piece.x + c.x,
    y: piece.y + c.y,
  }));
}

/** 以 spawn 位置建立新方塊（rotation 0） */
export function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: SPAWN[type].x, y: SPAWN[type].y };
}

/** 旋轉方向：+1 順轉、-1 逆轉，回傳 0..3 */
export function rotateIndex(rotation: Rotation, dir: 1 | -1): Rotation {
  return (((rotation + dir) % 4) + 4) % 4 as Rotation;
}
