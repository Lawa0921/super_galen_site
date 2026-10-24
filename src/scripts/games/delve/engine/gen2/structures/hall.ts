// hall.ts — gen2 矮人地廳（M2a Task 9；spec §4.4「至少 1 座矮人廳」）：家鄉的 hall 錨點建構器（DEEP 層）。
// 畫圖是與舊生成器共用的 draw/hall.ts（drawHall），畫在 BpCanvas 上再輸出藍圖：
//   · 內部寬 hw ∈ [60, 78)，大廳置中於可用範圍（c.slotX0 / slotX1 ≥ ANCHOR_MAX_W.hall + 2 × SLOT_PAD = 170，置中一定放得下）。
//   · floorY ∈ [max(deep + 24) + 13, min(molten − 26))，極值取「隧道最長時的外框」各欄（實際外框是它的子集）。
//   · 兩側軌道隧道各 TUNNEL_MIN–TUNNEL_MAX（20–36）格，固定長度（外框 ≤ 77 + 4 + 2 × 36 = 153 ≤ ANCHOR_MAX_W.hall 154）。
//     spec「通往附近洞穴」：舊生成器逐欄掃已生成的格找洞穴；gen2 改用噪聲探針（caves.CaveProbe，與 fill.ts 同一份判定、只依 seed 與側寫，局部可算）：
//     每側取最短的長度 n，使隧道口外那一欄（外框外第一欄）隧道的 4 列裡有 ≥ 3 格天然洞穴；floorY 從雜湊起點往下（繞回）試完整個範圍，
//     先找兩側都接得到洞穴的列，沒有就取第一個接得到一側的列。
//     隧道口外那一欄在外框外，solid 管不到它，fill 照噪聲挖開，所以隧道真的通到那個洞穴（測試從大廳走到外框外）。
//     整個範圍都接不到洞穴（後備，實測 300 個種子沒有發生）：floorY 用起點、兩側 36 格，另外在大廳中央往上鑿一條 2 格寬的豎井到地表、
//     掛繩梯（T.ROPE，從地表垂到地板上一格），外框往上延伸到地表上一格（豎井在外框內、整個外框仍是 solid）——地廳一定走得到。
//   · BpCanvas 的回退讀取假設天然格是實心、沒有洞穴：drawHall 只在「讀到不是實心」時才補隧道的地板（floorY）與頂（floorY − 5）
//     → 外框整片併進 solid（箱內不挖噪聲洞穴，地板 / 頂在成品裡是天然岩；礦照常換）。
//   · 礦車地標（T.ORE_CART、site 'dwarf_hall'）；site = { kind: 'hall', key: 's' + id, rot, info }（rot = c.rank，外圍 0）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { CaveProbe } from '../caves';
import { BpCanvas } from '../draw/bpCanvas';
import { drawHall, HALL_IH } from '../draw/hall';
import { BP_DEEP, type Blueprint, type BpCtx } from '../bpcore';

export const TUNNEL_MIN = 20, TUNNEL_MAX = 36;
// 外殼在內部兩側各 2 欄、上 3 列、下 2 列（draw/hall.ts）；隧道從內部外 3 欄起
const SHELL = 2, SHELL_UP = 3, SHELL_DOWN = 2, MOUTH = 3;
// 地板離 deep 至少 24 + 室內高 + 2、離 molten 至少 26（舊生成器的規則）
const DEEP_GAP = 24, MOLTEN_GAP = 26;
// 後備豎井的寬
const SHAFT_W = 2;

// 天然洞穴的判定（預設 CaveProbe；測試注入「全部不通」來走後備豎井）
export interface HallOptions { caveOpen?: (x: number, y: number) => boolean }

export function buildHallBp(c: BpCtx, o: HallOptions = {}): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id);
  const hw = rng.int(60, 78), fu = rng.next();
  const x0 = c.slotX0 + ((c.slotX1 - c.slotX0) >> 1) - (hw >> 1), x1 = x0 + hw - 1;
  // 隧道最長時的外框 [x0 − 2 − 36, x1 + 2 + 36] 各欄的極值
  let top = 0, bot = p.height;
  for (let x = x0 - SHELL - TUNNEL_MAX; x <= x1 + SHELL + TUNNEL_MAX; x++) {
    const L = p.layersAt(x);
    top = Math.max(top, L.deep + DEEP_GAP + HALL_IH + 2); bot = Math.min(bot, L.molten - MOLTEN_GAP);
  }
  if (bot <= top) throw new RangeError(`gen2: hall ${c.id} has no room between deep and molten (${top}, ${bot})`);

  // 隧道口外那一欄（隧道 n 格時）有 ≥ 3 格天然洞穴的最短 n；沒有 = 0
  const probe = new CaveProbe(c.seed), caveOpen = o.caveOpen ?? ((x: number, y: number): boolean => probe.open(x, y, p.info(x)));
  const reach = (floorY: number, dir: -1 | 1): number => {
    const sx = dir < 0 ? x0 - MOUTH : x1 + MOUTH;
    for (let n = TUNNEL_MIN; n <= TUNNEL_MAX; n++) {
      const x = sx + dir * n;
      let open = 0;
      for (let y = floorY - 4; y < floorY; y++) if (caveOpen(x, y)) open++;
      if (open >= 3) return n;
    }
    return 0;
  };
  const span = bot - top, start = Math.floor(fu * span);
  let pick: { floorY: number; l: number; r: number } | null = null;
  for (let t = 0; t < span; t++) {
    const floorY = top + ((start + t) % span), l = reach(floorY, -1), r = reach(floorY, 1);
    if (l && r) { pick = { floorY, l, r }; break; }
    if ((l || r) && !pick) pick = { floorY, l: l || TUNNEL_MAX, r: r || TUNNEL_MAX };
  }
  const { floorY, l, r } = pick ?? { floorY: top + start, l: TUNNEL_MAX, r: TUNNEL_MAX };

  // 後備豎井：大廳中央 [sx, sx + 2)、從兩欄地表較高者的上一格往下
  const sx = (x0 + x1) >> 1, top0 = pick ? Infinity : Math.min(p.surfaceAt(sx), p.surfaceAt(sx + 1)) - 1;
  const bx = x0 - MOUTH - l + 1, bw = x1 + MOUTH + r - bx, hy = floorY - HALL_IH - SHELL_UP, by = Math.min(hy, top0), bh = floorY + SHELL_DOWN + 1 - by;
  const cv = new BpCanvas({ x: bx, y: by, w: bw, h: bh }, p);
  const info = drawHall(cv, { x0, hw, floorY }, rng, (dir) => (dir < 0 ? l : r));
  if (!pick) {
    for (let y = top0; y < info.y0; y++) for (let x = sx; x < sx + SHAFT_W; x++) { cv.setFg(x, y, T.AIR); cv.clearLiquid(x, y); }
    for (let y = top0 + 1; y <= floorY - 2; y++) cv.setFg(sx, y, T.ROPE);
  }
  cv.fillNatural(bx, by); cv.fillNatural(bx + bw - 1, by + bh - 1);
  return cv.toBlueprint(c.id, 'hall', BP_DEEP, {
    landmarks: [{ x: info.cart.x, y: info.cart.y, tile: T.ORE_CART, site: 'dwarf_hall' }],
    site: { kind: 'hall', key: 's' + c.id, rot: c.rank ?? 0, info },
  });
}
