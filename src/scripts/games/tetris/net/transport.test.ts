import { describe, it, expect } from 'vitest';
import { LoopbackPair } from './transport';

describe('LoopbackPair', () => {
  it('一端送出、另一端收到（雙向）', () => {
    const { a, b } = LoopbackPair.create();
    const gotB: string[] = [];
    const gotA: string[] = [];
    b.onMessage((m) => gotB.push(m));
    a.onMessage((m) => gotA.push(m));
    a.send('hello');
    b.send('world');
    expect(gotB).toEqual(['hello']);
    expect(gotA).toEqual(['world']);
  });
});
