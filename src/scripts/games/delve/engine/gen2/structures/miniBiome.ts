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
//   · 一定走得進去（Task 11 延續事項）：從主洞室走「藍圖的非實心格 ∪ 藍圖沒畫的天然洞穴」（linksToCave），走到外框外的天然洞穴 ≥ CAVE_BIG 格才算接上
//     （小氣泡不算；範圍只到自己的槽與外框上 80 / 下 40 列，同礦坑）。接不上 → digTunnel：從主洞室最左 / 最右的地板往外挖 4 列高的隧道到接上洞穴；
//     這個 y 都不行 → 換下一個 y。全部不行 → 錨點：天然洞穴最少的 y 照樣畫（不保證接得上；minibiome.test 的 200 個家鄉釘住沒有發生）；槽位表：不放。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, SOLID_LUT } from '../../tiles';
import { hash2, fbm2 } from '../../noise';
import type { ColumnLayers } from '../../column';
import { HRng } from '../hrng';
import { CaveProbe } from '../caves';
import { LAVA_Y, type Profile2 } from '../profile';
import { BpGrid, placeX, clearRange, emptyObjects, BP_UNDER, BP_DEEP, KEEP, type Blueprint, type BpCtx, type BpLandmark, type Span } from '../bpcore';

// 試幾個中心 y、E 內天然洞穴的比例上限（舊生成器 0.45）
const OPEN_TRIES = 8, OPEN_MAX = 0.45;
// 接到的洞穴至少這麼多格；探測範圍：左右到槽邊、外框上 REACH_UP 列、下 REACH_DOWN 列（同礦坑）
export const CAVE_BIG = 300;
const REACH_UP = 80, REACH_DOWN = 40;
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
// 範圍 x ∈ [span.x0, span.x1)、y ∈ [box.y − REACH_UP, box.y + box.h + REACH_DOWN)。外框外走到 ≥ CAVE_BIG 格 = 接上
export function linksToCave(box: { x: number; y: number; w: number; h: number }, span: Span, starts: readonly (readonly [number, number])[],
  inside: (x: number, y: number) => boolean, open: (x: number, y: number) => boolean): boolean {
  const y0 = box.y - REACH_UP, y1 = box.y + box.h + REACH_DOWN;
  const inBox = (x: number, y: number): boolean => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  const seen = new Set<number>(), st: number[] = [];
  for (const [x, y] of starts) { const k = x * 4096 + y; if (!seen.has(k)) { seen.add(k); st.push(x, y); } }
  let out = 0;
  while (st.length) {
    const cy = st.pop()!, cx = st.pop()!;
    for (let d = 0; d < 8; d += 2) {
      const nx = cx + DIRS[d], ny = cy + DIRS[d + 1];
      const k = nx * 4096 + ny;
      if (seen.has(k) || nx < span.x0 || nx >= span.x1 || ny < y0 || ny >= y1) continue;
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
  const bx = placeX(c, bw, o.force === true, (x) => { const s = spanAt(x); return s.hi >= s.lo; });
  if (bx === null) return null;
  const { lo, hi } = spanAt(bx), cx = bx + rx, open = naturalOpen(c, o);
  const rx2 = rx * rx, ry2 = ry * ry, rr = rx2 * ry2, salt = (c.s ^ Math.imul(c.id, 0x2545f491)) | 0;
  const room = clearRange(c, bx, bw), gx0 = Math.max(room.x0, bx + bw - sp.maxW), gx1 = Math.min(room.x1, bx + sp.maxW);
  const slot = { x0: c.slotX0, x1: c.slotX1 };

  // 中心 y = cy 時畫出整個小生態；主洞室接不上洞穴（天然或隧道）時回 null（force = 照樣回）
  const draw = (cy: number, force: boolean): Blueprint | null => {
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
    const g = new BpGrid(gx0, by, gx1 - gx0, bh);
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
    // 走得進去：主洞室接上外框外的天然洞穴；不行就從主洞室的地板挖隧道
    const box = { x: bx, y: by, w: bw, h: bh };
    let x0 = bx, x1 = bx + bw;
    if (!linksToCave(box, slot, [seed], pass, open)) {
      const t = digTunnel(g, box, { x0: gx0, x1: gx1 }, (x, y) => inMain(x, y) && airE(x, y) && solidE(x, y + 1), pass, open, slot);
      if (!t && !force) return null;
      if (t) { x0 = t.x0; x1 = t.x1; }
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
    return { id: c.id, kind: sp.kind, layer: sp.layer, x: x0, y: by, w: x1 - x0, h: bh, cells: g.cells(), chests: [], ...emptyObjects(), landmarks };
  };

  // 中心 y：依雜湊起點試 OPEN_TRIES 個（黃金比例步長）。E（不加雜湊的橢圓、每 2 格取樣）內天然洞穴 ≤ 45% 的依序畫，第一個接得上洞穴的就是；
  // 都不行 → 錨點：天然洞穴最少的那個照樣畫（不保證接得上；minibiome.test 的 200 個家鄉釘住沒有發生）；槽位表：不放
  if (hi < lo) return o.force ? draw(lo, true) : null;
  let best = lo, bestF = Infinity;
  for (let t = 0; t < OPEN_TRIES; t++) {
    const f = fy + t * 0.381966, y = lo + Math.floor((f - Math.floor(f)) * (hi - lo + 1));
    let n = 0, holes = 0;
    for (let dy = -ry; dy <= ry; dy += 2) for (let dx = -rx; dx <= rx; dx += 2) if (dx * dx * ry2 + dy * dy * rx2 <= rr) { n++; if (open(cx + dx, y + dy)) holes++; }
    const frac = holes / n;
    if (frac < bestF) { bestF = frac; best = y; }
    if (frac > OPEN_MAX) continue;
    const b = draw(y, false);
    if (b) return b;
  }
  return o.force ? draw(best, true) : null;
}

// 隧道（主洞室接不上洞穴時）：從上到下試主洞室的每一列地板（floorOf），由那一列最左 / 最右的地板格往外挖 4 列高（地板列在底）的隧道，
// 外框跟著延伸；隧道口那一欄的 4 列裡 ≥ CAVE_MIN 格走得過、其中一格屬於夠大的洞穴就停。外框在 [room.x0, room.x1) 內（room 已經扣掉寬度上限）。
// 夠大 = 那塊洞穴（舊外框內走 pass、外面走天然洞穴；範圍同 linksToCave）在 room × 外框列之外 ≥ CAVE_BIG 格——用最寬可能的外框算，
// 所以不管隧道挖多長、最後的外框外都至少有那麼多格；每塊洞穴只洪水填充一次。找到 → 挖開、回新的外框 x 範圍；都不行 → null（不挖）
export function digTunnel(g: BpGrid, box: { x: number; y: number; w: number; h: number }, room: Span, floorOf: (x: number, y: number) => boolean,
  pass: (x: number, y: number) => boolean, open: (x: number, y: number) => boolean, slot: Span): { x0: number; x1: number } | null {
  const bx0 = box.x, bx1 = box.x + box.w, y0 = box.y - REACH_UP, y1 = box.y + box.h + REACH_DOWN;
  const walk = (x: number, y: number): boolean => x >= slot.x0 && x < slot.x1 && y >= y0 && y < y1 && (x >= bx0 && x < bx1 && y >= box.y && y < box.y + box.h ? pass(x, y) : open(x, y));
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
  for (let fy = box.y + TUNNEL_H; fy < box.y + box.h - 1; fy++) {
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
