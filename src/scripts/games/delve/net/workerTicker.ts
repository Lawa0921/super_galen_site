// workerTicker.ts — Worker 計時器（C18）：背景分頁的主執行緒 setInterval 會被節流到 1 秒一次，
// Worker 內的計時器不受影響，連線模擬與信令才不會停。
import { intervalTicker, type Ticker } from './loop';

export interface TickWorker {
  postMessage(ms: number): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}

// Worker 內：收到間隔就（重）設計時器，0 代表停
const SRC = 'let id = 0; onmessage = (e) => { clearInterval(id); if (e.data > 0) id = setInterval(() => postMessage(0), e.data); };';

function blobWorker(): TickWorker {
  const url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
  try {
    return new Worker(url) as unknown as TickWorker;
  } finally {
    URL.revokeObjectURL(url); // Worker 已取得腳本，網址可以收
  }
}

/** make 可注入（測試）。沒有 Worker 或建構失敗（CSP 等）就退回 setInterval 版 */
export function workerTicker(make?: () => TickWorker): Ticker {
  const build = make ?? (() => {
    if (typeof Worker !== 'function') throw new Error('no Worker');
    return blobWorker();
  });
  let worker: TickWorker | null = null;
  let fallback: Ticker | null = null;
  let gen = 0; // stop 之後才送達的訊息要丟掉
  const halt = () => {
    gen++;
    if (worker) {
      worker.onmessage = null;
      worker.postMessage(0);
      worker.terminate();
      worker = null;
    }
    if (fallback) { fallback.stop(); fallback = null; }
  };
  return {
    start(cb, everyMs) {
      halt();
      let w: TickWorker;
      try {
        w = build();
      } catch {
        fallback = intervalTicker();
        fallback.start(cb, everyMs);
        return;
      }
      worker = w;
      const mine = gen;
      w.onmessage = () => { if (mine === gen) cb(performance.now()); };
      w.postMessage(everyMs);
    },
    stop: halt,
  };
}
