// fakeCanvas.ts — 測試用的假畫布（happy-dom 沒有 2D context）：document.createElement('canvas') 換成 FakeCanvas，
//   每張圖記下自己的內容（putImageData / 畫進來的東西）→ sig() 依內容比對；main 畫布把每個呼叫記進 calls。
//   只給 *.test.ts 用（同 net/testRig.ts）。
import { vi } from 'vitest';

export type Call = [string, ...unknown[]];

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(36);
}
function fnvBytes(b: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return `${(h >>> 0).toString(36)}:${b.length}`;
}

export class FakeCanvas {
  width = 300; height = 150; style = {};
  /** 內容：putImageData / drawImage / fillRect 依序 */
  ops: string[] = [];
  /** 主畫布：每個呼叫（drawImage 的圖換成 sig） */
  calls: Call[] = [];
  main = false;
  readonly ctx: CanvasRenderingContext2D = makeCtx(this);
  getContext(): CanvasRenderingContext2D { return this.ctx; }
  toDataURL(): string { return ''; }
  sig(): string { return `${this.width}x${this.height}#${fnv(this.ops.join('|'))}`; }
}

function srcSig(src: unknown): string { return src instanceof FakeCanvas ? src.sig() : 'ext'; }

function makeCtx(owner: FakeCanvas): CanvasRenderingContext2D {
  const st: Record<string | symbol, unknown> = { fillStyle: '#000', globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, globalAlpha: 1 };
  const rec = (e: Call): void => { if (owner.main) owner.calls.push(e); else owner.ops.push(JSON.stringify(e)); };
  const fns: Record<string, (...a: never[]) => unknown> = {
    putImageData: (img: ImageData, x: number, y: number) => { owner.ops.push(`p${x},${y}:${fnvBytes(img.data)}`); },
    getImageData: (_x: number, _y: number, w: number, h: number) => new ImageData(Math.max(1, w), Math.max(1, h)),
    createImageData: (w: number, h: number) => new ImageData(Math.max(1, w), Math.max(1, h)),
    drawImage: (src: unknown, ...a: number[]) => rec(['drawImage', src, srcSig(src), ...a]),
    fillRect: (...a: number[]) => rec(['fillRect', st.fillStyle, ...a]),
    clearRect: (...a: number[]) => rec(['clearRect', ...a]),
    translate: (x: number, y: number) => rec(['translate', x, y]),
    scale: (x: number, y: number) => rec(['scale', x, y]),
    save: () => rec(['save']),
    restore: () => rec(['restore']),
    setTransform: (...a: number[]) => rec(['setTransform', ...a]),
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
  };
  return new Proxy(st, {
    get(t, k) { if (typeof k === 'string' && k in fns) return fns[k]; if (k in t) return t[k]; if (k === 'canvas') return owner; return () => undefined; },
    set(t, k, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

/** document.createElement('canvas') → FakeCanvas；回傳還原函式 */
export function installFakeCanvas(): () => void {
  const orig = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: ElementCreationOptions) =>
    (tag === 'canvas' ? new FakeCanvas() : orig(tag, o))) as typeof document.createElement);
  return () => spy.mockRestore();
}

/** 記錄呼叫的主畫布 */
export function mainCanvas(): FakeCanvas {
  const c = new FakeCanvas();
  c.main = true;
  return c;
}
