// folkDraw.ts — 世界 NPC 的畫面圖層（Canvas2D）：村民 / 矮人 / 旅人 / 受困探險者。
//   和居民同一套 Q 版紙娃娃（dollPreview）；矮人再經過 folkArt.dwarfify（變矮 + 大鬍子 + 礦工頭燈盔），一眼就分得出族群。
//   受困探險者沒被救之前頭上有閃爍的「！」、跟隨中 / 安全後不閃。影格第一次畫到才烘、依外觀快取（約 13 張 44×54 / 人）。
import type { DelveGame } from '../engine/game';
import type { FolkNpc } from '../engine/folk';
import type { FolkLook } from '../engine/folkDefs';
import type { DollLook, DollPiece } from '../engine/doll';
import { dollKey } from '../engine/doll';
import { dollPreview } from './dollPreview';
import { AV_FH, AV_FW } from './avatarArt';
import { IDLE_FRAMES, WALK_FRAMES } from './anim';
import { Bmp, hex, toCanvas } from './pixel';
import { dwarfify, beardRamp } from './folkArt';

const piece = (look: string | undefined): DollPiece | null => (look ? { look, rarity: 0, plus: 0, elem: null } : null);
export function folkDollLook(l: FolkLook): DollLook {
  return { app: l.app, head: piece(l.head), body: piece(l.body), legs: piece(l.legs), back: piece(l.back), feet: null, neck: l.neck ?? null, belt: l.belt ?? null };
}
export interface FolkFrames { idle: Bmp[]; walk: Bmp[]; blink: Bmp; portrait: Bmp; }
const frameCache = new Map<string, FolkFrames>();
/** 一位 NPC 的全部影格（純 Bmp；測試 / 圖庫 / 肖像也用） */
export function folkFrames(l: FolkLook): FolkFrames {
  const d = folkDollLook(l), key = `folk:${dollKey(d)}:${l.dwarf ? 1 : 0}${l.beard ? 1 : 0}`;
  let f = frameCache.get(key);
  if (f) return f;
  const post = (b: Bmp): Bmp => (l.dwarf ? dwarfify(b, l.beard ? beardRamp(l.app.hairColor) : null, 4, l.app.skin) : b);
  const idle = Array.from({ length: IDLE_FRAMES }, (_, k) => post(dollPreview(d, key, 'idle', k)));
  const walk = Array.from({ length: WALK_FRAMES }, (_, k) => post(dollPreview(d, key, 'walk', k)));
  const blink = post(dollPreview(d, key, 'blink', 0));
  let top = 0;
  outer: for (; top < blink.h; top++) for (let x = 0; x < blink.w; x++) if (blink.on(x, top)) break outer;
  const portrait = new Bmp(AV_FW, 34);
  for (let y = 0; y < 34; y++) for (let x = 0; x < AV_FW; x++) portrait.setRaw(x, y, idle[0].raw(x, Math.min(blink.h - 1, top + y)));
  f = { idle, walk, blink, portrait };
  frameCache.set(key, f);
  if (frameCache.size > 64) frameCache.delete(frameCache.keys().next().value as string);
  return f;
}

/** 頭上的「！」（求救 / 委託可以交付） */
function bangBmp(color: string): Bmp {
  const b = new Bmp(4, 10);
  b.grid(['.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '....', '.##.', '.##.', '....'], { '#': hex(color) });
  return b.outline(hex('#1c1424'));
}

interface Canv { idle: HTMLCanvasElement[]; walk: HTMLCanvasElement[]; blink: HTMLCanvasElement; }

export class FolkLayer {
  private art = new Map<number, Canv>();
  private walkDist = new Map<number, number>();
  private lastX = new Map<number, number>();
  private bang = [toCanvas(bangBmp('#ffd86a')) as HTMLCanvasElement, toCanvas(bangBmp('#93cc50')) as HTMLCanvasElement];
  /** 頭上要不要畫「！」（UI 決定：委託可交付 = 綠） */
  marks: (n: FolkNpc) => 0 | 1 | null = () => null;

  constructor(private game: DelveGame) {}

  private canv(n: FolkNpc): Canv {
    let a = this.art.get(n.id);
    if (!a) {
      const f = folkFrames(n.look), c = (b: Bmp): HTMLCanvasElement => toCanvas(b) as HTMLCanvasElement;
      a = { idle: f.idle.map(c), walk: f.walk.map(c), blink: c(f.blink) };
      this.art.set(n.id, a);
      if (this.art.size > 80) { const k = this.art.keys().next().value as number; this.art.delete(k); }
    }
    return a;
  }
  drawWorld(ctx: CanvasRenderingContext2D, vb: { x: number; y: number; w: number; h: number }, clock: number): void {
    for (const n of this.game.folk.npcs) {
      const b = n.body;
      if (b.x + b.w + AV_FW < vb.x || b.x - AV_FW > vb.x + vb.w || b.y + b.h + 8 < vb.y || b.y - AV_FH > vb.y + vb.h) continue;
      const a = this.canv(n);
      const prev = this.lastX.get(n.id) ?? b.x;
      this.lastX.set(n.id, b.x);
      const dist = (this.walkDist.get(n.id) ?? 0) + Math.abs(b.x - prev);
      this.walkDist.set(n.id, dist);
      const walking = Math.abs(b.vx) > 4;
      const img = walking ? a.walk[Math.floor(dist / 5) % a.walk.length]
        : (clock + n.id) % 4 < 0.12 ? a.blink : a.idle[Math.floor((clock + n.id * 0.3) * 4) % a.idle.length];
      const cx = Math.round(b.x + b.w / 2), bottom = Math.round(b.y + b.h + b.gfxOffY);
      ctx.save();
      ctx.translate(cx, bottom);
      ctx.scale(n.dir, 1);
      ctx.drawImage(img, -AV_FW / 2, -AV_FH);
      ctx.restore();
      const m = n.role === 'stranded' && !n.following && !n.safe ? 0 : this.marks(n);
      if (m !== null && (m === 1 || Math.floor(clock * 3) % 2 === 0)) {
        const top = bottom - AV_FH + (n.look.dwarf ? 4 : 0);
        ctx.drawImage(this.bang[m], cx - 3, top - 12 - Math.round(Math.abs(((clock * 2) % 2) - 1) * 2));
      }
    }
  }
}
