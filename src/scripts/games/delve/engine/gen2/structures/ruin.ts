// ruin.ts — gen2 地表遺跡（照舊生成器的形狀）：寬 12–18、高 7–9 的石磚殘屋，一側坍塌，底 = 寬度內地表平均；
// 起伏 > 5 或雪原就不放（回 null）。外框 = 屋子左右各多 1 欄：底以上清空、底以下到地表補該生態的土，箱子（'ruin'）、陶罐。
// 地面覆寫（ground）：外框每欄的地面 = 底（屋子的石磚牆 / 屋頂是建物、不是地面）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { BIOME } from '../../world';
import { HRng } from '../hrng';
import { BpGrid, placeX, emptyObjects, BP_SURFACE, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';
import { gridFloors } from './shrine';

const MAX_ROUGH = 5;

// force（P11）：無視起伏 / 雪原門檻，地基補土整平（底以上的地面也清掉）
export function buildRuin(c: BpCtx, o: { force?: boolean } = {}): Blueprint | null {
  // ctx.ver 0 的規則
  const force = o.force === true, p = c.profile, biome = c.region.biome;
  if (!force && biome === BIOME.SNOW) return null;
  const rng = new HRng(c.s, c.id);
  const w = rng.int(12, 19), h = rng.int(7, 10);
  // 外框 x = bx 時的底與起伏（屋子在 [bx + 1, bx + 1 + w)）
  const baseAt = (bx: number): { base: number; rough: number } => {
    let sum = 0, rough = 0;
    for (let x = bx + 1; x <= bx + w; x++) sum += p.surfaceAt(x);
    const base = Math.round(sum / w);
    for (let x = bx + 1; x <= bx + w; x++) rough = Math.max(rough, Math.abs(p.surfaceAt(x) - base));
    return { base, rough };
  };
  const bx = placeX(c, w + 2, force, (x) => baseAt(x).rough <= MAX_ROUGH);
  if (bx === null) return null;
  const { base } = baseAt(bx), x = bx + 1, bw = w + 2;
  let sMin = p.height, sMax = 0;
  for (let xx = bx; xx < bx + bw; xx++) { const s = p.surfaceAt(xx); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); }
  const top = Math.min(base - h - 2, sMin), bottom = Math.max(base + 1, sMax);
  const g = new BpGrid(bx, top, bw, bottom - top);
  const soil = biome === BIOME.DESERT ? T.SAND : biome === BIOME.JUNGLE ? T.MUD : T.DIRT;

  // 底以上清空、底到地表之間補土
  for (let xx = bx; xx < bx + bw; xx++) {
    const s = p.surfaceAt(xx);
    for (let yy = top; yy < base; yy++) { g.fg(xx, yy, T.AIR); g.liq(xx, yy, 0); }
    for (let yy = base; yy < s; yy++) { g.fg(xx, yy, soil); g.liq(xx, yy, 0); }
  }
  // 石磚殘屋：坍塌側（右）高度往右遞減；左牆底部留 3 格門洞；外殼偶爾缺磚、內部 80% 石牆
  const roof = base - h;
  const breakAt = x + Math.floor(w * (0.45 + 0.25 * rng.next()));
  for (let xx = x; xx < x + w; xx++) {
    g.fg(xx, base, T.STONE_BRICK);
    const keep = xx < breakAt ? h : Math.max(1, Math.floor(h * (1 - (xx - breakAt + 1) / (x + w - breakAt + 1))) - rng.int(0, 3));
    for (let yy = base - 1; yy >= roof; yy--) {
      if (base - yy > keep) break;
      const shell = xx === x || xx === x + w - 1 || yy === roof;
      if (shell && !(xx === x && yy >= base - 3) && !rng.chance(8)) g.fg(xx, yy, T.STONE_BRICK);
      if (!shell && rng.next() < 0.8) g.wall(xx, yy, W.STONE_WALL);
    }
  }
  const cx = x + 2 + rng.int(0, Math.max(1, Math.floor(w / 2) - 2));
  g.fg(cx, base - 1, T.CHEST);
  for (let k = 0; k < 2; k++) {
    const px = rng.int(x + 1, x + w - 1);
    if (g.getFg(px, base - 1) === T.AIR) g.fg(px, base - 1, T.POT);
  }
  // 地標（M2a Task 14，舊生成器 landmarks.ts）：守望石像（T.GUARDIAN_STATUE、site 'ruin'），屋內地板（底上一列）離屋子中央最近、
  // 頭頂空氣、左右不是箱子的空氣格（平手取左邊的；不吃亂數）；floors = 其餘站得住的地板格
  const mid = x + (w >> 1), fy = base - 1, landmarks: BpLandmark[] = [];
  for (let d = 0; d <= w >> 1 && !landmarks.length; d++) for (const xx of [mid - d, mid + d]) {
    if (xx < x || xx >= x + w || g.getFg(xx, fy) !== T.AIR || g.getFg(xx, fy - 1) !== T.AIR || xx - 1 === cx || xx + 1 === cx) continue;
    g.fg(xx, fy, T.GUARDIAN_STATUE); landmarks.push({ x: xx, y: fy, tile: T.GUARDIAN_STATUE, site: 'ruin' }); break;
  }
  return { id: c.id, kind: 'ruin', layer: BP_SURFACE, x: bx, y: top, w: bw, h: bottom - top, cells: g.cells(), chests: [{ x: cx, y: base - 1, kind: 'ruin' }],
    ...emptyObjects(), landmarks, floors: gridFloors(g, x, x + w, fy), ground: { x0: bx, tops: new Int16Array(bw).fill(base) } };
}
