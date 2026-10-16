// dungeon.ts — 地城生成（stub，Part B 實作）
import type { World } from '../world';
import type { ReservedZone } from '../worldgen';

export interface DungeonOptions {
  seed: string;
  zone: ReservedZone;
  surface: Int16Array;
  color: { key: string; brick: number; wall: number };
  depthFrac: (x: number, y: number) => number;
}
export interface DungeonInfo { bbox: { x: number; y: number; w: number; h: number } }

export function generateDungeon(world: World, o: DungeonOptions): DungeonInfo | null {
  void world; void o;
  return null;
}
