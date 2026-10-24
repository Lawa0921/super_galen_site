// miniBiome.ts — gen2 小生態（M2a Task 11；spec §4.4「蘑菇 / 水晶小生態」）：地下層的蘑菇林、深層的水晶洞。
// 錨點（家鄉各一座：mushroom_biome 在森林、crystal_cave 先挑森林，anchors.ts）與槽位表（地下層蘑菇林 0.05 只在森林 / 叢林、
// 深層水晶洞 0.08，blueprint.ts）共用同一個建構器（錨點 force：一定回藍圖）。舊生成器的小生態散在全圖的 pass 裡（tileRunner + 換材質），沒有可搬的共用繪製碼。
//   · 區域 E：橢圓 rx × ry（蘑菇林 rx 40–70、ry 22–34；水晶洞 rx 40–60、ry 24–34），邊緣是雜湊值雜訊（engine/noise.ts 的 fbm2）往內縮：
//     dx² ry² + dy² rx² ≤ rx² ry² × k、k ∈ [0.75, 1]（整數比較乘上門檻，不開根號）；外框 = 橢圓的外接矩形（寬 2rx + 1、高 2ry + 1），
//     接洞的隧道可以讓外框往左 / 右延伸（寬 ≤ MUSHROOM_MAX_W / CRYSTAL_MAX_W = anchors.ANCHOR_MAX_W）。
//     中心 y：蘑菇林 [rock + ry + 10, rock + 0.4 × (deep − rock) + ry]、水晶洞 [deep, molten − ry − 12]（取外框各欄最緊的）；
//     依雜湊起點試 OPEN_TRIES 個 y：E 內天然洞穴 ≤ 45% 的（舊生成器的規則：小生態要有岩體長殼）依序畫，取第一個主洞室接得上洞穴的。
//   · 洞腔：置中的主洞室（半軸 0.7 rx × 0.55 ry）+ 幾個中心在主洞室裡的副洞室（半軸 0.2–0.4 rx × 0.25–0.5 ry），各自是雜湊邊緣的橢圓，
//     限制在 E 的 0.85 倍內（E 的邊留一層殼）。主洞室 = 外框內含洞腔的最大一塊連通空間（雜湊邊緣可能切出小塊）。
//     平台：浮在洞腔裡的 2 格厚殼材質（寬 6–16），外圍一圈都還是洞腔空氣才放（不碰殼、不碰別的平台 → 不會把洞腔隔開）；
//     先放 floor(rx / 3)（蘑菇林）/ floor(rx / 5)（水晶洞）塊，蘑菇林的地板還不到 200 格就繼續放（小的蘑菇林地板不夠長蘑菇，最多 LEDGE_TRIES 個候選）。
//     E 內原本的天然洞穴（caves.CaveProbe，與 fill.ts 同一份判定）照樣是空氣——天然洞穴穿過殼就是入口（舊生成器也保留洞穴、只換材質）。
//   · 殼：E 內其餘的格改殼材質（蘑菇林泥巴、水晶洞大理石；礦也換掉），E 內全部是殼牆（泥巴牆 / 冰牆）。
//     E 內每一格都由藍圖決定（不靠 fill，不用 solid，所以分段填與整欄填一樣）；E 外的格 KEEP（天然）。
//   · 裝飾（擲 hash2(x, y, 這份藍圖的鹽)）：E 內的空氣格，下方是 E 內的殼 = 地板、上方是 E 內的殼 = 天花板（兩者都是時算地板）。
//     蘑菇林：露出的地板（殼材質、上方空氣）換成 T.MUSHROOM_GRASS，地板上 38% T.GLOW_MUSHROOM、天花板 10% T.VINE；
//     水晶洞：地板 28%、天花板 22% T.CRYSTAL。
//   · 地標：主洞室裡離中心最近（舊生成器 landmarks.ts 的距離：dx² / rx² + 0.6 dy² / ry²）、腳下是 E 內的殼、頭頂空氣的地板格放
//     T.SPORE_TOTEM（site 'mushroom_biome'）/ T.GEODE（site 'crystal_cave'）；那格與頭頂那格不放裝飾。
//   · 一定走得進去（Task 11 延續事項 / 修正 1）：從主洞室走「藍圖的非實心格 ∪ 藍圖沒畫的天然洞穴」（linksToCave），走到外框外的天然洞穴 ≥ CAVE_BIG 格才算接上
//     （小氣泡不算；範圍 = 自己的槽 ∩ 外框左右 80 欄、外框上 80 / 下 40 列，同測試的 walkOut）。接不上 → digTunnel：從主洞室的地板由下往上逐列，
//     往外挖 4 列高的隧道到接上洞穴。這個 y 不行換下一個 y、這個 x 不行換 placeX 的下一個 x（同蜂巢）。
//     全部不行 → 槽位表：不放；錨點：第一個放得下的 x、天然洞穴最多的 y，再接不上就挖 2 格寬、掛繩梯的直豎井（planShaft / digShaft，外框只加高不加寬）：
//     蘑菇林 往上接洞 → 往下接洞（不過 deep 線、熔岩線）→ 往上通地表；水晶洞 往上接洞 → 往上通地表（正上方的地下層槽沒有錨點，anchors.ts）。
//     bx-0..4999 完整開機實測 15,000 座錨點用到豎井 13 次（約 6 次通地表、4 次往下）。
//     Task 11 修正 2：豎井部件不碰 BpCtx.surfaceBan（家鄉表層錨點的部件）；主洞室上方的欄都碰到時，從主洞室地板挖一段 4 列高的橫隧道
//     到不碰的欄（可以延伸到外框外，寬 ≤ maxW）再往上；force 備案依 x 候選 × y 候選逐組找，全部沒有才丟 RangeError。
//     有豎井時藍圖帶部件 = 主體（含繞路的隧道）+ 豎井那兩欄；部件外不寫任何格
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, SOLID_LUT } from '../../tiles';
import { hash2, fbm2 } from '../../noise';
import type { ColumnLayers } from '../../column';
import { HRng } from '../hrng';
import { CaveProbe } from '../caves';
import { LAVA_Y, type Profile2 } from '../profile';
import { BpGrid, placeX, clearRange, emptyObjects, boxHits, BP_UNDER, BP_DEEP, KEEP, type Blueprint, type BpBox, type BpCtx, type BpLandmark, type Span } from '../bpcore';

// 試幾個中心 y、E 內天然洞穴的比例上限（舊生成器 0.45）
const OPEN_TRIES = 8, OPEN_MAX = 0.45;
// 接到的洞穴至少這麼多格；探測範圍：左右到槽邊、外框上 REACH_UP 列、下 REACH_DOWN 列（同礦坑）
export const CAVE_BIG = 300;
// 探測範圍（同測試的 walkOut）：外框左右 REACH_X 欄（且不出自己的槽）、上 REACH_UP 列、下 REACH_DOWN 列
const REACH_X = 80, REACH_UP = 80, REACH_DOWN = 40;
// 隧道高 4 列（同礦坑 / 地廳的坑道）；隧道口那一欄的 4 列至少 CAVE_MIN 格是洞穴
const TUNNEL_H = 4, CAVE_MIN = 3;
// 4 鄰（dx, dy 成對）
const DIRS = [-1, 0, 1, 0, 0, -1, 0, 1];
// 平台候選數
const LEDGE_TRIES = 120;

// 天然洞穴的判定（預設 CaveProbe；測試注入「全部不通」來走隧道）
export interface MiniOptions { caveOpen?: (x: number, y: number) => boolean; force?: boolean }

// 天然洞穴（快取）：探針只讀噪聲與 profile（熔岩線以下算不通）。CaveProbe 沿同一欄依序取樣最快（ColNoise 在同一格內重用格點雜湊），
// 所以一次算一欄的 64 列（不管呼叫端用什麼順序問）
export function naturalOpen(c: BpCtx, o: MiniOptions): (x: number, y: number) => boolean {
  const p = c.profile, probe = new CaveProbe(c.seed), segs = new Map<number, Uint8Array>();
  const raw = o.caveOpen ?? ((x: number, y: number, I: ColumnLayers & { surface: number }): boolean => y < LAVA_Y && probe.open(x, y, I));
  return (x, y) => {
    if (y < 0 || y >= p.height) return false;
    // 世界高 1200 < 32 × 64：一欄至多 19 段，x × 32 + 段號不會撞
    const k = x * 32 + (y >> 6);
    let a = segs.get(k);
    if (!a) {
      a = new Uint8Array(64);
      const I = p.info(x), y0 = y & ~63;
      for (let j = 0; j < 64 && y0 + j < p.height; j++) a[j] = raw(x, y0 + j, I) ? 1 : 0;
      segs.set(k, a);
    }
    return a[y & 63] === 1;
  };
}

// 從 starts 出發走 4 鄰：外框 box 內走 air(x, y) 為真的格（藍圖畫的空氣；KEEP 的格看 open），外框外走天然洞穴；
// 範圍 x ∈ [span.x0, span.x1) ∩ 外框左右 REACH_X 欄、y ∈ [box.y − REACH_UP, box.y + box.h + REACH_DOWN)。外框外走到 ≥ CAVE_BIG 格 = 接上
export function linksToCave(box: { x: number; y: number; w: number; h: number }, span: Span, starts: readonly (readonly [number, number])[],
  inside: (x: number, y: number) => boolean, open: (x: number, y: number) => boolean): boolean {
  const y0 = box.y - REACH_UP, y1 = box.y + box.h + REACH_DOWN, xl = Math.max(span.x0, box.x - REACH_X), xr = Math.min(span.x1, box.x + box.w + REACH_X);
  const inBox = (x: number, y: number): boolean => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  const seen = new Set<number>(), st: number[] = [];
  for (const [x, y] of starts) { const k = x * 4096 + y; if (!seen.has(k)) { seen.add(k); st.push(x, y); } }
  let out = 0;
  while (st.length) {
    const cy = st.pop()!, cx = st.pop()!;
    for (let d = 0; d < 8; d += 2) {
      const nx = cx + DIRS[d], ny = cy + DIRS[d + 1];
      const k = nx * 4096 + ny;
      if (seen.has(k) || nx < xl || nx >= xr || ny < y0 || ny >= y1) continue;
      const b = inBox(nx, ny);
      if (b ? !inside(nx, ny) : !open(nx, ny)) continue;
      seen.add(k);
      if (!b && ++out >= CAVE_BIG) return true;
      st.push(nx, ny);
    }
  }
  return false;
}

interface GroveSpec {
  kind: 'mushroom_biome' | 'crystal_cave'; layer: typeof BP_UNDER | typeof BP_DEEP;
  // rng.int 的 [lo, hi)
  rx: [number, number]; ry: [number, number];
  // 第 x 欄（層線 I）中心 y 的 [下限, 上限]
  span: (I: ColumnLayers, ry: number) => [number, number];
  shell: number; wall: number;
  // 露出的地板換成的 tile（null = 不換）
  grass: number | null;
  floor: { p: number; t: number }; ceil: { p: number; t: number };
  landmark: number;
  // 平台數 = floor(rx / ledgeDiv)；之後補到地板 ≥ minFloor 格（0 = 不補）
  ledgeDiv: number; minFloor: number;
  // 副洞室數
  subs: number;
  // 外框（含隧道）寬上限（anchors.ANCHOR_MAX_W 同值，那邊有測試）
  maxW: number;
}

export const MUSHROOM_MAX_W = 145, CRYSTAL_MAX_W = 125;
const MUSHROOM: GroveSpec = {
  kind: 'mushroom_biome', layer: BP_UNDER, rx: [40, 71], ry: [22, 35],
  span: (I, ry) => [I.rock + ry + 10, I.rock + Math.floor((2 * (I.deep - I.rock)) / 5) + ry],
  shell: T.MUD, wall: W.MUD_WALL, grass: T.MUSHROOM_GRASS,
  floor: { p: 0.38, t: T.GLOW_MUSHROOM }, ceil: { p: 0.1, t: T.VINE }, landmark: T.SPORE_TOTEM, ledgeDiv: 3, minFloor: 200, subs: 6, maxW: MUSHROOM_MAX_W,
};
const CRYSTAL: GroveSpec = {
  kind: 'crystal_cave', layer: BP_DEEP, rx: [40, 61], ry: [24, 35],
  span: (I, ry) => [I.deep, I.molten - ry - 12],
  shell: T.MARBLE, wall: W.ICE_WALL, grass: null,
  floor: { p: 0.28, t: T.CRYSTAL }, ceil: { p: 0.22, t: T.CRYSTAL }, landmark: T.GEODE, ledgeDiv: 5, minFloor: 0, subs: 4, maxW: CRYSTAL_MAX_W,
};

// 錨點（force，不回 null；放不下 = RangeError）與槽位表（放不下、接不上洞穴 → null；生態由 blueprint.ts 的槽位表篩）
export function buildMushroomBp(c: BpCtx, o: MiniOptions = {}): Blueprint { return must(grove(c, MUSHROOM, { ...o, force: true }), c); }
export function buildCrystalBp(c: BpCtx, o: MiniOptions = {}): Blueprint { return must(grove(c, CRYSTAL, { ...o, force: true }), c); }
export function rollMushroomBp(c: BpCtx, o: MiniOptions = {}): Blueprint | null { return grove(c, MUSHROOM, o); }
export function rollCrystalBp(c: BpCtx, o: MiniOptions = {}): Blueprint | null { return grove(c, CRYSTAL, o); }

function must(b: Blueprint | null, c: BpCtx): Blueprint {
  if (!b) throw new RangeError(`gen2: mini biome ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  return b;
}

// 一個洞室：中心（相對 E 中心）、半軸
interface Blob { x: number; y: number; rx: number; ry: number }

// ctx.ver 0 的規則
function grove(c: BpCtx, sp: GroveSpec, o: MiniOptions): Blueprint | null {
  const p = c.profile, rng = new HRng(c.s, c.id);
  const rx = rng.int(sp.rx[0], sp.rx[1]), ry = rng.int(sp.ry[0], sp.ry[1]), fy = rng.next();
  // 主洞室半軸 0.6 rx × 0.5 ry；副洞室的中心在主洞室裡（|ox| ≤ 0.7 mrx、|oy| ≤ 0.7 mry），半軸 0.2–0.4 rx × 0.25–0.5 ry
  const mrx = Math.floor((rx * 7) / 10), mry = Math.floor((ry * 11) / 20), blobs: Blob[] = [{ x: 0, y: 0, rx: mrx, ry: mry }];
  for (let k = 0; k < sp.subs; k++) {
    const ox = Math.round((rng.next() * 2 - 1) * mrx * 0.7), oy = Math.round((rng.next() * 2 - 1) * mry * 0.7);
    blobs.push({ x: ox, y: oy, rx: Math.max(4, Math.floor(rx * (0.2 + rng.next() * 0.2))), ry: Math.max(3, Math.floor(ry * (0.25 + rng.next() * 0.25))) });
  }
  // 平台候選（固定 LEDGE_TRIES 個，亂數流長度不變）：中心（相對 E 中心）與寬
  const ledges: { x: number; y: number; w: number }[] = [];
  for (let k = 0; k < LEDGE_TRIES; k++) ledges.push({ x: Math.round((rng.next() * 2 - 1) * mrx), y: Math.round((rng.next() * 2 - 1) * mry * 0.9), w: rng.int(6, 17) });
  const bw = 2 * rx + 1, bh = 2 * ry + 1;
  const spanAt = (bx: number): { lo: number; hi: number } => {
    let lo = -1, hi = p.height;
    for (let x = bx; x < bx + bw; x++) { const [a, b] = sp.span(p.layersAt(x), ry); lo = Math.max(lo, a); hi = Math.min(hi, b); }
    return { lo, hi };
  };
  const open = naturalOpen(c, o), rx2 = rx * rx, ry2 = ry * ry, rr = rx2 * ry2, salt = (c.s ^ Math.imul(c.id, 0x2545f491)) | 0;
  const slot = { x0: c.slotX0, x1: c.slotX1 };

  // 外框 x = bx、中心 y = cy 時畫出整個小生態；主洞室接不上洞穴（天然或隧道）時回 null；force = 再接不上就挖直豎井（一定走得出去）
  const draw = (bx: number, cy: number, force: boolean): Blueprint | null => {
    const cx = bx + rx, room = clearRange(c, bx, bw), gx0 = Math.max(room.x0, bx + bw - sp.maxW), gx1 = Math.min(room.x1, bx + sp.maxW);
    const by = cy - ry, N = bw * bh, at = (x: number, y: number): number => (y - by) * bw + x - bx;
    // E：雜湊邊緣往內縮（k ∈ [0.75, 1]）；洞腔：E 的 0.85 倍內、在某個洞室裡（洞室的雜湊邊緣門檻 [0.8, 1.2]）
    const E = new Uint8Array(N), H = new Uint8Array(N);
    // 雜湊門檻只在落在門檻範圍內的格才算（E 與洞腔門檻的下限 0.75 × 0.85 以內一定都在、上限以外一定不在）
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const dx = x - cx, dy = y - cy, q = dx * dx * ry2 + dy * dy * rx2;
      if (q > rr) continue;
      const k = q <= rr * 0.6375 ? 1 : 0.75 + 0.25 * fbm2(x, y, 10, salt);
      if (q > rr * k) continue;
      E[at(x, y)] = 1;
      if (q > rr * k * 0.85) continue;
      let kb = -1;
      for (const b of blobs) {
        const ex = dx - b.x, ey = dy - b.y, a2 = b.rx * b.rx, b2 = b.ry * b.ry, qb = ex * ex * b2 + ey * ey * a2, ab = a2 * b2;
        if (qb > ab * 1.2) continue;
        if (qb > ab * 0.8 && kb < 0) kb = 0.8 + 0.4 * fbm2(x, y, 6, salt + 1);
        if (qb <= ab * 0.8 || qb <= ab * kb) { H[at(x, y)] = 1; break; }
      }
    }
    // 畫：E 內全部殼牆；洞腔、洞腔外的天然洞穴 = AIR，其餘殼。隧道可能讓外框往兩側延伸到 [gx0, gx1)，BpGrid 先開這麼寬
    let g = new BpGrid(gx0, by, gx1 - gx0, bh);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const i = at(x, y);
      if (!E[i]) continue;
      g.wall(x, y, sp.wall); g.liq(x, y, 0); g.fg(x, y, H[i] || open(x, y) ? T.AIR : sp.shell);
    }
    const inBox = (x: number, y: number): boolean => x >= bx && x < bx + bw && y >= by && y < by + bh;
    const isE = (x: number, y: number): boolean => inBox(x, y) && E[at(x, y)] === 1;
    const solidE = (x: number, y: number): boolean => isE(x, y) && SOLID_LUT[g.getFg(x, y)] === 1;
    const airE = (x: number, y: number): boolean => isE(x, y) && g.getFg(x, y) === T.AIR;
    const hollowAir = (x: number, y: number): boolean => inBox(x, y) && H[at(x, y)] === 1 && g.getFg(x, y) === T.AIR;
    // 平台：浮在洞腔裡的 2 格厚殼材質，外圍一圈都還是洞腔空氣才放（不碰殼、不碰別的平台 → 不會把洞腔隔開）。
    // 依序試候選，放滿 floor(rx / ledgeDiv) 塊後、地板（E 內的空氣格、腳下 E 內的殼）還不到 minFloor 就繼續放
    // 地板數只在放平台時局部更新（平台只改它上一列到下一列的地板）
    const floorsIn = (x0: number, x1: number, y0: number, y1: number): number => {
      let n = 0;
      for (let y = Math.max(by, y0); y <= Math.min(by + bh - 2, y1); y++) for (let x = x0; x <= x1; x++) if (airE(x, y) && solidE(x, y + 1)) n++;
      return n;
    };
    let nFloor = sp.minFloor > 0 ? floorsIn(bx, bx + bw - 1, by, by + bh - 2) : 0, placed = 0;
    const enough = (): boolean => placed >= Math.floor(rx / sp.ledgeDiv) && (sp.minFloor === 0 || nFloor >= sp.minFloor);
    // 候選先以外圍 2 格試一輪，還不夠再以外圍 1 格試一輪（1 格的縫仍然連通）
    for (const ring of [2, 1]) for (const l of ledges) {
      if (enough()) break;
      const lx0 = cx + l.x - (l.w >> 1), lx1 = cx + l.x + (l.w >> 1), ly = cy + l.y;
      let ok = true;
      for (let y = ly - ring; y <= ly + 1 + ring && ok; y++) for (let x = lx0 - ring; x <= lx1 + ring; x++) if (!hollowAir(x, y)) { ok = false; break; }
      if (!ok) continue;
      const before = floorsIn(lx0, lx1, ly - 1, ly + 2);
      for (let y = ly; y <= ly + 1; y++) for (let x = lx0; x <= lx1; x++) g.fg(x, y, sp.shell);
      nFloor += floorsIn(lx0, lx1, ly - 1, ly + 2) - before;
      placed++;
    }
    // 外框內走得過的格：藍圖的非實心格、KEEP 的格看天然洞穴
    const pass = (x: number, y: number): boolean => { const t = g.getFg(x, y); return t === KEEP ? open(x, y) : SOLID_LUT[t] !== 1; };
    // 主洞室：外框內含洞腔空氣的最大一塊走得過的格（4 鄰連通）；lab = 塊號 + 1（0 = 還沒走到）
    const lab = new Int32Array(N), st: number[] = [];
    let main = 0, mainN = 0, nextId = 0, seed: [number, number] = [cx, cy];
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (lab[at(x, y)] || !hollowAir(x, y)) continue;
      const id = ++nextId;
      let n = 1;
      lab[at(x, y)] = id; st.push(x, y);
      while (st.length) {
        const py = st.pop()!, px = st.pop()!;
        for (let d = 0; d < 8; d += 2) {
          const nx = px + DIRS[d], ny = py + DIRS[d + 1];
          if (!inBox(nx, ny) || lab[at(nx, ny)] || !pass(nx, ny)) continue;
          lab[at(nx, ny)] = id; st.push(nx, ny); n++;
        }
      }
      if (n > mainN) { main = id; mainN = n; seed = [x, y]; }
    }
    if (!main) return null;
    const inMain = (x: number, y: number): boolean => inBox(x, y) && lab[at(x, y)] === main;
    // 走得進去：主洞室接上外框外的天然洞穴；不行就從主洞室的地板挖隧道；再不行（force）挖直豎井
    const box = { x: bx, y: by, w: bw, h: bh };
    let x0 = bx, x1 = bx + bw, top = by, bottom = by + bh, parts: BpBox[] | undefined;
    if (!linksToCave(box, slot, [seed], pass, open)) {
      const t = digTunnel(g, box, { x0: gx0, x1: gx1 }, (x, y) => inMain(x, y) && airE(x, y) && solidE(x, y + 1), pass, open, slot);
      if (!t && !force) return null;
      if (t) { x0 = t.x0; x1 = t.x1; } else {
        // 豎井的候選欄（sx 與 sx + 1 同一列都是主洞室的空氣格）：離中心近的先；往上從那兩欄主洞室最高一列的上一列挖、往下從最低一列的下一列挖
        const up: ShaftCol[] = [], down: ShaftCol[] = [];
        for (let sx = bx; sx < bx + bw - 1; sx++) {
          let hiY = -1, loY = -1;
          for (let y = by; y < by + bh; y++) if (inMain(sx, y) && inMain(sx + 1, y) && airE(sx, y) && airE(sx + 1, y)) { if (hiY < 0) hiY = y; loY = y; }
          if (hiY >= 0) { up.push({ sx, start: hiY - 1 }); down.push({ sx, start: loY + 1 }); }
        }
        const near = (a: ShaftCol, b2: ShaftCol): number => Math.abs(a.sx - cx) - Math.abs(b2.sx - cx) || a.sx - b2.sx;
        up.sort(near); down.sort(near);
        const env: ShaftEnv = { box, slot, pass, open, surface: (x) => p.surfaceAt(x), limit: (x) => Math.min(p.layersAt(x).deep, LAVA_Y), ban: c.surfaceBan ?? [] };
        // 蘑菇林：往上接洞 → 往下接洞（不過 deep 線）→ 往上通地表；水晶洞：往上接洞 → 往上通地表（水晶洞正上方的地下層槽沒有錨點，anchors.ts）
        let plan2 = planShaft(up, -1, false, env) ?? (sp.kind === 'mushroom_biome' ? planShaft(down, 1, false, env) : null) ?? planShaft(up, -1, true, env);
        if (!plan2) {
          // 繞路（主洞室上方的豎井欄全都碰到 surfaceBan）：從主洞室的地板挖一段 4 列高的橫隧道到不碰的欄 sx，再從隧道頂往上挖。
          // sx 在外框可延伸的範圍 [gx0, gx1 − 1) 內（已扣掉 ANCHOR_MAX_W 與槽邊距；外框跟著延伸，主體部件 = 延伸後的外框列），
          // 離中心近的先；地板取離 sx 最近（列差算一半）的主洞室地板格
          const floorsM: [number, number][] = [];
          for (let y = by + TUNNEL_H; y < by + bh - 1; y++) for (let x = bx; x < bx + bw; x++) if (inMain(x, y) && airE(x, y) && solidE(x, y + 1)) floorsM.push([x, y]);
          const cols = [...Array(Math.max(0, gx1 - gx0 - 1)).keys()].map((k) => gx0 + k).sort((a2, b2) => Math.abs(a2 - cx) - Math.abs(b2 - cx) || a2 - b2);
          for (const sx of cols) {
            let fm: [number, number] | null = null, fd = Infinity;
            for (const f of floorsM) { const d = 2 * Math.abs(f[0] - sx) + Math.abs(f[1] - cy); if (d < fd) { fd = d; fm = f; } }
            if (!fm) break;
            const [xm, fy] = fm, t2 = planShaft([{ sx, start: fy - TUNNEL_H }], -1, true, env);
            if (!t2) continue;
            for (let x = Math.min(xm, sx); x <= Math.max(xm, sx + 1); x++) for (let y = fy - TUNNEL_H + 1; y <= fy; y++) { g.fg(x, y, T.AIR); g.liq(x, y, 0); }
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx + 2);
            plan2 = t2;
            break;
          }
        }
        // 沒有能挖的欄（繞路也都碰到 surfaceBan）→ 這個 (x, y) 不行，外層換下一組
        if (!plan2) return null;
        const plan = plan2;
        const dug = digShaft(g, plan, (x, y) => g.getFg(x, y) === T.AIR, by + bh);
        g = dug.g; top = dug.y0; bottom = dug.y1;
        // 部件：主體（原外框，含繞路延伸的欄）+ 豎井那兩欄（Task 11 修正 2；部件外不寫任何格）
        parts = [{ x: x0, y: by, w: x1 - x0, h: bh }, shaftPart(plan)];
      }
    }
    // 地標：主洞室裡離中心最近、腳下是 E 內的殼、頭頂空氣的地板格
    let spot: { x: number; y: number } | null = null, sd = Infinity;
    for (let y = by + 1; y < by + bh - 1; y++) for (let x = bx; x < bx + bw; x++) {
      if (!inMain(x, y) || !airE(x, y) || !solidE(x, y + 1) || !airE(x, y - 1)) continue;
      const dx = x - cx, dy = y - cy, d = 5 * dx * dx * ry2 + 3 * dy * dy * rx2;
      if (d < sd) { sd = d; spot = { x, y }; }
    }
    // 裝飾：由上往下（換成蘑菇草的格之後就是實心，不會再被當成空氣）；地標那格與頭頂那格不放
    const dsalt = (salt + 0x5bd1e995) | 0;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (!airE(x, y)) continue;
      const floor = solidE(x, y + 1);
      if (floor && sp.grass !== null) g.fg(x, y + 1, sp.grass);
      if (spot && x === spot.x && (y === spot.y || y === spot.y - 1)) continue;
      const r = hash2(x, y, dsalt);
      if (floor) { if (r < sp.floor.p) g.fg(x, y, sp.floor.t); } else if (solidE(x, y - 1) && r < sp.ceil.p) g.fg(x, y, sp.ceil.t);
    }
    const landmarks: BpLandmark[] = [];
    if (spot) { g.fg(spot.x, spot.y, sp.landmark); landmarks.push({ x: spot.x, y: spot.y, tile: sp.landmark, site: sp.kind }); }
    const out: Blueprint = { id: c.id, kind: sp.kind, layer: sp.layer, x: x0, y: top, w: x1 - x0, h: bottom - top, cells: g.cells(), chests: [], ...emptyObjects(), landmarks };
    if (parts) out.parts = parts;
    return out;
  };

  // 中心 y 的候選：依雜湊起點試 OPEN_TRIES 個（黃金比例步長）；frac = E（不加雜湊的橢圓、每 2 格取樣）內天然洞穴的比例
  const ys = (bx: number): { y: number; frac: number }[] => {
    const { lo, hi } = spanAt(bx), cx = bx + rx;
    if (hi < lo) return [{ y: lo, frac: 0 }];
    const out: { y: number; frac: number }[] = [];
    for (let t = 0; t < OPEN_TRIES; t++) {
      const f = fy + t * 0.381966, y = lo + Math.floor((f - Math.floor(f)) * (hi - lo + 1));
      let n = 0, holes = 0;
      for (let dy = -ry; dy <= ry; dy += 2) for (let dx = -rx; dx <= rx; dx += 2) if (dx * dx * ry2 + dy * dy * rx2 <= rr) { n++; if (open(cx + dx, y + dy)) holes++; }
      out.push({ y, frac: holes / n });
    }
    return out;
  };
  // 外框 x：placeX 的候選依序試（同蜂巢），每個 x 依序畫天然洞穴 ≤ 45% 的 y，第一個主洞室接得上洞穴（天然或隧道）的就是。
  // 都不行 → 槽位表：不放；錨點：x 候選（placeX 的順序）× y 候選（天然洞穴多的先）逐組畫、接不上就挖直豎井，
  // 取第一組有不碰 surfaceBan 的豎井欄的（Task 11 修正 2）；全部都沒有才丟 RangeError
  let got: Blueprint | null = null;
  const bx = placeX(c, bw, o.force === true, (x) => {
    const s = spanAt(x);
    if (s.hi < s.lo) return false;
    for (const q of ys(x)) { if (q.frac > OPEN_MAX) continue; got = draw(x, q.y, false); if (got) return true; }
    return false;
  });
  if (bx === null) return null;
  if (got) return got;
  if (!o.force) return null;
  for (const x of xCandidates(c, bw, bx)) {
    for (const q of ys(x).sort((a, b) => b.frac - a.frac)) { const b = draw(x, q.y, true); if (b) return b; }
  }
  throw new RangeError(`gen2: mini biome ${c.id} has no reachable layout outside the surface ban`);
}

// placeX 的候選外框 x（依它的順序；放得下的才算）；都放不下時只有 placeX 夾進槽裡的 fallback
export function xCandidates(c: BpCtx, w: number, fallback: number): number[] {
  const xs: number[] = [];
  placeX(c, w, false, (x) => { xs.push(x); return false; });
  return xs.length ? xs : [fallback];
}
// 豎井的部件：那兩欄、挖的列
export const shaftPart = (s: ShaftPlan): BpBox => ({ x: s.sx, y: s.y0, w: 2, h: s.y1 - s.y0 + 1 });

// ── 直豎井（Task 11 修正 1：天然洞穴與隧道都接不上的錨點；比照地廳 / 礦坑的後備豎井）──
// 2 欄寬（sx、sx + 1）、外框跟著加高（寬不變）；繩梯掛在 sx 欄
export interface ShaftCol { sx: number; start: number }
export interface ShaftEnv {
  box: { x: number; y: number; w: number; h: number }; slot: Span;
  pass: (x: number, y: number) => boolean; open: (x: number, y: number) => boolean;
  // profile 地表；往下時的界線（那一列起不挖：deep 線、熔岩線）
  surface: (x: number) => number; limit: (x: number) => number;
  // 豎井部件不得相交的盒子（BpCtx.surfaceBan：表層錨點）
  ban: readonly BpBox[];
}
export interface ShaftPlan { sx: number; y0: number; y1: number; dir: -1 | 1; sky: boolean }
// 依 cols 的順序試：從 start 那一列往 dir 一列一列挖（豎井部件碰到 e.ban 的欄不算，Task 11 修正 2）。某一列兩欄有一格走得過（外框內看 pass、外框外看天然洞穴）、
// 而且從那裡走得到（加高後的）外框外 ≥ CAVE_BIG 格 → 挖到前一列為止（接上洞穴）；往上挖到兩欄地表較高處的上一列 → surfaceOK 才算成功（通地表）；
// 往下碰到 limit → 這一欄不行。挖的格只有藍圖的殼與天然格（熔岩線以下不去），沒有液體
export function planShaft(cols: readonly ShaftCol[], dir: -1 | 1, surfaceOK: boolean, e: ShaftEnv): ShaftPlan | null {
  const { box } = e, inBox = (x: number, y: number): boolean => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  const walk = (x: number, y: number): boolean => (inBox(x, y) ? e.pass(x, y) : e.open(x, y));
  for (const { sx, start } of cols) {
    const sky = Math.min(e.surface(sx), e.surface(sx + 1)) - 1, lim = Math.min(e.limit(sx), e.limit(sx + 1));
    for (let y = start; dir < 0 ? y >= 0 : y < lim; y += dir) {
      if (dir < 0 && y <= sky) {
        const s: ShaftPlan = { sx, y0: y, y1: start, dir, sky: true };
        if (surfaceOK && !boxHits(shaftPart(s), e.ban)) return s;
        break;
      }
      if (y === start) continue;
      const a = Math.min(start, y - dir), b = Math.max(start, y - dir), y0 = Math.min(box.y, a), y1 = Math.max(box.y + box.h, b + 1);
      const nb = { x: box.x, y: y0, w: box.w, h: y1 - y0 };
      let hit: ShaftPlan | null = null;
      for (const x of [sx, sx + 1]) if (walk(x, y) && linksToCave(nb, e.slot, [[x, y]], walk, e.open)) { hit = { sx, y0: a, y1: b, dir, sky: false }; break; }
      // 接上洞穴的豎井也不得碰到 surfaceBan（洞穴可能就在表層錨點正下方）；碰到就換下一欄
      if (hit) { if (!boxHits(shaftPart(hit), e.ban)) return hit; break; }
    }
  }
  return null;
}
// 挖豎井：BpGrid 往上 / 下加高到包住豎井（寬不變），豎井兩欄挖空、清液體。繩梯：往上的豎井從頂（通地表時是地表上一列的下一列）垂到豎井底，
// 再沿 sx 欄往下穿過底下的空氣格（air 為真、y < end）直到腳下實心；往下的豎井從洞腔地板上一格（豎井頂 − 1）垂到豎井底
export function digShaft(g: BpGrid, s: ShaftPlan, air: (x: number, y: number) => boolean, end: number): { g: BpGrid; y0: number; y1: number } {
  const y0 = Math.min(g.y, s.y0), y1 = Math.max(g.y + g.h, s.y1 + 1), n = new BpGrid(g.x, y0, g.w, y1 - y0);
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
    const f = g.getFg(x, y), w = g.getWall(x, y), l = g.getLiq(x, y);
    if (f !== KEEP) n.fg(x, y, f);
    if (w !== KEEP) n.wall(x, y, w);
    if (l !== KEEP) n.liq(x, y, l);
  }
  for (let y = s.y0; y <= s.y1; y++) for (const x of [s.sx, s.sx + 1]) { n.fg(x, y, T.AIR); n.liq(x, y, 0); }
  if (s.dir < 0) {
    for (let y = s.sky ? s.y0 + 1 : s.y0; y <= s.y1; y++) n.fg(s.sx, y, T.ROPE);
    for (let y = s.y1 + 1; y < end && y < g.y + g.h && air(s.sx, y); y++) {
      n.fg(s.sx, y, T.ROPE);
      if (y + 1 >= g.y + g.h || SOLID_LUT[g.getFg(s.sx, y + 1)] === 1) break;
    }
  } else {
    for (let y = s.y0 - 1; y <= s.y1; y++) n.fg(s.sx, y, T.ROPE);
  }
  return { g: n, y0, y1 };
}

// 隧道（主洞室接不上洞穴時）：從下到上試主洞室的每一列地板（floorOf），由那一列最左 / 最右的地板格往外挖 4 列高（地板列在底）的隧道，
// 外框跟著延伸；隧道口那一欄的 4 列裡 ≥ CAVE_MIN 格走得過、其中一格屬於夠大的洞穴就停。外框在 [room.x0, room.x1) 內（room 已經扣掉寬度上限）。
// 夠大 = 那塊洞穴（舊外框內走 pass、外面走天然洞穴；範圍同 linksToCave）在 room × 外框列之外 ≥ CAVE_BIG 格——用最寬可能的外框算，
// 所以不管隧道挖多長、最後的外框外都至少有那麼多格；每塊洞穴只洪水填充一次。找到 → 挖開、回新的外框 x 範圍；都不行 → null（不挖）
export function digTunnel(g: BpGrid, box: { x: number; y: number; w: number; h: number }, room: Span, floorOf: (x: number, y: number) => boolean,
  pass: (x: number, y: number) => boolean, open: (x: number, y: number) => boolean, slot: Span): { x0: number; x1: number } | null {
  const bx0 = box.x, bx1 = box.x + box.w, y0 = box.y - REACH_UP, y1 = box.y + box.h + REACH_DOWN;
  // 範圍同 linksToCave（槽 ∩ 舊外框左右 REACH_X 欄；隧道只會讓外框變寬，所以新外框的範圍一定包住它）
  const xl = Math.max(slot.x0, bx0 - REACH_X), xr = Math.min(slot.x1, bx1 + REACH_X);
  const walk = (x: number, y: number): boolean => x >= xl && x < xr && y >= y0 && y < y1 && (x >= bx0 && x < bx1 && y >= box.y && y < box.y + box.h ? pass(x, y) : open(x, y));
  const far = (x: number, y: number): boolean => x < room.x0 || x >= room.x1 || y < box.y || y >= box.y + box.h;
  // 洞穴塊的標號（懶算）：格 → 塊號；big[塊號] = 夠大
  const label = new Map<number, number>(), big: boolean[] = [];
  const isBig = (x: number, y: number): boolean => {
    if (!walk(x, y)) return false;
    const k0 = x * 4096 + y, id0 = label.get(k0);
    if (id0 !== undefined) return big[id0];
    const id = big.length, st = [x, y];
    let n = far(x, y) ? 1 : 0;
    label.set(k0, id);
    while (st.length) {
      const cy = st.pop()!, cx = st.pop()!;
      for (let d = 0; d < 8; d += 2) {
        const nx = cx + DIRS[d], ny = cy + DIRS[d + 1];
        const k = nx * 4096 + ny;
        if (label.has(k) || !walk(nx, ny)) continue;
        label.set(k, id); st.push(nx, ny);
        if (far(nx, ny)) n++;
      }
    }
    big.push(n >= CAVE_BIG);
    return n >= CAVE_BIG;
  };
  // 由下往上試（地板低的先：隧道貼著洞腔底；蜂巢就是貼著蜂蜜面，不會從頂上掉進蜂蜜）
  for (let fy = box.y + box.h - 2; fy >= box.y + TUNNEL_H; fy--) {
    let l = Infinity, r = -Infinity;
    for (let x = bx0; x < bx1; x++) if (floorOf(x, fy)) { l = Math.min(l, x); r = Math.max(r, x); }
    if (!Number.isFinite(l)) continue;
    for (const dir of [-1, 1] as const) {
      const from = dir < 0 ? l : r;
      for (let x = from + dir; dir < 0 ? x >= room.x0 : x < room.x1; x += dir) {
        // 隧道挖到 x（含）；隧道口 = x + dir（可能還在外框的 KEEP 邊上，那裡是天然格）
        const mouth = x + dir;
        if (mouth < slot.x0 || mouth >= slot.x1) break;
        let n = 0, hit = false;
        for (let y = fy - TUNNEL_H + 1; y <= fy; y++) if (walk(mouth, y)) { n++; hit ||= isBig(mouth, y); }
        if (n < CAVE_MIN || !hit) continue;
        for (let tx = from + dir; tx !== x + dir; tx += dir) for (let y = fy - TUNNEL_H + 1; y <= fy; y++) { g.fg(tx, y, T.AIR); g.liq(tx, y, 0); }
        return { x0: Math.min(bx0, x), x1: Math.max(bx1, x + 1) };
      }
    }
  }
  return null;
}
