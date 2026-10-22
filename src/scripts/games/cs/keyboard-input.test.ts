import { describe, expect, it } from 'vitest';
import { capturesKey, keyboardInput, slotForKey, wheelSlot } from './keyboard-input';

describe('keyboard gameplay input', () => {
  it('maps held Left Ctrl to crouch alongside existing movement keys', () => {
    expect(keyboardInput(new Set(['ControlLeft', 'KeyW', 'KeyD']))).toEqual({ forward: 1, right: 1, jump: false, slow: false, interact: false, crouch: true });
    expect(keyboardInput(new Set(['KeyS', 'KeyA', 'ShiftRight', 'Space', 'KeyE']))).toEqual({ forward: -1, right: -1, jump: true, slow: true, interact: true, crouch: false });
  });
  it('releases crouch once Ctrl is no longer held; Right Ctrl is not a crouch key', () => {
    expect(keyboardInput(new Set()).crouch).toBe(false);
    expect(keyboardInput(new Set(['ControlRight'])).crouch).toBe(false);
  });
  it('captures Ctrl and Ctrl+key browser shortcuts during play, but leaves other keys alone', () => {
    expect(capturesKey({ code: 'ControlLeft', ctrlKey: true })).toBe(true);
    expect(capturesKey({ code: 'KeyD', ctrlKey: true })).toBe(true);
    expect(capturesKey({ code: 'KeyS', ctrlKey: true })).toBe(true);
    expect(capturesKey({ code: 'KeyW', ctrlKey: false })).toBe(true);
    expect(capturesKey({ code: 'Tab', ctrlKey: false })).toBe(true);
    expect(capturesKey({ code: 'KeyR', ctrlKey: false })).toBe(false);
    expect(capturesKey({ code: 'F5', ctrlKey: false })).toBe(false);
  });
});

describe('slot selection', () => {
  const actor = (held: 'gun' | 'he' | 'flash' | 'smoke', he = 1, flash = 2, smoke = 0) => ({ held, grenades: { he, flash, smoke } });
  it('1/2 draw the gun and 4 cycles carried grenades like CS', () => {
    expect(slotForKey('Digit1', actor('flash'))).toBe('gun');
    expect(slotForKey('Digit2', actor('he'))).toBe('gun');
    expect(slotForKey('Digit4', actor('gun'))).toBe('he');
    expect(slotForKey('Digit4', actor('he'))).toBe('flash');
    expect(slotForKey('Digit4', actor('flash'))).toBe('he');
    expect(slotForKey('Digit4', actor('gun', 0, 0, 0))).toBeNull();
    expect(slotForKey('KeyR', actor('gun'))).toBeNull();
  });
  it('the mouse wheel steps through the gun and every carried grenade, wrapping', () => {
    expect(wheelSlot(actor('gun'), 1)).toBe('he');
    expect(wheelSlot(actor('he'), 1)).toBe('flash');
    expect(wheelSlot(actor('flash'), 1)).toBe('gun');
    expect(wheelSlot(actor('gun'), -1)).toBe('flash');
    expect(wheelSlot(actor('gun', 0, 0, 0), 1)).toBe('gun');
  });
});
