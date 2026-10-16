// main.ts — 把 DelveGame 接上 canvas：固定 60Hz 步長 + rAF 渲染、HUD、輸入、resize。回傳 handle（含 destroy）。
import type { DelveGame } from '../engine/game';
import { FIXED_DT } from '../engine/constants';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { FixedStepper, blockedMessage, hintText } from './model';
import { MapCache, Minimap, FullMap } from './mapView';
import { ExploreUi } from './journal';
import { SoundManager } from '../audio/SoundManager';
import { T } from '../engine/tiles';
import { ITEMS } from '../engine/items';
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
  /** 地圖快取 + 小地圖 / 全地圖每幀平均耗時（ms） */
  mapMs: number;
}

export interface DelveHandle {
  game: DelveGame;
  renderer: Renderer;
  hud: Hud;
  map: { cache: MapCache; minimap: Minimap; full: FullMap };
  ui: ExploreUi;
  sound: SoundManager;
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
  const sound = new SoundManager();
  const ui = new ExploreUi(root, game, renderer.atlas);
  const mapCache = new MapCache(game);
  renderer.onWorldDirty = (cis) => mapCache.markWorld(cis);
  const mmRoot = root.querySelector<HTMLElement>('#delve-minimap'), mmCanvas = root.querySelector<HTMLCanvasElement>('#delve-minimap-canvas');
  const mapRoot = root.querySelector<HTMLElement>('#delve-map'), mapCanvas = root.querySelector<HTMLCanvasElement>('#delve-map-canvas');
  if (!mmRoot || !mmCanvas || !mapRoot || !mapCanvas) throw new Error('delve: missing map elements');
  const minimap = new Minimap(mmRoot, mmCanvas, mapCache, game);
  /** 選單暫停（session 控制）與地圖開啟（這裡控制）分開記 */
  let menuPaused = false;
  const fullmap = new FullMap(mapRoot, mapCanvas, mapCache, game, {
    onClose: () => setMap(false),
    onToast: (m) => hud.toast(m),
  });
  let paused = false;
  const setMap = (open: boolean): void => {
    if (open === fullmap.isOpen) return;
    if (open) { fullmap.open(); root.dataset.map = '1'; } else { fullmap.close(); delete root.dataset.map; }
    paused = menuPaused || fullmap.isOpen;
    if (paused) controls.releaseAll();
    last = performance.now();
  };
  const unlock = (): void => sound.ensure();
  root.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const mmIn = root.querySelector('#delve-mm-in'), mmOut = root.querySelector('#delve-mm-out'), mapBtn = root.querySelector('#delve-map-btn');
  const onMmIn = (): void => { minimap.zoomBy(1); }, onMmOut = (): void => { minimap.zoomBy(-1); };
  const onMapBtn = (): void => { if (!menuPaused) setMap(!fullmap.isOpen); };
  mmIn?.addEventListener('click', onMmIn);
  mmOut?.addEventListener('click', onMmOut);
  mapBtn?.addEventListener('click', onMapBtn);
  mmCanvas.addEventListener('click', onMapBtn);
  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  const work = new Float32Array(WINDOW), gaps = new Float32Array(WINDOW), mapWork = new Float32Array(WINDOW);
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
      if (fullmap.isOpen) setMap(false);
      else if (ui.loreOpen) ui.closeLore();
      else if (game.openChest) game.closeChest();
      else if (ui.journalOpen) ui.setJournal(false);
      else if (hud.inventoryOpen) hud.setInventory(false);
      else opts.onMenu();
    },
    onMap: () => { if (!menuPaused) setMap(!fullmap.isOpen); },
    onMinimap: () => { if (!menuPaused && !fullmap.isOpen) hud.toast(minimap.toggle() ? '小地圖：開' : '小地圖：關'); },
    onJournal: () => { if (!menuPaused && !fullmap.isOpen) ui.toggleJournal(); },
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
        else if (e.type === 'lore') { ui.showLore(e.id, e.first); sound.lore(e.first); }
        else if (e.type === 'discover') { ui.discover(e.region.name, e.region.cat); sound.discover(); }
        else if (e.type === 'treasure') { hud.toast(`獲得珍寶：${ITEMS[e.item].name.zh}`, 2400); sound.treasure(); invChanged = true; }
        else if (e.type === 'spawn') { hud.toast(e.set ? '已設定重生點（床）' : '床被拆掉了：重生點回到出生點'); if (e.set) sound.spawn(); }
        else if (e.type === 'recall') {
          sound.recall(e.phase);
          if (e.phase === 'done') { renderer.snapCamera(); hud.toast('傳送回重生點'); }
          else if (e.phase === 'cancel') hud.toast('移動了：傳送中斷');
        }
        else if (e.type === 'hint') hud.toast(hintText(e.id));
        else if (e.type === 'unlock') { hud.toast(e.item === 'golden_key' ? '用金鑰匙打開了金寶箱' : '用地城鑰匙打開了門'); invChanged = true; }
        else if (e.type === 'door') { /* 門的開關：只需要重畫（chunk dirty） */ }
        else {
          if (e.type === 'mine' && e.tile === T.CRACKED_STONE) { sound.crumble(); hud.toast('裂紋石碎了——後面好像是空的'); }
          else if (e.type === 'place' && e.tile === T.ROPE) sound.tick();
          invChanged = true;
        }
      }
      if (invChanged) hud.refresh();
    }
    renderer.render(paused ? 0 : dt);
    hud.tick();
    ui.tick(dt);
    const tm = performance.now();
    mapCache.update(fullmap.isOpen ? 64 : 16);
    if (fullmap.isOpen) fullmap.draw();
    else if ((frames & 3) === 0) minimap.draw();
    mapWork[frames % WINDOW] = performance.now() - tm;
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
    game, renderer, hud, ui, sound,
    map: { cache: mapCache, minimap, full: fullmap },
    stats: () => {
      const f = avg(gaps);
      return {
        avgWorkMs: avg(work), avgFrameMs: f, fps: f > 0 ? 1000 / f : 0, frames,
        lightMs: renderer.stats.lightMs, cachedChunks: renderer.stats.cached, mapMs: avg(mapWork),
      };
    },
    setPaused: (p) => {
      menuPaused = p;
      paused = menuPaused || fullmap.isOpen;
      if (paused) controls.releaseAll();
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
      mmIn?.removeEventListener('click', onMmIn);
      mmOut?.removeEventListener('click', onMmOut);
      mapBtn?.removeEventListener('click', onMapBtn);
      mmCanvas.removeEventListener('click', onMapBtn);
      root.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      fullmap.destroy();
      ui.destroy();
      sound.destroy();
      hud.destroy();
      renderer.destroy();
    },
  };
  return handle;
}
