import { describe, it, expect } from 'vitest';
import { FfaMatch, SeededRandomRouting, type FfaMatchEvent } from './ffa';
import { createRng } from './rng';

const IDS4 = ['p1', 'p2', 'p3', 'p4'];

/** 取出 incoming map（測試專用，繞過私有）。 */
function incomingOf(m: FfaMatch): Map<string, number> {
  return (m as unknown as { incoming: Map<string, number> }).incoming;
}
function setIncoming(m: FfaMatch, id: string, n: number): void {
  incomingOf(m).set(id, n);
}

describe('SeededRandomRouting', () => {
  it('從存活且非自己中選一名', () => {
    const r = new SeededRandomRouting();
    const rng = createRng(123);
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = r.pickTarget('p1', ['p1', 'p2', 'p3'], rng);
      expect(t).not.toBe('p1');
      expect(t === 'p2' || t === 'p3').toBe(true);
      if (t) picks.add(t);
    }
    // 至少要能挑到兩個對手（種子化、非退化）
    expect(picks.size).toBe(2);
  });

  it('只剩自己 → null', () => {
    const r = new SeededRandomRouting();
    expect(r.pickTarget('p1', ['p1'], createRng(1))).toBeNull();
  });

  it('空存活清單 → null', () => {
    const r = new SeededRandomRouting();
    expect(r.pickTarget('p1', [], createRng(1))).toBeNull();
  });

  it('同 rng 序列 → 同選擇（確定性）', () => {
    const a = new SeededRandomRouting();
    const b = new SeededRandomRouting();
    const ra = createRng(777);
    const rb = createRng(777);
    for (let i = 0; i < 30; i++) {
      expect(a.pickTarget('x', ['x', 'a', 'b', 'c'], ra)).toBe(
        b.pickTarget('x', ['x', 'a', 'b', 'c'], rb),
      );
    }
  });
});

describe('FfaMatch 初始化', () => {
  it('N 盤皆 playing、同 seed → 各盤初始 getState 一致', () => {
    const m = new FfaMatch(IDS4, { seed: 42 });
    expect(m.phase).toBe('playing');
    expect(m.aliveIds()).toEqual(IDS4);
    const states = IDS4.map((id) => m.getPlayerState(id));
    const ref = JSON.stringify(states[0]);
    for (const s of states) expect(JSON.stringify(s)).toBe(ref);
  });

  it('input 只影響該盤', () => {
    const m = new FfaMatch(IDS4, { seed: 42 });
    const x0 = m.getPlayerState('p1').active!.x;
    m.input('p1', 'left');
    expect(m.getPlayerState('p1').active!.x).toBe(x0 - 1);
    for (const id of ['p2', 'p3', 'p4']) {
      expect(m.getPlayerState(id).active!.x).toBe(x0);
    }
  });

  it('pendingGarbage 初始皆 0', () => {
    const m = new FfaMatch(IDS4, { seed: 42 });
    for (const id of IDS4) expect(m.pendingGarbage(id)).toBe(0);
  });
});

describe('FfaMatch 攻擊量（沿用 computeAttack 已知值）', () => {
  it('single（combo0）attack 0 → 不送', () => {
    const m = new FfaMatch(IDS4, { seed: 42 });
    m.drainEvents();
    (m as unknown as { games: Map<string, { debugFillRowExceptOneAndDrop(): void } > }).games
      .get('p1')!.debugFillRowExceptOneAndDrop();
    m.step(0);
    // single combo0 → 0；無人收到垃圾
    for (const id of IDS4) expect(m.pendingGarbage(id)).toBe(0);
  });

  it('連段 combo 0,1,2 → 共送出 0+1+1=2（每次消行各自路由）+ attack 事件', () => {
    const m = new FfaMatch(IDS4, { seed: 5 });
    m.drainEvents();
    const g = (m as unknown as { games: Map<string, { debugFillRowExceptOneAndDrop(): void }> }).games.get('p1')!;
    // 三次消行（combo 0,1,2）在同一 step 內結算，各自呼叫 targetRng 選對手
    g.debugFillRowExceptOneAndDrop();
    g.debugFillRowExceptOneAndDrop();
    g.debugFillRowExceptOneAndDrop();
    m.step(0);
    const evs = m.drainEvents();
    const attacks = evs.filter((e): e is Extract<FfaMatchEvent, { kind: 'attack' }> => e.kind === 'attack' && e.from === 'p1');
    const totalSent = attacks.reduce((s, e) => s + e.amount, 0);
    expect(totalSent).toBe(2); // 0+1+1
    for (const a of attacks) expect(a.to).not.toBe('p1');
    // 全部送出的量加總應等於對手 incoming 總和
    const totalIncoming = ['p2', 'p3', 'p4'].reduce((s, id) => s + m.pendingGarbage(id), 0);
    expect(totalIncoming).toBe(2);
  });
});

describe('FfaMatch 抵銷與傾倒', () => {
  it('消行先抵銷自身待入、餘量才送對手', () => {
    const m = new FfaMatch(IDS4, { seed: 5 });
    setIncoming(m, 'p1', 1);
    m.drainEvents();
    const g = (m as unknown as { games: Map<string, { debugFillRowExceptOneAndDrop(): void }> }).games.get('p1')!;
    // 逐次結算：out 序列 0,1,1,2。incoming(p1)=1：
    //   #1 cancel(1,0)→incoming1 sent0；#2 cancel(1,1)→incoming0 sent0；
    //   #3 cancel(0,1)→sent1；#4 cancel(0,2)→sent2。共送 3，p1 歸 0。
    for (let i = 0; i < 4; i++) g.debugFillRowExceptOneAndDrop();
    m.step(0);
    expect(m.pendingGarbage('p1')).toBe(0);
    const evs = m.drainEvents();
    const attacks = evs.filter((e): e is Extract<FfaMatchEvent, { kind: 'attack' }> => e.kind === 'attack' && e.from === 'p1');
    const totalSent = attacks.reduce((s, e) => s + e.amount, 0);
    expect(totalSent).toBe(3);
    const totalIncoming = ['p2', 'p3', 'p4'].reduce((s, id) => s + m.pendingGarbage(id), 0);
    expect(totalIncoming).toBe(3);
  });

  it('落地未消行 → 傾倒自身待入垃圾並發 garbageIn', () => {
    const m = new FfaMatch(IDS4, { seed: 3 });
    setIncoming(m, 'p2', 3);
    m.drainEvents();
    m.input('p2', 'hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    expect(
      evs.some((e) => e.kind === 'garbageIn' && e.id === 'p2' && e.amount === 3),
    ).toBe(true);
    expect(m.pendingGarbage('p2')).toBe(0);
    expect(
      m.getPlayerState('p2').board.flat().filter((c) => c === 'G').length,
    ).toBeGreaterThan(0);
  });

  it('多來源累積的待入垃圾合併傾倒（單次 garbageIn）', () => {
    const m = new FfaMatch(IDS4, { seed: 3 });
    // 模擬兩名對手分別送來 2 與 4，合併為 6
    setIncoming(m, 'p2', 2);
    incomingOf(m).set('p2', incomingOf(m).get('p2')! + 4);
    m.drainEvents();
    m.input('p2', 'hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    const gin = evs.find((e): e is Extract<FfaMatchEvent, { kind: 'garbageIn' }> => e.kind === 'garbageIn' && e.id === 'p2');
    expect(gin).toBeDefined();
    expect(gin!.amount).toBe(6);
    expect(m.pendingGarbage('p2')).toBe(0);
  });
});

describe('FfaMatch 名次（淘汰反序）', () => {
  function topout(m: FfaMatch, id: string): void {
    // 灌滿垃圾再硬降觸發 spawn 失敗
    const g = (m as unknown as { games: Map<string, { receiveGarbage(n: number, h: number): void; input(a: string): void }> }).games.get(id)!;
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.input('hardDrop');
  }

  it('第一個倒的拿最差名次、最後存活＝placement 1 + phase result', () => {
    const m = new FfaMatch(IDS4, { seed: 3 });
    // p3 先倒（4 人 → placement 4）
    topout(m, 'p3');
    m.step(0);
    expect(m.getPlacement().get('p3')).toBe(4);
    expect(m.aliveIds()).toEqual(['p1', 'p2', 'p4']);
    expect(m.phase).toBe('playing');

    // p1 次倒（剩 3 人 → placement 3）
    topout(m, 'p1');
    m.step(0);
    expect(m.getPlacement().get('p1')).toBe(3);

    // p4 倒（剩 2 人 → placement 2），p2 最後存活 → placement 1 + result + victory
    topout(m, 'p4');
    m.step(0);
    expect(m.getPlacement().get('p4')).toBe(2);
    expect(m.getPlacement().get('p2')).toBe(1);
    expect(m.phase).toBe('result');
    const standings = m.getStandings();
    expect(standings[0]).toBe('p2'); // 冠軍
    expect(standings).toEqual(['p2', 'p4', 'p1', 'p3']);
    // 所有人都有 placement
    expect(m.getPlacement().size).toBe(4);
  });

  it('victory 事件含冠軍 id', () => {
    const m = new FfaMatch(['a', 'b'], { seed: 9 });
    const g = (m as unknown as { games: Map<string, { receiveGarbage(n: number, h: number): void; input(a: string): void }> }).games.get('b')!;
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.input('hardDrop');
    m.step(0);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'victory' && e.id === 'a')).toBe(true);
    expect(m.getPlacement().get('a')).toBe(1);
    expect(m.getPlacement().get('b')).toBe(2);
  });
});

describe('FfaMatch 同幀多人 topout（playerIds 順序 tie-break）', () => {
  it('同幀 p1 與 p3 一起倒 → 依 playerIds 順序決定名次', () => {
    const m = new FfaMatch(IDS4, { seed: 3 });
    const games = (m as unknown as { games: Map<string, { receiveGarbage(n: number, h: number): void; input(a: string): void }> }).games;
    for (const id of ['p1', 'p3']) {
      const g = games.get(id)!;
      for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
      g.input('hardDrop');
    }
    m.step(0);
    // 4 人同幀倒 2 人：先處理者（playerIds 序 p1 在 p3 前）先被淘汰 → 較差名次
    // 剩 4 人時 p1 倒 → placement 4；剩 3 人時 p3 倒 → placement 3
    expect(m.getPlacement().get('p1')).toBe(4);
    expect(m.getPlacement().get('p3')).toBe(3);
    expect(m.aliveIds()).toEqual(['p2', 'p4']);
    expect(m.phase).toBe('playing');
  });
});

describe('FfaMatch determinism（命脈）', () => {
  function run(seed: number): { standings: string[]; states: string } {
    const ids = ['alpha', 'bravo', 'charlie', 'delta'];
    const m = new FfaMatch(ids, { seed });
    const games = (m as unknown as { games: Map<string, { debugFillRowExceptOneAndDrop(): void }> }).games;
    // 同一套輸入序列：讓不同盤製造攻擊/垃圾互動
    for (let round = 0; round < 6; round++) {
      games.get('alpha')!.debugFillRowExceptOneAndDrop();
      games.get('charlie')!.debugFillRowExceptOneAndDrop();
      m.step(16);
      m.input('bravo', 'left');
      m.input('delta', 'rotateCW');
      m.step(16);
    }
    return {
      standings: m.getStandings(),
      states: JSON.stringify(ids.map((id) => m.getPlayerState(id))),
    };
  }

  it('同 seed 兩場跑同一輸入序列 → standings 與各盤狀態完全一致', () => {
    const a = run(2024);
    const b = run(2024);
    expect(a.standings).toEqual(b.standings);
    expect(a.states).toBe(b.states);
  });

  it('targetRng 序列同 seed 可重現', () => {
    const seq = (seed: number): number[] => {
      const m = new FfaMatch(IDS4, { seed });
      const r = (m as unknown as { targetRng: () => number }).targetRng;
      return [r(), r(), r(), r(), r()];
    };
    expect(seq(31)).toEqual(seq(31));
  });

  it('holeRng 序列同 seed 可重現（沿用 1v1 種子化垃圾洞）', () => {
    const seq = (seed: number): number[] => {
      const m = new FfaMatch(IDS4, { seed });
      const r = (m as unknown as { holeRng: () => number }).holeRng;
      return [r(), r(), r()];
    };
    expect(seq(31)).toEqual(seq(31));
  });

  it('全盤共用同一 seed（禁 seed+i）：各盤 next 隊列一致', () => {
    const m = new FfaMatch(IDS4, { seed: 99 });
    const refNext = JSON.stringify(m.getPlayerState('p1').next);
    for (const id of IDS4) {
      expect(JSON.stringify(m.getPlayerState(id).next)).toBe(refNext);
    }
  });
});

describe('FfaMatch N=2 行為與 1v1 直覺一致', () => {
  it('一方倒 → 另一方冠軍、result', () => {
    const m = new FfaMatch(['A', 'B'], { seed: 7 });
    expect(m.aliveIds()).toEqual(['A', 'B']);
    const g = (m as unknown as { games: Map<string, { receiveGarbage(n: number, h: number): void; input(a: string): void }> }).games.get('A')!;
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.input('hardDrop');
    m.step(0);
    expect(m.phase).toBe('result');
    expect(m.getStandings()).toEqual(['B', 'A']);
    expect(m.getPlacement().get('B')).toBe(1);
    expect(m.getPlacement().get('A')).toBe(2);
  });

  it('N=2 攻擊只能送給唯一對手', () => {
    const m = new FfaMatch(['A', 'B'], { seed: 5 });
    m.drainEvents();
    const g = (m as unknown as { games: Map<string, { debugFillRowExceptOneAndDrop(): void }> }).games.get('A')!;
    g.debugFillRowExceptOneAndDrop();
    g.debugFillRowExceptOneAndDrop();
    g.debugFillRowExceptOneAndDrop();
    m.step(0);
    expect(m.pendingGarbage('B')).toBe(2);
    expect(m.pendingGarbage('A')).toBe(0);
  });
});
