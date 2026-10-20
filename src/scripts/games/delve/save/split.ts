// split.ts — 世界檔 + 角色檔的存讀編排（純邏輯；IndexedDB 在 SplitStore 後面，Task 7 接）。
// 規則：讀檔（planContinue / planPlay）永遠不寫；遷移 = 先備份、備份成功才 putSplit；每次存檔只有一次 putSplit（一個 transaction）。
// 多世界 × 多角色：任何角色都能進任何世界（planPlay）；匯入一律開新槽（importWorld），不動既有世界。
import { SaveFormatError, restoreGame, type RestoreError, type SaveData } from './serialize';
import { decodeCharacter, newId, newIdentity, type CharIdentity, type DelveCharacter } from './character';
import {
  decodeAnySave, encodeWorld, restoreSplit, saveSplitGame, type AnySave, type WorldData, type WorldHeader, type WorldIdentity,
} from './worldSave';
import { GEN_VERSION } from '../engine/constants';
import type { DelveGame } from '../engine/game';
import type { CharacterMeta, SaveSummary, SlotMeta } from './storage';

export const BACKUP_SUFFIX = '.v9.bak';
export const CHARACTER_MISSING_MSG = '找不到這個世界的角色檔，沒有讀取也沒有修改任何存檔。';
export const CHARACTER_CORRUPT_MSG = '角色檔已損毀，沒有讀取也沒有修改任何存檔。';
export const WORLD_CORRUPT_MSG = '讀取失敗：這不是有效的 DELVE 存檔，或檔案已損毀 / 不完整。';
/** 匯入的世界檔沒有內嵌角色（不是從遊戲匯出的檔） */
export const NO_CHARACTER_MSG = '讀取失敗：這個存檔沒有角色資料。';
export const BAD_SIZE_MSG = '這個存檔的世界大小不正確，可能不是有效的 DELVE 存檔或已損毀。';
export const oldGeneratorMsg = (v?: number): string =>
  `這個存檔是舊版地圖產生器（v${v ?? '?'}）做的，新版地圖重做了洞穴、地層、生態區形狀並加入地城，舊世界無法繼續。`;

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

/** 一場遊戲的存檔身分：哪個存檔槽、哪個角色、哪個世界、世界上各角色的 visit */
export class SplitSession {
  private who: CharIdentity;
  private where: WorldIdentity;
  constructor(who: CharIdentity, where: WorldIdentity, readonly slot: string) {
    this.who = { ...who };
    this.where = { ...where, visits: { ...where.visits } };
  }
  static fresh(seed: string, now: number, slot: string): SplitSession {
    return new SplitSession(newIdentity(now), { worldId: newId(), worldName: seed, visits: {} }, slot);
  }
  static fromLoaded(world: WorldHeader, character: DelveCharacter, slot: string): SplitSession {
    const { id, nick, createdAt, rev } = character;
    return new SplitSession({ id, nick, createdAt, rev }, { worldId: world.worldId, worldName: world.worldName, visits: world.visits }, slot);
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
  | { kind: 'legacy'; data: SaveData; slot: string }
  | { kind: 'split'; world: WorldData; character: DelveCharacter; slot: string }
  | { kind: 'error'; message: string };

/** 槽的記錄 → 舊合併檔 / 世界檔（還沒配角色）；解不開 = 損毀 */
type SlotPlan = Exclude<ContinuePlan, { kind: 'split' }> | { kind: 'world'; world: WorldData };
function readRecord(rec: SlotRead, slot: string): SlotPlan {
  let any: AnySave;
  try { any = decodeAnySave(rec.bytes); } catch (e) {
    if (e instanceof SaveFormatError) return { kind: 'error', message: WORLD_CORRUPT_MSG };
    throw e;
  }
  return any.kind === 'legacy' ? { kind: 'legacy', data: any.data, slot } : { kind: 'world', world: any.data };
}

/** 世界檔 + 指定角色（角色檔 bytes）→ 計畫；角色不見 / 損毀 / id 不符 → 錯誤 */
function withCharacter(world: WorldData, slot: string, charId: string, cb: Uint8Array | null): ContinuePlan {
  if (!cb) return { kind: 'error', message: CHARACTER_MISSING_MSG };
  let character: DelveCharacter;
  try { character = decodeCharacter(cb); } catch (e) {
    if (e instanceof SaveFormatError) return { kind: 'error', message: CHARACTER_CORRUPT_MSG };
    throw e;
  }
  if (character.id !== charId) return { kind: 'error', message: CHARACTER_CORRUPT_MSG };
  return { kind: 'split', world, character, slot };
}

async function planRecord(store: SplitStore, slot: string, rec: SlotRead): Promise<ContinuePlan> {
  const p = readRecord(rec, slot);
  if (p.kind !== 'world') return p;
  if (!rec.charId) return { kind: 'error', message: CHARACTER_MISSING_MSG };
  return withCharacter(p.world, slot, rec.charId, await store.getCharacter(rec.charId));
}

/**
 * 只讀不寫：槽 → 該怎麼繼續（用世界記錄上的 charId）。legacy 由呼叫端還原成功後再 commitMigration。
 * 不給 slot：依 listWorlds 新到舊，取第一個「有 charId 且角色檔還在」的世界；沒有 charId 的槽只有解得開的舊合併檔算數。
 */
export async function planContinue(store: SplitStore, slot?: string): Promise<ContinuePlan> {
  if (slot !== undefined) {
    const rec = await store.getSlot(slot);
    return rec ? planRecord(store, slot, rec) : { kind: 'none' };
  }
  for (const m of await store.listWorlds()) {
    const rec = await store.getSlot(m.slot);
    if (!rec) continue;
    if (rec.charId) {
      if (await store.getCharacter(rec.charId)) return planRecord(store, m.slot, rec);
      continue;
    }
    const p = readRecord(rec, m.slot);
    if (p.kind === 'legacy') return p;
  }
  return { kind: 'none' };
}

/** 只讀不寫：用指定角色進指定世界（這個世界沒有該角色的 visit → 還原時 freshVisit）。舊合併檔照樣回 legacy（先遷移） */
export async function planPlay(store: SplitStore, slot: string, charId: string): Promise<ContinuePlan> {
  const rec = await store.getSlot(slot);
  if (!rec) return { kind: 'none' };
  const p = readRecord(rec, slot);
  if (p.kind !== 'world') return p;
  return withCharacter(p.world, slot, charId, await store.getCharacter(charId));
}

/**
 * 剛生成的世界 + 既有角色 → 開局：拆出世界（全新 worldId、worldName = seed、新存檔槽），丟掉生成時附帶的角色與它的 visit，
 * 再用 character 以 freshVisit 重組（出生點、角色的背包 / 裝備 / 等級都帶進來）。還原會重新生成一次同 seed 的世界。
 */
export function planNewWorld(game: DelveGame, character: DelveCharacter, now: number): { game: DelveGame; session: SplitSession } {
  const { world } = saveSplitGame(game, newIdentity(now), { worldId: newId(), worldName: game.seed, visits: {} }, now);
  const bare: WorldData = { ...world, header: { ...world.header, visits: {} } };
  const r = restoreSplit(bare, character);
  if (!r.ok) throw new Error(r.message);
  return { game: r.game, session: SplitSession.fromLoaded(r.world, character, newWorldSlot()) };
}

/** restoreGame 的錯誤 → 給玩家看的訊息 */
export function restoreErrorMessage(r: { error: RestoreError; saveGenVersion?: number }): string {
  if (r.error === 'gen_version') return oldGeneratorMsg(r.saveGenVersion);
  if (r.error === 'size') return BAD_SIZE_MSG;
  return WORLD_CORRUPT_MSG;
}

/**
 * 匯入檔 → 新存檔槽（既有槽一律不動）。舊合併檔：還原後 commitMigration（不備份）；
 * 世界檔：要有內嵌角色（遊戲匯出的檔才有），世界存檔時拿掉內嵌角色；本機已有同 id 角色時，匯入的 rev 較大才覆蓋（否則保留本機角色）。
 */
export async function importWorld(store: SplitStore, bytes: Uint8Array, now: number): Promise<{ slot: string } | { error: string }> {
  let any: AnySave;
  try { any = decodeAnySave(bytes); } catch { return { error: WORLD_CORRUPT_MSG }; }
  const slot = newWorldSlot();
  if (any.kind === 'legacy') {
    const r = restoreGame(any.data);
    if (!r.ok) return { error: restoreErrorMessage(r) };
    await commitMigration(store, slot, r.game, now, { backup: false });
    return { slot };
  }
  const { character: imported, ...header } = any.data.header;
  if (!imported) return { error: NO_CHARACTER_MSG };
  if (header.genVersion !== GEN_VERSION) return { error: oldGeneratorMsg(header.genVersion) };
  let local: DelveCharacter | null = null;
  const cb = await store.getCharacter(imported.id);
  if (cb) {
    try { local = decodeCharacter(cb); } catch (e) { if (!(e instanceof SaveFormatError)) throw e; }
  }
  const character = local && local.id === imported.id && local.rev >= imported.rev ? local : imported;
  await store.putSplit(slot, { bytes: encodeWorld({ header, chunks: any.data.chunks }), seed: header.seed }, character);
  return { slot };
}

export function saveSplit(store: SplitStore, s: SplitSession, game: DelveGame, now: number, summary?: SaveSummary): Promise<SlotMeta> {
  const { world, character } = s.snapshot(game, now);
  return store.putSplit(s.slot, { bytes: encodeWorld(world), seed: world.header.seed, summary }, character);
}

/** backup = true：先 backupSlot(slot, slot + BACKUP_SUFFIX) 成功後才 putSplit；任一步丟錯就整個丟出（舊存檔不動） */
export async function commitMigration(
  store: SplitStore, slot: string, game: DelveGame, now: number, o: { backup: boolean; summary?: SaveSummary },
): Promise<SplitSession> {
  if (o.backup) await store.backupSlot(slot, slot + BACKUP_SUFFIX);
  const s = SplitSession.fresh(game.seed, now, slot);
  await saveSplit(store, s, game, now, o.summary);
  return s;
}
