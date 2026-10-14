import { describe, it, expect, vi } from 'vitest';
import { bindKeys, mapKey } from './keymap';

describe('keymap', () => {
  it('maps arrows, WASD, confirm and cancel', () => {
    expect(mapKey('ArrowUp')).toBe('up');
    expect(mapKey('d')).toBe('right');
    expect(mapKey('S')).toBe('down');
    expect(mapKey('Enter')).toBe('confirm');
    expect(mapKey('Escape')).toBe('cancel');
    expect(mapKey('q')).toBeNull();
  });
  it('dispatches handled keys, ignores form fields and unbinds', () => {
    const fn = vi.fn();
    const off = bindKeys(window, fn);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    const sel = document.createElement('select');
    document.body.append(sel);
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(fn.mock.calls).toEqual([['left']]);
    sel.remove();
  });
  it('leaves Enter and Space to a focused button but still moves with arrows', () => {
    const fn = vi.fn();
    const off = bindKeys(window, fn);
    const b = document.createElement('button');
    document.body.append(b);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    b.dispatchEvent(enter);
    b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    off();
    b.remove();
    expect(enter.defaultPrevented).toBe(false);
    expect(fn.mock.calls).toEqual([['up']]);
  });
});
