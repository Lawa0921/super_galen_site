import { verifyMessage } from 'ethers';

/**
 * 錢包身分認證（鏈下、免 gas）：使用者用錢包對一段含 nonce 的訊息 signMessage，
 * 伺服器以 verifyMessage 回推地址驗證擁有權。
 */
export function buildSignInMessage(nonce: string): string {
  return `Dungeon Arcade 登入\n以此簽章證明錢包擁有權（不會送出交易、不花 gas）。\nnonce: ${nonce}`;
}

/** 對戰結果的標準簽章訊息（綁定 matchId/雙方/勝方，避免簽章被挪用）。 */
export function buildResultMessage(matchId: string, reporter: string, opponent: string, winner: string): string {
  return `Dungeon Arcade 對戰結果\nmatch: ${matchId}\nme: ${reporter}\nvs: ${opponent}\nwinner: ${winner}`;
}

/**
 * 大亂鬥（FFA/N 人）結果的標準簽章訊息：把 matchId 與「玩家→名次」對綁進去，
 * 避免簽章被挪用到別場或別的名次。格式穩定、雙方可由相同輸入重建。
 * sortedPlayerIds 與 sortedPlacements 為等長平行陣列（index 對齊）。
 */
export function buildFfaResultMessage(
  matchId: string,
  sortedPlayerIds: string[],
  sortedPlacements: number[],
): string {
  const pairs = sortedPlayerIds.map((id, i) => `${id}=${sortedPlacements[i]}`).join(',');
  return `Dungeon Arcade 大亂鬥結果\nmatch: ${matchId}\nstandings: ${pairs}`;
}

/** 驗證簽章是否由 expectedAddress 對 message 簽出。壞輸入回 false（不丟例外）。 */
export function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    return verifyMessage(message, signature).toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
