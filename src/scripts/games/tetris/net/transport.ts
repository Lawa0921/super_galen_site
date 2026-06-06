export interface Transport {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  close(): void;
}

class Loopback implements Transport {
  private cb: ((d: string) => void) | null = null;
  peer: Loopback | null = null;
  send(data: string): void { this.peer?.cb?.(data); }
  onMessage(cb: (d: string) => void): void { this.cb = cb; }
  close(): void { this.cb = null; }
}

export const LoopbackPair = {
  create(): { a: Transport; b: Transport } {
    const a = new Loopback();
    const b = new Loopback();
    a.peer = b;
    b.peer = a;
    return { a, b };
  },
};
