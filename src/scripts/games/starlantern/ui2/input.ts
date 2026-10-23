/**
 * `prev` / `next` page between party members on the status and equipment screens; `swap` (Tab) switches focus between panes;
 * `scrollUp` / `scrollDown` (R / F) scroll the equipment screen's item detail.
 */
export type UiAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'auto' | 'prev' | 'next' | 'swap' | 'scrollUp' | 'scrollDown';

const KEYS: Record<string, UiAction> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  Enter: 'confirm', ' ': 'confirm', z: 'confirm', Z: 'confirm',
  Escape: 'cancel', Backspace: 'cancel', x: 'cancel', X: 'cancel', c: 'menu', C: 'menu',
  q: 'prev', Q: 'prev', PageUp: 'prev', e: 'next', E: 'next', PageDown: 'next', Tab: 'swap',
  r: 'scrollUp', R: 'scrollUp', f: 'scrollDown', F: 'scrollDown',
};
const REPEATABLE = new Set<UiAction>(['up', 'down', 'left', 'right']);

function isFormField(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

export function uiActionFor(key: string): UiAction | null {
  return KEYS[key] ?? null;
}

export async function toggleFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch (err) {
    console.warn('[starlantern] fullscreen unavailable', err);
  }
}

/** Keyboard and right-click to UI actions. Held confirm/cancel keys do not repeat, so a held key cannot skip dialogue. */
export function bindUiInput(target: Window, handler: (a: UiAction) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;   // browser shortcuts (copy, tab switching, zoom) stay the browser's
    if (e.key === 'F11') { e.preventDefault(); void toggleFullscreen(document.documentElement); return; }   // the page, as the settings' 全螢幕 (legibility 2a)
    if (e.key === 'Tab' && isFormField(e.target)) return;   // Tab keeps moving focus inside a real form field
    const a = uiActionFor(e.key);
    if (!a) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.has(a)) return;
    handler(a);
  };
  const onContext = (e: MouseEvent) => { e.preventDefault(); handler('cancel'); };
  target.addEventListener('keydown', onKey);
  target.addEventListener('contextmenu', onContext);
  return () => { target.removeEventListener('keydown', onKey); target.removeEventListener('contextmenu', onContext); };
}
