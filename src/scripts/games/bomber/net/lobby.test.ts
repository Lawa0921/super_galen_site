import { describe, it, expect } from 'vitest';
import { BomberLobby, type BomberStartPayload } from './lobby';
import type { CharacterId } from '../engine/types';

/** 確定性 rng（注入用）：每次回傳遞增的固定值，避免 Math.random 破壞可重播。 */
function makeSeqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('BomberLobby — 角色與初始狀態', () => {
  it('host 建立 lobby：自己先入座（index 0）、狀態 waiting、role=host', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    expect(lobby.role).toBe('host');
    expect(lobby.state).toBe('waiting');
    expect(lobby.players).toEqual([{ id: 'host', character: 'lena', ready: false }]);
    expect(lobby.isHost).toBe(true);
  });

  it('guest 建立 lobby：自己入座、role=guest、isHost=false、預設 arenaId=0', () => {
    const lobby = new BomberLobby({ role: 'guest', localId: 'g1', character: 'mira' });
    expect(lobby.role).toBe('guest');
    expect(lobby.isHost).toBe(false);
    expect(lobby.players).toEqual([{ id: 'g1', character: 'mira', ready: false }]);
    expect(lobby.arenaId).toBe(0);
  });

  it('可指定初始 arenaId', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena', arenaId: 5 });
    expect(lobby.arenaId).toBe(5);
  });
});

describe('BomberLobby — 加入 / 人數上限（2-4）', () => {
  function host(): BomberLobby {
    return new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
  }

  it('加入第 2~4 名玩家成功；第 5 名被拒（回 false，名單不變）', () => {
    const lobby = host();
    expect(lobby.addPlayer({ id: 'g1', character: 'mira' })).toBe(true);
    expect(lobby.addPlayer({ id: 'g2', character: 'aya' })).toBe(true);
    expect(lobby.addPlayer({ id: 'g3', character: 'rosa' })).toBe(true);
    expect(lobby.players.length).toBe(4);
    // 第 5 名 → 拒絕
    expect(lobby.addPlayer({ id: 'g4', character: 'lena' })).toBe(false);
    expect(lobby.players.length).toBe(4);
  });

  it('重複 id 加入 → 拒絕（不重複入座）', () => {
    const lobby = host();
    expect(lobby.addPlayer({ id: 'g1', character: 'mira' })).toBe(true);
    expect(lobby.addPlayer({ id: 'g1', character: 'aya' })).toBe(false);
    expect(lobby.players.length).toBe(2);
  });

  it('新加入玩家預設 ready=false', () => {
    const lobby = host();
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    expect(lobby.players.find((p) => p.id === 'g1')!.ready).toBe(false);
  });
});

describe('BomberLobby — ready 狀態與開局 gating', () => {
  function full2(): BomberLobby {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    return lobby;
  }

  it('未全員 ready → state 維持 waiting、canStart=false', () => {
    const lobby = full2();
    lobby.setReady('host', true);
    expect(lobby.state).toBe('waiting');
    expect(lobby.canStart()).toBe(false);
  });

  it('全員 ready 且 >=2 人 → state 轉 ready、canStart=true', () => {
    const lobby = full2();
    lobby.setReady('host', true);
    lobby.setReady('g1', true);
    expect(lobby.state).toBe('ready');
    expect(lobby.canStart()).toBe(true);
  });

  it('僅 1 人（host 自己）即使 ready 也不能開局（至少 2 人）', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    lobby.setReady('host', true);
    expect(lobby.canStart()).toBe(false);
    expect(lobby.state).toBe('waiting');
  });

  it('某玩家取消 ready → state 退回 waiting、canStart=false', () => {
    const lobby = full2();
    lobby.setReady('host', true);
    lobby.setReady('g1', true);
    expect(lobby.state).toBe('ready');
    lobby.setReady('g1', false);
    expect(lobby.state).toBe('waiting');
    expect(lobby.canStart()).toBe(false);
  });

  it('setReady 未知 id → 忽略（不丟例外、名單不變）', () => {
    const lobby = full2();
    expect(() => lobby.setReady('nobody', true)).not.toThrow();
    expect(lobby.players.every((p) => !p.ready)).toBe(true);
  });

  it('guest 不能 canStart（只有 host 能開局）即使全員 ready', () => {
    const lobby = new BomberLobby({ role: 'guest', localId: 'g1', character: 'mira' });
    lobby.addPlayer({ id: 'host', character: 'lena' });
    lobby.setReady('g1', true);
    lobby.setReady('host', true);
    expect(lobby.state).toBe('ready');
    expect(lobby.canStart()).toBe(false); // guest 端不主導開局
  });
});

describe('BomberLobby — arena 選擇（host，0-7）', () => {
  it('host 設定 arenaId 0..7 成功', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    expect(lobby.setArena(7)).toBe(true);
    expect(lobby.arenaId).toBe(7);
    expect(lobby.setArena(0)).toBe(true);
    expect(lobby.arenaId).toBe(0);
  });

  it('arenaId 超界（負數 / >=8 / 非整數）→ 拒絕、值不變', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena', arenaId: 3 });
    expect(lobby.setArena(8)).toBe(false);
    expect(lobby.setArena(-1)).toBe(false);
    expect(lobby.setArena(2.5)).toBe(false);
    expect(lobby.arenaId).toBe(3);
  });

  it('guest 不能改 arena（只有 host 決定）→ 拒絕、值不變', () => {
    const lobby = new BomberLobby({ role: 'guest', localId: 'g1', character: 'mira', arenaId: 1 });
    expect(lobby.setArena(4)).toBe(false);
    expect(lobby.arenaId).toBe(1);
  });
});

describe('BomberLobby — leave 處理', () => {
  function ready3(): BomberLobby {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    lobby.addPlayer({ id: 'g2', character: 'aya' });
    lobby.setReady('host', true);
    lobby.setReady('g1', true);
    lobby.setReady('g2', true);
    return lobby;
  }

  it('一名 guest 離開 → 從名單移除、state 退回 waiting', () => {
    const lobby = ready3();
    expect(lobby.state).toBe('ready');
    lobby.removePlayer('g2');
    expect(lobby.players.map((p) => p.id)).toEqual(['host', 'g1']);
    expect(lobby.state).toBe('waiting'); // 有人離開 → 回 waiting，需重新確認
  });

  it('leave 後其餘玩家的 ready 被清空（需重新就緒）', () => {
    const lobby = ready3();
    lobby.removePlayer('g2');
    expect(lobby.players.every((p) => !p.ready)).toBe(true);
  });

  it('移除 host 自己 / 未知 id → 安全（不丟例外）', () => {
    const lobby = ready3();
    expect(() => lobby.removePlayer('nobody')).not.toThrow();
    expect(lobby.players.length).toBe(3);
  });

  it('leave 至剩 1 人 → canStart=false', () => {
    const lobby = ready3();
    lobby.removePlayer('g1');
    lobby.removePlayer('g2');
    expect(lobby.players.length).toBe(1);
    expect(lobby.canStart()).toBe(false);
  });
});

describe('BomberLobby — host 建立 start payload（決定性 seed）', () => {
  function full3(): BomberLobby {
    const lobby = new BomberLobby({
      role: 'host',
      localId: 'host',
      character: 'lena',
      arenaId: 4,
      rng: makeSeqRng([0.5]),
    });
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    lobby.addPlayer({ id: 'g2', character: 'aya' });
    lobby.setReady('host', true);
    lobby.setReady('g1', true);
    lobby.setReady('g2', true);
    return lobby;
  }

  it('buildStartPayload：含 seed/arenaId/players（id+character，順序＝入座順序，host 在前）', () => {
    const lobby = full3();
    const payload = lobby.buildStartPayload();
    expect(payload).not.toBeNull();
    const p = payload as BomberStartPayload;
    expect(typeof p.seed).toBe('number');
    expect(Number.isFinite(p.seed)).toBe(true);
    expect(p.arenaId).toBe(4);
    expect(p.players).toEqual([
      { id: 'host', character: 'lena' },
      { id: 'g1', character: 'mira' },
      { id: 'g2', character: 'aya' },
    ]);
  });

  it('seed 由注入的 rng 決定（確定性可重播，非 Math.random 直用）', () => {
    const a = new BomberLobby({ role: 'host', localId: 'host', character: 'lena', rng: () => 0.123456789 });
    a.addPlayer({ id: 'g1', character: 'mira' });
    a.setReady('host', true);
    a.setReady('g1', true);
    const b = new BomberLobby({ role: 'host', localId: 'host', character: 'lena', rng: () => 0.123456789 });
    b.addPlayer({ id: 'g1', character: 'mira' });
    b.setReady('host', true);
    b.setReady('g1', true);
    // 相同 rng → 相同 seed（決定性）
    expect(a.buildStartPayload()!.seed).toBe(b.buildStartPayload()!.seed);
  });

  it('可接受外部指定 seed（覆蓋 rng）', () => {
    const lobby = full3();
    const payload = lobby.buildStartPayload({ seed: 987654 });
    expect(payload!.seed).toBe(987654);
  });

  it('未達開局條件（未全 ready / <2 人）→ buildStartPayload 回 null', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    // 未全 ready
    expect(lobby.buildStartPayload()).toBeNull();
  });

  it('guest 角色 → buildStartPayload 回 null（只有 host 出 payload）', () => {
    const lobby = new BomberLobby({ role: 'guest', localId: 'g1', character: 'mira' });
    lobby.addPlayer({ id: 'host', character: 'lena' });
    lobby.setReady('g1', true);
    lobby.setReady('host', true);
    expect(lobby.buildStartPayload()).toBeNull();
  });

  it('seed 落在 32-bit 無號整數範圍內（適合當 arena/RNG 種子）', () => {
    const lobby = full3();
    const seed = lobby.buildStartPayload()!.seed;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });

  it('start payload 的 characters 可直接組成 BomberLockstep 的 Record<string,CharacterId>', () => {
    const lobby = full3();
    const p = lobby.buildStartPayload()!;
    const characters: Record<string, CharacterId> = {};
    for (const pl of p.players) characters[pl.id] = pl.character;
    expect(characters).toEqual({ host: 'lena', g1: 'mira', g2: 'aya' });
  });
});

describe('BomberLobby — markStarting（開局後鎖定）', () => {
  it('canStart 時 markStarting → state=starting；之後 addPlayer/setReady 被忽略', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    lobby.addPlayer({ id: 'g1', character: 'mira' });
    lobby.setReady('host', true);
    lobby.setReady('g1', true);
    expect(lobby.markStarting()).toBe(true);
    expect(lobby.state).toBe('starting');
    // 鎖定後不再變動
    expect(lobby.addPlayer({ id: 'g2', character: 'aya' })).toBe(false);
    expect(lobby.players.length).toBe(2);
  });

  it('未達開局條件 markStarting → false、state 不變', () => {
    const lobby = new BomberLobby({ role: 'host', localId: 'host', character: 'lena' });
    expect(lobby.markStarting()).toBe(false);
    expect(lobby.state).toBe('waiting');
  });
});
