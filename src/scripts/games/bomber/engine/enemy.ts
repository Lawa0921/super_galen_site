// enemy.ts
import type { Grid, Enemy, Dir, Vec, Bomb, BlastCell, EnemyKind } from './types';
import { isWalkable } from './board';
import { dirDelta } from './player';
import { ENEMY_MOVE_MS } from './constants';
import { computeBlast } from './blast';

/** 敵人每格移動耗時（隨層數遞減，下限 80ms）。 */
export function enemyMoveMs(kind: EnemyKind, floor: number): number {
  return Math.max(80, ENEMY_MOVE_MS[kind] - (floor - 1) * 15);
}

/** 炸彈引信低於此值時，敵人視其未來爆風範圍為危險區並閃避。 */
export const ENEMY_DODGE_FUSE_MS = 700;

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function open(grid: Grid, x: number, y: number, bombs: Bomb[], kind: EnemyKind): boolean {
  if (kind === 'ghost') {
    // 幽靈穿木箱（不穿牆、不穿炸彈本體）
    const tile = grid[y]?.[x];
    if (tile === undefined || tile === 'wall') return false;
  } else if (!isWalkable(grid, x, y)) {
    return false;
  }
  return !bombs.some((b) => b.x === x && b.y === y);
}

function openDirs(grid: Grid, e: Enemy, bombs: Bomb[]): Dir[] {
  return DIRS.filter((d) => { const v = dirDelta(d); return open(grid, e.x + v.x, e.y + v.y, bombs, e.kind); });
}

/** 危險格集合：現存爆風 + 即將引爆（fuse ≤ ENEMY_DODGE_FUSE_MS）炸彈的未來爆風範圍。 */
function dangerSet(grid: Grid, bombs: Bomb[], blasts: BlastCell[]): Set<number> {
  const key = (x: number, y: number): number => y * 64 + x;
  const s = new Set<number>();
  for (const b of blasts) s.add(key(b.x, b.y));
  for (const bm of bombs) {
    if (bm.fuseMs <= ENEMY_DODGE_FUSE_MS) {
      for (const c of computeBlast(grid, bm.x, bm.y, bm.range).cells) s.add(key(c.x, c.y));
    }
  }
  return s;
}

/**
 * 決定敵人這次嘗試移動的方向；無路可走回傳 null。
 * 危險感知：
 * - 絕不走進現存爆風格或快爆炸彈的爆風範圍；
 * - 站在安全格且四周皆危險 → 停住（null）比自盡聰明；
 * - 已身陷危險格 → 任一開放方向逃命。
 */
export function chooseEnemyDir(
  grid: Grid, e: Enemy, player: Vec,
  bombs: Bomb[], blasts: BlastCell[], rng: () => number,
): Dir | null {
  const opts = openDirs(grid, e, bombs);
  if (opts.length === 0) return null;

  const danger = dangerSet(grid, bombs, blasts);
  const keyOf = (x: number, y: number): number => y * 64 + x;
  const safe = opts.filter((d) => {
    const v = dirDelta(d);
    return !danger.has(keyOf(e.x + v.x, e.y + v.y));
  });

  let pool = safe;
  if (safe.length === 0) {
    if (!danger.has(keyOf(e.x, e.y))) return null; // 安全格上：寧可停住也不走進火裡
    pool = opts; // 已在危險中：任一開放方向逃命
  }

  if (e.kind === 'chaser') {
    let best: Dir = pool[0];
    let bestDist = Infinity;
    for (const d of pool) {
      const v = dirDelta(d);
      const dist = Math.abs(e.x + v.x - player.x) + Math.abs(e.y + v.y - player.y);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  if (e.kind === 'dasher') {
    // 衝刺獸：方向開放（且安全）就永遠直走；被擋才換向（固定抽 1 個亂數）
    const pick = pool[Math.floor(rng() * pool.length)];
    return pool.includes(e.dir) ? e.dir : pick;
  }

  // wander / ghost：固定抽兩個獨立亂數——一個決定是否直走、一個獨立選方向（消除呼叫次數不固定）
  const keepStraight = rng() < 0.8;
  const pick = pool[Math.floor(rng() * pool.length)];
  if (pool.includes(e.dir) && keepStraight) return e.dir;
  return pick;
}
