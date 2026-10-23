// bake.ts — 舊世界（genVersion 7、正式尺寸）烘焙成 genVersion 8（spec §5 步驟 1–6；M1 期間在開發旗標後面，Task 17 接 session）。
//   1. 備份：烘焙本身不寫任何東西（純函式：不改輸入的 world / character）；session 讀到烘焙結果後設
//      pendingBackup = V7_BACKUP_SUFFIX（save/split.ts），第一次 saveSplit 先備份原槽、成功才寫（沿用 v10 的機制）。
//   2. 用舊生成器重建（restoreSplit + gen）得到舊世界遊戲 L；中央所有 chunk 標成已修改（tile + 液體）→ snapshotGame(L)：
//      中央每個 chunk、每個箱子都進存檔；附帶資料 → LegacyMeta（save/legacyMeta.ts）。
//   3. 舊外圍：legacyRange 取「已知最遠點」所在的 v1 段落末端（點在中央 / v1 海 → 到 v1 海的末端、gen2 從大陸開始；
//      點在 v1 陸地段 → 到那一段的末端、gen2 從海開始）。這段不存 chunk，繼續由 v1 即時生成（決定 3）。
//   4. 接縫：gen2 的 SideOrigin.seaY = v1 海平面（frame.edgeR / edgeL + 1）、shore = v1 地表（接縫內側一格；Profile2 的接縫規則 P13）。
//   5. 文化：gen2 從接縫起算第 1 片大陸套新世界的指派規則（Layout）。
//   6. 依生成順序的 id（地區、村落 / 地廳、陶罐鑰匙）存進 LegacyMeta，之後不再重算。
// bake.quiet = 中央 chunk 中原本不在 chunks ∪ liquids.chunks 的鍵（玩家沒碰過 → 液體是舊生成器靜置後的狀態 → 讀檔 / 載入 / 接縫都不喚醒）。
import { CHUNK, GEN_VERSION, GEN_VERSION_V2, PLAYER_W, TILE_SIZE, WORLD_H, WORLD_W } from '../engine/constants';
import { X_LIMIT, chunkXY } from '../engine/coords';
import { OuterGen, SEA_W, SEG_W, frameOf, type CentralFrame, type OuterProfile } from '../engine/legacy/chunkgen';
import { OUTER_REGION_BASE, isOuterRegionId } from '../engine/discovery';
import { GEN2_VERSION } from '../engine/gen2';
import type { SideOrigin } from '../engine/gen2/layout';
import type { Waystones } from '../engine/waystones';
import type { GenResult } from '../engine/legacy/worldgen';
import type { DelveCharacter } from './character';
import type { DelveGame } from '../engine/game';
import { SaveFormatError, encodeDeltas, snapshotGame, validGen2 } from './serialize';
import { encodeLegacyMeta } from './legacyMeta';
import { decodeWorld, restoreSplit, splitSnapshot, whereOf, whoOf, type WorldData, type WorldHeader } from './worldSave';
import { SplitSession, V7_BACKUP_SUFFIX, type SplitStore } from './split';

/** 烘焙資訊（存檔 header.gen2.bake）：兩側接縫、舊中央框、還沒被碰過的中央 chunk（差分編碼的 chunk 鍵） */
export interface BakeInfo { east: SideOrigin; west: SideOrigin; frame: CentralFrame; quiet: number[] /* 差分編碼的 chunk 鍵 */ }
export type BakeStage = 'restore' | 'snapshot' | 'meta' | 'split';

/** 這個世界要不要烘焙：舊生成器（genVersion 7）且正式尺寸（format 9 / 10 的 200×100 小測試世界不適用，照舊載入） */
export function bakeApplies(h: { genVersion: number; width: number; height: number }): boolean {
  return h.genVersion === GEN_VERSION && h.width === WORLD_W && h.height === WORLD_H;
}

/**
 * 玩家「知道」的最遠點（東 = 最大 x、西 = 最小 x；沒有外圍的已知點 = 中央邊欄）：
 * 世界檔的已修改 chunk（chunks、liquids.chunks：整個 chunk 的欄範圍都算）、每個 visit 的外圍迷霧 chunk、
 * 已發現的 v1 外圍地區（outerRegionId → 那一整段 / 那一片海）、玩家位置（身體兩緣）/ 床 / 地圖標記、已解鎖傳送碑（兩格寬）、地上掉落物。
 */
export function farthestKnown(h: WorldHeader, p: OuterProfile, stones: Waystones): { east: number; west: number } {
  const W = p.frame.width, cxN = Math.ceil(h.width / CHUNK);
  let east = W - 1, west = 0;
  const at = (x0: number, x1: number): void => { if (x1 > east) east = x1; if (x0 < west) west = x0; };
  const chunk = (k: number): void => { const { cx } = chunkXY(cxN, k); at(cx * CHUNK, cx * CHUNK + CHUNK - 1); };
  for (const k of h.chunks) chunk(k);
  for (const k of h.liquids?.chunks ?? []) chunk(k);
  for (const id of h.stones ?? []) { const s = stones.byId(id); if (s) at(s.x, s.x + 1); }
  for (const d of h.drops) { const x = Math.floor(d.x / TILE_SIZE); at(x, x); }
  for (const v of Object.values(h.visits)) {
    at(Math.floor(v.pos.x / TILE_SIZE), Math.floor((v.pos.x + PLAYER_W - 1) / TILE_SIZE));
    if (v.bed) at(v.bed.x, v.bed.x);
    for (const m of v.markers) at(m.x, m.x);
    for (const k of v.exploredOuter?.chunks ?? []) chunk(k);
    for (const id of v.discovery?.regions ?? []) {
      if (!isOuterRegionId(id)) continue;
      const n = Math.floor((id - OUTER_REGION_BASE) / 2), side = (id - OUTER_REGION_BASE) % 2 === 0 ? 1 : -1;
      if (n === 0) { if (side === 1) at(W, W + SEA_W - 1); else at(-SEA_W, -1); continue; }
      // 第 n − 1 段的中點（段界抖動 ±SEG_JITTER < SEG_W / 2，中點一定在段內）
      const e = (n - 1) * SEG_W + (SEG_W >> 1), x = side === 1 ? W + SEA_W + e : -SEA_W - 1 - e;
      if (x <= -X_LIMIT || x >= X_LIMIT) continue;
      const s = p.segmentAt(x);
      if (s) at(s.x0, s.x1 - 1);
    }
  }
  return { east, west };
}

/** 舊範圍與兩側接縫：舊範圍 = [west.x, east.x)（含中央）；接縫外接 gen2 */
export function legacyRange(h: WorldHeader, p: OuterProfile, stones: Waystones): { east: SideOrigin; west: SideOrigin } {
  const f = farthestKnown(h, p, stones), W = p.frame.width;
  const side = (x: number, dir: 1 | -1): SideOrigin => {
    const z = p.zoneAt(x), seaY = (dir === 1 ? p.frame.edgeR : p.frame.edgeL) + 1;
    const land = z.kind === 'land';
    const edge = land ? (dir === 1 ? z.seg.x1 : z.seg.x0) : (dir === 1 ? W + SEA_W : -SEA_W);
    return { x: edge, start: land ? 'sea' : 'continent', seaY, shore: p.surfaceAt(dir === 1 ? edge - 1 : edge) };
  };
  return { east: side(f.east, 1), west: side(f.west, -1) };
}

/**
 * 舊世界的世界檔 → 烘焙後的世界檔（genVersion 8、outerGen = GEN2_VERSION、gen2 = { locks: [], bake, legacy }）。
 * gen = 同 seed 的舊生成器輸出（呼叫端先生成）。純函式：不改 world / character；任何一段丟錯都整個丟出（原檔沒被寫過）。
 * onStage 在每段開始前呼叫（失敗注入用，裁決 P7）。這個角色在這個世界沒有 visit → 不替它留下 visit。
 */
export function bakeWorld(world: WorldData, character: DelveCharacter, gen: GenResult, now: number, onStage?: (s: BakeStage) => void): WorldData {
  const h = world.header;
  if (!bakeApplies(h)) throw new Error(`bakeWorld: genVersion ${h.genVersion} ${h.width}x${h.height} is not a v7 ${WORLD_W}x${WORLD_H} world`);
  onStage?.('restore');
  const r = restoreSplit(world, character, { gen });
  if (!r.ok) throw new Error(`bakeWorld: restore failed (${r.error}): ${r.message}`);
  const L = r.game, w = L.world, src = w.source;
  if (L.genKind !== 'legacy' || !w.centralArrays || !(src instanceof OuterGen)) throw new Error('bakeWorld: restored world is not a legacy infinite world');

  onStage?.('snapshot');
  const before = new Set([...h.chunks, ...(h.liquids?.chunks ?? [])]);
  const quiet: number[] = [];
  for (let cy = 0; cy < w.chunksY; cy++) {
    for (let cx = 0; cx < w.chunksX; cx++) {
      const k = w.chunkIndex(cx, cy);
      if (!before.has(k)) quiet.push(k);
      w.modifiedChunks.add(k);
      w.liquidModified.add(k);
    }
  }
  const data = snapshotGame(L, now);

  onStage?.('meta');
  const legacy = encodeLegacyMeta(L);
  const range = legacyRange(h, src.profile, L.waystones);
  const bake: BakeInfo = { east: range.east, west: range.west, frame: frameOf(w), quiet: encodeDeltas(quiet.sort((a, b) => a - b)) };

  onStage?.('split');
  const header = { ...data.header, genVersion: GEN_VERSION_V2, bounds: 'infinite' as const, outerGen: GEN2_VERSION, gen2: { locks: [], bake, legacy } };
  const out = splitSnapshot({ header, chunks: data.chunks }, whoOf(character), whereOf(h), now).world;
  if (r.freshVisit) out.header.visits = { ...h.visits };
  // 自己先過一次讀檔時的驗證（validGen2：bake 的接縫範圍、bake.frame = legacy.frame、LegacyMeta 每個欄位）：
  // 寫出去之後才讀不回來就太遲了 → 在這裡丟（原 v7 存檔沒被動過，可以重試）
  try { validGen2(JSON.parse(JSON.stringify(out.header.gen2))); } catch (e) {
    throw new Error(`bakeWorld: baked header does not validate: ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}

/** 升級失敗的訊息開頭（後面接原因）；原本的 v7 存檔沒有被寫過 */
export const UPGRADE_FAILED_MSG = '世界升級失敗，原本的存檔沒有改動：';

/**
 * session 的舊世界升級路徑（裁決 P7）：從 store 讀 slot 的世界檔 → bake（預設 bakeWorld；gen = 同 seed 的舊生成器輸出）→ restoreSplit。
 * 成功 → 開局用的遊戲 + 存檔身分（pendingBackup = V7_BACKUP_SUFFIX：第一次 saveSplit 先把原本的 v7 記錄備份成 slot + '.v7.bak'）。
 * 任何一步丟錯 / 還原失敗 → { ok: false, message: UPGRADE_FAILED_MSG + 原因 }。永遠不寫 store（升級本身不存檔，可以重試）。
 */
export async function upgradeSlot(store: SplitStore, slot: string, character: DelveCharacter, gen: GenResult, now: number, bake: typeof bakeWorld = bakeWorld):
  Promise<{ ok: true; game: DelveGame; session: SplitSession } | { ok: false; message: string }> {
  try {
    const rec = await store.getSlot(slot);
    if (!rec) throw new Error('找不到這個存檔');
    const baked = bake(decodeWorld(rec.bytes), character, gen, now);
    const r = restoreSplit(baked, character);
    if (!r.ok) throw new Error(r.message);
    const session = SplitSession.fromLoaded(r.world, character, slot);
    session.pendingBackup = V7_BACKUP_SUFFIX;
    return { ok: true, game: r.game, session };
  } catch (e) {
    return { ok: false, message: UPGRADE_FAILED_MSG + (e instanceof Error ? e.message : String(e)) };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 存檔的 gen2.bake → BakeInfo；形狀不對 / 接縫沒包住中央或到了 ±X_LIMIT / 安靜 chunk 不是中央鍵 /
 * bake.frame 與 legacy 的 frame 不同（給了 legacyFrame 時）→ SaveFormatError。回傳副本
 */
export function validBakeInfo(v: unknown, legacyFrame?: CentralFrame): BakeInfo {
  if (!isObj(v)) throw new SaveFormatError('gen2.bake');
  const f = v.frame;
  if (!isObj(f) || !['width', 'height', 'edgeL', 'edgeR', 'cavernY', 'moltenY'].every((k) => Number.isInteger(f[k]))
    || (f.width as number) < CHUNK || (f.height as number) < CHUNK) throw new SaveFormatError('gen2.bake.frame');
  const frame: CentralFrame = {
    width: f.width as number, height: f.height as number, edgeL: f.edgeL as number, edgeR: f.edgeR as number,
    cavernY: f.cavernY as number, moltenY: f.moltenY as number,
  };
  if (legacyFrame && (Object.keys(frame) as (keyof CentralFrame)[]).some((k) => frame[k] !== legacyFrame[k])) {
    throw new SaveFormatError('gen2.bake.frame != legacy.frame');
  }
  const side = (s: unknown, dir: 1 | -1): SideOrigin => {
    if (!isObj(s) || !Number.isInteger(s.x) || !Number.isInteger(s.seaY) || !Number.isInteger(s.shore)
      || (s.start !== 'sea' && s.start !== 'continent')) throw new SaveFormatError('gen2.bake side');
    const x = s.x as number;
    if (dir === 1 ? x < frame.width || x >= X_LIMIT : x > 0 || x <= -X_LIMIT) throw new SaveFormatError('gen2.bake side x');
    return { x, start: s.start, seaY: s.seaY as number, shore: s.shore as number };
  };
  const q = v.quiet, total = Math.ceil(frame.width / CHUNK) * Math.ceil(frame.height / CHUNK);
  if (!Array.isArray(q) || q.length > total || !q.every((d) => Number.isInteger(d) && d >= 0)) throw new SaveFormatError('gen2.bake.quiet');
  let k = 0;
  q.forEach((d: number, i: number) => {
    k += d;
    if ((i > 0 && d === 0) || k >= total) throw new SaveFormatError('gen2.bake.quiet key');
  });
  return { east: side(v.east, 1), west: side(v.west, -1), frame, quiet: [...q] };
}
