// testRig.ts — 驗收測試輔助（Task 11）：同一行程裡的房主 + 客人，經 LoopbackNet。只給測試 import，正式程式碼不用。
//   run(ms)：每 1000/60 ms 依序 net.advance → host.frame → 每位客人 guest.frame（各自一個 FixedStepper）。
//   世界：arena（平地 160×100、有界）、infinite（中央 200×100 + HashSource 外圍）、real（正式尺寸、OuterGen；generateWorld 只跑一次）。
// 決定性：LoopbackNet 用種子；沒有真的計時器。
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { BIOME, LIQ } from '../engine/world';
import { li, type Column, type ColumnLayers, type ColumnSource } from '../engine/column';
import { generateWorld, type GenResult } from '../engine/worldgen';
import { chunkOfX } from '../engine/coords';
import { CHUNK } from '../engine/constants';
import { normalizeAppearance } from '../engine/appearance';
import type { ItemId } from '../engine/items';
import type { Stack } from '../engine/inventory';
import { FixedStepper } from '../render/model';
import { createCharacter, type DelveCharacter } from '../save/character';
import type { HeldChar, VisitSave } from '../save/worldSave';
import { LoopbackNet } from './loopback';
import type { NetLink } from './link';
import { decodeBulk } from './codec';
import { NetHost, type VisitStore } from './host';
import { NetGuest } from './guest';
import type { Welcome } from './protocol';

export const FRAME = 1000 / 60;
export const BUILD = 'coop-build';
/** arena 的地面：y ≥ FLOOR 是石頭 */
export const FLOOR = 60;
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

export interface RigOptions {
  latencyMs?: [number, number]; loss?: number; seed?: string; guests?: number; world?: 'arena' | 'infinite' | 'real';
  /** 世界種子（預設 arena 'host'、infinite 'coop-inf'、real 'coop-real'）；seed 是 LoopbackNet 的種子 */
  worldSeed?: string;
  /** 預設 arena / infinite / real 都是和平；false = 非和平 */
  peaceful?: boolean;
  /** 直接用這個遊戲當房主（例：restoreSplit 讀回來的）；world 只決定客人副本怎麼建 */
  game?: DelveGame;
}
export interface Rig {
  net: LoopbackNet; readonly host: NetHost; hostGame: DelveGame; guests: NetGuest[]; visits: Map<string, VisitSave>; checkpoints: DelveCharacter[][];
  /** 房主的 VisitStore（visits + held，Map 版；模擬世界檔，rehost 沿用） */
  store: VisitStore; held: Map<string, HeldChar>;
  /** 每 1000/60 ms：net.advance、host.frame（driveHost 時）、每位沒暫停的客人 guest.frame；each 在每一幀之後呼叫 */
  run(ms: number, each?: () => void): void;
  /** 模擬客人分頁在背景：不呼叫他的 frame */
  pause(i: number, on: boolean): void;
  /** 客人 i 同步集合內所有 chunk 與房主逐層（六層 + 箱子）比對的差異（空 = 一致）；pending 的 chunk 記成 layer 'pending'；同步集合是空的記成 'emptySync' */
  sameTiles(i: number): { key: number; layer: string }[];
  count(item: ItemId): { host: number; guestsOnHost: number[]; drops: number; chests: number; lastChk: number[] };
  // ── 以下是測試方便用 ──
  /** 虛擬時間（ms） */
  readonly now: number;
  /** false：run 不呼叫 host.frame（A8 改用 NetLoop 驅動房主） */
  driveHost: boolean;
  /** 每位客人目前的連線（客人那一端） */
  links: NetLink[];
  /** 同上，房主那一端（驗延遲關閉用） */
  hostLinks: NetLink[];
  /** 每位客人加入時的角色 */
  chars: DelveCharacter[];
  /** 房主收到每位客人的 ps（state 通道）則數 */
  ps: number[];
  /** 每位客人收到的 col 回覆：欄與 diff 的 cy */
  cols: { cx: number; diff: number[] }[][];
  /** 新客人加入（不跑幀）；onCheckpoint 另外再呼叫（回傳值當成 guest 的 onCheckpoint 回傳值） */
  join(o?: { character?: DelveCharacter; onCheckpoint?: (c: DelveCharacter, rev: number) => void | Promise<void> }): NetGuest;
  /** 模擬房主重新整理：同一個 hostGame 與 store、新的 NetHost 並 open（舊的不再驅動、不 close）；之後的 accept 走新的 */
  rehost(): NetHost;
  /** 客人 i 換一條新連線重連（房主 accept 另一端） */
  reconnect(i: number): void;
  /** 客人 i 同步集合內、已 live 的欄（升冪） */
  synced(i: number): number[];
}

/** 抄 engine/world.stream.test.ts 的 TestSource：依座標雜湊寫 STONE / DIRT / AIR 與牆 */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y + 977, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
const srcFg = (x: number, y: number): number => { const v = hash(x, y) % 3; return v === 0 ? T.STONE : v === 1 ? T.DIRT : T.AIR; };
const srcWall = (x: number, y: number): number => (hash(y, x) % 4 === 0 ? W.DIRT_WALL : 0);
export class HashSource implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 0; y < col.height; y++) {
      for (let x = x0; x < x1; x++) { col.fg[li(x, y)] = srcFg(x, y); col.wall[li(x, y)] = srcWall(x, y); }
    }
  }
  surfaceAt(x: number): number { return 30 + (x & 3); }
  biomeAt(x: number): number { return x < 0 ? 2 : 1; }
  layersAt(x: number): ColumnLayers { return { rock: 50 + (x & 1), deep: 70, molten: 90 }; }
}

/** 平地小世界（同 engine/actors.test.ts）：y ≥ 60 石頭；本地玩家與出生點在 (40, 59)；白天 */
export function arenaGame(seed = 'host', peaceful = true): DelveGame {
  const g = new DelveGame({ seed, width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  g.spawn.x = 40; g.spawn.y = FLOOR - 1;
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = peaceful;
  g.drainEvents();
  return g;
}

/** 無限小世界：中央 200×100（generateWorld）、外圍 HashSource */
export function infiniteGame(seed = 'coop-inf', peaceful = true): DelveGame {
  const g = new DelveGame({ seed, width: 200, height: 100, bounds: 'infinite', columnSource: new HashSource(), peaceful });
  g.drainEvents();
  return g;
}

const gens = new Map<string, GenResult>();
/** 正式尺寸的世界：同一個種子只生成一次（房主與客人共用 gen；World.fromGen 會複製） */
function realGen(seed: string): GenResult {
  let gen = gens.get(seed);
  if (!gen) { gen = generateWorld(seed); gens.set(seed, gen); }
  return gen;
}

let baseChar: DelveCharacter | null = null;
let charNo = 0;
function hero(): DelveCharacter {
  baseChar ??= createCharacter('乙', normalizeAppearance(undefined), 0);
  return { ...JSON.parse(JSON.stringify(baseChar)) as DelveCharacter, id: `rig-char-${++charNo}` };
}

const countSlots = (slots: readonly (Stack | null)[] | undefined, item: ItemId): number => {
  let n = 0;
  for (const s of slots ?? []) if (s && s.item === item) n += s.count;
  return n;
};

export function coopRig(o: RigOptions = {}): Rig {
  const kind = o.world ?? 'arena';
  const peaceful = o.peaceful ?? true;
  const seed = o.worldSeed ?? (kind === 'arena' ? 'host' : kind === 'infinite' ? 'coop-inf' : 'coop-real');
  const hostGame = o.game ?? (kind === 'arena' ? arenaGame(seed, peaceful)
    : kind === 'infinite' ? infiniteGame(seed, peaceful)
      : new DelveGame({ seed, gen: realGen(seed), peaceful }));
  const createReplica = kind === 'arena' ? undefined
    : kind === 'infinite'
      ? (w: Welcome): DelveGame => new DelveGame({
        seed: w.seed, width: w.w, height: w.h, bounds: w.bounds, peaceful: w.peaceful, localPid: w.pid, mode: 'replica', columnSource: new HashSource(),
      })
      : (w: Welcome): DelveGame => new DelveGame({ seed: w.seed, gen: realGen(w.seed), bounds: w.bounds, peaceful: w.peaceful, localPid: w.pid, mode: 'replica' });
  const net = new LoopbackNet({ seed: o.seed ?? 'coop-rig', latencyMs: o.latencyMs, loss: o.loss });
  const visits = new Map<string, VisitSave>();
  const held = new Map<string, HeldChar>();
  const store: VisitStore = {
    get: (k) => visits.get(k), put: (k, v) => { visits.set(k, v); },
    getHeld: (k) => held.get(k), putHeld: (k, h) => { if (h) held.set(k, h); else held.delete(k); },
  };
  const newHost = (): NetHost => { const h = new NetHost(hostGame, { build: BUILD, worldId: `w-${seed}`, visits: store }); h.open(); return h; };
  let host = newHost();
  const hs = new FixedStepper();
  const guests: NetGuest[] = [], steppers: FixedStepper[] = [], paused: boolean[] = [];
  const links: NetLink[] = [], hostLinks: NetLink[] = [], chars: DelveCharacter[] = [], ps: number[] = [], checkpoints: DelveCharacter[][] = [];
  const cols: { cx: number; diff: number[] }[][] = [];
  let now = 0;

  /** 新的一對連線：房主 accept 一端；記 ps 與 col */
  const pair = (i: number): NetLink => {
    const p = net.pair();
    p.host.onMessage((ch) => { if (ch === 'state') ps[i]++; });
    host.accept(p.host);
    p.guest.onMessage((ch, d) => {
      if (ch !== 'bulk' || typeof d === 'string') return;
      const m = decodeBulk(d);
      if (m && m.head.t === 'col') cols[i].push({ cx: m.head.cx, diff: m.head.diff.map((q) => q.cy) });
    });
    links[i] = p.guest;
    hostLinks[i] = p.host;
    return p.guest;
  };

  const rig: Rig = {
    net, hostGame, guests, visits, store, held, checkpoints, links, hostLinks, chars, ps, cols,
    get host() { return host; },
    driveHost: true,
    get now() { return now; },
    run(ms, each) {
      const n = Math.round(ms / FRAME);
      for (let k = 0; k < n; k++) {
        now += FRAME;
        net.advance(FRAME);
        if (rig.driveHost) host.frame(now, hs.advance(FRAME / 1000));
        for (let i = 0; i < guests.length; i++) if (!paused[i]) guests[i].frame(now, steppers[i].advance(FRAME / 1000));
        each?.();
      }
    },
    pause(i, on) { paused[i] = on; },
    join(jo = {}) {
      const i = guests.length;
      ps[i] = 0; cols[i] = []; checkpoints[i] = []; paused[i] = false;
      steppers[i] = new FixedStepper();
      const character = jo.character ?? hero();
      chars[i] = character;
      const g = new NetGuest(pair(i), {
        build: BUILD, character, createReplica,
        onCheckpoint: (c, rev) => { checkpoints[i].push(c); return jo.onCheckpoint?.(c, rev); },
      });
      guests.push(g);
      return g;
    },
    rehost() { host = newHost(); return host; },
    reconnect(i) { guests[i].reconnect(pair(i)); },
    synced(i) {
      const g = guests[i], rep = g.game, sync = g.sync;
      if (!rep || !sync) return [];
      const w = rep.world;
      return w.residentColumns().filter((cx) => {
        for (let cy = 0; cy < w.chunksY; cy++) if (sync.state(w.chunkIndex(cx, cy)) !== 'live') return false;
        return true;
      }).sort((p, q) => p - q);
    },
    sameTiles(i) {
      const g = guests[i], rep = g.game, sync = g.sync;
      if (!rep || !sync) return [{ key: -1, layer: 'noReplica' }];
      const hw = hostGame.world, gw = rep.world, out: { key: number; layer: string }[] = [];
      let checked = 0;
      for (const cx of gw.residentColumns()) {
        for (let cy = 0; cy < gw.chunksY; cy++) {
          const key = gw.chunkIndex(cx, cy), st = sync.state(key);
          if (st === 'unsynced') continue;
          checked++;
          if (st === 'pending') { out.push({ key, layer: 'pending' }); continue; }
          const a = hw.readChunk(cx, cy), b = gw.readChunk(cx, cy);
          if (!a || !b) { out.push({ key, layer: a ? 'guestMissing' : 'hostMissing' }); continue; }
          for (const L of LAYERS) if (!a[L].every((v, j) => v === b[L][j])) out.push({ key, layer: L });
          if (chestSig(hostGame, key) !== chestSig(rep, key)) out.push({ key, layer: 'chests' });
        }
      }
      // 同步集合是空的：什麼都沒比到，不能當成一致
      if (checked === 0) out.push({ key: -1, layer: 'emptySync' });
      return out;
    },
    count(item) {
      let drops = 0, chests = 0;
      for (const d of hostGame.drops.list) if (d.item === item) drops += d.count;
      for (const s of hostGame.world.chests.values()) chests += countSlots(s, item);
      return {
        host: hostGame.local.inventory.count(item),
        guestsOnHost: guests.map((g) => (g.pid ? hostGame.actors.get(g.pid)?.inventory.count(item) ?? 0 : 0)),
        drops, chests,
        lastChk: guests.map((g) => countSlots(g.lastCheckpoint?.character.inventory.slots, item)),
      };
    },
  };

  for (let i = 0; i < (o.guests ?? 1); i++) rig.join();
  if (guests.length) {
    // 等全部 live，再多跑 1 秒讓興趣範圍內的欄同步完
    for (let t = 0; t < 10_000 && guests.some((g) => g.state !== 'live'); t += FRAME) rig.run(FRAME);
    const stuck = guests.findIndex((g) => g.state !== 'live');
    if (stuck >= 0) throw new Error(`coopRig: guest ${stuck} never reached live (state ${guests[stuck].state})`);
    rig.run(1000);
  }
  return rig;
}

/** 一個 chunk 內的箱子與解鎖（tile 鍵升冪）的簽名 */
function chestSig(game: DelveGame, key: number): string {
  const w = game.world, { cx, cy } = w.chunkCoords(key), parts: string[] = [];
  const keys = [...w.chests.keys()].filter((k) => {
    const { x, y } = w.tileXY(k);
    return chunkOfX(x) === cx && Math.floor(y / CHUNK) === cy;
  }).sort((p, q) => p - q);
  for (const k of keys) parts.push(`${k}:${JSON.stringify(w.chests.get(k))}:${w.unlocked.has(k) ? 1 : 0}`);
  return parts.join('|');
}
