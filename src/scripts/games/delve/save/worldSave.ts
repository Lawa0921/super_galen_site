// worldSave.ts — 世界檔 format 10（co-op M-A）：純資料，不碰 IndexedDB / DOM。
// 存檔 = snapshotGame()（format 9 的完整 header）→ splitSnapshot() 切成「世界 + 角色」；
// 讀檔 = joinSplit() 拼回 format-9 形狀的 SaveData → 交給現行 restoreGame()（restoreSplit 包好這兩步；存檔用 saveSplitGame）。
//   角色第一次來這個世界（沒有 visit）→ restoreGame 的 freshVisit：出生點、只揭露出生點周圍、沒有標記 / 床 / 重生核心。
// 世界 header 不再有玩家欄位：每個來過的角色各有一筆 visits[charId]（位置 / 床 / 重生核心 / 探索 / 標記 / 發現 /
//   呼吸燃燒蜂蜜 / lastSeen），最多 MAX_VISITS 筆，超過以 lastSeen 最舊者淘汰（LRU）。settle.spawnCore 在世界一律 null。
// 角色隨身的東西（背包 / 裝備 / 等級 / 圖鑑 / 釣魚紀錄 / 不滅冷卻 / buff 剩餘秒數）在 character.ts 的 DelveCharacter。
// 容器與 format 9 相同（magic "DLVS" + header JSON + chunk payload），靠 header.format 分流：
//   format ≤ 9 → decodeSave（舊合併檔）、format 10 → decodeWorld；restoreGame 收到 format 10 會回 'format' 錯誤。
// 驗證：世界欄位重用 serialize 的驗證函式（壞了 = 損毀）；worldId 不合法 = 損毀；worldName 不合法 → 退回 seed；
//   visits 不是物件 = 損毀，但單筆 visit 不合法只丟那一筆（該角色在這個世界從出生點重來）；
//   匯出檔才有的內嵌 character 有值時過 validateCharacter。
import {
  SAVE_FORMAT, SaveFormatError, decodeSave, encodeContainer, isNum, readChunks, readContainer, restoreGame, snapshotGame,
  validBed, validBossActive, validChests, validDiscovery, validDrops, validEnv, validExplored, validExtra, validFolk, validHalves,
  validKeysUsed, validLevels, validLiquids, validMarkers, validUnlocked, validVitals,
  type ChestSave, type ChunkPayload, type DropSave, type EnvSave, type FolkSave, type LiquidSave, type PlayerSave,
  type RestoreOptions, type RestoreResult, type SaveData, type SaveHeader,
} from './serialize';
import { CHARACTER_FORMAT, validateCharacter, type CharIdentity, type DelveCharacter } from './character';
import { MAX_BREATH, type DelveGame } from '../engine/game';
import { BASE_HP, BASE_MANA } from '../engine/combat';
import { Codex } from '../engine/codex';
import { Equipment } from '../engine/equipment';
import { Vanity } from '../engine/vanity';
import { normalizeAppearance } from '../engine/appearance';
import { ENEMIES, type EnemyKind } from '../engine/enemies';
import type { MapMarker } from '../engine/explore';
import type { DiscoveryJSON } from '../engine/discovery';
import type { RngState } from '../engine/rng';
import type { SettlementJSON } from '../engine/settlement';
import type { BuffKind } from '../engine/folkDefs';
import type { FolkJSON } from '../engine/folk';
import type { QuestLogJSON } from '../engine/quests';

export const WORLD_FORMAT = 10;
export const MAX_VISITS = 8;
const MAX_WORLD_NAME = 64;
/** worldId 與 visits 的 key（角色 id）共用 */
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export interface VisitSave {
  pos: PlayerSave; bed: { x: number; y: number } | null; spawnCore: number | null;
  explored?: string; markers: MapMarker[]; discovery?: DiscoveryJSON;
  vitals: { breath: number; burning: number; honey: number }; lastSeen: number;
}
export type VisitMap = Record<string, VisitSave>;
export interface WorldHeader {
  format: 10; genVersion: number; seed: string; width: number; height: number;
  time: number; tick: number; savedAt: number; worldId: string; worldName: string;
  chunks: number[]; chests: ChestSave[]; unlocked: number[]; keysUsed: number;
  combat: { bosses: string[]; kills: Partial<Record<EnemyKind, number>>; peaceful: boolean };
  liquids?: LiquidSave; drops: DropSave[]; bossActive: EnemyKind | null; env?: EnvSave;
  extra: { minedIce: number[]; rng?: { loot?: RngState; fish?: RngState } };
  settle?: SettlementJSON; halves?: number[]; folk?: Omit<FolkSave, 'buffs'>;
  visits: VisitMap;
  /** 只有匯出檔有（D4） */
  character?: DelveCharacter;
}
export interface WorldData { header: WorldHeader; chunks: Map<number, ChunkPayload> }
export interface WorldIdentity { worldId: string; worldName: string; visits: VisitMap }
export type AnySave = { kind: 'legacy'; data: SaveData } | { kind: 'world'; data: WorldData };
export type SplitRestoreResult =
  | { ok: true; game: DelveGame; world: WorldHeader; freshVisit: boolean }
  | Extract<RestoreResult, { ok: false }>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** 就地淘汰 lastSeen 最舊的 visit 直到 ≤ max（keep 永不淘汰；同 lastSeen 先淘汰先放進來的） */
function evictOldest(v: VisitMap, max: number, keep?: string): void {
  const ids = Object.keys(v);
  if (ids.length <= max) return;
  const order = ids.filter((id) => id !== keep).sort((a, b) => v[a].lastSeen - v[b].lastSeen);
  for (const id of order.slice(0, ids.length - max)) delete v[id];
}

/** 放進 / 更新一個角色的 visit，回傳新物件（不改輸入）；超過 max 筆淘汰最久沒來的 */
export function upsertVisit(visits: VisitMap, charId: string, v: VisitSave, max: number = MAX_VISITS): VisitMap {
  const out: VisitMap = { ...visits, [charId]: v };
  evictOldest(out, max, charId);
  return out;
}

/** format-9 完整 header（snapshotGame 的輸出）→ 世界 + 角色 */
export function splitSnapshot(data: SaveData, who: CharIdentity, where: WorldIdentity, now: number): { world: WorldData; character: DelveCharacter } {
  const h = data.header;
  const cb = h.combat;
  const eq = Equipment.fromJSON(cb?.equipment, cb?.equipGear);
  const buffsLeft: Partial<Record<BuffKind, number>> = {};
  for (const [k, until] of Object.entries(h.folk?.buffs ?? {}) as [BuffKind, number][]) {
    const left = until - h.time;
    if (left > 0) buffsLeft[k] = left;
  }
  const character: DelveCharacter = {
    cformat: CHARACTER_FORMAT, id: who.id, nick: who.nick, createdAt: who.createdAt, savedAt: now, rev: who.rev,
    appearance: h.appearance ?? normalizeAppearance(undefined),
    vanity: h.vanity ?? Vanity.fromJSON(undefined).toJSON(),
    inventory: h.inventory,
    equipment: eq.toJSON(), equipGear: eq.gearJSON(),
    combat: { hp: cb?.hp ?? BASE_HP, baseMaxHp: cb?.maxHp ?? BASE_HP, mana: cb?.mana ?? BASE_MANA },
    levels: h.levels ?? validLevels(undefined),
    codex: h.extra?.codex ?? new Codex().toJSON(),
    fishLog: h.extra?.fishLog ?? {},
    undyingCd: h.vitals?.undying ?? 0,
    buffsLeft,
  };
  const visit: VisitSave = {
    pos: { ...h.player }, bed: h.bed ?? null, spawnCore: h.settle?.spawnCore ?? null,
    explored: h.explored, markers: h.markers ?? [], discovery: h.discovery,
    vitals: { breath: h.vitals?.breath ?? MAX_BREATH, burning: h.vitals?.burning ?? 0, honey: h.vitals?.honey ?? 0 },
    lastSeen: now,
  };
  let folk: Omit<FolkSave, 'buffs'> | undefined;
  if (h.folk) { const { buffs: _buffs, ...rest } = h.folk; folk = rest; }
  const rng = h.extra?.rng;
  const header: WorldHeader = {
    format: WORLD_FORMAT, genVersion: h.genVersion, seed: h.seed, width: h.width, height: h.height,
    time: h.time, tick: h.tick, savedAt: h.savedAt, worldId: where.worldId, worldName: where.worldName,
    chunks: h.chunks, chests: h.chests ?? [], unlocked: h.unlocked ?? [], keysUsed: h.keysUsed ?? 0,
    combat: { bosses: cb?.bosses ?? [], kills: cb?.kills ?? {}, peaceful: cb?.peaceful ?? false },
    liquids: h.liquids, drops: h.drops ?? [], bossActive: h.bossActive ?? null, env: h.env,
    extra: rng ? { minedIce: h.extra?.minedIce ?? [], rng } : { minedIce: h.extra?.minedIce ?? [] },
    settle: h.settle ? { ...h.settle, spawnCore: null } : undefined,
    halves: h.halves, folk,
    visits: upsertVisit(where.visits, who.id, visit),
  };
  return { world: { header, chunks: data.chunks }, character };
}

/** 世界 + 角色 → format-9 形狀的 SaveData（給 restoreGame）；這個世界沒有該角色的 visit → freshVisit（位置是佔位） */
export function joinSplit(world: WorldData, character: DelveCharacter): { data: SaveData; freshVisit: boolean } {
  const w = world.header;
  const visit = own(w.visits, character.id) ? w.visits[character.id] : undefined;
  const buffs: Partial<Record<BuffKind, number>> = {};
  for (const [k, left] of Object.entries(character.buffsLeft) as [BuffKind, number][]) buffs[k] = w.time + left;
  // 世界沒有 folk（舊存檔）→ 初始值（world / quests 的空物件由 load() 補成預設，同 validFolk）
  const folk: Omit<FolkSave, 'buffs'> = w.folk
    ?? { world: {} as FolkJSON, quests: {} as QuestLogJSON, scoutMarks: [], perkDays: { guide: -1, healer: -1 }, scouted: [] };
  const rng = w.extra.rng;
  const header: SaveHeader = {
    format: SAVE_FORMAT, genVersion: w.genVersion, seed: w.seed, width: w.width, height: w.height,
    time: w.time, tick: w.tick, savedAt: w.savedAt,
    player: visit ? { ...visit.pos } : { x: 0, y: 0, vx: 0, vy: 0 },
    inventory: character.inventory,
    chunks: w.chunks, chests: w.chests, unlocked: w.unlocked, keysUsed: w.keysUsed,
    explored: visit?.explored, markers: visit?.markers ?? [], discovery: visit?.discovery, bed: visit?.bed ?? null,
    combat: {
      hp: character.combat.hp, maxHp: character.combat.baseMaxHp, mana: character.combat.mana,
      equipment: character.equipment, equipGear: character.equipGear,
      bosses: w.combat.bosses, kills: w.combat.kills, peaceful: w.combat.peaceful,
    },
    liquids: w.liquids,
    vitals: { ...(visit?.vitals ?? { breath: MAX_BREATH, burning: 0, honey: 0 }), undying: character.undyingCd },
    drops: w.drops, bossActive: w.bossActive, env: w.env,
    extra: rng
      ? { fishLog: character.fishLog, minedIce: w.extra.minedIce, codex: character.codex, rng }
      : { fishLog: character.fishLog, minedIce: w.extra.minedIce, codex: character.codex },
    appearance: character.appearance, vanity: character.vanity,
    settle: w.settle ? { ...w.settle, spawnCore: visit?.spawnCore ?? null } : undefined,
    halves: w.halves, levels: character.levels,
    folk: { ...folk, buffs },
  };
  return { data: { header, chunks: world.chunks }, freshVisit: !visit };
}

/** 遊戲 → 世界 + 角色（where.visits 放進 / 更新這個角色的 visit） */
export function saveSplitGame(game: DelveGame, who: CharIdentity, where: WorldIdentity, now: number): { world: WorldData; character: DelveCharacter } {
  return splitSnapshot(snapshotGame(game, now), who, where, now);
}

/** 世界檔（bytes 或已解碼）+ 角色 → 遊戲。永不丟例外（同 restoreGame）；角色第一次來這個世界 → freshVisit（出生點、只揭露出生點周圍） */
export function restoreSplit(world: Uint8Array | WorldData, character: DelveCharacter, opts: RestoreOptions = {}): SplitRestoreResult {
  let wd: WorldData, joined: { data: SaveData; freshVisit: boolean };
  try {
    wd = world instanceof Uint8Array ? decodeWorld(world) : world;
    joined = joinSplit(wd, character);
  } catch (e) {
    return { ok: false, error: 'format', message: e instanceof Error ? e.message : String(e) };
  }
  const r = restoreGame(joined.data, { ...opts, freshVisit: joined.freshVisit });
  if (!r.ok) return r;
  return { ok: true, game: r.game, world: wd.header, freshVisit: joined.freshVisit };
}

export function encodeWorld(w: WorldData): Uint8Array {
  return encodeContainer(w.header, w.header.chunks, w.chunks);
}

/** 單筆 visit：不合法 → null（丟掉這筆，不算世界損毀） */
function validVisit(v: unknown, width: number, height: number): VisitSave | null {
  if (!isObj(v)) return null;
  const p = v.pos;
  if (!isObj(p) || !isNum(p.x) || !isNum(p.y) || !isNum(v.lastSeen)) return null;
  if (v.spawnCore !== undefined && v.spawnCore !== null && !Number.isInteger(v.spawnCore)) return null;
  try {
    const vit = validVitals(v.vitals);
    if (!vit) return null;
    return {
      pos: { x: p.x, y: p.y, vx: isNum(p.vx) ? p.vx : 0, vy: isNum(p.vy) ? p.vy : 0 },
      bed: validBed(v.bed),
      spawnCore: Number.isInteger(v.spawnCore) ? v.spawnCore as number : null,
      explored: validExplored(v.explored, width, height),
      markers: validMarkers(v.markers),
      discovery: validDiscovery(v.discovery),
      vitals: { breath: vit.breath, burning: vit.burning, honey: vit.honey },
      lastSeen: v.lastSeen,
    };
  } catch (e) {
    if (e instanceof SaveFormatError) return null;
    throw e;
  }
}

/** 世界的戰鬥欄位（首領 / 擊殺 / 和平模式）：型別錯 → 損毀；未知 kind 寬鬆丟掉（同 validCombat） */
function validWorldCombat(v: unknown): WorldHeader['combat'] {
  if (!isObj(v)) throw new SaveFormatError('combat');
  const { bosses, kills } = v;
  if ((bosses !== undefined && (!Array.isArray(bosses) || !bosses.every((b) => typeof b === 'string')))
    || (kills !== undefined && !isObj(kills))) throw new SaveFormatError('combat');
  const k: Partial<Record<EnemyKind, number>> = {};
  for (const [kind, n] of Object.entries(kills ?? {})) {
    if (own(ENEMIES, kind) && Number.isInteger(n) && (n as number) >= 0) k[kind as EnemyKind] = n as number;
  }
  return {
    bosses: ((bosses ?? []) as string[]).filter((b) => own(ENEMIES, b) && ENEMIES[b as EnemyKind].boss),
    kills: k, peaceful: Boolean(v.peaceful),
  };
}

function worldFromContainer(bytes: Uint8Array, { raw, body }: { raw: unknown; body: number }): WorldData {
  if (!isObj(raw)) throw new SaveFormatError('world header');
  const { genVersion, seed, width, height, time, tick, chunks } = raw;
  if (raw.format !== WORLD_FORMAT) throw new SaveFormatError(`world format ${String(raw.format)}`);
  if (!isNum(genVersion) || typeof seed !== 'string' || !isNum(width) || !isNum(height) || !isNum(time) || !isNum(tick)
    || !Array.isArray(chunks) || !chunks.every((c) => Number.isInteger(c) && c >= 0)) {
    throw new SaveFormatError('world header fields');
  }
  if (typeof raw.worldId !== 'string' || !ID_RE.test(raw.worldId)) throw new SaveFormatError('worldId');
  const name = raw.worldName;
  const worldName = typeof name === 'string' && [...name].length <= MAX_WORLD_NAME ? name : seed;
  if (!isObj(raw.visits)) throw new SaveFormatError('visits');
  const visits: VisitMap = {};
  for (const [id, v] of Object.entries(raw.visits)) {
    if (!ID_RE.test(id)) continue;
    const ok = validVisit(v, width, height);
    if (ok) visits[id] = ok;
  }
  evictOldest(visits, MAX_VISITS);
  const extra = validExtra(raw.extra);
  const folk = validFolk(raw.folk);
  let worldFolk: Omit<FolkSave, 'buffs'> | undefined;
  if (folk) { const { buffs: _buffs, ...rest } = folk; worldFolk = rest; }
  const header: WorldHeader = {
    format: WORLD_FORMAT, genVersion, seed, width, height, time, tick,
    savedAt: isNum(raw.savedAt) ? raw.savedAt : 0, worldId: raw.worldId, worldName,
    chunks: chunks as number[],
    chests: validChests(raw.chests),
    unlocked: validUnlocked(raw.unlocked),
    keysUsed: validKeysUsed(raw.keysUsed),
    combat: validWorldCombat(raw.combat),
    liquids: validLiquids(raw.liquids, width, height),
    drops: validDrops(raw.drops) ?? [],
    bossActive: validBossActive(raw.bossActive),
    env: validEnv(raw.env),
    extra: extra?.rng ? { minedIce: extra.minedIce ?? [], rng: extra.rng } : { minedIce: extra?.minedIce ?? [] },
    settle: raw.settle && typeof raw.settle === 'object' ? raw.settle as SettlementJSON : undefined,
    halves: validHalves(raw.halves),
    folk: worldFolk,
    visits,
  };
  if (raw.character !== undefined) header.character = validateCharacter(raw.character);
  return { header, chunks: readChunks(bytes, body, header.chunks) };
}

/** 世界檔 bytes → WorldData；不是 format 10 或任何欄位損毀 → SaveFormatError */
export function decodeWorld(bytes: Uint8Array): WorldData {
  return worldFromContainer(bytes, readContainer(bytes));
}

/** 依 header.format 分流：≤ 9 → 舊合併檔（decodeSave），其餘 → 世界檔（decodeWorld） */
export function decodeAnySave(bytes: Uint8Array): AnySave {
  const c = readContainer(bytes);
  const format = isObj(c.raw) ? c.raw.format : undefined;
  if (isNum(format) && format <= SAVE_FORMAT) return { kind: 'legacy', data: decodeSave(bytes) };
  return { kind: 'world', data: worldFromContainer(bytes, c) };
}
