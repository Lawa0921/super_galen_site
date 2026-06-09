import { describe, it, expect } from 'vitest';
import { MemoryRankStore } from './rankStore';
import { reportResult, leaderboard } from './ranking';
import { DEFAULT_RATING } from './elo';

const A = '0xaaa';
const B = '0xbbb';

describe('reportResult 結果共識', () => {
  it('單方回報 → pending、未計分', async () => {
    const s = new MemoryRankStore();
    expect(await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: A })).toBe('pending');
    expect(await s.getPlayer(A)).toBeNull();
  });

  it('雙方一致 → settled、贏家升分/輸家降分/勝負紀錄', async () => {
    const s = new MemoryRankStore();
    await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: A });
    expect(await reportResult(s, { matchId: 'm1', reporter: B, opponent: A, winner: A })).toBe('settled');
    const pa = await s.getPlayer(A);
    const pb = await s.getPlayer(B);
    expect(pa!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(pb!.rating).toBeLessThan(DEFAULT_RATING);
    expect(pa!.wins).toBe(1);
    expect(pb!.losses).toBe(1);
  });

  it('重複回報已結算對局 → already、不重複計分', async () => {
    const s = new MemoryRankStore();
    await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: A });
    await reportResult(s, { matchId: 'm1', reporter: B, opponent: A, winner: A });
    const rating = (await s.getPlayer(A))!.rating;
    expect(await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: A })).toBe('already');
    expect((await s.getPlayer(A))!.rating).toBe(rating);
  });

  it('雙方不一致 → conflict、不計分', async () => {
    const s = new MemoryRankStore();
    await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: A });
    expect(await reportResult(s, { matchId: 'm1', reporter: B, opponent: A, winner: B })).toBe('conflict');
    expect(await s.getPlayer(A)).toBeNull();
  });

  it('winner 非參賽者 → invalid', async () => {
    const s = new MemoryRankStore();
    expect(await reportResult(s, { matchId: 'm1', reporter: A, opponent: B, winner: '0xccc' })).toBe('invalid');
  });
});

describe('leaderboard', () => {
  it('依分數高→低排序並附段位', async () => {
    const s = new MemoryRankStore();
    await s.setPlayer('0x1', { rating: 1500, wins: 5, losses: 1, xp: 0, level: 1, games: 0, top3: 0 });
    await s.setPlayer('0x2', { rating: 1200, wins: 2, losses: 2, xp: 0, level: 1, games: 0, top3: 0 });
    await s.setPlayer('0x3', { rating: 1800, wins: 9, losses: 0, xp: 0, level: 1, games: 0, top3: 0 });
    const lb = await leaderboard(s, 10);
    expect(lb.map((r) => r.id)).toEqual(['0x3', '0x1', '0x2']);
    expect(lb[0].tier).toBe('Diamond');
    expect(lb[2].tier).toBe('Silver');
  });
});

describe('結算後累加 XP / 等級 / 場數', () => {
  it('雙方一致結算 → 勝方 xp40、敗方 xp10，兩人 games=1', async () => {
    const s = new MemoryRankStore();
    const A = '0xAAAA', B = '0xBBBB', mid = 'm1';
    expect(await reportResult(s, { matchId: mid, reporter: A, opponent: B, winner: A })).toBe('pending');
    expect(await reportResult(s, { matchId: mid, reporter: B, opponent: A, winner: A })).toBe('settled');
    const pa = await s.getPlayer(A);
    const pb = await s.getPlayer(B);
    expect(pa?.xp).toBe(40);
    expect(pa?.wins).toBe(1);
    expect(pa?.games).toBe(1);
    expect(pb?.xp).toBe(10);
    expect(pb?.losses).toBe(1);
    expect(pb?.games).toBe(1);
    expect(pa?.level).toBe(1);
  });
});
