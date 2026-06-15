import { VersusMatch } from '../versus/versusMatch';
import type { CharacterId, Dir } from '../engine/types';
import type { VersusAction } from './bomberLockstep';

const SIM_DT = 1000 / 60;

/** 合法方向（與 bomberLockstep 的 VALID_DIRS 對齊）。 */
const VALID_DIRS: ReadonlySet<string> = new Set<Dir>(['up', 'down', 'left', 'right']);

/**
 * 驗證單一 VersusAction 形狀（鏡像 bomberLockstep.isValidAction）。
 * 不可信輸入：t ∈ {held,bomb,ability}；held 須 d 為合法 Dir、v 為 boolean。
 */
function isValidAction(a: unknown): a is VersusAction {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  if (o.t === 'bomb' || o.t === 'ability') return true;
  if (o.t === 'held') return typeof o.d === 'string' && VALID_DIRS.has(o.d) && typeof o.v === 'boolean';
  return false;
}

/** 重播上限（防 DoS / 損壞紀錄無窮迴圈）。bomber 局含 sudden death，最長約 3 分鐘。 */
const MAX_FRAMES = 60 * 60 * 5; // 5 分鐘 frame 上限（遠超實際 sudden-death 終局）
const MAX_INPUTS = 200_000;

/**
 * 一場 versus 的可重播紀錄（比照 tetris FfaReplay）：
 *  - 不可變參數（seed/arenaId/characters/playerIds）足以重建 VersusMatch。
 *  - frameCount：已 step 的總幀數。
 *  - inputs：稀疏逐幀「某玩家」輸入（只含非空；順序 == BomberLockstep.advance() 套用序，
 *    即同幀依固定 playerIds 序、同玩家內 held 先於 bomb/ability 由 VersusAction 陣列保證）。
 *  - forfeits：哪一幀對哪位玩家套用 forfeit（重現斷線結束的局；套用在該幀輸入之前）。
 */
export interface VersusReplay {
  seed: number;
  arenaId: number;
  characters: Record<string, CharacterId>;
  playerIds: string[];
  frameCount: number;
  inputs: Array<{ f: number; p: string; a: VersusAction[] }>;
  /** 中離事件（可選，向後相容）：幀 f 時玩家 p 被 forfeit；套用順序在該幀輸入之前。 */
  forfeits?: Array<{ f: number; p: string }>;
}

/** simulateVersusReplay 的回傳：最終名次（冠軍在前）+ 決定性 stateHash + 重模擬勝者。 */
export interface VersusReplayResult {
  standings: string[];
  stateHash: string;
  /** server 重模擬出的勝者 id；null = 平局（全滅同幀）。結算端用此判定平局，不信任 client。 */
  winnerId: string | null;
}

/**
 * 由 VersusMatch 的 placement 推導最終名次（冠軍在前）。
 *
 * 鐵則（與 BomberLockstep / FfaMatch.getStandings 對齊）：
 *  - placement 升冪（1 = 冠軍在最前；存活中 placement=0 會排在最前，僅在未結束局出現）。
 *  - 平手（同 placement，如同幀死亡共享名次、或全滅平局全員 placement=1）以
 *    `playerIds` 的固定順序穩定排列——這是各端一致、與 simFrame 偏移無關的決定性 tie-break，
 *    對應 FfaMatch 以 placements Map 插入序（淘汰序）穩定排列的精神。
 *
 * 實作：對 playerIds 的副本做穩定排序（依 placement 升冪；相等者保留 playerIds 原序）。
 */
export function liveStandings(match: VersusMatch, playerIds: string[]): string[] {
  const state = match.getState();
  const placementOf = new Map<string, number>();
  for (const p of state.players) placementOf.set(p.id, p.placement);
  // 以 playerIds 固定順序為基底，標上原序索引做穩定 tie-break（避免依賴 sort 穩定性）。
  return playerIds
    .map((id, i) => ({ id, placement: placementOf.get(id) ?? 0, i }))
    .sort((a, b) => a.placement - b.placement || a.i - b.i)
    .map((e) => e.id);
}

/**
 * 以確定性 VersusMatch 重跑該局，逐幀套用紀錄的輸入/forfeit，回傳最終名次與 stateHash。
 *
 * 套用順序「逐位元」對齊 BomberLockstep.advance()：
 *  每幀 f（status 仍 playing 時）：
 *   1. 先套用該幀所有 forfeit（依 forfeits 陣列出現序）。
 *   2. 再套用該幀所有輸入：同幀多筆 entry 依 inputs 陣列出現序（錄製端已是固定 playerIds 序），
 *      每筆 entry 內 held 先於 bomb/ability（與 advance() 同）。
 *   3. match.step(1000/60)。
 *  對局結束（status !== 'playing'）後即停止套用（forfeit/input 對 finished 局為 no-op，
 *  但提早停可避免無謂運算，且與 advance() 的「分出勝負就停止推進」一致）。
 *
 * 決定性鐵則：純整數/紀錄重放，無 Math.random / Date.now。
 */
export function simulateVersusReplay(replay: VersusReplay): VersusReplayResult {
  const match = new VersusMatch({
    seed: replay.seed,
    arenaId: replay.arenaId,
    players: replay.playerIds.map((id) => ({ id, character: replay.characters[id] })),
  });

  // 依 frame 分組輸入（保留陣列出現序＝錄製端的固定 playerIds 套用序）。
  const inputsByFrame = new Map<number, Array<{ p: string; a: VersusAction[] }>>();
  for (const e of replay.inputs) {
    let list = inputsByFrame.get(e.f);
    if (!list) {
      list = [];
      inputsByFrame.set(e.f, list);
    }
    list.push({ p: e.p, a: e.a });
  }

  // 依 frame 分組 forfeits（同幀多筆依陣列出現序套用）。
  const forfeitsByFrame = new Map<number, string[]>();
  if (Array.isArray(replay.forfeits)) {
    for (const ff of replay.forfeits) {
      let list = forfeitsByFrame.get(ff.f);
      if (!list) {
        list = [];
        forfeitsByFrame.set(ff.f, list);
      }
      list.push(ff.p);
    }
  }

  const n = Math.min(replay.frameCount, MAX_FRAMES);
  for (let f = 0; f < n && match.getState().status === 'playing'; f++) {
    // 1) 該幀 forfeit 先於輸入（與 advance() 約定一致）。
    const frameForfeits = forfeitsByFrame.get(f);
    if (frameForfeits) {
      for (const p of frameForfeits) match.forfeit(p);
    }
    // 2) 該幀輸入：依 entry 出現序；entry 內 held 先於 bomb/ability。
    const frameInputs = inputsByFrame.get(f);
    if (frameInputs) {
      for (const entry of frameInputs) {
        for (const act of entry.a) {
          if (act.t === 'held') match.setHeld(entry.p, act.d, act.v);
        }
        for (const act of entry.a) {
          if (act.t === 'bomb') match.input(entry.p, 'bomb');
          else if (act.t === 'ability') match.input(entry.p, 'ability');
        }
      }
    }
    // 3) 推進一幀。
    match.step(SIM_DT);
  }

  return {
    standings: liveStandings(match, replay.playerIds),
    stateHash: match.stateHash(),
    winnerId: match.getState().winnerId,
  };
}

/**
 * 驗證 replay 結構合理且重模擬名次/stateHash == 宣稱值（伺服器端結算共識用，比照 verifyFfaReplay）。
 * 任何結構不合法或重模擬不符 → false；絕不丟例外（不可信輸入）。
 */
export function verifyVersusReplay(
  replay: VersusReplay,
  claimed: { standings: string[]; stateHash: string },
): boolean {
  if (!replay || typeof replay !== 'object') return false;
  if (typeof replay.seed !== 'number' || !Number.isFinite(replay.seed)) return false;
  if (typeof replay.arenaId !== 'number' || !Number.isFinite(replay.arenaId)) return false;
  if (!replay.characters || typeof replay.characters !== 'object') return false;
  if (!Array.isArray(replay.playerIds)) return false;
  if (!Number.isFinite(replay.frameCount)) return false;
  if (replay.frameCount < 0 || replay.frameCount > MAX_FRAMES) return false;
  if (!Array.isArray(replay.inputs)) return false;
  if (replay.inputs.length > MAX_INPUTS) return false;

  // 每位玩家都要有角色設定（否則 VersusMatch 取不到 profile）。
  for (const id of replay.playerIds) {
    if (typeof replay.characters[id] !== 'string') return false;
  }

  // inputs 逐筆 shape：f 有限且在範圍內、p 在名單、a 為陣列且每個 action 形狀合法。
  for (const e of replay.inputs) {
    if (!e || typeof e !== 'object') return false;
    if (!Number.isFinite(e.f) || e.f < 0 || e.f > replay.frameCount) return false;
    if (typeof e.p !== 'string' || !replay.playerIds.includes(e.p)) return false;
    if (!Array.isArray(e.a)) return false;
    // 每筆 action 須是合法 VersusAction（與 lockstep 入口同一道閘，杜絕畸形/惡意 payload）。
    for (const act of e.a) {
      if (!isValidAction(act)) return false;
    }
  }

  // forfeits 檢查（欄位不存在＝合法，向後相容）。
  if (replay.forfeits !== undefined) {
    if (!Array.isArray(replay.forfeits)) return false;
    if (replay.forfeits.length > replay.playerIds.length) return false;
    for (const ff of replay.forfeits) {
      if (!ff || typeof ff !== 'object') return false;
      if (!Number.isFinite(ff.f) || ff.f < 0 || ff.f > replay.frameCount) return false;
      if (typeof ff.p !== 'string' || !replay.playerIds.includes(ff.p)) return false;
    }
  }

  if (!claimed || !Array.isArray(claimed.standings) || typeof claimed.stateHash !== 'string') {
    return false;
  }

  // 防禦縱深：replay 的參與者集合必須恰等於 claimed.standings 的集合（case-insensitive，
  // 與結算端以 lowerStandings 比對一致）。否則攻擊者可用「他人對局的 replay」配上「自選名單」。
  const idSet = (ids: string[]): Set<string> => new Set(ids.map((s) => s.toLowerCase()));
  const a = idSet(replay.playerIds);
  const b = idSet(claimed.standings);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;

  const sim = simulateVersusReplay(replay);
  if (sim.stateHash !== claimed.stateHash) return false;
  if (sim.standings.length !== claimed.standings.length) return false;
  for (let i = 0; i < sim.standings.length; i++) {
    if (sim.standings[i] !== claimed.standings[i]) return false;
  }
  return true;
}
