import { verifyMessage } from 'ethers';

/**
 * 錢包身分認證（鏈下、免 gas）：使用者用錢包對一段含 nonce 的訊息 signMessage，
 * 伺服器以 verifyMessage 回推地址驗證擁有權。
 */
export function buildSignInMessage(nonce: string): string {
  return `Dungeon Arcade 登入\n以此簽章證明錢包擁有權（不會送出交易、不花 gas）。\nnonce: ${nonce}`;
}

/** 驗證簽章是否由 expectedAddress 對 message 簽出。壞輸入回 false（不丟例外）。 */
export function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    return verifyMessage(message, signature).toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
