// protocol.ts — 連線協定的型別與常數（co-op M-B3）。ctrl／state 是 JSON 字串，bulk 是二進位（見 codec.ts）。
import { UNLOAD_COLS } from '../engine/streaming';
import type { Pid } from '../engine/actor';
import type { DollLook } from '../engine/doll';
import type { EnemyKind } from '../engine/enemies';
import type { ItemId, WeaponKind } from '../engine/items';
import type { PlayerPose } from '../engine/pose';
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
export const MAX_GUESTS = 7;                    // MAX_PLAYERS 8（含房主；M-C2 D7）
export const PS_HZ = 20, WS_HZ = 15, LIQ_HZ = 5, CHAR_HZ = 5;
export const WORLD_SIG_MS = 1000, LOOK_MS = 1000, CHK_MS = 30_000, SAVE_DEBOUNCE_MS = 2000;
export const GUEST_TIMEOUT_MS = 90_000, HOST_TIMEOUT_MS = 90_000, PS_STALE_MS = 500;   // C8
export const INTERP_DELAY_MS = 100, CMD_RATE = 30, CMD_BURST = 60;
/** M-C：reject / bye 之後房主多留連線這麼久才關（讓最後那則訊息送達）；ping 週期；每位客人停放的遠方 sum 上限；同角色舊連線沉默超過這麼久可被新 hello 取代 */
export const LINGER_MS = 2000, PING_MS = 2000, SUM_PARK_MAX = 32, REPLACE_SILENT_MS = 5000;
/**
 * 跨邊界指令（物品進出世界 / 箱子 / 商店 / 鍛造）：房主同一幀結束時送 chk，並觸發存世界的防抖（C9）；
 * 客人記下最後一個的 seq，chk.upTo 還沒涵蓋到它 = unconfirmed（M-C C1）
 */
export const BOUNDARY_OPS: ReadonlySet<Cmd['op']> = new Set<Cmd['op']>([
  'chestTake', 'chestTakeAll', 'chestDeposit', 'toss', 'buy', 'sell', 'folkBuy', 'folkSell', 'service',
  'residentService', 'folkService', 'reroll', 'upgrade', 'ascend', 'deepforge', 'salvage', 'salvageAll',
]);
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
/** WirePose 的 flags 位元（M-C2 D2） */
export const POSE_GROUND = 1, POSE_BOAT = 2, POSE_CLIMB = 4, POSE_DEAD = 8, POSE_LEFT = 16;

/**
 * PlayerPose 的線上版本（M-C2 D2）：固定長度的陣列、數字保留 2 位小數、物品 / 武器種類 / 釣魚狀態照舊用字串。
 * 解碼在 validate.ts decodePose（不合法 → null）。
 */
export type WireMantle = [p: number, dir: 1 | -1, edgeX: number, edgeY: number];
export type WirePose = [
  x: number, y: number, vx: number, vy: number, flags: number, gfxOffY: number, iframes: number, liquidFrac: number,
  held: ItemId | null,
  mantle: WireMantle | null,
  attack: [item: ItemId, kind: WeaponKind, angle: number, dir: 1 | -1, at: number, dur: number] | null,
  mining: [x: number, y: number, progress: number, pick: ItemId | null] | null,
  fishing: [state: NonNullable<PlayerPose['fishing']>['state'], x: number, y: number, liquid: 0 | 1] | null,
  /** 挨打計數 0..255 */
  hurt: number,
];
export const WIRE_POSE_LEN = 14;
/** 2 位小數 */
export const r2 = (v: number): number => Math.round(v * 100) / 100;
/** 往下取 2 位小數（HUD 用 Math.floor 顯示的值：取完再 floor 跟原值一樣） */
export const floor2 = (v: number): number => Math.floor(v * 100) / 100;
/** 往上取 2 位小數（呼吸泡泡用 Math.ceil 算顆數：取完再 ceil 跟原值一樣） */
export const ceil2 = (v: number): number => Math.ceil(v * 100) / 100;
export function encodeMantle(m: PlayerPose['mantle']): WireMantle | null {
  return m ? [r2(Math.max(0, Math.min(1, m.p))), m.dir, r2(m.edgeX), r2(m.edgeY)] : null;
}
export function encodePose(p: PlayerPose): WirePose {
  const flags = (p.onGround ? POSE_GROUND : 0) | (p.boating ? POSE_BOAT : 0) | (p.climbing ? POSE_CLIMB : 0)
    | (p.dead ? POSE_DEAD : 0) | (p.facing < 0 ? POSE_LEFT : 0);
  const a = p.attack, m = p.mining, f = p.fishing;
  return [
    r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), flags, r2(p.gfxOffY), r2(p.iframes), r2(p.liquidFrac),
    p.held,
    encodeMantle(p.mantle),
    a ? [a.item, a.kind, r2(a.angle), a.dir, r2(a.at), r2(a.dur)] : null,
    m ? [m.x, m.y, r2(m.progress), m.pick] : null,
    f ? [f.state, r2(f.x), r2(f.y), f.liquid ? 1 : 0] : null,
    p.hurt & 255,
  ];
}

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
  /** 正在攀上邊緣（M-C2）：[進度 0..1, 方向, 牆角 x, 牆角 y]；null = 沒有 */
  mt: [number, 1 | -1, number, number] | null;
}
/** ws 裡的一位玩家：位置 / 速度 / 面向 / 死活只在 pose 裡（不重複帶）；mana 往下取 2 位小數 */
export interface WsPlayer {
  pid: Pid; hp: number; maxHp: number; mana: number;
  /** 畫這個玩家需要的全部（M-C2 D2） */
  pose: WirePose;
}
/** 怪物 / 掉落物 / 投射物 / NPC 的座標與速度：2 位小數（r2） */
export interface WsEnemy { id: number; kind: EnemyKind; x: number; y: number; dir: 1 | -1; hp: number; maxHp: number; state: string }
export interface WsDrop { id: number; item: ItemId; count: number; x: number; y: number }
export interface WsProj { id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; hostile: boolean }
export interface WsNpc { id: number; src: 0 | 1; x: number; y: number; dir: 1 | -1 }   // src 0 = 據點居民、1 = 世界 NPC
export interface Ws {
  t: 'ws'; tick: number; time: number; players: WsPlayer[]; enemies: WsEnemy[]; drops: WsDrop[]; proj: WsProj[]; npcs: WsNpc[];
  /** 收件客人自己的呼吸泡泡數（往上取 2 位小數）；滿氣就省略。別人的呼吸畫面上用不到，不帶 */
  br?: number;
}

export type HostCtrl = Welcome | { t: 'reject'; reason: RejectReason } | { t: 'tiles'; tick: number; batches: WireBatch[] }
  | { t: 'ev'; list: DelveEvent[] } | { t: 'pub'; list: DelveEvent[] } | { t: 'ack'; seq: number; ok: boolean; reason?: string }
  | { t: 'char'; rev: number; character: DelveCharacter } | { t: 'chk'; rev: number; character: DelveCharacter; upTo: number }
  | { t: 'look'; pid: Pid; nick: string; look: DollLook } | { t: 'gone'; pid: Pid }
  | { t: 'teleport'; x: number; y: number; tseq: number } | { t: 'knock'; vx: number; vy: number; dur: number }
  | { t: 'world'; snap: WorldSnap } | { t: 'bye'; reason: ByeReason } | { t: 'ping'; at: number } | { t: 'pong'; at: number };
export type GuestCtrl = { t: 'hello'; proto: number; build: string; charId: string; nick: string; character: unknown }
  | { t: 'ready' } | { t: 'cmd'; seq: number; cmd: Cmd } | { t: 'sum'; cx: number; sums: number[] } | { t: 'bye'; reason: ByeReason }
  | { t: 'ping'; at: number } | { t: 'pong'; at: number } | { t: 'chkAck'; rev: number };

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
