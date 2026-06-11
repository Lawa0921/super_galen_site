import { describe, it, expect } from 'vitest';
import {
  routeFrame,
  FfaHubTransport,
  FfaSpokeTransport,
  type RelayChannel,
} from './ffaTransport';
import { FfaLockstep, type FfaFrameMsg } from './ffaLockstep';
import type { InputAction } from '../engine/game';

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
    const raw = JSON.stringify({ f: 0, p: 'host', a: ['left'] });
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

describe('FfaHubTransport（Host 端 relay）', () => {
  it('某 guest channel 觸發 onmessage → 其餘 guest 收到該 raw、host 上層收到 parse 後 msg', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new FfaHubTransport(channels);
    const got: FfaFrameMsg[] = [];
    hub.onMessage((m) => got.push(m));

    const msg: FfaFrameMsg = { f: 2, p: 'g1', a: ['right'] };
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
    const hub = new FfaHubTransport(channels);
    const got: FfaFrameMsg[] = [];
    hub.onMessage((m) => got.push(m));

    const msg: FfaFrameMsg = { f: 0, p: 'host', a: ['hardDrop'] };
    hub.send(msg);

    const raw = JSON.stringify(msg);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([raw]);
    expect(got).toEqual([msg]); // host lockstep 也要看到自己的幀
  });
});

describe('FfaSpokeTransport（Guest 端）', () => {
  it('send → 對 host 的 channel.send 被呼叫且內容為該 msg 的 JSON', () => {
    const ch = mockChannel();
    const spoke = new FfaSpokeTransport(ch);
    const msg: FfaFrameMsg = { f: 3, p: 'g0', a: ['softDrop'] };
    spoke.send(msg);
    expect(ch.sent).toEqual([JSON.stringify(msg)]);
  });

  it('channel.open=false 時 send 不丟例外、不送出', () => {
    const ch = mockChannel(false);
    const spoke = new FfaSpokeTransport(ch);
    expect(() => spoke.send({ f: 1, p: 'g0', a: [] })).not.toThrow();
    expect(ch.sent).toEqual([]);
  });

  it('channel.onmessage(raw) → 上層 cb 收到 parse 後 msg', () => {
    const ch = mockChannel();
    const spoke = new FfaSpokeTransport(ch);
    const got: FfaFrameMsg[] = [];
    spoke.onMessage((m) => got.push(m));
    const msg: FfaFrameMsg = { f: 4, p: 'host', a: ['rotateCW'] };
    ch.onmessage!(JSON.stringify(msg));
    expect(got).toEqual([msg]);
  });
});

describe('F4：Hub 控制訊息通道 + channel-close 掛點', () => {
  it('guest 送 ffa-leave → onChannelClose(該 idx)、不 relay、不上拋（onMessage/onControl 都沒收到）', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new FfaHubTransport(channels);
    const closed: number[] = [];
    const frames: FfaFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    hub.onChannelClose((idx) => closed.push(idx));
    hub.onMessage((m) => frames.push(m));
    hub.onControl((m) => controls.push(m));

    channels[1].onmessage!(JSON.stringify({ t: 'ffa-leave' }));

    expect(closed).toEqual([1]);
    expect(channels[0].sent).toEqual([]); // 不 relay
    expect(channels[2].sent).toEqual([]);
    expect(frames).toEqual([]); // 不上拋幀
    expect(controls).toEqual([]); // 也不當一般控制訊息
  });

  it('guest 送 ffa-forfeit → relay 給其餘 channel、hub onControl 收到 parse 後物件、onMessage 沒收到', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new FfaHubTransport(channels);
    const frames: FfaFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    hub.onMessage((m) => frames.push(m));
    hub.onControl((m) => controls.push(m));

    const msg = { t: 'ffa-forfeit', p: 'x', f: 5 };
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
    const hub = new FfaHubTransport(channels);
    const controls: Array<Record<string, unknown>> = [];
    hub.onControl((m) => controls.push(m));

    const msg = { t: 'ffa-forfeit', p: 'x', f: 9 };
    hub.sendControl(msg);

    const raw = JSON.stringify(msg);
    expect(channels[0].sent).toEqual([raw]);
    expect(channels[1].sent).toEqual([raw]);
    expect(controls).toEqual([msg]); // 回灌自身
  });

  it('mock channel 觸發 onclose → hub onChannelClose(該 idx)', () => {
    const channels = [mockChannel(), mockChannel(), mockChannel()];
    const hub = new FfaHubTransport(channels);
    const closed: number[] = [];
    hub.onChannelClose((idx) => closed.push(idx));

    channels[2].onclose?.();
    channels[0].onclose?.();

    expect(closed).toEqual([2, 0]);
  });

  it('畸形 JSON / t 非字串 → 走幀訊息既有容錯路徑、不丟例外、不觸發控制回呼', () => {
    const channels = [mockChannel(), mockChannel()];
    const hub = new FfaHubTransport(channels);
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
});

describe('F4：Spoke 控制訊息通道 + onClose 掛點', () => {
  it('收 ffa-forfeit → onControl 收到、onMessage 沒收到；收幀 → onMessage 收到、onControl 沒收到', () => {
    const ch = mockChannel();
    const spoke = new FfaSpokeTransport(ch);
    const frames: FfaFrameMsg[] = [];
    const controls: Array<Record<string, unknown>> = [];
    spoke.onMessage((m) => frames.push(m));
    spoke.onControl((m) => controls.push(m));

    const ctrl = { t: 'ffa-forfeit', p: 'x', f: 5 };
    ch.onmessage!(JSON.stringify(ctrl));
    expect(controls).toEqual([ctrl]);
    expect(frames).toEqual([]);

    const frame: FfaFrameMsg = { f: 7, p: 'host', a: ['left'] };
    ch.onmessage!(JSON.stringify(frame));
    expect(frames).toEqual([frame]);
    expect(controls).toEqual([ctrl]); // 控制回呼沒再被觸發
  });

  it('sendControl：open=true 送出 JSON；open=false 不丟例外、不送出', () => {
    const chOpen = mockChannel();
    const spokeOpen = new FfaSpokeTransport(chOpen);
    const msg = { t: 'ffa-leave' };
    spokeOpen.sendControl(msg);
    expect(chOpen.sent).toEqual([JSON.stringify(msg)]);

    const chClosed = mockChannel(false);
    const spokeClosed = new FfaSpokeTransport(chClosed);
    expect(() => spokeClosed.sendControl(msg)).not.toThrow();
    expect(chClosed.sent).toEqual([]);
  });

  it('channel 觸發 onclose → spoke onClose 回呼', () => {
    const ch = mockChannel();
    const spoke = new FfaSpokeTransport(ch);
    let closed = 0;
    spoke.onClose(() => closed++);

    ch.onclose?.();
    expect(closed).toBe(1);
  });
});

describe('整合：1 Hub + 3 Spoke 串接撐起 FfaLockstep', () => {
  it('4 端跑 ~60 幀 → standings/playerState JSON 一致', () => {
    const playerIds = ['host', 'g0', 'g1', 'g2'];
    const seed = 0xC0FFEE;

    // Host 有 3 條 channel（對應 g0/g1/g2）。
    const hubChannels = [mockChannel(), mockChannel(), mockChannel()];
    // 各 spoke 對 host 的 channel。
    const spokeChannels = [mockChannel(), mockChannel(), mockChannel()];

    const hub = new FfaHubTransport(hubChannels);
    const spokes = spokeChannels.map((ch) => new FfaSpokeTransport(ch));

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
        new FfaLockstep({ playerIds, localId, seed, transport: transports[i] }),
    );

    // 跑 60 幀，每端送空輸入（確定性，所有端同序推進）。
    const noop: InputAction[] = [];
    for (let f = 0; f < 60; f++) {
      for (const ls of locksteps) ls.tick(noop);
    }

    // 各端 confirmedFrame 至多相差 1（這個 ±1 偏移是 tick 迴圈內排序的固有現象，
    // 既有的 LoopbackHub 鎖步也一樣；只要「都已確認的幀」狀態一致即為正確）。
    const frames = locksteps.map((ls) => ls.confirmedFrame);
    expect(Math.max(...frames) - Math.min(...frames)).toBeLessThanOrEqual(1);
    expect(Math.min(...frames)).toBeGreaterThan(0); // 確實有在推進

    // 各端 standings + 每位玩家狀態的完整 JSON 指紋必須位元級一致
    //（證明這層星狀中繼能撐起 T4 確定性鎖步）。
    const snapshots = locksteps.map((ls) => {
      const match = ls.getMatch();
      return JSON.stringify({
        standings: ls.getStandings(),
        states: playerIds.map((id) => match.getPlayerState(id)),
      });
    });
    expect(new Set(snapshots).size).toBe(1);
  });
});
