// split.ts — 世界檔 + 角色檔的存讀編排（純邏輯；IndexedDB 在 SplitStore 後面，Task 7 接）。
// 規則：讀檔（planContinue / planPlay）永遠不寫；遷移 = 先備份、備份成功才 putSplit；每次存檔只有一次 putSplit（一個 transaction）。
// format 10 的世界檔：讀進來時 SplitSession.pendingBackup = V10_BACKUP_SUFFIX，第一次 saveSplit 先備份成
//   slot + '.v10.bak'、成功才寫 format 11（備份丟錯就整個丟出、原檔不動；寫成功後清空，之後不再備份）。
// 多世界 × 多角色：任何角色都能進任何世界（planPlay）；匯入一律開新槽（importWorld），不動既有世界。
import { SaveFormatError, applyCharacter, restoreBlocker, snapshotGame, type RestoreError, type SaveData } from './serialize';
import { decodeCharacter, newId, newIdentity, type CharIdentity, type DelveCharacter } from './character';
import {
  V10_BACKUP_SUFFIX, characterState, decodeAnySave, encodeWorld, splitSnapshot, trimHeld, upsertVisit,
  type AnySave, type HeldChar, type VisitSave, type WorldData, type WorldHeader, type WorldIdentity,
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
  /** 只寫角色檔（同 id 覆蓋）；pendingWorld 沒給或 null 都會清掉記錄上的 pendingWorld（co-op C1） */
  putCharacter(c: DelveCharacter, opts?: { pendingWorld?: string | null }): Promise<void>;
}

/**
 * 一場遊戲的存檔身分：哪個存檔槽、哪個角色、哪個世界、世界上各角色的 visit 與 held。
 * 也是開房時 NetHost 的 VisitStore（co-op C1）：get / put 是客人的 visit、getHeld / putHeld 是離線客人的角色，下一次存檔一起寫進世界檔。
 */
export class SplitSession {
  private who: CharIdentity;
  private where: WorldIdentity;
  /** 下一次存檔前要先備份的槽後綴（讀進 format 10 的世界檔 → V10_BACKUP_SUFFIX；備份 + 寫入成功後清空） */
  pendingBackup: string | null = null;
  constructor(who: CharIdentity, where: WorldIdentity, readonly slot: string) {
    this.who = { ...who };
    this.where = { ...where, visits: { ...where.visits }, held: { ...where.held } };
  }
  static fresh(seed: string, now: number, slot: string): SplitSession {
    return new SplitSession(newIdentity(now), { worldId: newId(), worldName: seed, visits: {} }, slot);
  }
  static fromLoaded(world: WorldHeader, character: DelveCharacter, slot: string): SplitSession {
    const { id, nick, createdAt, rev } = character;
    const s = new SplitSession({ id, nick, createdAt, rev }, { worldId: world.worldId, worldName: world.worldName, visits: world.visits, held: world.held }, slot);
    if (world.format === 10) s.pendingBackup = V10_BACKUP_SUFFIX;
    return s;
  }
  get charId(): string { return this.who.id; }
  get nick(): string { return this.who.nick; }
  get worldId(): string { return this.where.worldId; }
  // ── VisitStore（NetHost）──
  get(charId: string): VisitSave | undefined {
    return Object.prototype.hasOwnProperty.call(this.where.visits, charId) ? this.where.visits[charId] : undefined;
  }
  put(charId: string, v: VisitSave): void { this.where = { ...this.where, visits: upsertVisit(this.where.visits, charId, v) }; }
  getHeld(charId: string): HeldChar | undefined {
    const held = this.where.held ?? {};
    return Object.prototype.hasOwnProperty.call(held, charId) ? held[charId] : undefined;
  }
  /** null = 清掉；放進新的一筆時超過上限淘汰 at 最舊的（剛放的不淘汰） */
  putHeld(charId: string, h: HeldChar | null): void {
    const held = { ...this.where.held };
    if (h) held[charId] = h; else delete held[charId];
    this.where = { ...this.where, held: h ? trimHeld(held, undefined, charId) : held };
  }
  /** rev + 1、更新 visits，回傳要寫的兩份資料 */
  snapshot(game: DelveGame, now: number): { world: WorldData; character: DelveCharacter } {
    return this.snapshotData(snapshotGame(game, now), now);
  }
  /** 同 snapshot，但輸入是 format-9 形狀的完整存檔資料（遷移 / 匯入舊檔不必先建遊戲） */
  snapshotData(data: SaveData, now: number): { world: WorldData; character: DelveCharacter } {
    const next = { ...this.who, rev: this.who.rev + 1 };
    const out = splitSnapshot(data, next, this.where, now);
    this.who = next;
    this.where = { ...this.where, visits: out.world.header.visits, held: { ...out.world.header.held } };
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

/** 角色檔 bytes → 角色；不見 / 解不開 / id 不符 → null（「繼續冒險」挑世界時跳過，同 continueSlot / listCharacters） */
async function usableCharacter(store: SplitStore, charId: string): Promise<DelveCharacter | null> {
  const cb = await store.getCharacter(charId);
  if (!cb) return null;
  try {
    const c = decodeCharacter(cb);
    return c.id === charId ? c : null;
  } catch (e) {
    if (e instanceof SaveFormatError) return null;
    throw e;
  }
}

/**
 * 只讀不寫：槽 → 該怎麼繼續（用世界記錄上的 charId）。legacy 由呼叫端還原成功後再 commitMigration。
 * 不給 slot：依 listWorlds 新到舊，取第一個「清單上有 charId 且角色檔還在、解得開」的世界（先看清單與角色檔，
 * 只解開選中的那個世界）；清單上沒有 charId 的槽只有解得開的舊合併檔算數（要讀它的 bytes 才知道）。
 */
export async function planContinue(store: SplitStore, slot?: string): Promise<ContinuePlan> {
  if (slot !== undefined) {
    const rec = await store.getSlot(slot);
    return rec ? planRecord(store, slot, rec) : { kind: 'none' };
  }
  for (const m of await store.listWorlds()) {
    if (m.charId) {
      const character = await usableCharacter(store, m.charId);
      if (!character) continue;
      const rec = await store.getSlot(m.slot);
      if (!rec) continue;
      const p = readRecord(rec, m.slot);
      return p.kind === 'world' ? { kind: 'split', world: p.world, character, slot: m.slot } : p;
    }
    const rec = await store.getSlot(m.slot);
    if (!rec) continue;
    if (rec.charId) {
      if (await usableCharacter(store, rec.charId)) return planRecord(store, m.slot, rec);
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
 * 剛生成（還沒玩過）的世界 + 既有角色 → 開局：就地把角色隨身的狀態套到這個遊戲上（與 restoreGame 共用 applyCharacter，
 * 不重新生成世界；玩家留在出生點 = freshVisit）。存檔身分 = 全新 worldId、worldName = seed、新存檔槽、沒有任何 visit
 * （生成時的角色不留下 visit）。回傳的 game 就是傳入的那個。now 未用：visit 的 lastSeen 在第一次 saveSplit 時才寫。
 */
export function planNewWorld(game: DelveGame, character: DelveCharacter, _now: number): { game: DelveGame; session: SplitSession } {
  applyCharacter(game, characterState(character, game.time));
  const { id, nick, createdAt, rev } = character;
  const session = new SplitSession({ id, nick, createdAt, rev }, { worldId: newId(), worldName: game.seed, visits: {} }, newWorldSlot());
  return { game, session };
}

/** restoreGame 的錯誤 → 給玩家看的訊息 */
export function restoreErrorMessage(r: { error: RestoreError; saveGenVersion?: number }): string {
  if (r.error === 'gen_version') return oldGeneratorMsg(r.saveGenVersion);
  if (r.error === 'size') return BAD_SIZE_MSG;
  return WORLD_CORRUPT_MSG;
}

/**
 * 匯入檔 → 新存檔槽（既有槽一律不動；不建遊戲、不生成世界）。寫入的角色 savedAt = now（存檔清單以匯入時間排序）。
 * 舊合併檔：restoreBlocker 檢查後直接在資料層拆成世界 + 新角色（與 commitMigration 共用 migrateData，不備份）；
 *   COMPAT_GEN 舊生成器的存檔照 restoreGame 的遷移規則改標成目前生成器。
 * 世界檔：要有內嵌角色（遊戲匯出的檔才有），世界存檔時拿掉內嵌角色；本機已有同 id 角色時，匯入的 rev 較大才覆蓋（否則保留本機角色）。
 */
export async function importWorld(store: SplitStore, bytes: Uint8Array, now: number): Promise<{ slot: string } | { error: string }> {
  let any: AnySave;
  try { any = decodeAnySave(bytes); } catch { return { error: WORLD_CORRUPT_MSG }; }
  const slot = newWorldSlot();
  if (any.kind === 'legacy') {
    const h = any.data.header;
    const blocked = restoreBlocker(h);
    if (blocked) return { error: restoreErrorMessage(blocked) };
    await migrateData(store, slot, { ...any.data, header: { ...h, genVersion: GEN_VERSION, savedAt: now } }, now, { backup: false });
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
  const kept = local && local.id === imported.id && local.rev >= imported.rev ? local : imported;
  await store.putSplit(slot, { bytes: encodeWorld({ header, chunks: any.data.chunks }), seed: header.seed }, { ...kept, savedAt: now });
  return { slot };
}

function putData(store: SplitStore, s: SplitSession, data: SaveData, now: number, summary?: SaveSummary): Promise<SlotMeta> {
  const { world, character } = s.snapshotData(data, now);
  return store.putSplit(s.slot, { bytes: encodeWorld(world), seed: world.header.seed, summary }, character);
}

/** 存檔；s.pendingBackup 有值（format 10 的世界）→ 先 backupSlot 成功才 putSplit，putSplit 成功後清空 */
export async function saveSplit(store: SplitStore, s: SplitSession, game: DelveGame, now: number, summary?: SaveSummary): Promise<SlotMeta> {
  const suffix = s.pendingBackup;
  if (suffix) await store.backupSlot(s.slot, s.slot + suffix);
  const meta = await putData(store, s, snapshotGame(game, now), now, summary);
  if (suffix && s.pendingBackup === suffix) s.pendingBackup = null;
  return meta;
}

type MigrateOpts = { backup: boolean; summary?: SaveSummary };
/** 遷移核心（資料層）：backup = true 先 backupSlot(slot, slot + BACKUP_SUFFIX) 成功後才 putSplit；任一步丟錯就整個丟出（舊存檔不動） */
async function migrateData(store: SplitStore, slot: string, data: SaveData, now: number, o: MigrateOpts): Promise<SplitSession> {
  if (o.backup) await store.backupSlot(slot, slot + BACKUP_SUFFIX);
  const s = SplitSession.fresh(data.header.seed, now, slot);
  await putData(store, s, data, now, o.summary);
  return s;
}

/** 還原好的舊存檔遊戲 → 世界 + 新角色（見 migrateData） */
export function commitMigration(store: SplitStore, slot: string, game: DelveGame, now: number, o: MigrateOpts): Promise<SplitSession> {
  return migrateData(store, slot, snapshotGame(game, now), now, o);
}
