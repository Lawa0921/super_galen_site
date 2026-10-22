import { describe, expect, it } from 'vitest';
import { stageSpan } from './stageAxis';

/** A rect as getBoundingClientRect gives it, from its edges. */
const rect = (r: { left?: number; top?: number; right?: number; bottom?: number }): DOMRectReadOnly => {
  const left = r.left ?? 0, top = r.top ?? 0, right = r.right ?? left, bottom = r.bottom ?? top;
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => r };
};

describe('stageSpan (legibility Task 2a)', () => {
  it('returns the rect as is with no screen', () => {
    expect(stageSpan(rect({ top: 232, bottom: 264 }), null)).toEqual({ top: 232, bottom: 264 });
    expect(stageSpan(rect({ top: 232, bottom: 264 }), rect({}))).toEqual({ top: 232, bottom: 264 });   // a screen of no size
  });

  it('divides by the stage scale', () => {
    const screen = rect({ left: 128, top: 72, right: 128 + 1024, bottom: 72 + 576 });   // s 1.6
    expect(stageSpan(rect({ top: 232, bottom: 264 }), screen)).toEqual({ top: 100, bottom: 120 });
  });

  it('reads a sideways screen from its right edge', () => {
    const screen = rect({ left: 15, right: 375, top: 102, bottom: 742 });              // 360 x 640: turned, s 1
    expect(stageSpan(rect({ left: 300, right: 340, top: 400, bottom: 500 }), screen)).toEqual({ top: 35, bottom: 75 });
    const twice = rect({ left: 0, right: 720, top: 0, bottom: 1280 });                // turned, s 2
    expect(stageSpan(rect({ left: 600, right: 680 }), twice)).toEqual({ top: 20, bottom: 60 });
  });
});
