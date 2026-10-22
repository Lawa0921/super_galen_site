import { describe, it, expect } from 'vitest';
import { LoopbackNet } from './loopback';
import type { Channel, Payload } from './link';

type Got = { t: number; ch: Channel; d: Payload };

function collect(net: LoopbackNet, link: { onMessage(cb: (ch: Channel, d: Payload) => void): void }): Got[] {
  const out: Got[] = [];
  link.onMessage((ch, d) => out.push({ t: net.now, ch, d }));
  return out;
}

describe('LoopbackNet', () => {
  it('零延遲：advance(0) 才送達、不在 send 裡同步回呼', () => {
    const net = new LoopbackNet();
    const { host, guest } = net.pair();
    const got = collect(net, guest);
    host.send('ctrl', 'hi');
    expect(got.length).toBe(0);
    net.advance(0);
    expect(got.length).toBe(1);
  });

  it('可靠通道有序', () => {
    for (const ch of ['ctrl', 'bulk'] as const) {
      const net = new LoopbackNet({ latencyMs: [50, 150], loss: 0.5 });
      const { host, guest } = net.pair();
      const got = collect(net, guest);
      for (let i = 0; i < 200; i++) host.send(ch, String(i));
      net.flush();
      expect(got.map((g) => g.d)).toEqual(Array.from({ length: 200 }, (_, i) => String(i)));
    }
  });

  it('state 丟包率與亂序', () => {
    const run = (reorder: boolean) => {
      const net = new LoopbackNet({ loss: 0.3, latencyMs: [10, 200], reorder });
      const { host, guest } = net.pair();
      const got = collect(net, guest);
      for (let i = 0; i < 10000; i++) host.send('state', String(i));
      net.flush();
      const s = net.stats();
      return { ratio: s.dropped / s.sent, seq: got.map((g) => Number(g.d)) };
    };
    const a = run(true);
    expect(a.ratio).toBeGreaterThan(0.27);
    expect(a.ratio).toBeLessThan(0.33);
    expect(a.seq.some((v, i) => i > 0 && v < a.seq[i - 1])).toBe(true);
    const b = run(false);
    expect(b.seq.every((v, i) => i === 0 || v > b.seq[i - 1])).toBe(true);
  });

  it('延遲範圍', () => {
    const net = new LoopbackNet({ latencyMs: [100, 200] });
    const { host, guest } = net.pair();
    const got = collect(net, guest);
    host.send('ctrl', 'x');
    net.advance(99);
    expect(got.length).toBe(0);
    net.advance(101);
    expect(got.length).toBe(1);
  });

  it('決定性', () => {
    const run = (seed: string) => {
      const net = new LoopbackNet({ seed, latencyMs: [0, 100], loss: 0.2 });
      const { host, guest } = net.pair();
      const got = collect(net, guest);
      for (let i = 0; i < 100; i++) {
        host.send(i % 3 === 0 ? 'ctrl' : 'state', String(i));
        if (i % 7 === 0) net.advance(13);
      }
      net.flush();
      return got;
    };
    expect(run('a')).toEqual(run('a'));
    expect(run('a')).not.toEqual(run('b'));
  });

  it('複製 Uint8Array', () => {
    const net = new LoopbackNet();
    const { host, guest } = net.pair();
    const got = collect(net, guest);
    const src = new Uint8Array([1, 2, 3]);
    host.send('bulk', src);
    src[0] = 99;
    net.flush();
    const d = got[0].d as Uint8Array;
    expect(Array.from(d)).toEqual([1, 2, 3]);
    expect(d).not.toBe(src);
  });

  it('close 與 sever', () => {
    const net = new LoopbackNet();
    const { host, guest } = net.pair();
    const gotG = collect(net, guest);
    let hc = 0, gc = 0;
    host.onClose(() => hc++);
    guest.onClose(() => gc++);
    host.close('bye');
    host.close('again');
    expect([hc, gc]).toEqual([1, 1]);
    expect(host.open).toBe(false);
    expect(guest.open).toBe(false);
    host.send('ctrl', 'x');
    net.flush();
    expect(gotG.length).toBe(0);

    const n2 = new LoopbackNet({ latencyMs: [100, 100] });
    const p = n2.pair();
    const g2 = collect(n2, p.guest);
    let c2 = 0;
    p.host.onClose(() => c2++);
    p.guest.onClose(() => c2++);
    p.host.send('ctrl', 'a');
    p.guest.send('ctrl', 'b');
    n2.sever(p.host, 'cut');
    expect(n2.stats().dropped).toBe(2);
    expect(c2).toBe(2);
    n2.flush();
    expect(g2.length).toBe(0);
  });

  it('buffered', () => {
    const net = new LoopbackNet({ latencyMs: [100, 100] });
    const { host, guest } = net.pair();
    collect(net, guest);
    for (let i = 0; i < 3; i++) host.send('bulk', new Uint8Array(1000));
    expect(host.buffered('bulk')).toBe(3000);
    expect(guest.buffered('bulk')).toBe(0);
    net.flush();
    expect(host.buffered('bulk')).toBe(0);
  });

  it('多對', () => {
    const net = new LoopbackNet();
    const a = net.pair();
    const b = net.pair();
    const ga = collect(net, a.guest);
    const gb = collect(net, b.guest);
    a.host.send('ctrl', 'A');
    net.flush();
    expect(ga.length).toBe(1);
    expect(gb.length).toBe(0);
  });
});
