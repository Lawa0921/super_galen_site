// main.ts — 把 DelveGame 接上 canvas：固定 60Hz 步長 + rAF 渲染、HUD、輸入、resize。回傳 handle（含 destroy）。
import type { DelveGame } from '../engine/game';
import { FIXED_DT } from '../engine/constants';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { FixedStepper, blockedMessage } from './model';
import { parseZoomPref } from './lowres';

const ZOOM_KEY = 'delve.zoom';
function loadZoom(): number {
  try { return parseZoomPref(globalThis.localStorage?.getItem(ZOOM_KEY)); } catch { return 0; }
}
function saveZoom(z: number): void {
  try { globalThis.localStorage?.setItem(ZOOM_KEY, String(z)); } catch { /* 私密模式等：不記住 */ }
}
import { attachControls } from '../input/controls';

export interface FrameStats {
  /** 平均每幀 JS 工作時間（模擬 + 繪製，ms） */
  avgWorkMs: number;
  /** 平均 rAF 間隔（ms） */
  avgFrameMs: number;
  fps: number;
  frames: number;
  lightMs: number;
  cachedChunks: number;
}

export interface DelveHandle {
  game: DelveGame;
  renderer: Renderer;
  hud: Hud;
  stats(): FrameStats;
  /** 暫停模擬（選單開啟時） */
  setPaused(p: boolean): void;
  readonly paused: boolean;
  destroy(): void;
}

export interface StartOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  game: DelveGame;
  onMenu: () => void;
}

const WINDOW = 120;

export function startDelve(opts: StartOptions): DelveHandle {
  const { root, canvas, game } = opts;
  const renderer = new Renderer(canvas, game);
  renderer.zoomOffset = loadZoom();
  const hud = new Hud(root, game, renderer.atlas);
  const stepper = new FixedStepper(FIXED_DT, 0.25);
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  const work = new Float32Array(WINDOW), gaps = new Float32Array(WINDOW);
  let frames = 0;

  const resize = (): void => {
    const r = canvas.getBoundingClientRect();
    renderer.resize(r.width || window.innerWidth, r.height || window.innerHeight, window.devicePixelRatio || 1);
    renderer.snapCamera();
    // HUD 的像素單位（CSS px）跟著畫面的美術像素大小走：外框 / 圖示都是整數倍
    root.dataset.px = String(Math.max(1, Math.min(3, Math.round(renderer.baseZoom()))));
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  window.addEventListener('resize', resize);

  const zoom = (d: number): void => {
    saveZoom(renderer.zoomBy(d));
    const v = renderer.viewTiles();
    hud.toast(`縮放 ${renderer.scale}× · 視野 ${v.w}×${v.h} 格`);
  };
  const zIn = root.querySelector('#delve-zoom-in'), zOut = root.querySelector('#delve-zoom-out');
  const onZin = (): void => zoom(1), onZout = (): void => zoom(-1);
  zIn?.addEventListener('click', onZin);
  zOut?.addEventListener('click', onZout);

  const controls = attachControls({
    game, canvas, root,
    joy: root.querySelector<HTMLElement>('#delve-joy'),
    jumpBtn: root.querySelector<HTMLElement>('#delve-jump'),
    screenToWorld: (sx, sy) => renderer.screenToWorld(sx, sy),
    onInventory: () => hud.toggleInventory(),
    onMenu: () => {
      if (game.openChest) game.closeChest();
      else if (hud.inventoryOpen) hud.setInventory(false);
      else opts.onMenu();
    },
    onZoom: zoom,
    isBlocked: () => paused,
  });

  const frame = (now: number): void => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    gaps[frames % WINDOW] = now - last;
    last = now;
    const t0 = performance.now();
    if (!paused) {
      controls.update();
      const n = stepper.advance(dt);
      for (let i = 0; i < n; i++) game.step(FIXED_DT);
      let invChanged = false;
      for (const e of game.drainEvents()) {
        renderer.onEvent(e);
        if (e.type === 'blocked') {
          const m = blockedMessage(e.reason);
          if (m) hud.toast(m);
        } else if (e.type === 'chest') hud.setChest(e.open);
        else invChanged = true;
      }
      if (invChanged) hud.refresh();
    }
    renderer.render(paused ? 0 : dt);
    hud.tick();
    work[frames % WINDOW] = performance.now() - t0;
    frames++;
  };
  raf = requestAnimationFrame(frame);

  const avg = (a: Float32Array): number => {
    const n = Math.min(frames, WINDOW);
    if (!n) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i];
    return s / n;
  };

  const handle: DelveHandle = {
    game, renderer, hud,
    stats: () => {
      const f = avg(gaps);
      return {
        avgWorkMs: avg(work), avgFrameMs: f, fps: f > 0 ? 1000 / f : 0, frames,
        lightMs: renderer.stats.lightMs, cachedChunks: renderer.stats.cached,
      };
    },
    setPaused: (p) => {
      paused = p;
      if (p) controls.releaseAll();
      last = performance.now();
    },
    get paused() { return paused; },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      controls.destroy();
      zIn?.removeEventListener('click', onZin);
      zOut?.removeEventListener('click', onZout);
      hud.destroy();
      renderer.destroy();
    },
  };
  return handle;
}
