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
  return { app: l.app, head: piece(l.head), body: piece(l.body), legs: piece(l.legs), back: piece(l.back), acc: null, feet: null, neck: l.neck ?? null, belt: l.belt ?? null };
}
// 動畫相位：聚落 NPC 的 id 是 2 的 52 次方等級的大數，直接 clock + id 會吃掉 clock 的小數（雙精度間距 0.5–1）；
// 取 id 的小餘數（< 4096 的 id 原樣，遇見型 NPC 不變）
export const folkPhase = (id: number): number => id % 4096;
/** 站著的影格：眨眼（每 4 秒約 0.12 秒）或第幾張 idle */
export function folkIdlePose(clock: number, id: number): 'blink' | number {
  const p = folkPhase(id);
  return (clock + p) % 4 < 0.12 ? 'blink' : Math.floor((clock + p * 0.3) * 4) % IDLE_FRAMES;
}
export interface FolkFrames { idle: Bmp[]; walk: Bmp[]; blink: Bmp; portrait: Bmp; }
const oneCache = new Map<string, Bmp>();
const folkKey = (l: FolkLook): string => `folk:${dollKey(folkDollLook(l))}:${l.dwarf ? 1 : 0}${l.beard ? 1 : 0}`;
/** 一位 NPC 的某一格（只烘這一格；畫面上用，進村時不會一次烘十幾格） */
export function folkFrame(l: FolkLook, kind: 'idle' | 'walk' | 'blink', k: number): Bmp {
  const key = `${folkKey(l)}|${kind}|${k}`;
  let b = oneCache.get(key);
  if (b) return b;
  const d = folkDollLook(l);
  const raw = dollPreview(d, folkKey(l), kind, kind === 'blink' ? 0 : k);
  b = l.dwarf ? dwarfify(raw, l.beard ? beardRamp(l.app.hairColor) : null, 2, l.app.skin) : raw;
  oneCache.set(key, b);
  if (oneCache.size > 600) oneCache.delete(oneCache.keys().next().value as string);
  return b;
}
const frameCache = new Map<string, FolkFrames>();
/** 一位 NPC 的全部影格（純 Bmp；測試 / 圖庫 / 肖像也用） */
export function folkFrames(l: FolkLook): FolkFrames {
  const d = folkDollLook(l), key = `folk:${dollKey(d)}:${l.dwarf ? 1 : 0}${l.beard ? 1 : 0}`;
  let f = frameCache.get(key);
  if (f) return f;
  const post = (b: Bmp): Bmp => (l.dwarf ? dwarfify(b, l.beard ? beardRamp(l.app.hairColor) : null, 2, l.app.skin) : b);
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

/** 一位 NPC 已經烘好的 canvas（還沒烘的格子是 undefined；第一次要用到才烘） */
interface Canv { idle: (HTMLCanvasElement | undefined)[]; walk: (HTMLCanvasElement | undefined)[]; blink?: HTMLCanvasElement; }
/** 一幀最多花多少 ms 烘 NPC 的新影格（超過就先用這個人已經烘好的那格頂著） */
const FOLK_BAKE_BUDGET_MS = 2;

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
      a = { idle: new Array(IDLE_FRAMES), walk: new Array(WALK_FRAMES) };
      this.art.set(n.id, a);
      if (this.art.size > 80) { const k = this.art.keys().next().value as number; this.art.delete(k); }
    }
    return a;
  }
  private budgetT0 = 0;
  /** 取某一格：還沒烘 → 預算內就烘、超過預算就用已經有的那格頂著（每人至少一格：待機第 0 格） */
  private frame(n: FolkNpc, a: Canv, kind: 'idle' | 'walk' | 'blink', k: number): HTMLCanvasElement {
    const list = kind === 'blink' ? null : a[kind];
    const have = kind === 'blink' ? a.blink : list![k];
    if (have) return have;
    const fallback = a.idle[0] ?? a.idle.find(Boolean) ?? a.walk.find(Boolean);
    if (fallback && performance.now() - this.budgetT0 > FOLK_BAKE_BUDGET_MS) return fallback;
    const c = toCanvas(folkFrame(n.look, kind, k)) as HTMLCanvasElement;
    if (kind === 'blink') a.blink = c; else list![k] = c;
    return c;
  }
  drawWorld(ctx: CanvasRenderingContext2D, vb: { x: number; y: number; w: number; h: number }, clock: number): void {
    this.budgetT0 = performance.now();
    for (const n of this.game.folk.npcs) {
      const b = n.body;
      if (b.x + b.w + AV_FW < vb.x || b.x - AV_FW > vb.x + vb.w || b.y + b.h + 8 < vb.y || b.y - AV_FH > vb.y + vb.h) continue;
      const a = this.canv(n);
      const prev = this.lastX.get(n.id) ?? b.x;
      this.lastX.set(n.id, b.x);
      const dist = (this.walkDist.get(n.id) ?? 0) + Math.abs(b.x - prev);
      this.walkDist.set(n.id, dist);
      const walking = Math.abs(b.vx) > 4;
      const pose = walking ? null : folkIdlePose(clock, n.id);
      const img = pose === null ? this.frame(n, a, 'walk', Math.floor(dist / 5) % WALK_FRAMES)
        : pose === 'blink' ? this.frame(n, a, 'blink', 0) : this.frame(n, a, 'idle', pose);
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
