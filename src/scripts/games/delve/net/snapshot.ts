// net/snapshot.ts — 世界層級快照（spec §5.6 第 2 點）：加入的客人一次拿到；之後房主每秒比 worldSig，變了才重送。
// 只有元件自己的 toJSON（與 snapshotGame 同一批序列化函式），不呼叫 snapshotGame；沒有 chunk、液體、掉落物。
import type { DelveGame } from '../engine/game';
import { ENEMIES, type EnemyKind } from '../engine/enemies';
import { SPAWN_STONE } from '../engine/waystones';
import type { VisitSave } from '../save/worldSave';
import type { WorldSnap } from './protocol';
import { fnv1aStr } from './codec';

/** 房主端：組出目前的世界層級狀態。visit = 加入時給該客人的足跡；之後重送一律 null */
export function snapshotWorld(game: DelveGame, visit: VisitSave | null): WorldSnap {
  const boss = game.bossEnemy();
  return {
    time: game.time, tick: game.tick, peaceful: game.peaceful,
    unlocked: [...game.world.unlocked].sort((a, b) => a - b), keysUsed: game.world.keysUsed,
    bosses: [...game.bossesDefeated].sort(), kills: { ...game.kills },
    bossActive: boss && boss.state !== 'leave' ? boss.kind : null,
    weather: game.weatherOverride ? { ...game.weatherOverride } : null,
    minedIce: [...game.minedIce].sort((a, b) => a - b),
    settle: game.settle.toJSON({ ids: true }), folk: game.folk.toJSON({ ids: true }), quests: game.quests.toJSON(),
    scoutMarks: game.scoutMarks.map((m) => ({ ...m })),
    perkDays: { ...game.perkDays }, scouted: [...game.scouted].sort(),
    stones: [...game.stonesUnlocked].sort((a, b) => a - b),
    visit,
  };
}

const isInt = (v: unknown): v is number => Number.isInteger(v);

/**
 * 客人副本：把世界層級狀態套上去（客人信任房主，但壞欄位仍丟掉不拋）。
 * perkDays.healer 是房主本地玩家的（C16），不套；guide 照套。
 * bossActive 沒有對應的副本欄位（首領本身走 ws 的怪物列表），不套。visit 套到本地 actor。
 */
export function applyWorldSnap(game: DelveGame, snap: WorldSnap): void {
  const w = game.world;
  w.unlocked.clear();
  for (const i of snap.unlocked) if (isInt(i) && i >= 0) w.unlocked.add(i);
  w.keysUsed = isInt(snap.keysUsed) ? snap.keysUsed : 0;
  game.stonesUnlocked.clear();
  for (const id of snap.stones) if (isInt(id) && id !== SPAWN_STONE) game.stonesUnlocked.add(id); // 客人信任房主：同種子的碑 id 不再驗
  game.bossesDefeated.clear();
  for (const b of snap.bosses) if (Object.prototype.hasOwnProperty.call(ENEMIES, b)) game.bossesDefeated.add(b as EnemyKind);
  game.kills = { ...snap.kills };
  game.peaceful = Boolean(snap.peaceful);
  game.minedIce.clear();
  for (const i of snap.minedIce) if (isInt(i) && i >= 0) game.minedIce.add(i);
  game.time = snap.time;
  game.tick = snap.tick;
  game.weatherOverride = snap.weather ? { ...snap.weather } : null;
  game.syncDay();
  // 據點核心那格的爐心還在等 chunk 同步 → trust 不驗
  game.settle.load(snap.settle, w, true);
  game.folk.load(snap.folk, w, true);
  game.quests.load(snap.quests);
  game.scoutMarks = snap.scoutMarks.map((m) => ({ ...m }));
  game.perkDays = { guide: snap.perkDays.guide, healer: game.perkDays.healer };
  game.scouted.clear();
  for (const k of snap.scouted) game.scouted.add(k);
  for (const m of game.scoutMarks) game.scouted.add(`${m.x},${m.y}`);
  if (snap.visit) game.applyVisit(snap.visit);
}

/** 去掉 settle.npcs / folk.travellers 的 x、y 與 time / tick / visit 後的 FNV-1a：NPC 走動不算變動（位置走 ws） */
export function worldSig(snap: WorldSnap): number {
  const { time: _t, tick: _k, visit: _v, ...rest } = snap;
  const stripped = {
    ...rest,
    settle: { ...snap.settle, npcs: snap.settle.npcs.map(({ x: _x, y: _y, ...n }) => n) },
    folk: { ...snap.folk, travellers: snap.folk.travellers.map(({ x: _x, y: _y, ...n }) => n) },
  };
  return fnv1aStr(JSON.stringify(stripped));
}
