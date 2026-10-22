// protocol.ts — 連線協定的型別與常數（co-op M-B3）。ctrl／state 是 JSON 字串，bulk 是二進位（見 codec.ts）。
import { UNLOAD_COLS } from '../engine/streaming';
import type { Pid } from '../engine/actor';
import type { DollLook } from '../engine/doll';
import type { EnemyKind } from '../engine/enemies';
import type { ItemId } from '../engine/items';
import type { ProjKind } from '../engine/projectiles';
import type { Stack } from '../engine/inventory';
import type { DelveEvent } from '../engine/game';
import type { Cmd } from '../engine/commands';
import type { WorldBounds } from '../engine/coords';
import type { SettlementJSON } from '../engine/settlement';
import type { FolkJSON } from '../engine/folk';
import type { QuestLogJSON } from '../engine/quests';
import type { MapMarker } from '../engine/explore';
import type { DelveCharacter } from '../save/character';
import type { EnvSave } from '../save/serialize';
import type { VisitSave } from '../save/worldSave';

export const PROTO = 1;
export const MAX_GUESTS = 3;                    // MAX_PLAYERS 4（含房主）
export const PS_HZ = 20, WS_HZ = 15, LIQ_HZ = 5, CHAR_HZ = 5;
export const WORLD_SIG_MS = 1000, LOOK_MS = 1000, CHK_MS = 30_000, SAVE_DEBOUNCE_MS = 2000;
export const GUEST_TIMEOUT_MS = 90_000, HOST_TIMEOUT_MS = 90_000, PS_STALE_MS = 500;   // C8
export const INTERP_DELAY_MS = 100, CMD_RATE = 30, CMD_BURST = 60;
/** 定義在 engine/constants.ts（引擎不依賴 net/）；這裡轉出口，既有的 import 不必改 */
export { REMOTE_REACH_SLACK } from '../engine/constants';
/** 興趣範圍（C6）：tiles／liq 用的欄數，比客人自己的 UNLOAD_COLS 多 2 欄 */
export const NET_TILE_COLS = UNLOAD_COLS + 2;
/** bulk 在途超過就排隊（R6） */
export const BULK_HIGH_WATER = 256 * 1024;

export type RejectReason = 'full' | 'proto' | 'gen' | 'charInUse' | 'closed' | 'char';
export type ByeReason = 'leave' | 'closed' | 'timeout';
/** 引擎裡沒有獨立的 ScoutMark，實際型別是 explore.ts 的 MapMarker */
export type ScoutMark = MapMarker;

export const PS_GROUND = 1, PS_BOAT = 2, PS_CLIMB = 4;           // Ps.flags 位元

export type WireChest = [key: number, slots: (Stack | null)[] | null, unlocked: 0 | 1];
export interface WireBatch { chunk: number; rev: number; tiles: number[]; chests: WireChest[]; full: boolean }
export interface PeerInfo { pid: Pid; nick: string; look: DollLook }
export interface Welcome {
  t: 'welcome'; pid: Pid; worldId: string; seed: string; genVersion: number; outerGenVersion: number;
  bounds: WorldBounds; w: number; h: number; time: number; tick: number; peaceful: boolean; you: { x: number; y: number }; players: PeerInfo[];
}
export interface Ps {
  t: 'ps'; seq: number; tseq: number; x: number; y: number; vx: number; vy: number; flags: number;
  facing: 1 | -1; aim: [number, number]; mine: boolean; use: boolean; slot: number;
}
export interface WsPlayer { pid: Pid; x: number; y: number; vx: number; vy: number; facing: 1 | -1; hp: number; maxHp: number; mana: number; dead: boolean }
export interface WsEnemy { id: number; kind: EnemyKind; x: number; y: number; dir: 1 | -1; hp: number; maxHp: number; state: string }
export interface WsDrop { id: number; item: ItemId; count: number; x: number; y: number }
export interface WsProj { id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; hostile: boolean }
export interface WsNpc { id: number; src: 0 | 1; x: number; y: number; dir: 1 | -1 }   // src 0 = 據點居民、1 = 世界 NPC
export interface Ws { t: 'ws'; tick: number; time: number; players: WsPlayer[]; enemies: WsEnemy[]; drops: WsDrop[]; proj: WsProj[]; npcs: WsNpc[] }

export type HostCtrl = Welcome | { t: 'reject'; reason: RejectReason } | { t: 'tiles'; tick: number; batches: WireBatch[] }
  | { t: 'ev'; list: DelveEvent[] } | { t: 'pub'; list: DelveEvent[] } | { t: 'ack'; seq: number; ok: boolean; reason?: string }
  | { t: 'char'; rev: number; character: DelveCharacter } | { t: 'chk'; rev: number; character: DelveCharacter }
  | { t: 'look'; pid: Pid; nick: string; look: DollLook } | { t: 'gone'; pid: Pid }
  | { t: 'teleport'; x: number; y: number; tseq: number } | { t: 'knock'; vx: number; vy: number; dur: number }
  | { t: 'world'; snap: WorldSnap } | { t: 'bye'; reason: ByeReason };
export type GuestCtrl = { t: 'hello'; proto: number; build: string; charId: string; nick: string; character: unknown }
  | { t: 'ready' } | { t: 'cmd'; seq: number; cmd: Cmd } | { t: 'sum'; cx: number; sums: number[] } | { t: 'bye'; reason: ByeReason };

/** spec §5.6 第 2 點：只有世界層級（Task 7 產生 / 套用） */
export interface WorldSnap {
  time: number; tick: number; peaceful: boolean;
  unlocked: number[]; keysUsed: number; bosses: string[]; kills: Partial<Record<EnemyKind, number>>;
  bossActive: EnemyKind | null; weather: EnvSave['weather'] | null; minedIce: number[];
  settle: SettlementJSON; folk: FolkJSON; quests: QuestLogJSON;
  scoutMarks: ScoutMark[]; perkDays: { guide: number; healer: number }; scouted: string[]; stones: number[];
  /** 只有加入時給該客人的那份帶；之後重送的 world 一律 null */
  visit: VisitSave | null;
}
/** bulk 的標頭（payload 另外帶） */
export type BulkHead = { t: 'snap'; snap: WorldSnap } | { t: 'col'; cx: number; revs: number[]; diff: { cy: number; chests: WireChest[] }[] }
  | { t: 'chunk'; key: number; rev: number; chests: WireChest[] } | { t: 'liq'; chunks: number[] };
