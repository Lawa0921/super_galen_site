// gen/settlements.ts — 世界生成：NPC 地表村落與矮人地底大廳（確定性、只用整數 / 基本四則運算）。
//   · 村落（2～4 座，世界 ≥ 3000 欄）：平坦的森林地表、離出生點 / 地城 / 彼此夠遠、不和其他結構重疊。
//     整平地面 → 2～3 棟木骨灰泥 + 茅草屋頂的小屋（門、窗、床、桌椅、光源、木板背景牆）→ 中央廣場（委託板、燈柱、木桶）
//     → 村子兩端的高旗桿（遠遠就看得到）+ 短圍欄。
//   · 矮人地廳（1～2 座）：洞穴層深處鑿出的拱頂石廳（鑿石磚外殼、鑿刻石牆背景）、矮人熔爐 + 鐵砧、火盆、旗幟與吊燈、
//     長桌、橫貫大廳的礦車軌道與兩側鑿出的軌道隧道（通往附近洞穴）、軌道上一台滿載的礦車（一次性發現物）。
//   回傳結構矩形 + NPC 要站的位置（engine/folk.ts 用來安排村民 / 矮人）。
//   這裡只留選址；畫圖在 engine/gen2/draw/village.ts、hall.ts（與 gen2 共用），經 gridCanvas 直接寫 GenGrid。
import type { GenGrid } from './grid';
import { BIOME } from '../../world';
import { subSeed, type Rng } from '../../rng';
import { T } from '../../tiles';
import type { GenRect, VillageInfo, HallInfo } from '../../genTypes';
import type { Canvas } from '../../gen2/draw/canvas';
import { drawVillage } from '../../gen2/draw/village';
import { drawHall, HALL_IH } from '../../gen2/draw/hall';
import { gridCanvas } from './gridCanvas';

export interface SettleGenCtx {
  world: GenGrid;
  seed: string | number;
  surface: Int16Array;
  colBiome: Uint8Array;
  deepLine: Int16Array;
  moltenLine: Int16Array;
  spawnX: number;
  /** 地城預留區 x 範圍 */
  dz: { x0: number; x1: number };
  beachW: number;
  /** 不能重疊的矩形（已放好的結構 / 預留區） */
  blocked: () => GenRect[];
  /** 不能放村子的欄（湖床 / 冰湖） */
  wetCols?: (x: number) => boolean;
}

// 村落 / 地廳的畫布：不放箱子、不補天然地層（depthFrac / natural 被叫到就是 bug）
function settleCanvas(c: SettleGenCtx): Canvas {
  const none = (): never => { throw new Error('settlements: villages / halls place no chests and fill no natural rock'); };
  return gridCanvas(c.world, String(c.seed), none, c.surface, none);
}

const overlap = (a: GenRect, b: GenRect, m = 0): boolean =>
  a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;

/** 世界大小 → 村落數目標（預設 4200 欄 → 多半 3 座，有時 2 或 4 座） */
export function villageTarget(width: number, rng: Rng): number {
  if (width >= 3000) { const r = rng.next(); return r < 0.15 ? 2 : r < 0.75 ? 3 : 4; }
  return width >= 1000 ? 1 : 0;
}
/** 村落選址條件：一輪比一輪寬鬆（地面起伏上限、彼此間距、兩側緩坡也要是森林），最後一輪逐欄掃描 */
const VILLAGE_PASSES: readonly { rough: number; gap: number; edgeForest: boolean; tries: number }[] = [
  { rough: 10, gap: 0.1, edgeForest: true, tries: 260 },
  { rough: 18, gap: 0.075, edgeForest: true, tries: 260 },
  { rough: 26, gap: 0.06, edgeForest: false, tries: 260 },
  { rough: 30, gap: 0.05, edgeForest: false, tries: 0 },
];
/** 村落最少幾座（世界夠大時保證） */
export const MIN_VILLAGES = 2;
export function hallTarget(width: number, rng: Rng): number {
  if (width >= 3000) return rng.chance(3) ? 1 : 2;
  return width >= 1000 ? 1 : 0;
}

/** 放村落（經 gridCanvas 直接寫 world.fg / wall / liquid / surface；回傳每座村子的配置與結構矩形） */
export function placeVillages(c: SettleGenCtx): { villages: VillageInfo[]; rects: GenRect[] } {
  const w = c.world, { width, height } = w, WW = width;
  const rng = subSeed(c.seed, 'villages');
  const want = villageTarget(width, rng);
  const villages: VillageInfo[] = [], rects: GenRect[] = [];
  const cv = settleCanvas(c);
  const minSpawn = Math.max(160, Math.floor(width * 0.07));
  const need = width >= 3000 ? Math.max(MIN_VILLAGES, want) : want;
  // 候選位置：前三輪隨機抽，最後一輪（還不夠 MIN_VILLAGES 才跑）每 9 欄掃一次
  const cands: { x0: number; vw: number; p: number }[] = [];
  let pass = 0, scanX = c.beachW + 30, tries = 0;
  const next = (): { x0: number; vw: number; p: number } | null => {
    for (;;) {
      if (villages.length >= need || pass >= VILLAGE_PASSES.length) return null;
      const P = VILLAGE_PASSES[pass];
      // 最後一輪（逐欄掃描）只用來保證最少座數
      if (pass === VILLAGE_PASSES.length - 1 && villages.length >= MIN_VILLAGES) return null;
      if (P.tries > 0) {
        if (tries++ >= P.tries) { pass++; tries = 0; continue; }
        return { x0: rng.int(c.beachW + 30, Math.max(c.beachW + 31, width - c.beachW - 30 - 74)), vw: rng.int(58, 74), p: pass };
      }
      if (scanX > width - c.beachW - 30 - 66) { pass++; continue; }
      const x0 = scanX; scanX += 9;
      return { x0, vw: 66, p: pass };
    }
  };
  void cands;
  for (let cand = next(); cand; cand = next()) {
    const P = VILLAGE_PASSES[cand.p];
    const vw = cand.vw, x0 = cand.x0, x1 = x0 + vw - 1;
    const cx = (x0 + x1) >> 1;
    if (Math.abs(cx - c.spawnX) < minSpawn + vw / 2) continue;
    if (x1 + 90 > c.dz.x0 && x0 - 90 < c.dz.x1) continue;
    if (villages.some((v) => Math.abs(((v.x0 + v.x1) >> 1) - cx) < Math.max(150, Math.floor(width * P.gap)))) continue;
    let ok = true, lo = height, hi = 0;
    for (let x = x0 - 8; x <= x1 + 8 && ok; x++) {
      const inside = x >= x0 && x <= x1;
      if (x < 0 || x >= width || c.wetCols?.(x) || ((inside || P.edgeForest) && c.colBiome[x] !== BIOME.FOREST)) { ok = false; break; }
      const s = c.surface[x];
      if (inside) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
    }
    if (!ok || hi - lo > P.rough) continue;
    // 地面：取中位數（整平時削高補低）
    const col: number[] = [];
    for (let x = x0; x <= x1; x++) col.push(c.surface[x]);
    col.sort((a, b) => a - b);
    const ground = col[col.length >> 1];
    const rect: GenRect = { x: x0 - 10, y: ground - 26, w: vw + 20, h: 34 };
    if (rect.y < 4 || c.blocked().some((b) => overlap(b, rect, 2)) || rects.some((b) => overlap(b, rect, 20))) continue;
    // 地面不能有水
    let wet = false;
    for (let x = x0 - 4; x <= x1 + 4 && !wet; x++) for (let y = ground - 6; y <= ground + 2; y++) if (w.liquid[y * WW + x]) { wet = true; break; }
    if (wet) continue;

    // ── 畫：整平、房子、廣場、旗桿、圍欄（engine/gen2/draw/village.ts，與 gen2 共用；亂數抽取順序不變） ──
    const info = drawVillage(cv, { x0, vw, ground, style: villages.length % 3 }, rng);
    villages.push(info);
    rects.push({ x: x0 - 9, y: ground - 24, w: vw + 18, h: 30 });
  }
  return { villages, rects };
}

/** 放矮人地廳（洞穴層深處）；回傳配置與結構矩形 */
export function placeDwarfHalls(c: SettleGenCtx): { halls: HallInfo[]; rects: GenRect[] } {
  const w = c.world, { width, height } = w;
  const rng = subSeed(c.seed, 'dwarf-halls');
  const want = hallTarget(width, rng);
  const halls: HallInfo[] = [], rects: GenRect[] = [];
  const cv = settleCanvas(c);
  for (let tries = 0; tries < 120 && halls.length < want; tries++) {
    const hw = rng.int(60, 78), ih = HALL_IH;
    const x0 = rng.int(c.beachW + 60, Math.max(c.beachW + 61, width - c.beachW - 60 - hw)), x1 = x0 + hw - 1;
    const cx = (x0 + x1) >> 1;
    if (Math.abs(cx - c.spawnX) < Math.max(150, Math.floor(width * 0.06))) continue;
    if (x1 + 60 > c.dz.x0 && x0 - 60 < c.dz.x1) continue;
    if (halls.some((h) => Math.abs(((h.x0 + h.x1) >> 1) - cx) < Math.floor(width * 0.2))) continue;
    let top = 0, bot = height;
    for (let x = x0; x <= x1; x++) { top = Math.max(top, c.deepLine[x] + 24); bot = Math.min(bot, c.moltenLine[x] - 26); }
    if (bot - top < ih + 6) continue;
    const floorY = rng.int(top + ih + 2, bot);
    const y0 = floorY - ih;
    const rect: GenRect = { x: x0 - 3, y: y0 - 4, w: hw + 6, h: ih + 8 };
    if (c.blocked().some((b) => overlap(b, rect, 6)) || rects.some((b) => overlap(b, rect, 30))) continue;
    // ── 畫（engine/gen2/draw/hall.ts，與 gen2 共用）；兩側隧道照舊規則逐欄往外掃：離隧道口 > 6 欄後，
    // 隧道那 4 列有 ≥ 3 格空氣的欄（已經接到天然洞穴）出現第 3 次就停在那一欄（那欄不鑿）、碰到世界邊 4 格內也停、最多 70 欄。
    // 鑿一欄只動那一欄，所以先掃再鑿與舊碼邊掃邊鑿讀到的格一樣。舊規則的隧道範圍含停下來的那一欄（洞口），畫完補回。
    const mouth = [false, false]; // [左, 右]
    const tunnelLen = (dir: -1 | 1): number => {
      const sx = dir < 0 ? x0 - 3 : x1 + 3;
      let open = 0, n = 0;
      for (let k = 0; k < 70; k++) {
        const x = sx + dir * k;
        if (x < 4 || x >= width - 4) break;
        let air = 0;
        for (let y = floorY - 4; y < floorY; y++) if (cv.fg(x, y) === T.AIR) air++;
        if (k > 6 && air >= 3) { open++; if (open > 2) { mouth[dir < 0 ? 0 : 1] = true; break; } }
        n++;
      }
      return n;
    };
    const info = drawHall(cv, { x0, hw, floorY }, rng, tunnelLen);
    if (mouth[0]) info.tunnels[0].x0--;
    if (mouth[1]) info.tunnels[1].x1++;
    halls.push(info);
    rects.push({ x: x0 - 3, y: y0 - 4, w: hw + 6, h: ih + 8 });
  }
  return { halls, rects };
}
