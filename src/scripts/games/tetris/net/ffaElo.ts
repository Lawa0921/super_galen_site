/**
 * N 人名次制 ELO（純函式）。
 * 重用 elo.ts 的 expectedScore、K_FACTOR。
 * N=2 時數學退化為 1v1 updateRatings。
 */
import { expectedScore, K_FACTOR } from './elo';

/** 名次對戰分：我名次比對手前(數字小)=1、後=0、同=0.5。 */
export function placementScore(myPlacement: number, oppPlacement: number): number {
  if (myPlacement < oppPlacement) return 1;
  if (myPlacement > oppPlacement) return 0;
  return 0.5;
}

/**
 * N 人名次制 ELO 更新。
 * ΔR_i = K/(N-1) · Σ_{j≠i}(S_ij − E_ij)
 * S_ij = placementScore（依名次）、E_ij = expectedScore(Ri, Rj)。
 * 回傳每位玩家更新後的 rating（四捨五入整數）。
 * N=2 時數學上退化為 1v1 updateRatings。
 * 入參：players = [{ id, rating, placement }]（placement 1=冠軍，1..N 唯一）。
 */
export function updateRatingsNWay(
  players: Array<{ id: string; rating: number; placement: number }>,
): Record<string, number> {
  const n = players.length;
  const out: Record<string, number> = {};
  for (const p of players) {
    if (n < 2) {
      out[p.id] = Math.round(p.rating);
      continue;
    }
    let delta = 0;
    for (const q of players) {
      if (q.id === p.id) continue;
      delta += placementScore(p.placement, q.placement) - expectedScore(p.rating, q.rating);
    }
    out[p.id] = Math.round(p.rating + (K_FACTOR / (n - 1)) * delta);
  }
  return out;
}
