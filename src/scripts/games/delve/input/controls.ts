// controls.ts — DOM 輸入：鍵盤、滑鼠、滾輪、觸控（Pointer Events）→ DelveGame。destroy() 清掉所有監聽。
import type { DelveGame } from '../engine/game';
import { keyAction, slotForKey, wheelSlot, moveAxis, joystick, touchIntent, mouseIntent } from './mapping';

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
  /** M：全地圖、N：小地圖開關、J：探險日誌 */
  onMap?: () => void;
  onMinimap?: () => void;
  onJournal?: () => void;
  /** H：查房模式、B：據點面板 */
  onHousing?: () => void;
  onSettle?: () => void;
  /** L：委託清單；T：和最近的人說話 */
  onQuests?: () => void;
  onTalk?: () => void;
  /** +1 放大 / −1 縮小 */
  onZoom?: (d: number) => void;
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
  const keys = { left: false, right: false, jump: false, up: false, down: false };
  let joyMove: -1 | 0 | 1 | null = null;
  let joyUp = false;
  let joyDown = false;
  let jumpTouch = false;
  let mouse: { x: number; y: number } | null = null;
  /** 上次套用的滑鼠 buttons 遮罩（和弦：按住左鍵時再按右鍵只會觸發 pointermove） */
  let mouseButtons = 0;
  const applyMouseButtons = (buttons: number): void => {
    if (buttons === mouseButtons) return;
    const prev = mouseIntent(mouseButtons), next = mouseIntent(buttons);
    mouseButtons = buttons;
    if (next.mine !== prev.mine) game.setMining(next.mine);
    if (next.use !== prev.use) game.setUse(next.use);
  };
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
    game.setJump(keys.jump || jumpTouch);
    game.setUp(keys.up || joyUp);
    game.setDrop(keys.down || joyDown);
  };
  const aimAt = (sx: number, sy: number): void => {
    const w = o.screenToWorld(sx, sy);
    game.setAimWorld(w.x, w.y);
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
    // 地圖 / 日誌：地圖開著（遊戲暫停）時也要能用同一個鍵關掉，由呼叫端決定要不要理
    if (a === 'map' || a === 'minimap' || a === 'journal') {
      if (!e.repeat) (a === 'map' ? o.onMap : a === 'minimap' ? o.onMinimap : o.onJournal)?.();
      e.preventDefault();
      return;
    }
    if (o.isBlocked()) return;
    if (a === 'inventory') { if (!e.repeat) o.onInventory(); e.preventDefault(); return; }
    if (a === 'housing' || a === 'settle') { if (!e.repeat) (a === 'housing' ? o.onHousing : o.onSettle)?.(); e.preventDefault(); return; }
    if (a === 'quests') { if (!e.repeat) o.onQuests?.(); e.preventDefault(); return; }
    if (a === 'talk') { if (!e.repeat) o.onTalk?.(); e.preventDefault(); return; }
    if (a === 'zoomIn' || a === 'zoomOut') { if (!e.repeat) o.onZoom?.(a === 'zoomIn' ? 1 : -1); e.preventDefault(); return; }
    if (a === 'left' || a === 'right' || a === 'jump' || a === 'up' || a === 'down') {
      keys[a] = true; e.preventDefault(); applyMove(); return;
    }
    const s = slotForKey(e.code);
    if (s !== null) { game.selectSlot(s); e.preventDefault(); }
  });
  on(window, 'keyup', (e: KeyboardEvent) => {
    const a = keyAction(e.code);
    if (a === 'left' || a === 'right' || a === 'jump' || a === 'up' || a === 'down') { keys[a] = false; applyMove(); }
  });
  const releaseAll = (): void => {
    keys.left = keys.right = keys.jump = keys.up = keys.down = false;
    joyMove = null; joyUp = false; joyDown = false; jumpTouch = false;
    touchAim = null;
    mouseButtons = 0;
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
      applyMouseButtons(e.buttons);
      e.preventDefault();
      return;
    }
    // 觸控 / 筆：點格子 = 依手上物品挖或放
    root.dataset.touch = '1';
    if (touchAim) return;
    touchAim = { id: e.pointerId, x: p.x, y: p.y };
    capture(canvas, e.pointerId);
    aimAt(p.x, p.y);
    const aim = game.getState().aim;
    const wp = o.screenToWorld(p.x, p.y);
    // 點到人（居民 / 村民 / 矮人 / 旅人）：立刻對話，不會挖到他腳下的地（點一下太快也接得到）
    if (game.talkAtPx(wp.x, wp.y)) { e.preventDefault(); return; }
    const intent = touchIntent(game.inventory.selectedStack(), game.world.getFg(aim.x, aim.y), game.settle.npcAtPx(wp.x, wp.y) !== null || game.folk.atPx(wp.x, wp.y) !== null);
    if (intent === 'place' || intent === 'use') game.setUse(true);
    else game.setMining(true);
    e.preventDefault();
  });
  on(canvas, 'pointermove', (e: PointerEvent) => {
    const p = local(e);
    if (e.pointerType === 'mouse') {
      mouse = p;
      if (!o.isBlocked()) applyMouseButtons(e.buttons);
      return;
    }
    if (touchAim && touchAim.id === e.pointerId) { touchAim.x = p.x; touchAim.y = p.y; aimAt(p.x, p.y); }
  });
  const endPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      applyMouseButtons(e.type === 'pointerup' ? e.buttons : 0);
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
      joyMove = j.moveX; joyUp = j.up; joyDown = j.down; setKnob(j.knobX, j.knobY); applyMove();
      e.preventDefault();
    });
    on(joy, 'pointermove', (e: PointerEvent) => {
      if (e.pointerId !== joyId) return;
      const j = joystick(e.clientX - cx, e.clientY - cy, radius);
      joyMove = j.moveX; joyUp = j.up; joyDown = j.down; setKnob(j.knobX, j.knobY); applyMove();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== joyId) return;
      joyId = null; joyMove = null; joyUp = false; joyDown = false; setKnob(0, 0); applyMove();
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
