// dungeon.ts — gen2 家鄉地城（M2a Task 8；spec §4.4「地城在一端海灘內 ≥ 25 個房間且有召喚 / 鑰匙內容」）。
// 地城區（VARIANT.DUNGEON，420 寬）的 wholeRegion 錨點（Q2）：畫圖是與舊生成器共用的 draw/dungeon.ts（generateDungeonOn），
// 畫在 BpCanvas 上再輸出藍圖（排序距離用預設的平方距離）。
//   · 預留區 zone = 地城區扣掉對著沙灘那側 4 格；y0 = max(2, 區內最高地表 − 40)、
//     y1 = min(LAVA_Y − 60, max(區內最大 rock + 40, 區內最小 deep + floor((區內最小 molten − 區內最小 deep) × 0.32)))（舊 worldgen 的規則改用區內極值）。
//   · 顏色 = DUNGEON_COLORS[雜湊 % 3]；古碑 id 依位置固定（LORE_SITES：塔 6、神殿 7、寶藏室 12）。
//   · 召喚 / 鑰匙內容與舊地城相同（Q20a，都在 draw/dungeon.ts）：陶罐 / 箱子裡的地城鑰匙、上鎖神殿裡的金鑰匙、
//     上鎖的金寶箱（BpChest 'treasure' + fg T.LOCKED_CHEST；寶藏表有金礦 20–36，wick_offering 的 3 金錠要 12）。
//   · BpCanvas 的回退讀取假設天然格是實心、沒有洞穴：畫圖時依賴實心的格子（塔周圍整平帶 cx ± 34 × [gy, gy + 8)）
//     以及地城外框從區內最高地表往下整片，都併進 solid（fill.ts 在 solid 內不挖噪聲洞穴、不當地表入口；礦照常換）。
//     solid 不會填天空（fill.ts 只寫地表以下），入口（塔、整平帶上方的空氣、入口豎井）靠 stamp 覆寫。
//   · 外框 = 實際畫到的範圍（格子、solid、ground、物件）；格子依欄排序並建 colIndex（stamp 只掃該欄）。
//   · 8 次規劃都失敗就用 minConnected 5 再試；仍失敗丟 RangeError（測試證明 50 個種子都不會發生）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, SOLID_LUT, DUNGEON_COLORS } from '../../tiles';
import { seedInt } from '../../noise';
import { LORE_SITES } from '../../lore';
import type { ReservedZone } from '../../genTypes';
import { LAVA_Y } from '../profile';
import { VARIANT } from '../layout';
import { BpCanvas } from '../draw/bpCanvas';
import { generateDungeonOn } from '../draw/dungeon';
import { BP_SURFACE, indexColumns, type Blueprint, type BpCtx, type BpTablet } from '../bpcore';

// 對著沙灘那側留的格數
const BEACH_GAP = 4;
// 畫布在 zone.y1 以下多留（走廊 / 磚殼最多到 zone.y1 + 4、天然岩層回填最多到 zone.y1 + 14）
const BELOW = 20;
// 塔周圍整平帶（draw/dungeon.ts：x ∈ cx ± 34、需要左右鄰欄在畫布內；y ∈ [gy − 40, gy + 8)）
const LEVEL_HALF = 34, LEVEL_UP = 40, LEVEL_DOWN = 8;

export function buildDungeonBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, r = c.region;
  const beachWest = p.regionAt(r.x0 - 1)?.variant === VARIANT.BEACH;
  const zx0 = r.x0 + (beachWest ? BEACH_GAP : 0), zx1 = r.x1 - (beachWest ? 0 : BEACH_GAP);
  let sMin = p.height, rMax = 0, dMin = p.height, mMin = p.height;
  for (let x = zx0; x < zx1; x++) {
    const I = p.info(x);
    sMin = Math.min(sMin, I.surface); rMax = Math.max(rMax, I.rock); dMin = Math.min(dMin, I.deep); mMin = Math.min(mMin, I.molten);
  }
  const zone: ReservedZone = {
    x0: zx0, x1: zx1, y0: Math.max(2, sMin - LEVEL_UP),
    y1: Math.min(LAVA_Y - 60, Math.max(rMax + 40, dMin + Math.floor((mMin - dMin) * 0.32))), side: beachWest ? 'left' : 'right',
  };
  const cv = new BpCanvas({ x: zone.x0, y: zone.y0, w: zone.x1 - zone.x0, h: zone.y1 + BELOW - zone.y0 }, p);
  const color = DUNGEON_COLORS[(seedInt(c.seed, `g2-dungeon-color:${c.id}`) >>> 0) % DUNGEON_COLORS.length];
  const opts = { seed: `${c.seed}:g2-dungeon:${c.id}`, zone, surfaceAt: (x: number) => p.surfaceAt(x), height: p.height, color, natural: true };
  // 規劃失敗時不會畫任何格（generateDungeonOn 只在規劃成功後施工），同一張畫布可以再試
  const info = generateDungeonOn(cv, opts) ?? generateDungeonOn(cv, { ...opts, minConnected: 5 });
  if (!info) throw new RangeError(`gen2: home dungeon ${c.id} has no plan`);

  const cx = info.entrance.x - 4, gy = info.entrance.y + 1;
  // 整平帶要整段在畫布內（左右鄰欄也在），否則 draw/dungeon.ts 會默默跳過那幾欄
  if (!cv.inBounds(cx - LEVEL_HALF - 1, gy - LEVEL_UP) || !cv.inBounds(cx + LEVEL_HALF + 1, gy + LEVEL_DOWN)) {
    throw new RangeError(`gen2: home dungeon ${c.id} leveling band outside its canvas`);
  }
  // 整平帶 [gy, gy + 8) 與地城外框從區內最高地表往下：併進 solid（BpBox 是外接矩形，兩個角就夠）
  cv.fillNatural(cx - LEVEL_HALF, gy); cv.fillNatural(cx + LEVEL_HALF, gy + LEVEL_DOWN - 1);
  let top = gy;
  for (let x = info.bbox.x; x < info.bbox.x + info.bbox.w; x++) top = Math.min(top, p.surfaceAt(x));
  cv.fillNatural(info.bbox.x, top); cv.fillNatural(info.bbox.x + info.bbox.w - 1, top);

  const tablets: BpTablet[] = info.tablets.map((t) => ({ x: t.x, y: t.y, id: LORE_SITES.indexOf(`dungeon_${t.site}`) }));
  const floors: { x: number; y: number }[] = [];
  for (const q of info.rooms) {
    const fy = q.y + q.h - 1;
    for (let x = q.x; x < q.x + q.w; x++) if (cv.fg(x, fy) === T.AIR && SOLID_LUT[cv.fg(x, fy + 1)] === 1) floors.push({ x, y: fy });
  }
  const bp = cv.toBlueprint(c.id, 'dungeon', BP_SURFACE, { tablets, floors, site: { kind: 'dungeon', key: 's' + c.id, rot: 0, info } });
  const { cells, colIndex } = indexColumns(bp.cells);
  return { ...bp, ...drawnBox(bp), cells, colIndex, wholeRegion: true };
}

// 實際畫到的範圍：格子、solid、ground 的欄、箱子 / 陶罐 / 古碑（都在畫布內；structures/keep.ts 共用）
export function drawnBox(bp: Blueprint): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number, w = 1, h = 1): void => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  const c = bp.cells;
  for (let k = 0; k < c.length; k += 5) add(c[k], c[k + 1]);
  if (bp.solid) add(bp.solid.x, bp.solid.y, bp.solid.w, bp.solid.h);
  if (bp.ground) for (let k = 0; k < bp.ground.tops.length; k++) add(bp.ground.x0 + k, bp.ground.tops[k]);
  for (const o of [...bp.chests, ...bp.pots, ...bp.tablets]) add(o.x, o.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
