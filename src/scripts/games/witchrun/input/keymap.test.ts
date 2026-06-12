import { describe, it, expect } from 'vitest';
import { KEYMAP } from './keymap';

describe('KEYMAP', () => {
  it('方向鍵與 WASD 對應移動', () => {
    expect(KEYMAP.ArrowUp).toBe('up');
    expect(KEYMAP.KeyW).toBe('up');
    expect(KEYMAP.ArrowLeft).toBe('left');
    expect(KEYMAP.KeyD).toBe('right');
  });
  it('Shift=focus、X/K=bomb、Z/J/Space=overdrive', () => {
    expect(KEYMAP.ShiftLeft).toBe('focus');
    expect(KEYMAP.KeyX).toBe('bomb');
    expect(KEYMAP.KeyK).toBe('bomb');
    expect(KEYMAP.KeyZ).toBe('overdrive');
    expect(KEYMAP.KeyJ).toBe('overdrive');
    expect(KEYMAP.Space).toBe('overdrive');
  });
});
