// split.ts — 世界檔 + 角色檔的存讀編排（純邏輯；IndexedDB 在 SplitStore 後面，Task 7 接）。
// 規則：讀檔（planContinue）永遠不寫；遷移 = 先備份、備份成功才 putSplit；每次存檔只有一次 putSplit（一個 transaction）。
import { SaveFormatError, type SaveData } from './serialize';
import { decodeCharacter, newId, newIdentity, type CharIdentity, type DelveCharacter } from './character';
import { decodeAnySave, encodeWorld, saveSplitGame, type WorldData, type WorldHeader, type WorldIdentity } from './worldSave';
import type { DelveGame } from '../engine/game';
import type { CharacterMeta, SaveSummary, SlotMeta } from './storage';

export const BACKUP_SUFFIX = '.v9.bak';
export const CHARACTER_MISSING_MSG = '找不到這個世界的角色檔，沒有讀取也沒有修改任何存檔。';
export const CHARACTER_CORRUPT_MSG = '角色檔已損毀，沒有讀取也沒有修改任何存檔。';
export const WORLD_CORRUPT_MSG = '讀取失敗：這不是有效的 DELVE 存檔，或檔案已損毀 / 不完整。';

/** 新世界的存檔槽名（多世界）；'main' 是舊的單一槽 */
export function newWorldSlot(): string { return 'w-' + newId(); }

export interface SlotRead { bytes: Uint8Array; charId?: string }
export interface SplitStore {
  /** 已解壓的世界 / 舊存檔 bytes */
  getSlot(slot: string): Promise<SlotRead | null>;
  /** 已解壓的角色 JSON bytes */
  getCharacter(id: string): Promise<Uint8Array | null>;
  /** 整筆記錄原封複製 */
  backupSlot(from: string, to: string): Promise<void>;
  /** 世界 + 角色在同一個 transaction 寫入 */
  putSplit(slot: string, world: { bytes: Uint8Array; seed: string; summary?: SaveSummary }, character: DelveCharacter): Promise<SlotMeta>;
  /** 可繼續的世界（不含 *.bak），新到舊 */
  listWorlds(): Promise<SlotMeta[]>;
  /** 所有角色，新到舊 */
  listCharacters(): Promise<CharacterMeta[]>;
  deleteWorld(slot: string): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  /** 只寫角色檔（同 id 覆蓋） */
  putCharacter(c: DelveCharacter): Promise<void>;
}

/** 一場遊戲的存檔身分：哪個角色、哪個世界、世界上各角色的 visit */
export class SplitSession {
  private who: CharIdentity;
  private where: WorldIdentity;
  constructor(who: CharIdentity, where: WorldIdentity) {
    this.who = { ...who };
    this.where = { ...where, visits: { ...where.visits } };
  }
  static fresh(seed: string, now: number): SplitSession {
    return new SplitSession(newIdentity(now), { worldId: newId(), worldName: seed, visits: {} });
  }
  static fromLoaded(world: WorldHeader, character: DelveCharacter): SplitSession {
    const { id, nick, createdAt, rev } = character;
    return new SplitSession({ id, nick, createdAt, rev }, { worldId: world.worldId, worldName: world.worldName, visits: world.visits });
  }
  get charId(): string { return this.who.id; }
  get nick(): string { return this.who.nick; }
  /** rev + 1、更新 visits，回傳要寫的兩份資料 */
  snapshot(game: DelveGame, now: number): { world: WorldData; character: DelveCharacter } {
    const next = { ...this.who, rev: this.who.rev + 1 };
    const out = saveSplitGame(game, next, this.where, now);
    this.who = next;
    this.where = { ...this.where, visits: out.world.header.visits };
    return out;
  }
}

export type ContinuePlan =
  | { kind: 'none' }
  | { kind: 'legacy'; data: SaveData }
  | { kind: 'split'; world: WorldData; character: DelveCharacter }
  | { kind: 'error'; message: string };

/** 只讀不寫：槽 → 該怎麼繼續。legacy 由呼叫端還原成功後再 commitMigration */
export async function planContinue(store: SplitStore, slot: string): Promise<ContinuePlan> {
  const rec = await store.getSlot(slot);
  if (!rec) return { kind: 'none' };
  let any;
  try { any = decodeAnySave(rec.bytes); } catch (e) {
    if (e instanceof SaveFormatError) return { kind: 'error', message: WORLD_CORRUPT_MSG };
    throw e;
  }
  if (any.kind === 'legacy') return { kind: 'legacy', data: any.data };
  if (!rec.charId) return { kind: 'error', message: CHARACTER_MISSING_MSG };
  const cb = await store.getCharacter(rec.charId);
  if (!cb) return { kind: 'error', message: CHARACTER_MISSING_MSG };
  let character: DelveCharacter;
  try { character = decodeCharacter(cb); } catch (e) {
    if (e instanceof SaveFormatError) return { kind: 'error', message: CHARACTER_CORRUPT_MSG };
    throw e;
  }
  if (character.id !== rec.charId) return { kind: 'error', message: CHARACTER_CORRUPT_MSG };
  return { kind: 'split', world: any.data, character };
}

export function saveSplit(store: SplitStore, slot: string, s: SplitSession, game: DelveGame, now: number, summary?: SaveSummary): Promise<SlotMeta> {
  const { world, character } = s.snapshot(game, now);
  return store.putSplit(slot, { bytes: encodeWorld(world), seed: world.header.seed, summary }, character);
}

/** backup = true：先 backupSlot(slot, slot + BACKUP_SUFFIX) 成功後才 putSplit；任一步丟錯就整個丟出（舊存檔不動） */
export async function commitMigration(
  store: SplitStore, slot: string, game: DelveGame, now: number, o: { backup: boolean; summary?: SaveSummary },
): Promise<SplitSession> {
  if (o.backup) await store.backupSlot(slot, slot + BACKUP_SUFFIX);
  const s = SplitSession.fresh(game.seed, now);
  await saveSplit(store, slot, s, game, now, o.summary);
  return s;
}
