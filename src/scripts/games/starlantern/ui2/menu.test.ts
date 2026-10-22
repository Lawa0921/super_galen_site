import { describe, expect, it } from 'vitest';
import { Menu } from './menu';

const items = (...ids: (string | [string, boolean])[]) => ids.map((x) => (Array.isArray(x) ? { id: x[0], label: x[0], disabled: x[1] } : { id: x, label: x }));

describe('Menu', () => {
  it('starts on the first enabled item', () => {
    expect(new Menu(items(['a', true], 'b', 'c')).current()!.id).toBe('b');
  });

  it('moves, skips disabled items and wraps both ways', () => {
    const m = new Menu(items('a', ['b', true], 'c'));
    expect(m.move(1)).toBe(true); expect(m.current()!.id).toBe('c');
    expect(m.move(1)).toBe(true); expect(m.current()!.id).toBe('a');
    expect(m.move(-1)).toBe(true); expect(m.current()!.id).toBe('c');
  });

  it('does not move or loop forever when nothing can be chosen', () => {
    const m = new Menu(items(['a', true], ['b', true]));
    expect(m.current()).toBeNull();
    expect(m.move(1)).toBe(false);
    expect(m.current()).toBeNull();
  });

  it('reports no movement when only one item is enabled', () => {
    const m = new Menu(items(['a', true], 'b'));
    expect(m.move(1)).toBe(false);
    expect(m.current()!.id).toBe('b');
  });

  it('lets the pointer pick enabled items only', () => {
    const m = new Menu(items('a', ['b', true], 'c'));
    expect(m.setCursor(1)).toBe(false); expect(m.current()!.id).toBe('a');
    expect(m.setCursor(2)).toBe(true); expect(m.current()!.id).toBe('c');
    expect(m.setCursor(9)).toBe(false);
  });

  it('honours a requested start position when it is enabled', () => {
    expect(new Menu(items('a', 'b', 'c'), 2).current()!.id).toBe('c');
    expect(new Menu(items('a', ['b', true], 'c'), 1).current()!.id).toBe('c');
  });
});
