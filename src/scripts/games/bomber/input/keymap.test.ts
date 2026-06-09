// keymap.test.ts
import { describe, it, expect } from 'vitest';
import { KEYMAP } from './keymap';

describe('KEYMAP', () => {
  it('方向鍵與 WASD 都對應方向', () => {
    expect(KEYMAP.ArrowUp).toBe('up');
    expect(KEYMAP.KeyW).toBe('up');
    expect(KEYMAP.ArrowRight).toBe('right');
    expect(KEYMAP.KeyD).toBe('right');
    expect(KEYMAP.ArrowDown).toBe('down');
    expect(KEYMAP.KeyS).toBe('down');
    expect(KEYMAP.ArrowLeft).toBe('left');
    expect(KEYMAP.KeyA).toBe('left');
  });
  it('空白鍵與 J 放炸彈', () => {
    expect(KEYMAP.Space).toBe('bomb');
    expect(KEYMAP.KeyJ).toBe('bomb');
    expect(KEYMAP.KeyK).toBe('bomb');
  });
  it('ShiftLeft / ShiftRight / E で能力発動', () => {
    expect(KEYMAP.ShiftLeft).toBe('ability');
    expect(KEYMAP.ShiftRight).toBe('ability');
    expect(KEYMAP.KeyE).toBe('ability');
  });
});
