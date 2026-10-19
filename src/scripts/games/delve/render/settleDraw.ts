// settleDraw.ts — 據點的畫面圖層（Canvas2D，渲染器在固定的兩個點呼叫）：
//   · drawWorld：居民（和玩家同一套 Q 版紙娃娃：dollPreview，各自的外觀 / 時裝）走路 / 待機 / 睡在床上 + Zzz
//   · drawOverlay：查房模式（每間房間 1/4 密度的 Bayer 抖動填色：合格綠、不合格紅，房間外緣 1px 實線）、
//     放置預覽（手上方塊 / 家具的鬼影：棋盤格抖動，放不下 → 紅色棋盤框）
//   全部不透明像素（抖動代替半透明）、色票色。居民影格第一次畫到才烘（每種約 13 張 44×54）。
import type { DelveGame } from '../engine/game';
import type { Npc } from '../engine/settlement';
import { NPCS, type NpcKind } from '../engine/npcs';
import { scanRooms, type RoomCheck } from '../engine/housing';
import { isSolidTile, T } from '../engine/tiles';
import type { DollLook, DollPiece } from '../engine/doll';
import { dollKey } from '../engine/doll';
import { dollPreview } from './dollPreview';
import { AV_FH, AV_FW } from './avatarArt';
import { IDLE_FRAMES, WALK_FRAMES } from './anim';
import { Bmp, bayer, hex, toCanvas, type RGB } from './pixel';
import { CLOTH_RAMPS } from './avatarPalette';
import type { Atlas } from './textures';
import { TILE_SIZE } from '../engine/constants';

const S = TILE_SIZE;
const piece = (look: string | undefined): DollPiece | null => (look ? { look, rarity: 0, plus: 0, elem: null } : null);
/** 居民的紙娃娃樣子（純資料） */
export function npcLook(kind: NpcKind): DollLook {
  const l = NPCS[kind].look;
  return { app: l.app, head: piece(l.head), body: piece(l.body), legs: piece(l.legs), back: piece(l.back), feet: null, neck: l.neck ?? null, belt: l.belt ?? null };
}

export interface NpcFrames { idle: Bmp[]; blink: Bmp; walk: Bmp[]; sleep: Bmp; portrait: Bmp; }
/** 睡覺：閉眼那格的頭（第一個不透明列往下 SLEEP_HEAD 列）露在被子外 */
const SLEEP_HEAD = 25;
/** 睡覺的頭最寬幾 px（床 32px 寬，兩側留床頭板 / 床尾板） */
const SLEEP_MAX_W = 26;
/** 睡覺的頭在床上的位置：左邊靠床頭板內側（床頭 tile x + 4） */
export function sleepHeadX(bedX: number, headW: number): number { return bedX + 4 + Math.max(0, Math.floor((SLEEP_MAX_W - headW) / 2) - 6); }
/** 一位居民的全部影格（純 Bmp；測試 / 圖庫也用） */
export function npcFrames(kind: NpcKind): NpcFrames {
  const l = npcLook(kind), key = `npc:${kind}:${dollKey(l)}`;
  const idle = Array.from({ length: IDLE_FRAMES }, (_, f) => dollPreview(l, key, 'idle', f));
  const walk = Array.from({ length: WALK_FRAMES }, (_, f) => dollPreview(l, key, 'walk', f));
  const blink = dollPreview(l, key, 'blink', 0);
  let top = 0;
  outer: for (; top < blink.h; top++) for (let x = 0; x < blink.w; x++) if (blink.on(x, top)) break outer;
  // 睡覺：閉眼那格的頭，左右裁到不透明範圍（長髮 / 雙馬尾不會伸出床外）
  let hl = AV_FW, hr = -1;
  for (let y = 0; y < SLEEP_HEAD; y++) for (let x = 0; x < AV_FW; x++) if (blink.on(x, top + y)) { hl = Math.min(hl, x); hr = Math.max(hr, x); }
  // 頭最多 SLEEP_MAX_W 寬，從臉那側（右邊）往回留
  if (hr - hl + 1 > SLEEP_MAX_W) hl = hr - SLEEP_MAX_W + 1;
  const sleep = new Bmp(Math.max(1, hr - hl + 1), SLEEP_HEAD);
  for (let y = 0; y < SLEEP_HEAD; y++) for (let x = 0; x < sleep.w; x++) sleep.setRaw(x, y, blink.raw(hl + x, top + y));
  // 肖像：頭到胸口
  const portrait = new Bmp(AV_FW, 34);
  for (let y = 0; y < 34; y++) for (let x = 0; x < AV_FW; x++) portrait.setRaw(x, y, idle[0].raw(x, top + y));
  return { idle, blink, walk, sleep, portrait };
}
/** 被子（蓋住頭以下）：居民主色的布 + 上緣反摺 */
function blanketBmp(kind: NpcKind): Bmp {
  const r = CLOTH_RAMPS[NPCS[kind].look.app.color1] ?? CLOTH_RAMPS[0];
  const b = new Bmp(26, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 26; x++) {
    if (y === 5 && (x === 0 || x === 25)) continue;
    b.set(x, y, y === 0 ? r[Math.min(r.length - 1, 4)] : y === 1 ? r[Math.min(r.length - 1, 3)] : (x + y) % 5 === 0 ? r[1] : r[2]);
  }
  return b.outline(hex('#1c1424'));
}
/** 小小的 z（3×3 / 4×4）：睡覺時往上飄 */
function zBmp(big: boolean): Bmp {
  const rows = big ? ['####', '..#.', '.#..', '####'] : ['###', '.#.', '###'];
  const b = new Bmp(rows[0].length, rows.length);
  b.grid(rows, { '#': hex('#cceaf8') });
  return b.outline(hex('#1c1424'));
}

interface NpcCanvases { idle: HTMLCanvasElement[]; walk: HTMLCanvasElement[]; blink: HTMLCanvasElement; sleep: HTMLCanvasElement; blanket: HTMLCanvasElement; }

const FILL_OK: RGB = hex('#93cc50'), FILL_BAD: RGB = hex('#c8344c'), EDGE_OK: RGB = hex('#c2e478'), EDGE_BAD: RGB = hex('#e890b0');

export class SettleLayer {
  /** 查房模式 */
  housing = false;
  private npcArt = new Map<NpcKind, NpcCanvases>();
  private z = [toCanvas(zBmp(false)) as HTMLCanvasElement, toCanvas(zBmp(true)) as HTMLCanvasElement];
  private fills: HTMLCanvasElement[] = [];
  private ghosts = new Map<string, HTMLCanvasElement>();
  private roomCache: { rev: number; key: string; rooms: RoomCheck[] } | null = null;
  private walkDist = new Map<number, number>();
  private lastX = new Map<number, number>();

  constructor(private game: DelveGame, private atlas: Atlas) {
    // 房間填色：16×16 的 1/4 密度 Bayer 點（合格 / 不合格）
    for (const c of [FILL_OK, FILL_BAD]) {
      const b = new Bmp(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (bayer(x, y) < 0.25) b.set(x, y, c);
      this.fills.push(toCanvas(b) as HTMLCanvasElement);
    }
  }

  private art(kind: NpcKind): NpcCanvases {
    let a = this.npcArt.get(kind);
    if (!a) {
      const f = npcFrames(kind);
      const c = (b: Bmp): HTMLCanvasElement => toCanvas(b) as HTMLCanvasElement;
      a = { idle: f.idle.map(c), walk: f.walk.map(c), blink: c(f.blink), sleep: c(f.sleep), blanket: c(blanketBmp(kind)) };
      this.npcArt.set(kind, a);
    }
    return a;
  }

  /** 居民（在光照遮罩之前畫：晚上也是暗的） */
  drawWorld(ctx: CanvasRenderingContext2D, vb: { x: number; y: number; w: number; h: number }, clock: number): void {
    for (const n of this.game.settle.npcs) {
      const b = n.body;
      if (b.x + b.w + AV_FW < vb.x || b.x - AV_FW > vb.x + vb.w || b.y + b.h + 8 < vb.y || b.y - AV_FH > vb.y + vb.h) continue;
      this.drawNpc(ctx, n, clock);
    }
  }
  private drawNpc(ctx: CanvasRenderingContext2D, n: Npc, clock: number): void {
    const a = this.art(n.kind), b = n.body;
    if (n.state === 'sleep' && n.bed) {
      // 頭靠在枕頭上（床頭格 x+4..8），被子蓋到下巴；Zzz 往上飄
      const bx = n.bed.x * S, by = n.bed.y * S;
      ctx.drawImage(a.sleep, sleepHeadX(bx, a.sleep.width), Math.round(by + 10 - SLEEP_HEAD));
      ctx.drawImage(a.blanket, bx + 5, by + 7);
      const t = (clock + n.id * 0.7) % 3;
      for (let k = 0; k < 2; k++) {
        const tt = (t + k * 1.5) % 3;
        if (tt > 2.4) continue;
        ctx.drawImage(this.z[k], Math.round(bx + 12 + tt * 3), Math.round(by - 14 - tt * 6));
      }
      return;
    }
    const prev = this.lastX.get(n.id) ?? b.x;
    this.lastX.set(n.id, b.x);
    const dist = (this.walkDist.get(n.id) ?? 0) + Math.abs(b.x - prev);
    this.walkDist.set(n.id, dist);
    const walking = Math.abs(b.vx) > 4 && n.state === 'walk';
    const img = walking ? a.walk[Math.floor(dist / 5) % a.walk.length]
      : (clock + n.id) % 4 < 0.12 ? a.blink : a.idle[Math.floor((clock + n.id * 0.3) * 4) % a.idle.length];
    const cx = Math.round(b.x + b.w / 2), bottom = Math.round(b.y + b.h + b.gfxOffY);
    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(n.dir, 1);
    ctx.drawImage(img, -AV_FW / 2, -AV_FH);
    ctx.restore();
  }

  /** 畫面內的房間（查房模式用；世界有變或鏡頭移動超過 8 格才重掃） */
  roomsInView(vb: { x: number; y: number; w: number; h: number }): RoomCheck[] {
    const w = this.game.world;
    const x0 = Math.floor(vb.x / S / 8) * 8 - 8, y0 = Math.floor(vb.y / S / 8) * 8 - 8;
    const x1 = Math.ceil((vb.x + vb.w) / S / 8) * 8 + 8, y1 = Math.ceil((vb.y + vb.h) / S / 8) * 8 + 8;
    const key = `${x0},${y0},${x1},${y1}`;
    if (!this.roomCache || this.roomCache.rev !== w.rev || this.roomCache.key !== key) {
      this.roomCache = { rev: w.rev, key, rooms: scanRooms(w, x0, y0, x1, y1, { shells: true }) };
    }
    return this.roomCache.rooms;
  }

  /** 查房填色 + 放置預覽（在光照之後畫：晚上也看得清楚） */
  drawOverlay(ctx: CanvasRenderingContext2D, vb: { x: number; y: number; w: number; h: number }): void {
    if (this.housing) this.drawHousing(ctx, vb);
    this.drawGhost(ctx);
  }
  private drawHousing(ctx: CanvasRenderingContext2D, vb: { x: number; y: number; w: number; h: number }): void {
    const w = this.game.world, W0 = w.width;
    for (const r of this.roomsInView(vb)) {
      if (r.reasons[0] === 'open') {
        // 漏出去的「房間」：只把種子附近（畫面內）標成紅色外框太吵 → 只標有人造牆的格
        ctx.fillStyle = `rgb(${FILL_BAD.join(',')})`;
        for (const i of r.tiles) {
          if (!w.wall[i]) continue;
          const tx = i % W0, ty = (i - tx) / W0;
          ctx.drawImage(this.fills[1], tx * S, ty * S);
        }
        continue;
      }
      const fill = this.fills[r.ok ? 0 : 1], edge = r.ok ? EDGE_OK : EDGE_BAD;
      const set = new Set(r.tiles);
      ctx.fillStyle = `rgb(${edge.join(',')})`;
      for (const i of r.tiles) {
        const tx = i % W0, ty = (i - tx) / W0, px = tx * S, py = ty * S;
        ctx.drawImage(fill, px, py);
        if (!set.has(i - W0)) ctx.fillRect(px, py, S, 1);
        if (!set.has(i + W0)) ctx.fillRect(px, py + S - 1, S, 1);
        if (!set.has(i - 1)) ctx.fillRect(px, py, 1, S);
        if (!set.has(i + 1)) ctx.fillRect(px + S - 1, py, 1, S);
      }
    }
  }
  /** 一格的鬼影（棋盤格抖動：一半像素透明）；bad = 放不下（紅棋盤） */
  private ghost(id: number, bad: boolean, wall?: number): HTMLCanvasElement {
    const key = `${id}:${wall ?? 0}:${bad ? 1 : 0}`;
    let c = this.ghosts.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    if (g) {
      const src = wall ? this.atlas.wall(wall, 0, 15) : isSolidTile(id) && id !== T.DOOR_CLOSED ? this.atlas.tile(id, 0, 15) : this.atlas.decor(id, 0);
      g.drawImage(this.atlas.canvas, src.sx, src.sy, S, S, 0, 0, S, S);
      const img = g.getImageData(0, 0, S, S), d = img.data;
      const red = FILL_BAD;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4;
        const checker = ((x + y) & 1) === 0;
        if (bad) {
          const frame = x === 0 || y === 0 || x === S - 1 || y === S - 1 || x === y || x === S - 1 - y;
          if (frame && checker) { d[o] = red[0]; d[o + 1] = red[1]; d[o + 2] = red[2]; d[o + 3] = 255; continue; }
        }
        if (!checker || d[o + 3] < 128) { d[o + 3] = 0; continue; }
        d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    this.ghosts.set(key, c);
    return c;
  }
  private drawGhost(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    if (g.dead) return;
    const aim = g.aimTile();
    const p = g.placementPreview(aim.x, aim.y);
    if (!p) return;
    for (const [x, y, id] of p.tiles) ctx.drawImage(this.ghost(id, !p.ok, p.wall), x * S, y * S);
  }
}
