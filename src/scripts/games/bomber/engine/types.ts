export type Tile = 'floor' | 'wall' | 'crate';      // wall = indestructible, crate = destructible
export type Grid = Tile[][];                          // grid[y][x], y down, x right
export interface Vec { x: number; y: number; }
export type Dir = 'up' | 'down' | 'left' | 'right';
export type PowerUpKind = 'fire' | 'bomb' | 'speed' | 'shield' | 'heart';
export type CharacterId = 'lena' | 'mira' | 'aya' | 'rosa';

export interface CharacterStats { lives: number; fireRange: number; maxBombs: number; speedLevel: number; }
export interface CharacterProfile { id: CharacterId; name: string; start: CharacterStats; caps: CharacterStats; }
export type EnemyKind = 'wander' | 'chaser';

export interface Bomb { x: number; y: number; fuseMs: number; range: number; }
export interface BlastCell { x: number; y: number; ttlMs: number; }
export interface PowerUp { x: number; y: number; kind: PowerUpKind; }
export interface Enemy {
  id: number; x: number; y: number; prevX: number; prevY: number;
  dir: Dir; kind: EnemyKind; moveAccMs: number; alive: boolean;
}
export interface Player {
  x: number; y: number; prevX: number; prevY: number; dir: Dir;
  lives: number; fireRange: number; maxBombs: number; speedLevel: number;
  shield: boolean; invulnMs: number; moveCooldownMs: number; alive: boolean;
}
export type GameStatus = 'playing' | 'gameover';

export interface FloorLayout {
  grid: Grid;
  enemies: Enemy[];
  hiddenPowerUps: Record<string, PowerUpKind>; // key `${x},${y}` -> revealed when that crate breaks
  exit: Vec;                                    // floor cell; active only when all enemies dead
}

export interface BomberState {
  grid: Grid;
  player: Player;
  bombs: Bomb[];
  blasts: BlastCell[];
  enemies: Enemy[];
  powerUps: PowerUp[];
  exit: Vec;
  exitActive: boolean;
  floor: number;
  score: number;
  status: GameStatus;
  character: CharacterId;
}

export type BomberEvent =
  | { kind: 'bombPlaced'; x: number; y: number }
  | { kind: 'explode'; cells: Vec[] }
  | { kind: 'crateBreak'; x: number; y: number }
  | { kind: 'pickup'; powerUp: PowerUpKind }
  | { kind: 'enemyKill'; x: number; y: number }
  | { kind: 'playerHit'; shielded: boolean }
  | { kind: 'floorClear' }
  | { kind: 'descend'; floor: number }
  | { kind: 'gameover' };

export type InputAction = Dir | 'bomb';
