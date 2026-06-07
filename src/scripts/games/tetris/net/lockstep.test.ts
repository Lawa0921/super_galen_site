import { describe, it, expect } from 'vitest';
import { Lockstep } from './lockstep';
import { LoopbackPair } from './transport';

describe('Lockstep 同步', () => {
  it('兩端各自控制一側、互傳輸入後 → 兩端 match 狀態一致', () => {
    const { a, b } = LoopbackPair.create();
    const seed = 77;
    const peerA = new Lockstep({ seed, localSide: 'A', transport: a });
    const peerB = new Lockstep({ seed, localSide: 'B', transport: b });

    // 模擬 120 幀；途中各自下指令
    for (let f = 0; f < 120; f++) {
      if (f === 4) peerA.pressLocal('left');
      if (f === 6) peerB.pressLocal('right');
      if (f === 10) peerA.pressLocal('hardDrop');
      // 每幀：先送本地輸入，雙方都嘗試前進
      peerA.tick();
      peerB.tick();
    }
    const sa = peerA.match.a.getState();
    const sb = peerB.match.a.getState();
    expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
    expect(peerA.confirmedFrame).toBe(peerB.confirmedFrame);
  });

  it('收到畸形 / 非預期結構的訊息不丟例外、不卡迴圈', () => {
    let cap: ((d: string) => void) | null = null;
    const transport = {
      send(): void {},
      onMessage(cb: (d: string) => void): void { cap = cb; },
      close(): void {},
    };
    const ls = new Lockstep({ seed: 1, localSide: 'A', transport });
    expect(cap).not.toBeNull();
    expect(() => cap!('not json{')).not.toThrow();        // 畸形 JSON
    expect(() => cap!(JSON.stringify({ junk: 1 }))).not.toThrow(); // 缺欄位
    expect(() => cap!(JSON.stringify({ f: 0, s: 'Z', a: [] }))).not.toThrow(); // 非法 side
    // 仍可正常推進（不因畸形訊息中斷）
    expect(() => ls.tick()).not.toThrow();
  });
});
