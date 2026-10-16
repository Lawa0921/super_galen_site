import { describe, expect, it, vi } from 'vitest';
import { bindUiInput, uiActionFor } from './input';

describe('uiActionFor', () => {
  it('maps the documented keys', () => {
    for (const [k, a] of [['ArrowUp', 'up'], ['w', 'up'], ['S', 'down'], ['a', 'left'], ['ArrowRight', 'right'], ['z', 'confirm'], ['Enter', 'confirm'], [' ', 'confirm'],
      ['x', 'cancel'], ['Escape', 'cancel'], ['Backspace', 'cancel'], ['c', 'menu'], ['C', 'menu'], ['q', null]] as const) {
      expect(uiActionFor(k), k).toBe(a);
    }
  });
});

describe('bindUiInput', () => {
  it('turns keys into actions, ignores key repeat for confirm and prevents the browser default', () => {
    const handler = vi.fn();
    const off = bindUiInput(window, handler);
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    window.dispatchEvent(down);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
    expect(handler.mock.calls.map((c) => c[0])).toEqual(['down', 'confirm']);
    expect(down.defaultPrevented).toBe(true);
    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('leaves browser shortcuts with Ctrl, Alt or Meta alone', () => {
    const handler = vi.fn();
    const off = bindUiInput(window, handler);
    const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true });
    window.dispatchEvent(e);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, cancelable: true }));
    expect(handler).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    off();
  });

  it('treats a right click as cancel', () => {
    const handler = vi.fn();
    const off = bindUiInput(window, handler);
    const e = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(e);
    expect(handler).toHaveBeenCalledWith('cancel');
    expect(e.defaultPrevented).toBe(true);
    off();
  });
});
