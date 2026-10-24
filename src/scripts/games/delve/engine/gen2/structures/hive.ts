// hive.ts — gen2 叢林蜂巢（M2a Task 11；舊生成器 legacy/gen/liquids.ts 的「叢林蜂巢」，蜂蜜的來源）：家鄉的 hive 錨點（叢林地區）與
// 地下層槽位表（0.1，只在叢林，blueprint.ts）共用同一個建構器。舊生成器的蜂巢用開根號與洪水填充灌蜜，沒有可搬的共用碼，這裡重寫成整數橢圓。
//   · 洞腔：橢圓 rx 10–15、ry 7–10，中心 y ∈ [rock + ry + 4, deep + 20]（取洞腔各欄最緊的）；邊緣雜湊值雜訊（fbm2）：
//     dx² ry² + dy² rx² ≤ rx² ry² × k、k ∈ [0.86, 1.14]（舊生成器的 ±7% 半徑；整數比較乘上門檻，不開根號），所以 |dx| ≤ rx + 1。
//   · 殼（T.HIVE）：不在洞腔、但在半軸 rx + 2.5 × ry + 2.5 的橢圓內（座標加倍成整數比較），或 2 格內（含斜角）有洞腔格——殼至少 2 格厚。
//     洞腔與殼全部是蜂巢牆（W.HIVE_WALL）；外框 = 洞腔中心 ± (rx + 3) × ± (ry + 3)（寬 2rx + 7 ≤ 37，加隧道 ≤ HIVE_MAX_W），外框裡其他格 KEEP（天然）。
//   · 蜂蜜：洞腔裡 y ≥ cy + round(0.15 × ry) 的格滿蜂蜜（LIQ.HONEY，生成時就是靜止平面，同 lakes.ts：每個蜂蜜格的左右與下方是蜂蜜或殼）。
//   · 3 個垂掛蜂巢：從 cy − ry 往下 2 ~ ry − 1 格（只蓋洞腔的空氣格，碰不到蜂蜜）。
//   · 地標 T.HONEY_JAR（site 'hive'）：蜂蜜面那一列中間 3 格換成殼當小台子（舊生成器地下湖的石台做法），罐子在台子上（頭頂要空氣）。
//   · 一定走得進去（Task 11 延續事項 / 修正 1；殼是封閉的）：從蜂蜜面那一列由下往上逐列試，往左 / 右挖 4 列高的隧道穿過殼（隧道整個在蜂蜜面以上，
//     蜂蜜仍靜止），直到隧道口接上天然洞穴（miniBiome.digTunnel，同一份判定）；外框跟著延伸（寬 ≤ HIVE_MAX_W、不出 clearRange）。
//     接不上就換中心 y（Y_TRIES 個）、再換 placeX 的下一個外框 x。全部不行 → 槽位表：不放；錨點：第一個放得下的 x、天然洞穴最多的 y，
//     從蜂蜜面以上的洞腔頂往上挖 2 格寬、掛繩梯的直豎井（先接洞、沒有才通地表；外框只加高），繩梯垂到蜂蜜面上一列。
//     豎井部件不碰 BpCtx.surfaceBan（Task 11 修正 2）；x 候選 × y 候選逐組找，全部沒有才丟 RangeError；有豎井時藍圖帶部件 = 主體 + 豎井那兩欄
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, SOLID_LUT } from '../../tiles';
import { fbm2 } from '../../noise';
import { LIQ, LIQ_MAX } from '../../liquidKind';
import { HRng } from '../hrng';
import { BpGrid, placeX, clearRange, emptyObjects, BP_UNDER, KEEP, type Blueprint, type BpBox, type BpCtx } from '../bpcore';
import { digShaft, digTunnel, naturalOpen, planShaft, shaftPart, xCandidates, type MiniOptions, type ShaftCol, type ShaftEnv } from './miniBiome';

// 外框（含隧道）寬上限（anchors.ANCHOR_MAX_W.hive 同值）：37 + 11。家鄉叢林常常只有 3 槽、中間那槽被主坑道帶切成兩側各約 63 欄，
// 48 + 2 × SLOT_PAD = 64 還放得進去（61 時 6000 個種子有 39 個家鄉放不下蜂巢錨點）
export const HIVE_MAX_W = 48;
// 殼外框的邊距（2.5 格殼往外取整 + 1）
const PAD = 3;
// 試幾個中心 y
const Y_TRIES = 24;

// 錨點：force（不回 null；放不下 = RangeError）
export function buildHiveBp(c: BpCtx, o: MiniOptions = {}): Blueprint {
  const b = hive(c, { ...o, force: true });
  if (!b) throw new RangeError(`gen2: hive ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  return b;
}
// 槽位表：放不下 → null
export function rollHiveBp(c: BpCtx, o: MiniOptions = {}): Blueprint | null { return hive(c, o); }

// ctx.ver 0 的規則
function hive(c: BpCtx, o: MiniOptions): Blueprint | null {
  const p = c.profile, rng = new HRng(c.s, c.id);
  const rx = rng.int(10, 16), ry = rng.int(7, 11), fy = rng.next();
  const combs: { dx: number; len: number }[] = [];
  for (let k = 0; k < 3; k++) combs.push({ dx: -rx + 3 + rng.int(0, 2 * rx - 6), len: rng.int(2, Math.max(3, ry)) });
  const bw = 2 * rx + 1 + 2 * PAD, bh = 2 * ry + 1 + 2 * PAD;
  const spanAt = (bx: number): { lo: number; hi: number } => {
    let lo = -1, hi = p.height;
    for (let x = bx + PAD; x < bx + bw - PAD; x++) { const L = p.layersAt(x); lo = Math.max(lo, L.rock + ry + 4); hi = Math.min(hi, L.deep + 20); }
    return { lo, hi };
  };
  const open = naturalOpen(c, o), rx2 = rx * rx, ry2 = ry * ry, rr = rx2 * ry2, salt = (c.s ^ Math.imul(c.id, 0x2545f491)) | 0;
  // 半軸 rx + 2.5、ry + 2.5 的橢圓（座標加倍）
  const ax = 2 * rx + 5, ay = 2 * ry + 5, ax2 = ax * ax, ay2 = ay * ay;
  interface Drawn { g: BpGrid; y0: number; y1: number; x0: number; x1: number; jar: { x: number; y: number } | null; parts?: BpBox[] }
  // 外框 x = bx、中心 y = cy 時畫出整個蜂巢；隧道接得上洞穴才回；force = 接不上就從蜂蜜面以上往上挖直豎井（一定走得出去）
  const draw = (bx: number, cy: number, force: boolean): Drawn | null => {
    const by = cy - ry - PAD, cx = bx + PAD + rx;
    // 洞腔（外框內的遮罩；洞腔 |dx| ≤ rx + 1、|dy| ≤ ry + 1，外框外一定不是）
    const mask = new Uint8Array(bw * bh);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx * ry2 + dy * dy * rx2 <= rr * (0.86 + 0.28 * fbm2(x, y, 5, salt))) mask[(y - by) * bw + x - bx] = 1;
    }
    const cave = (x: number, y: number): boolean => x >= bx && x < bx + bw && y >= by && y < by + bh && mask[(y - by) * bw + x - bx] === 1;
    const outer = (x: number, y: number): boolean => { const dx = 2 * (x - cx), dy = 2 * (y - cy); return dx * dx * ay2 + dy * dy * ax2 <= ax2 * ay2; };
    const near = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (cave(x + dx, y + dy)) return true;
      return false;
    };
    const level = cy + Math.floor((15 * ry + 50) / 100), honey = (LIQ_MAX << 8) | LIQ.HONEY;
    // 隧道可能讓外框往兩側延伸到 [gx0, gx1)，BpGrid 先開這麼寬
    const room = clearRange(c, bx, bw), gx0 = Math.max(room.x0, bx + bw - HIVE_MAX_W), gx1 = Math.min(room.x1, bx + HIVE_MAX_W);
    let g = new BpGrid(gx0, by, gx1 - gx0, bh), y0 = by, y1 = by + bh;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (cave(x, y)) { g.fg(x, y, T.AIR); g.wall(x, y, W.HIVE_WALL); g.liq(x, y, y >= level ? honey : 0); } else if (outer(x, y) || near(x, y)) { g.fg(x, y, T.HIVE); g.wall(x, y, W.HIVE_WALL); g.liq(x, y, 0); }
    }
    const airAt = (x: number, y: number): boolean => cave(x, y) && y < level && g.getFg(x, y) === T.AIR;
    // 垂掛蜂巢（在挖隧道之前：隧道從洞腔最邊的空氣格往外挖，垂掛蜂巢不會堵住隧道口）
    for (const cb of combs) for (let y = cy - ry; y < cy - ry + cb.len; y++) if (airAt(cx + cb.dx, y)) g.fg(cx + cb.dx, y, T.HIVE);
    // 走得進去：從蜂蜜面那一列往上逐列試（digTunnel 由下往上；隧道 4 列高、底在那一列，整個在蜂蜜面以上）往外挖隧道
    const pass = (x: number, y: number): boolean => { const t = g.getFg(x, y); return t === KEEP ? open(x, y) : SOLID_LUT[t] !== 1; };
    const box = { x: bx, y: by, w: bw, h: bh }, slot = { x0: c.slotX0, x1: c.slotX1 };
    const t = digTunnel(g, box, { x0: gx0, x1: gx1 }, (x, y) => y < level && airAt(x, y), pass, open, slot);
    if (!t && !force) return null;
    let parts: BpBox[] | undefined;
    if (!t) {
      // 直豎井：只從蜂蜜面以上往上挖（蜂蜜不會流掉）。候選欄 = sx 與 sx + 1 同一列都是蜂蜜面以上的洞腔空氣，離中心近的先；
      // 先找接得上洞穴的，沒有才通地表；繩梯從豎井頂垂到蜂蜜面上一列
      const cols: ShaftCol[] = [];
      for (let sx = bx; sx < bx + bw - 1; sx++) for (let y = by; y < level; y++) if (airAt(sx, y) && airAt(sx + 1, y)) { cols.push({ sx, start: y - 1 }); break; }
      cols.sort((a, b2) => Math.abs(a.sx - cx) - Math.abs(b2.sx - cx) || a.sx - b2.sx);
      const env: ShaftEnv = { box, slot, pass, open, surface: (x) => p.surfaceAt(x), limit: () => -Infinity, ban: c.surfaceBan ?? [] };
      const plan = planShaft(cols, -1, false, env) ?? planShaft(cols, -1, true, env);
      // 每一欄的豎井都碰到 surfaceBan → 這個 (x, y) 不行，外層換下一組
      if (!plan) return null;
      const dug = digShaft(g, plan, (x, y) => airAt(x, y), level);
      g = dug.g; y0 = dug.y0; y1 = dug.y1;
      // 部件：主體（原外框）+ 豎井那兩欄（Task 11 修正 2；部件外不寫任何格）
      parts = [{ x: bx, y: by, w: bw, h: bh }, shaftPart(plan)];
    }
    // 蜂王蜜罐：蜂蜜面中間 3 格的台子（離中心最近、罐子那格與頭頂是空氣）
    let jar: { x: number; y: number } | null = null;
    for (let d = 0; d <= rx && !jar; d++) for (const x of d ? [cx - d, cx + d] : [cx]) {
      if (![x - 1, x, x + 1].every((q) => cave(q, level)) || !airAt(x, level - 1) || !airAt(x, level - 2)) continue;
      for (const q of [x - 1, x, x + 1]) { g.fg(q, level, T.HIVE); g.liq(q, level, 0); }
      g.fg(x, level - 1, T.HONEY_JAR);
      jar = { x, y: level - 1 };
      break;
    }
    return { g, y0, y1, jar, x0: t ? t.x0 : bx, x1: t ? t.x1 : bx + bw, parts };
  };
  // 中心 y 的第 t 個候選（依雜湊起點、黃金比例步長）
  const yAt = (bx: number, t: number): number => {
    const { lo, hi } = spanAt(bx), f = fy + t * 0.381966;
    return hi >= lo ? lo + Math.floor((f - Math.floor(f)) * (hi - lo + 1)) : lo;
  };
  // 外框 x 的洞腔橢圓（不加雜湊）內、中心 y 時的天然洞穴格數
  const holes = (bx: number, cy: number): number => {
    let n = 0;
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if (dx * dx * ry2 + dy * dy * rx2 <= rr && open(bx + PAD + rx + dx, cy + dy)) n++;
    return n;
  };
  // 外框 x：placeX 的候選依序試，每個 x 試 Y_TRIES 個中心 y，取第一個隧道接得上洞穴的。
  // 都不行：槽位表不放；錨點（force）x 候選 × y 候選（天然洞穴多的先）逐組挖直豎井，取第一組有不碰 surfaceBan 的豎井欄的
  // （Task 11 修正 2）；全部都沒有才丟 RangeError
  let got: Drawn | null = null;
  const bx = placeX(c, bw, o.force === true, (x) => {
    const s = spanAt(x);
    if (s.hi < s.lo) return false;
    for (let t = 0; t < Y_TRIES && !got; t++) got = draw(x, yAt(x, t), false);
    return got !== null;
  });
  if (bx === null) return null;
  if (!got) {
    for (const x of xCandidates(c, bw, bx)) {
      const ys: { y: number; n: number }[] = [];
      for (let t = 0; t < Y_TRIES; t++) { const y = yAt(x, t); ys.push({ y, n: holes(x, y) }); }
      for (const q of ys.sort((a, b) => b.n - a.n)) { got = draw(x, q.y, true); if (got) break; }
      if (got) break;
    }
    if (!got) throw new RangeError(`gen2: hive ${c.id} has no reachable layout outside the surface ban`);
  }
  const { g, y0, y1, jar, x0, x1, parts } = got!;
  // 格都在 [x0, x1) × [y0, y1) 內（蜂巢在原外框裡、隧道在延伸的欄裡、豎井在加高的列裡；BpGrid 開得比較寬的欄都是 KEEP）
  return {
    id: c.id, kind: 'hive', layer: BP_UNDER, x: x0, y: y0, w: x1 - x0, h: y1 - y0, cells: g.cells(), chests: [], ...emptyObjects(),
    landmarks: jar ? [{ ...jar, tile: T.HONEY_JAR, site: 'hive' }] : [], ...(parts ? { parts } : {}),
  };
}
