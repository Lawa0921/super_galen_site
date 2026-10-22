import { describe, it, expect } from 'vitest';
import { activeLoops, endLoop, loopId, markFrame } from './live';

describe('live loop counter', () => {
  it('只數最近有跑幀的迴圈；結束的迴圈不算', () => {
    const a = loopId(), b = loopId();
    expect(a).not.toBe(b);
    markFrame(a, 1000);
    markFrame(b, 1000);
    expect(activeLoops(1100)).toBe(2);
    // b 停了（沒有再跑幀）：過了視窗就不算
    markFrame(a, 1500);
    expect(activeLoops(1550)).toBe(1);
    endLoop(a);
    expect(activeLoops(1550)).toBe(0);
    endLoop(b);
  });
});
