// src/scripts/games/bomber/versus/types.ts
import type { Dir, CharacterId, Grid, Bomb, BlastCell, PowerUp, PowerUpKind, AbilityId, Vec } from '../engine/types';

export interface VersusPlayerInit { id: string; character: CharacterId; }

export interface VPlayer {
  id: string;
  character: CharacterId;
  x: number; y: number; prevX: number; prevY: number; dir: Dir;
  alive: boolean;
  /** 場終名次：1=冠軍。存活中為 0。 */
  placement: number;
  fireRange: number; maxBombs: number; speedLevel: number;
  shield: boolean; invulnMs: number; moveCooldownMs: number;
  abilityId: AbilityId; abilityCooldownMs: number; abilityMaxMs: number;
}

export type VersusStatus = 'playing' | 'finished';

export interface VersusState {
  status: VersusStatus;
  arenaId: number;
  elapsedMs: number;
  grid: Grid;
  players: VPlayer[];
  bombs: Bomb[];
  blasts: BlastCell[];
  powerUps: PowerUp[];
  /** sudden death：已塌完的圈數（0=未開始）。 */
  collapsedRings: number;
  /** 勝者 id；平局為 null（status=finished 時有意義）。 */
  winnerId: string | null;
}

export type VersusEvent =
  | { kind: 'bombPlaced'; x: number; y: number; ownerId: string }
  | { kind: 'explode'; cells: Vec[] }
  | { kind: 'crateBreak'; x: number; y: number }
  | { kind: 'pickup'; playerId: string; powerUp: PowerUpKind }
  | { kind: 'playerDead'; playerId: string }
  | { kind: 'ringCollapse'; ring: number }
  | { kind: 'finish'; winnerId: string | null }
  | { kind: 'ability'; playerId: string; id: AbilityId };

export type VersusInput = 'bomb' | 'ability';
