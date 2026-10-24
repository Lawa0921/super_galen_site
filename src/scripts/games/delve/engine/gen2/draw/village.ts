// village.ts — NPC 地表村落的畫圖（舊生成器 legacy/gen/settlements.ts 搬過來，舊生成器與 gen2 共用；選址留在呼叫端）：
// 整平地面（含兩側 9 欄的緩坡）→ 2～3 棟木骨灰泥 + 茅草屋頂的小屋（門、窗、床、桌椅、光源、木板背景牆）
// → 中央廣場（委託板、燈柱、木桶、長椅）→ 村子兩端的高旗桿（桿頂燈 + 大村旗）+ 短圍欄。
// 亂數只有住家的盆栽（每棟 home 一次 chance(2)），抽取順序與舊生成器相同。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import type { VillageHouse, VillageInfo } from '../../genTypes';
import type { Canvas, RandomLike } from './canvas';

// x0 = 村子左端欄、vw = 寬（x1 = x0 + vw − 1）、ground = 整平後的地面列、style = 旗色
export function drawVillage(cv: Canvas, o: { x0: number; vw: number; ground: number; style: number }, rng: RandomLike): VillageInfo {
  const { x0, vw, ground, style } = o, x1 = x0 + vw - 1;
  // ── 整平（含兩側 9 欄的緩坡） ──
  const shape = (x: number, top: number): void => {
    const s0 = cv.surfaceAt(x);
    for (let y = Math.max(1, Math.min(ground, top) - 28); y < top; y++) { cv.setFg(x, y, T.AIR); cv.setWall(x, y, W.NONE); cv.clearLiquid(x, y); }
    // 補低：一路填到原本的地表下面（窪地整平後底下不會是空的）
    for (let y = top; y < Math.max(top + 6, s0 + 3); y++) if (!cv.isSolid(x, y)) cv.setFg(x, y, T.DIRT);
    cv.setFg(x, top, T.GRASS);
    cv.setSurface(x, top);
  };
  for (let x = x0; x <= x1; x++) shape(x, ground);
  for (let k = 1; k <= 9; k++) {
    for (const x of [x0 - k, x1 + k]) {
      if (!cv.inBounds(x, ground)) continue;
      const s = cv.surfaceAt(x);
      shape(x, ground + Math.trunc(((s - ground) * k) / 10));
    }
  }
  // ── 房子 ──
  // 版面：兩端各留 8 欄（旗桿 + 圍欄）；[左邊的房子] 2 [廣場 12] 2 [右邊的房子]，房子之間隔 2 欄，整排置中
  const nh = vw >= 66 ? 3 : 2, left = Math.ceil(nh / 2), right = nh - left, plazaW = 12;
  const fixed = (left - 1) * 2 + (right - 1) * 2 + 4 + plazaW;
  const hw = Math.max(9, Math.min(13, Math.floor((vw - 16 - fixed) / nh)));
  const total = nh * hw + fixed;
  let cur = x0 + 8 + Math.max(0, (vw - 16 - total) >> 1);
  const roles: VillageHouse['role'][] = nh === 3 ? ['shop', 'elder', 'home'] : ['shop', 'elder'];
  const houses: VillageHouse[] = [];
  const slots: number[] = [];
  for (let i = 0; i < left; i++) { slots.push(cur); cur += hw + 2; }
  const plaza0 = cur, plaza1 = plaza0 + plazaW - 1;
  cur = plaza1 + 3;
  for (let i = 0; i < right; i++) { slots.push(cur); cur += hw + 2; }
  slots.forEach((hx0, i) => {
    const hx1 = hx0 + hw - 1, floorY = ground;
    const door = hx0 > plaza1 ? hx0 : hx1; // 門朝廣場
    const role = roles[i] ?? 'home';
    buildHouse(cv, hx0, hx1, floorY, door, role, rng);
    houses.push({ x0: hx0, x1: hx1, floorY, door, role });
  });
  // ── 廣場：委託板、燈柱、木桶、長椅 ──
  const bx = (plaza0 + plaza1) >> 1;
  cv.setFg(bx, ground - 1, T.QUEST_BOARD);
  cv.setFg(plaza0 + 1, ground - 1, T.LANTERN_POST);
  cv.setFg(plaza1 - 1, ground - 1, T.LANTERN_POST);
  cv.setFg(bx + 3, ground - 1, T.BENCH);
  cv.setFg(bx - 3, ground - 1, T.BARREL);
  cv.setFg(bx - 4, ground - 1, T.BARREL);
  cv.setFg(bx - 4, ground - 2, T.BARREL);
  // ── 旗桿（14 格高 + 桿頂燈）+ 3×3 的大村旗（往村外飄）+ 短圍欄：遠遠就看得到，晚上桿頂的燈也亮著 ──
  for (const [fx, dir] of [[x0 + 1, -1], [x1 - 1, 1]] as const) {
    for (let k = 1; k <= 13; k++) cv.setFg(fx, ground - k, T.FLAGPOLE);
    cv.setFg(fx, ground - 14, T.FLAG_LAMP);
    const cx = dir < 0 ? fx - 3 : fx + 1;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) cv.setFg(cx + dx, ground - 13 + dy, T.FLAG_CLOTH);
  }
  for (const [a, b] of [[x0 + 3, x0 + 6], [x1 - 6, x1 - 3]] as const) for (let x = a; x <= b; x++) if (cv.fg(x, ground - 1) === T.AIR) cv.setFg(x, ground - 1, T.FENCE);
  return { x0, x1, ground, houses, board: { x: bx, y: ground - 1 }, style };
}

// 一棟村屋：木骨灰泥外牆、茅草三角屋頂、門朝廣場、另一側開窗；屋內木板背景牆 + 床 / 桌 / 椅 / 光源
export function buildHouse(cv: Canvas, x0: number, x1: number, floorY: number, door: number, role: VillageHouse['role'], rng: RandomLike): void {
  const ceil = floorY - 6; // 室內 5 格高
  for (let x = x0; x <= x1; x++) {
    cv.setFg(x, floorY, T.PLANKS);
    for (let y = ceil; y < floorY; y++) {
      const edge = x === x0 || x === x1 || y === ceil;
      cv.setFg(x, y, edge ? T.TIMBER : T.AIR);
      cv.setWall(x, y, W.PLANK_WALL);
    }
  }
  // 門（3 格）、窗
  for (let k = 1; k <= 3; k++) cv.setFg(door, floorY - k, T.DOOR_CLOSED);
  const winX = door === x0 ? x1 : x0;
  cv.setFg(winX, floorY - 3, T.GLASS);
  cv.setFg(winX, floorY - 4, T.GLASS);
  // 茅草屋頂：每列往內收一格（兩側各突出一格屋簷）
  for (let r = 0; ; r++) {
    const a = x0 - 1 + r, b = x1 + 1 - r, y = ceil - 1 - r;
    if (b - a < 1 || y < 2) break;
    for (let x = a; x <= b; x++) cv.setFg(x, y, T.THATCH);
  }
  // 家具（i = 從門口往裡數第幾格）：門口留空、椅子、桌子、（書架 / 盆栽）、最裡面是床；牆上火把
  const inner0 = x0 + 1, inner1 = x1 - 1, y = floorY - 1, n = inner1 - inner0 + 1;
  const at = (i: number): number => (door === x0 ? inner0 + i : inner1 - i);
  const bedX = Math.min(at(n - 1), at(n - 2));
  cv.setFg(bedX, y, T.BED_HEAD); cv.setFg(bedX + 1, y, T.BED_FOOT);
  cv.setFg(at(1), y, T.CHAIR);
  cv.setFg(at(2), y, T.TABLE);
  cv.setFg(at(3), floorY - 4, T.TORCH);
  if (role === 'elder') { const sx = at(4); cv.setFg(sx, y, T.BOOKSHELF); cv.setFg(sx, y - 1, T.BOOKSHELF); cv.setFg(sx, y - 2, T.CANDLE); }
  if (role === 'shop') {
    // 門外的木桶 + 屋簷下的布旗
    const out = door === x0 ? x0 - 2 : x1 + 2;
    cv.setFg(out, floorY - 1, T.BARREL);
    cv.setFg(door === x0 ? x0 - 1 : x1 + 1, ceil, T.BANNER);
  }
  if (role === 'home' && rng.chance(2)) cv.setFg(at(4), y, T.POTTED_PLANT);
}
