import { describe, it, expect } from 'vitest';
import {
  routeFrame,
  BomberHubTransport,
  BomberSpokeTransport,
  type RelayChannel,
} from './bomberTransport';
import { BomberLockstep, type BomberFrameMsg } from './bomberLockstep';
import type { CharacterId } from '../engine/types';

/** 測試用 mock channel：記錄送出的原始字串、可切 open、含 onclose 掛點。 */
function mockChannel(open = true): RelayChannel & {
  sent: string[];
  open: boolean;
  onmessage: ((raw: string) => void) | null;
  onclose: (() => void) | null;
} {
  return {
    sent: [] as string[],
    open,
    onmessage: null as ((raw: string) => void) | null,
    onclose: null as (() => void) | null,
    send(raw: string): void {
      this.sent.push(raw);
    },
  };
}

describe('routeFrame（純函式 relay）', () => {
  it('來自 channel 1 → 轉發給其餘 0/2/3、自己不收，回傳 [0,2,3]', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel(), mockChannel()];
    const raw = JSON.stringify({ f: 5, p: 'g1', a: [] });
    const routed = routeFrame(1, raw, channels);
    expect(routed).toEqual([0, 2, 3]);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([]); // 來源不回灌
    expect(channels[2].sent).toEqual([raw]);
    expect(channels[3].sent).toEqual([raw]);
  });

  it('fromIdx=null（host 自己的幀）→ 全部 channel 都收到，回傳全部 index', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const raw = JSON.stringify({ f: 0, p: 'host', a: [{ t: 'bomb' }] });
    const routed = routeFrame(null, raw, channels);
    expect(routed).toEqual([0, 1, 2]);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([raw]);
    expect(channels[2].sent).toEqual([raw]);
  });

  it('channel 未開（open=false）跳過、不丟例外、不在回傳陣列', () => {
    const channels = [mockChannel(true), mockChannel(false), mockChannel(true)];
    const raw = JSON.stringify({ f: 1, p: 'g0', a: [] });
    const routed = routeFrame(null, raw, channels);
    expect(routed).toEqual([0, 2]);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([]); // 未開不送
    expect(channels[2].sent).toEqual([raw]);
  });
});

describe('BomberHubTransport（Host 端 relay）', () => {
  it('某 guest channel 觸發 onmessage → 其餘 guest 收到該 raw、host 上層收到 parse 後 msg', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const got: BomberFrameMsg[] = [];
    hub.onMessage((m) => got.push(m));

    const msg: BomberFrameMsg = { f: 2, p: 'g1', a: [{ t: 'held', d: 'right', v: true }] };
    const raw = JSON.stringify(msg);
    // 模擬 guest 1 的 channel 收到訊息
    channels[1].onmessage!(raw);

    // 其餘 guest channel（0、2）都收到原始 raw、來源 channel 1 不回灌
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([]);
    expect(channels[2].sent).toEqual([raw]);
    // host 上層也看到該幀
    expect(got).toEqual([msg]);
  });

  it('send（host 自己的幀）→ 所有 guest channel 收到、host 上層 cb 也收到（自身可見）', () => {
    const channels = [mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const got: BomberFrameMsg[] = [];
    hub.onMessage((m) => got.push(m));

    const msg: BomberFrameMsg = { f: 0, p: 'host', a: [{ t: 'bomb' }] };
    hub.send(msg);

    const raw = JSON.stringify(msg);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([raw]);
    expect(got).toEqual([msg]); // host lockstep 也要看到自己的幀
  });
});

describe('BomberSpokeTransport（Guest 端）', () => {
  it('send → 對 host 的 channel.send 被呼叫且內容為該 msg 的 JSON', () => {
    const ch = mockChannel();
    const spoke = new BomberSpokeTransport(ch);
    const msg: BomberFrameMsg = { f: 3, p: 'g0', a: [{ t: 'ability' }] };
    spoke.send(msg);
    expect(ch.sent).toEqual([JSON.stringify(msg)]);
  });

  it('channel.open=false 時 send 不丟例外、不送出', () => {
    const ch = mockChannel(false);
    const spoke = new BomberSpokeTransport(ch);
    expect(() => spoke.send({ f: 1, p: 'g0', a: [] })).not.toThrow();
    expect(ch.sent).toEqual([]);
  });

  it('channel.onmessage(raw) → 上層 cb 收到 parse 後 msg', () => {
    const ch = mockChannel();
    const spoke = new BomberSpokeTransport(ch);
    const got: BomberFrameMsg[] = [];
    spoke.onMessage((m) => got.push(m));
    const msg: BomberFrameMsg = { f: 4, p: 'host', a: [{ t: 'held', d: 'left', v: false }] };
    ch.onmessage!(JSON.stringify(msg));
    expect(got).toEqual([msg]);
  });
});

describe('控制訊息通道 + channel-close 掛點（Hub）', () => {
  it('guest 送 bomber-leave → onChannelClose(該 idx)、不 relay、不上拋（onMessage/onControl 都沒收到）', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const closed: number[] = [];
    const frames: BomberFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    hub.onChannelClose((idx) => closed.push(idx));
    hub.onMessage((m) => frames.push(m));
    hub.onControl((m) => controls.push(m));

    channels[1].onmessage!(JSON.stringify({ t: 'bomber-leave' }));

    expect(closed).toEqual([1]);
    expect(channels[0].sent).toEqual([]); // 不 relay
    expect(channels[2].sent).toEqual([]);
    expect(frames).toEqual([]); // 不上拋幀
    expect(controls).toEqual([]); // 也不當一般控制訊息
  });

  it('guest 送 bomber-forfeit → relay 給其餘 channel、hub onControl 收到 parse 後物件、onMessage 沒收到', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const frames: BomberFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    hub.onMessage((m) => frames.push(m));
    hub.onControl((m) => controls.push(m));

    const msg = { t: 'bomber-forfeit', p: 'x', f: 5 };
    const raw = JSON.stringify(msg);
    channels[0].onmessage!(raw);

    expect(channels[1].sent).toEqual([raw]); // 其餘 channel 收到
    expect(channels[2].sent).toEqual([raw]);
    expect(channels[0].sent).toEqual([]); // 來源不回灌
    expect(controls).toEqual([msg]); // hub 自身 onControl 收到
    expect(frames).toEqual([]); // 幀路徑沒收到
  });

  it('hub sendControl → 全部 channel 收到、自身 onControl 回灌', () => {
    const channels = [mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const controls: Array<Record<string, unknown>> = [];
    hub.onControl((m) => controls.push(m));

    const msg = { t: 'bomber-forfeit', p: 'x', f: 9 };
    hub.sendControl(msg);

    const raw = JSON.stringify(msg);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([raw]);
    expect(controls).toEqual([msg]); // 回灌自身
  });

  it('mock channel 觸發 onclose → hub onChannelClose(該 idx)', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const closed: number[] = [];
    hub.onChannelClose((idx) => closed.push(idx));

    channels[2].onclose?.();
    channels[0].onclose?.();

    expect(closed).toEqual([2, 0]);
  });

  it('畸形 JSON / t 非字串 → 走幀訊息既有容錯路徑、不丟例外、不觸發控制回呼', () => {
    const channels = [mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const controls: Array<Record<string, unknown>> = [];
    const closed: number[] = [];
    hub.onControl((m) => controls.push(m));
    hub.onChannelClose((idx) => closed.push(idx));

    // 畸形 JSON：不丟例外、照幀路徑 relay（既有行為）
    expect(() => channels[0].onmessage!('not-json{{')).not.toThrow();
    expect(channels[1].sent).toEqual(['not-json{{']);

    // t 非字串：不是控制訊息 → 照幀路徑 relay
    const raw = JSON.stringify({ t: 5, f: 1, p: 'g0', a: [] });
    expect(() => channels[0].onmessage!(raw)).not.toThrow();
    expect(channels[1].sent).toEqual(['not-json{{', raw]);

    expect(controls).toEqual([]);
    expect(closed).toEqual([]);
  });

  it('tetris 命名空間的控制訊息（ffa-*）不被當作 bomber 控制訊息 → 走幀路徑 relay', () => {
    const channels = [mockChannel(), mockChannel()];
    const hub = new BomberHubTransport(channels);
    const controls: Array<Record<string, unknown>> = [];
    const closed: number[] = [];
    hub.onControl((m) => controls.push(m));
    hub.onChannelClose((idx) => closed.push(idx));

    const raw = JSON.stringify({ t: 'ffa-leave' });
    expect(() => channels[0].onmessage!(raw)).not.toThrow();
    // bomber 前綴不符 → 不觸發 control/close，照幀路徑 relay
    expect(controls).toEqual([]);
    expect(closed).toEqual([]);
    expect(channels[1].sent).toEqual([raw]);
  });
});

describe('控制訊息通道 + onClose 掛點（Spoke）', () => {
  it('收 bomber-forfeit → onControl 收到、onMessage 沒收到；收幀 → onMessage 收到、onControl 沒收到', () => {
    const ch = mockChannel();
    const spoke = new BomberSpokeTransport(ch);
    const frames: BomberFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    spoke.onMessage((m) => frames.push(m));
    spoke.onControl((m) => controls.push(m));

    const ctrl = { t: 'bomber-forfeit', p: 'x', f: 5 };
    ch.onmessage!(JSON.stringify(ctrl));
    expect(controls).toEqual([ctrl]);
    expect(frames).toEqual([]);

    const frame: BomberFrameMsg = { f: 7, p: 'host', a: [{ t: 'held', d: 'up', v: true }] };
    ch.onmessage!(JSON.stringify(frame));
    expect(frames).toEqual([frame]);
    expect(controls).toEqual([ctrl]); // 控制回呼沒再被觸發
  });

  it('sendControl：open=true 送出 JSON；open=false 不丟例外、不送出', () => {
    const chOpen = mockChannel();
    const spokeOpen = new BomberSpokeTransport(chOpen);
    const msg = { t: 'bomber-leave' };
    spokeOpen.sendControl(msg);
    expect(chOpen.sent).toEqual([JSON.stringify(msg)]);

    const chClosed = mockChannel(false);
    const spokeClosed = new BomberSpokeTransport(chClosed);
    expect(() => spokeClosed.sendControl(msg)).not.toThrow();
    expect(chClosed.sent).toEqual([]);
  });

  it('channel 觸發 onclose → spoke onClose 回呼', () => {
    const ch = mockChannel();
    const spoke = new BomberSpokeTransport(ch);
    let closed = 0;
    spoke.onClose(() => closed++);

    ch.onclose?.();
    expect(closed).toBe(1);
  });
});

describe('整合：1 Hub + 3 Spoke 串接撐起 BomberLockstep', () => {
  it('4 端跑 ~60 幀 → stateHash 位元級一致', () => {
    const playerIds = ['host', 'g0', 'g1', 'g2'];
    const seed = 0xc0ffee;
    const arenaId = 0;
    const CHARS: CharacterId[] = ['lena', 'mira', 'aya', 'rosa'];
    const characters: Record<string, CharacterId> = {};
    playerIds.forEach((id, i) => (characters[id] = CHARS[i % CHARS.length]));

    // Host 有 3 條 channel（對應 g0/g1/g2）。
    const hubChannels = [mockChannel(), mockChannel(), mockChannel()];
    // 各 spoke 對 host 的 channel。
    const spokeChannels = [mockChannel(), mockChannel(), mockChannel()];

    const hub = new BomberHubTransport(hubChannels);
    const spokes = spokeChannels.map((ch) => new BomberSpokeTransport(ch));

    // 手動接線：
    //  spoke i 的 send → 走 spokeChannels[i].send → 應觸發 hub 對應 channel 的 onmessage。
    //  hub 對 guest i 廣播（hubChannels[i].send）→ 應觸發 spoke i 的 channel.onmessage。
    for (let i = 0; i < 3; i++) {
      // guest → host：spoke 送出的 raw 直接餵給 hub 對應 channel 的 onmessage
      spokeChannels[i].send = (raw: string) => {
        hubChannels[i].onmessage!(raw);
      };
      // host → guest：hub 對該 channel 廣播的 raw 直接餵給 spoke 的 channel onmessage
      hubChannels[i].send = (raw: string) => {
        spokeChannels[i].onmessage!(raw);
      };
    }

    const transports = [hub, ...spokes];
    const locksteps = playerIds.map(
      (localId, i) =>
        new BomberLockstep({
          playerIds,
          localId,
          seed,
          arenaId,
          characters,
          transport: transports[i],
        }),
    );

    // 跑 60 幀，每端都不送輸入（確定性，所有端同序推進）。
    for (let f = 0; f < 60; f++) {
      for (const ls of locksteps) ls.tick();
    }

    // 同步 loopback 下末輪最後 tick 的節點會「結構性領先」一幀（良性瞬時偏移）：
    // 只 tick 落後端（凍結領先端，保證收斂終止），直到全端 confirmedFrame 追平領先端，
    // 方可在同一幀比對指紋。
    for (let r = 0; r < 50; r++) {
      const max = Math.max(...locksteps.map((n) => n.confirmedFrame));
      const laggards = locksteps.filter((n) => n.confirmedFrame < max);
      if (laggards.length === 0) break;
      for (const n of laggards) n.tick();
    }

    // 各端推進的幀數必須相等且 > 0（證明這層星狀中繼撐起確定性鎖步）。
    const cf = locksteps[0].confirmedFrame;
    expect(cf).toBeGreaterThan(0);
    for (const ls of locksteps) expect(ls.confirmedFrame).toBe(cf);

    // 各端 stateHash 必須位元級一致。
    const ref = locksteps[0].match.stateHash();
    for (const ls of locksteps) expect(ls.match.stateHash()).toBe(ref);
  });
});
