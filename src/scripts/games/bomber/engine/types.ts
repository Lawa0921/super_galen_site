export type Tile = 'floor' | 'wall' | 'crate';      // wall = indestructible, crate = destructible
export type Grid = Tile[][];                          // grid[y][x], y down, x right
export interface Vec { x: number; y: number; }
export type Dir = 'up' | 'down' | 'left' | 'right';
export type PowerUpKind = 'fire' | 'bomb' | 'speed' | 'shield' | 'heart';
export type CharacterId = 'lena' | 'mira' | 'aya' | 'rosa';
export type AbilityId = 'carpet' | 'inferno' | 'blink' | 'bulwark';

export interface CharacterStats { lives: number; fireRange: number; maxBombs: number; speedLevel: number; }
export interface AbilityDef { id: AbilityId; name: string; desc: string; cooldownMs: number; }
export interface CharacterProfile { id: CharacterId; name: string; start: CharacterStats; caps: CharacterStats; ability: AbilityDef; }
export type EnemyKind = 'wander' | 'chaser' | 'ghost' | 'dasher' | 'mimic' | 'tank' | 'sapper' | 'splitter' | 'mini';

export interface Bomb { x: number; y: number; fuseMs: number; range: number; owner?: 'enemy'; }
export interface BlastCell { x: number; y: number; ttlMs: number; }
export interface PowerUp { x: number; y: number; kind: PowerUpKind; }
export interface Enemy {
  id: number; x: number; y: number; prevX: number; prevY: number;
  dir: Dir; kind: EnemyKind; moveAccMs: number; alive: boolean;
  /** mimic 專用：false=偽裝休眠（不動），玩家靠近 ≤2 格甦醒。 */
  awake?: boolean;
  /** tank 專用：血量（預設 1；tank 為 2）。 */
  hp?: number;
  /** 受擊冷卻（ms）：殘留爆風不會連續扣血。 */
  hitCooldownMs?: number;
  /** sapper 專用：放彈冷卻（ms）。 */
  sapperCdMs?: number;
}
export interface Player {
  x: number; y: number; prevX: number; prevY: number; dir: Dir;
  lives: number; fireRange: number; maxBombs: number; speedLevel: number;
  shield: boolean; invulnMs: number; moveCooldownMs: number; alive: boolean;
}
export type GameStatus = 'playing' | 'gameover';

export type FloorArchetype = 'classic' | 'chambers' | 'arena' | 'maze';

export interface FloorLayout {
  grid: Grid;
  enemies: Enemy[];
  hiddenPowerUps: Record<string, PowerUpKind>; // key `${x},${y}` -> revealed when that crate breaks
  exit: Vec;                                    // floor cell; active only when all enemies dead
  archetype: FloorArchetype;                    // 佈局原型（1 層固定 classic，之後隨機）
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
  abilityCooldownMs: number;
  abilityMaxMs: number;
  abilityId: AbilityId | null;
  abilityName: string;
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
  | { kind: 'gameover' }
  | { kind: 'ability'; id: AbilityId }
  | { kind: 'mimicWake'; x: number; y: number };

export type InputAction = Dir | 'bomb' | 'ability';
