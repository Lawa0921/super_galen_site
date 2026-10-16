// mapping.test.ts — 純輸入映射（鍵盤、滾輪、搖桿、觸控意圖、螢幕→tile）。
import { describe, it, expect } from 'vitest';
import {
  keyAction, slotForKey, wheelSlot, moveAxis, joystick, touchIntent, screenToTile,
} from './mapping';

describe('keyAction', () => {
  it('A/D/方向鍵移動、Space/W/↑ 跳、E 背包、Esc 選單', () => {
    expect(keyAction('KeyA')).toBe('left');
    expect(keyAction('ArrowLeft')).toBe('left');
    expect(keyAction('KeyD')).toBe('right');
    expect(keyAction('ArrowRight')).toBe('right');
    expect(keyAction('Space')).toBe('jump');
    expect(keyAction('KeyW')).toBe('jump');
    expect(keyAction('ArrowUp')).toBe('jump');
    expect(keyAction('KeyE')).toBe('inventory');
    expect(keyAction('Escape')).toBe('menu');
    expect(keyAction('KeyQ')).toBeNull();
  });
});

describe('slotForKey', () => {
  it('Digit1..9 → 0..8，Digit0 → 9；Numpad 同理', () => {
    expect(slotForKey('Digit1')).toBe(0);
    expect(slotForKey('Digit9')).toBe(8);
    expect(slotForKey('Digit0')).toBe(9);
    expect(slotForKey('Numpad3')).toBe(2);
    expect(slotForKey('KeyA')).toBeNull();
  });
});

describe('wheelSlot', () => {
  it('往下捲 +1、往上捲 -1，循環', () => {
    expect(wheelSlot(0, 100)).toBe(1);
    expect(wheelSlot(9, 100)).toBe(0);
    expect(wheelSlot(0, -100)).toBe(9);
    expect(wheelSlot(4, 0)).toBe(4);
  });
});

describe('moveAxis', () => {
  it('左右同按抵銷', () => {
    expect(moveAxis(true, false)).toBe(-1);
    expect(moveAxis(false, true)).toBe(1);
    expect(moveAxis(true, true)).toBe(0);
    expect(moveAxis(false, false)).toBe(0);
  });
});

describe('joystick', () => {
  it('死區內不動', () => {
    const j = joystick(5, 3, 50);
    expect(j.moveX).toBe(0);
    expect(j.knobX).toBe(5);
  });
  it('超出半徑時 knob 夾在圓上，方向保留', () => {
    const j = joystick(100, 0, 50);
    expect(j.knobX).toBeCloseTo(50);
    expect(j.knobY).toBeCloseTo(0);
    expect(j.moveX).toBe(1);
    expect(j.x).toBeCloseTo(1);
  });
  it('向左推過死區 → moveX -1；往上推很多 → up', () => {
    expect(joystick(-30, 0, 50).moveX).toBe(-1);
    expect(joystick(0, -45, 50).up).toBe(true);
    expect(joystick(0, -10, 50).up).toBe(false);
  });
});

describe('touchIntent', () => {
  it('手持方塊 → place，否則 mine', () => {
    expect(touchIntent({ item: 'dirt', count: 3 })).toBe('place');
    expect(touchIntent({ item: 'torch', count: 3 })).toBe('place');
    expect(touchIntent({ item: 'wood_pickaxe', count: 1 })).toBe('mine');
    expect(touchIntent({ item: 'wood', count: 1 })).toBe('mine');
    expect(touchIntent(null)).toBe('mine');
  });
});

describe('screenToTile', () => {
  it('加上鏡頭偏移後除以 tile 大小並取 floor', () => {
    expect(screenToTile(0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToTile(17, 31, 0, 0)).toEqual({ x: 1, y: 1 });
    expect(screenToTile(10, 10, 100, 200)).toEqual({ x: 6, y: 13 });
    expect(screenToTile(-1, 0, 0, 0)).toEqual({ x: -1, y: 0 });
  });
});
