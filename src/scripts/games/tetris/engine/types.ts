/** 方塊種類 */
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 旋轉態：0=spawn, 1=順轉, 2=180, 3=逆轉 */
export type Rotation = 0 | 1 | 2 | 3;

/** 盤面格子：方塊種類、'G'=垃圾、null=空 */
export type Cell = PieceType | 'G' | null;

/** row-major 盤面矩陣，board[y][x]，y=0 在最上 */
export type Matrix = Cell[][];

export interface Point { x: number; y: number; }

/** 場上活動方塊：type/rotation + 其 bounding box 左上原點 (x,y) */
export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export type TSpinType = 'none' | 'mini' | 'full';

/** 可序列化的對外遊戲狀態 */
export interface GameState {
  board: Matrix;
  active: ActivePiece | null;
  hold: PieceType | null;
  canHold: boolean;
  next: PieceType[];
  score: number;
  lines: number;
  level: number;
  combo: number;        // -1 = 無連擊；0,1,2… = 連擊次數
  backToBack: boolean;
  status: 'playing' | 'topout';
}

export type GameEvent =
  | { kind: 'spawn'; type: PieceType }
  | { kind: 'lock' }
  | { kind: 'hold' }
  | { kind: 'lineClear'; rows: number[]; count: number; tSpin: TSpinType; b2b: boolean; combo: number }
  | { kind: 'topout' };
