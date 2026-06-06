# Dungeon Arcade — Phase 6：線上對戰 + 排行榜 + ELO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。netcode 核心（固定步長確定性 + lockstep）走 TDD；signaling/WebRTC/UI/伺服器端走 build + 手動/e2e。

**Goal:** 讓兩位玩家在不同瀏覽器/裝置上開房間連線，用 WebRTC P2P 即時對戰；對戰結果記錄到自託管 KV，計算 ELO 與段位，提供排行榜。身分以暱稱（casual）或錢包簽章（ranked，鏈下免 gas）認證。

**核心架構決策（已與使用者確認）：**
- **連線**：WebRTC P2P（`RTCDataChannel`）。牽線（signaling）自託管：Vercel serverless function `/api/signal` + **Upstash Redis（KV）**暫存房間 offer/answer/ICE。連線建立後資料不再經伺服器。
- **同步**：**確定性鎖步（deterministic lockstep）**。雙方共用同一 `seed` 建 `TetrisMatch`，以**固定步長**（`SIM_DT = 1000/60`）模擬；每模擬幀交換「該幀輸入」，輸入帶 `INPUT_DELAY` 緩衝；只有湊齊雙方該幀輸入才前進 → 兩端狀態完全一致，只傳輸入不傳盤面。**渲染與模擬解耦**（render 讀 match 狀態，不再自己 step）。
- **身分**：暱稱（存 KV）或錢包；錢包用 `signMessage`（ethers v6 `verifyMessage`）鏈下驗證地址擁有權，**不上鏈、免 gas**。
- **積分**：ELO（K-factor）+ 段位（ELO 區間 → Bronze/Silver/Gold/Platinum/Diamond）。排行榜用 Redis ZSET。
- **防作弊（務實）**：P2P 無權威伺服器，結果由雙方回報；伺服器只在**雙方回報一致**時記分（兩端各自簽一份結果摘要），不一致則作廢。對作品集小遊戲足夠。
- **本地開發**：signaling 與 KV 提供記憶體 mock，`vercel dev` 或 dev 環境無金鑰時自動退回 mock，不卡開發。

**Tech Stack:** TypeScript、Vitest、PixiJS、ethers v6（已是依賴，用於簽章驗證）、`@upstash/redis`（serverless KV）、Vercel serverless functions、Playwright。重用 Phase 1–5 的 engine/match/render。

**Spec:** §3.5（線上對戰架構）。本階段把 §3.5 落實並擴充身分/ELO/排行。

---

## 子階段拆解（每階段可獨立交付）

- **6a 線上對戰核心**：固定步長確定性、lockstep（TDD）、transport 介面 + WebRTC、`/api/signal` 牽線 + Upstash（含 mock）、開/加房 UI、netMain 控制器（重用雙盤渲染）。產出：**兩瀏覽器可連線對戰（casual / 暱稱）**。
- **6b 身分認證**：暱稱輸入 + 錢包 `signMessage` 鏈下驗證（serverless 驗簽發 session）。
- **6c 對戰紀錄 + ELO**：結果雙方回報一致才入帳；serverless 計算 ELO/段位、寫 KV；對戰歷史。
- **6d 排行榜 UI**：Redis ZSET 取 Top N + 個人檔案/戰績頁。

本文件詳列 **6a**；6b–6d 在 6a 完成後各自展開計畫。

---

## 6a 檔案結構

```
src/scripts/games/tetris/net/
  lockstep.ts          # 固定步長 + 鎖步輸入交換（純邏輯，TDD）
  lockstep.test.ts
  determinism.test.ts  # 證明：同 seed + 同輸入序列 + 固定 dt → 兩 match 狀態一致
  transport.ts         # Transport 介面 + LoopbackTransport（測試/本地用）
  webrtcTransport.ts   # RTCDataChannel 實作 Transport（build）
  signalClient.ts      # 呼叫 /api/signal 建/加房、交換 SDP/ICE（build）
  netMain.ts           # 線上對戰進入點（重用 match 渲染；本地=人類、遠端=lockstep 餵入）
api/
  signal.ts            # Vercel serverless：房間配對 + SDP/ICE 中轉（Upstash KV，含 mock）
src/pages/games/
  tetris.astro         # ?mode=online → 開/加房 UI → netMain
```

---

## Task 1：固定步長確定性驗證（determinism.test.ts）— TDD

確認「同 seed + 同輸入（同幀同順序）+ 固定 dt」下，兩個獨立 `TetrisMatch` 狀態完全一致（lockstep 的根本前提）。

**Files:** Create `src/scripts/games/tetris/net/determinism.test.ts`

- [ ] **Step 1：寫測試**

```ts
import { describe, it, expect } from 'vitest';
import { TetrisMatch } from '../engine/match';

const SIM_DT = 1000 / 60;

function run(seed: number, script: Array<{ frame: number; side: 'A' | 'B'; action: any }>) {
  const m = new TetrisMatch({ seed });
  const byFrame = new Map<number, typeof script>();
  for (const s of script) {
    const arr = byFrame.get(s.frame) ?? [];
    arr.push(s);
    byFrame.set(s.frame, arr);
  }
  for (let f = 0; f < 300; f++) {
    const ins = byFrame.get(f) ?? [];
    // 固定順序：先 A 後 B
    for (const i of ins.filter((x) => x.side === 'A')) m.input('A', i.action);
    for (const i of ins.filter((x) => x.side === 'B')) m.input('B', i.action);
    m.step(SIM_DT);
  }
  return m;
}

describe('deterministic fixed-step match', () => {
  it('同 seed + 同輸入序列 + 固定 dt → 兩 match 盤面/分數完全一致', () => {
    const script = [
      { frame: 5, side: 'A' as const, action: 'left' as const },
      { frame: 5, side: 'B' as const, action: 'right' as const },
      { frame: 10, side: 'A' as const, action: 'hardDrop' as const },
      { frame: 12, side: 'B' as const, action: 'rotateCW' as const },
      { frame: 20, side: 'B' as const, action: 'hardDrop' as const },
    ];
    const a = run(42, script).a.getState();
    const b = run(42, script).a.getState();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // 不同 seed 應不同
    const c = run(43, script).a.getState();
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});
```

- [ ] **Step 2：執行** `npx vitest run src/scripts/games/tetris/net/determinism.test.ts`。預期 PASS（引擎已是確定性、無 Date/Math.random）。若 FAIL → 找出非確定性來源並修（屬引擎 bug）。
- [ ] **Step 3：Commit**（only determinism.test.ts）`test(tetris): prove fixed-step match determinism for netcode`

---

## Task 2：Transport 介面 + Loopback（transport.ts）— TDD

**Files:** Create `net/transport.ts` + `net/transport.test.ts`

- [ ] **Step 1：寫測試**

```ts
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
```

- [ ] **Step 2：實作 `net/transport.ts`**

```ts
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
```

- [ ] **Step 3：執行確認通過。Commit** `feat(tetris): add net Transport interface + loopback`

---

## Task 3：Lockstep 核心（lockstep.ts）— TDD

每模擬幀：本地輸入 stamped 到 `frame+INPUT_DELAY` 並送出；湊齊雙方某幀輸入才 step。用 `LoopbackPair` 串兩個 Lockstep，餵不同輸入，斷言**兩端對 match 的 A/B 狀態完全一致**。

**Files:** Create `net/lockstep.ts` + `net/lockstep.test.ts`

- [ ] **Step 1：寫測試**

```ts
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
});
```

- [ ] **Step 2：實作 `net/lockstep.ts`**

```ts
import { TetrisMatch, type Side } from '../engine/match';
import type { InputAction } from '../engine/game';
import type { Transport } from './transport';

const SIM_DT = 1000 / 60;
const INPUT_DELAY = 3; // 幀

interface FrameMsg { f: number; s: Side; a: InputAction[] }

export interface LockstepOptions {
  seed: number;
  localSide: Side;
  transport: Transport;
}

export class Lockstep {
  readonly match: TetrisMatch;
  private localSide: Side;
  private transport: Transport;
  private simFrame = 0;       // 下一個要模擬的幀
  private sendFrame = 0;      // 下一個要送出的本地輸入幀
  private pending: InputAction[] = []; // 本地累積、尚未送出的輸入
  private inbox: Record<Side, Map<number, InputAction[]>> = { A: new Map(), B: new Map() };

  constructor(opts: LockstepOptions) {
    this.match = new TetrisMatch({ seed: opts.seed });
    this.localSide = opts.localSide;
    this.transport = opts.transport;
    this.transport.onMessage((raw) => {
      const m = JSON.parse(raw) as FrameMsg;
      this.inbox[m.s].set(m.f, m.a);
    });
  }

  get confirmedFrame(): number { return this.simFrame; }

  /** 累積一個本地輸入（會在下次 tick 隨該幀送出）。 */
  pressLocal(action: InputAction): void { this.pending.push(action); }

  /** 每模擬幀呼叫一次：送本地輸入 + 盡量前進模擬。 */
  tick(): void {
    // 1) 送出本地這一幀的輸入（排程到 sendFrame + INPUT_DELAY）
    const targetFrame = this.sendFrame + INPUT_DELAY;
    const actions = this.pending;
    this.pending = [];
    this.inbox[this.localSide].set(targetFrame, actions); // 本地也存
    this.transport.send(JSON.stringify({ f: targetFrame, s: this.localSide, a: actions } as FrameMsg));
    this.sendFrame++;

    // 2) 盡量前進：需同時有 A、B 對 simFrame 的輸入
    while (this.inbox.A.has(this.simFrame) && this.inbox.B.has(this.simFrame)) {
      const aIn = this.inbox.A.get(this.simFrame)!;
      const bIn = this.inbox.B.get(this.simFrame)!;
      for (const act of aIn) this.match.input('A', act);
      for (const act of bIn) this.match.input('B', act);
      this.match.step(SIM_DT);
      this.inbox.A.delete(this.simFrame);
      this.inbox.B.delete(this.simFrame);
      this.simFrame++;
    }
  }
}
```

> 註：開局 frame 0..INPUT_DELAY-1 因 `targetFrame` 從 INPUT_DELAY 起算，雙方那幾幀沒有輸入 → 需在建構時為 `inbox[A/B]` 預填 frame 0..INPUT_DELAY-1 為空陣列（兩側都要），否則永遠卡在 simFrame 0。實作時於 constructor 補：`for (let f=0; f<INPUT_DELAY; f++){ this.inbox.A.set(f,[]); this.inbox.B.set(f,[]); }`。測試需通過此開局推進。

- [ ] **Step 3：執行確認通過**（兩端狀態 deep-equal、confirmedFrame 相同）。**Commit** `feat(tetris): add deterministic lockstep input sync`

---

## Task 4：WebRTC Transport（webrtcTransport.ts）— build + manual

- [ ] 實作 `WebRtcTransport implements Transport`：建立 `RTCPeerConnection`（公共 STUN）、`RTCDataChannel`；`send` 走 datachannel、`onMessage` 綁 `onmessage`。提供 `createOffer()/acceptOffer()/acceptAnswer()/addIce()` 給 signalClient 驅動握手。手動以兩分頁/兩機驗證連通。
- [ ] Commit `feat(tetris): add WebRTC datachannel transport`

---

## Task 5：Signaling serverless + Upstash（api/signal.ts + signalClient.ts）— build

- [ ] `api/signal.ts`（Vercel function）：動作 `create`（產房號、存 host offer）、`join`（取 offer、存 guest answer）、`poll`（取對方 answer/ICE）。用 `@upstash/redis`；**無金鑰時用記憶體 mock**（dev）。房號短碼、TTL 數分鐘。
- [ ] `signalClient.ts`：封裝 create/join/poll，驅動 `WebRtcTransport` 完成握手。
- [ ] 文件：README 註明需在 Vercel 設 `UPSTASH_REDIS_REST_URL` / `_TOKEN`。
- [ ] Commit `feat(tetris): add serverless signaling over Upstash (+ in-memory mock)`

---

## Task 6：線上 UI + netMain + e2e — build

- [ ] `netMain.ts`：重用 Phase 3 雙盤渲染；本地側＝人類輸入（1P 鍵位）→ `lockstep.pressLocal`；每 render 幀以固定步長累加驅動 `lockstep.tick()`；遠端側由 lockstep 餵入。連線/等待/斷線狀態畫面。
- [ ] `tetris.astro` `?mode=online`：開房（顯示房號）/ 加房（輸入房號）UI → signalClient → 連上 → netMain。
- [ ] e2e（chromium）：用 LoopbackTransport 注入兩個 Lockstep 的整合煙霧（不依賴真網路）；或頁面層以 mock signaling 驗 UI 流程。
- [ ] Commit `feat(tetris): online battle UI + netMain controller`

---

## Self-Review
- 範圍：6a 線上對戰核心（連線 + 同步 + 牽線 + UI）；6b–6d（認證/ELO/排行）後續。
- TDD：determinism（T1）、transport（T2）、lockstep（T3）為可測核心並有具體程式碼；WebRTC/serverless/UI 為 build+手動（網路相依）。
- 一致性：`Transport`、`Lockstep({seed,localSide,transport})`、`SIM_DT`、`INPUT_DELAY`、`FrameMsg` 跨任務一致；重用 `TetrisMatch.input/step/getState`。
- 風險：固定步長要與 render 解耦（netMain 不可用變動 dt step）；開局幀預填（已註明）；P2P 結果回報信任（6c 用雙方一致才入帳）；嚴格 NAT 可能需 TURN（後續）。
