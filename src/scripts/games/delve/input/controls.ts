// controls.ts — DOM 輸入：鍵盤、滑鼠、滾輪、觸控（Pointer Events）→ DelveGame。destroy() 清掉所有監聽。
import type { DelveGame } from '../engine/game';
import { TILE_SIZE } from '../engine/constants';
import { keyAction, slotForKey, wheelSlot, moveAxis, joystick, touchIntent } from './mapping';

export interface ControlsOptions {
  game: DelveGame;
  canvas: HTMLCanvasElement;
  /** 根元素：觸控時加 data-touch，供 CSS 顯示虛擬按鍵 */
  root: HTMLElement;
  joy?: HTMLElement | null;
  jumpBtn?: HTMLElement | null;
  /** CSS px（相對 canvas）→ 世界 px */
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  onInventory: () => void;
  onMenu: () => void;
  /** 選單開啟等暫停狀態時忽略遊戲輸入 */
  isBlocked: () => boolean;
}

export interface Controls {
  /** 每幀呼叫：用最後的滑鼠位置與目前鏡頭重新瞄準 */
  update(): void;
  releaseAll(): void;
  destroy(): void;
}

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function attachControls(o: ControlsOptions): Controls {
  const { game, canvas, root } = o;
  const keys = { left: false, right: false, jump: false };
  let joyMove: -1 | 0 | 1 | null = null;
  let joyUp = false;
  let jumpTouch = false;
  let mouse: { x: number; y: number } | null = null;
  let touchAim: { id: number; x: number; y: number } | null = null;
  const offs: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    el: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions,
  ): void => {
    el.addEventListener(type, fn as EventListener, opts);
    offs.push(() => el.removeEventListener(type, fn as EventListener, opts));
  };

  const capture = (el: Element, id: number): void => {
    try { el.setPointerCapture(id); } catch { /* 合成事件或指標已釋放 */ }
  };
  const applyMove = (): void => {
    game.setMoveX(joyMove !== null && joyMove !== 0 ? joyMove : moveAxis(keys.left, keys.right));
    game.setJump(keys.jump || jumpTouch || joyUp);
  };
  const aimAt = (sx: number, sy: number): void => {
    const w = o.screenToWorld(sx, sy);
    game.setAim(Math.floor(w.x / TILE_SIZE), Math.floor(w.y / TILE_SIZE));
  };
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ── 鍵盤 ──
  on(window, 'keydown', (e: KeyboardEvent) => {
    if (isTextTarget(e.target)) return;
    const a = keyAction(e.code);
    if (a === 'menu') { e.preventDefault(); o.onMenu(); return; }
    if (o.isBlocked()) return;
    if (a === 'inventory') { if (!e.repeat) o.onInventory(); e.preventDefault(); return; }
    if (a === 'left' || a === 'right' || a === 'jump') {
      keys[a] = true; e.preventDefault(); applyMove(); return;
    }
    const s = slotForKey(e.code);
    if (s !== null) { game.selectSlot(s); e.preventDefault(); }
  });
  on(window, 'keyup', (e: KeyboardEvent) => {
    const a = keyAction(e.code);
    if (a === 'left' || a === 'right' || a === 'jump') { keys[a] = false; applyMove(); }
  });
  const releaseAll = (): void => {
    keys.left = keys.right = keys.jump = false;
    joyMove = null; joyUp = false; jumpTouch = false;
    touchAim = null;
    applyMove();
    game.setMining(false);
    game.setUse(false);
  };
  on(window, 'blur', releaseAll);

  // ── 滑鼠 / 觸控 on canvas ──
  on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
  on(canvas, 'pointerdown', (e: PointerEvent) => {
    if (o.isBlocked()) return;
    const p = local(e);
    if (e.pointerType === 'mouse') {
      mouse = p;
      capture(canvas, e.pointerId);
      aimAt(p.x, p.y);
      if (e.button === 0) game.setMining(true);
      else if (e.button === 2) game.setUse(true);
      e.preventDefault();
      return;
    }
    // 觸控 / 筆：點格子 = 依手上物品挖或放
    root.dataset.touch = '1';
    if (touchAim) return;
    touchAim = { id: e.pointerId, x: p.x, y: p.y };
    capture(canvas, e.pointerId);
    aimAt(p.x, p.y);
    if (touchIntent(game.inventory.selectedStack()) === 'place') game.setUse(true);
    else game.setMining(true);
    e.preventDefault();
  });
  on(canvas, 'pointermove', (e: PointerEvent) => {
    const p = local(e);
    if (e.pointerType === 'mouse') { mouse = p; return; }
    if (touchAim && touchAim.id === e.pointerId) { touchAim.x = p.x; touchAim.y = p.y; aimAt(p.x, p.y); }
  });
  const endPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 || e.type !== 'pointerup') game.setMining(false);
      if (e.button === 2 || e.type !== 'pointerup') game.setUse(false);
      return;
    }
    if (touchAim && touchAim.id === e.pointerId) {
      touchAim = null;
      game.setMining(false);
      game.setUse(false);
    }
  };
  on(canvas, 'pointerup', endPointer);
  on(canvas, 'pointercancel', endPointer);
  on(canvas, 'pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse') mouse = null; });
  on(canvas, 'wheel', (e: WheelEvent) => {
    if (o.isBlocked()) return;
    e.preventDefault();
    game.selectSlot(wheelSlot(game.inventory.selected, e.deltaY));
  }, { passive: false });

  // ── 虛擬搖桿 ──
  const joy = o.joy;
  if (joy) {
    let joyId: number | null = null;
    let cx = 0, cy = 0, radius = 40;
    const setKnob = (x: number, y: number): void => {
      joy.style.setProperty('--kx', `${x}px`);
      joy.style.setProperty('--ky', `${y}px`);
    };
    on(joy, 'pointerdown', (e: PointerEvent) => {
      if (joyId !== null) return;
      root.dataset.touch = '1';
      joyId = e.pointerId;
      capture(joy, e.pointerId);
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; radius = r.width / 2 - 8;
      const j = joystick(e.clientX - cx, e.clientY - cy, radius);
      joyMove = j.moveX; joyUp = j.up; setKnob(j.knobX, j.knobY); applyMove();
      e.preventDefault();
    });
    on(joy, 'pointermove', (e: PointerEvent) => {
      if (e.pointerId !== joyId) return;
      const j = joystick(e.clientX - cx, e.clientY - cy, radius);
      joyMove = j.moveX; joyUp = j.up; setKnob(j.knobX, j.knobY); applyMove();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== joyId) return;
      joyId = null; joyMove = null; joyUp = false; setKnob(0, 0); applyMove();
    };
    on(joy, 'pointerup', end);
    on(joy, 'pointercancel', end);
  }
  const jb = o.jumpBtn;
  if (jb) {
    on(jb, 'pointerdown', (e: PointerEvent) => {
      root.dataset.touch = '1';
      jumpTouch = true; applyMove();
      capture(jb, e.pointerId);
      e.preventDefault();
    });
    const up = (): void => { jumpTouch = false; applyMove(); };
    on(jb, 'pointerup', up);
    on(jb, 'pointercancel', up);
  }

  return {
    update(): void {
      if (mouse && !o.isBlocked()) aimAt(mouse.x, mouse.y);
      else if (touchAim) aimAt(touchAim.x, touchAim.y);
    },
    releaseAll,
    destroy(): void {
      releaseAll();
      for (const f of offs) f();
      offs.length = 0;
    },
  };
}
