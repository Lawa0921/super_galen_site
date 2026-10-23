// gen2Flag.ts — 1b M1 的 gen2 開發旗標（session 啟動時讀一次）。
// 旗標只管兩件事：(a) 新世界用 gen2（genVersion 8）；(b) 讀到舊世界（genVersion 7、正式尺寸）時烘焙升級（save/bake.ts）。
// 讀 genVersion 8 的存檔不看旗標。網址 ?gen2=1 → 記住（localStorage 'delve.gen2' = '1'）；?gen2=0 → 清掉；都沒有 → 看記住的值。

export const GEN2_FLAG_KEY = 'delve.gen2';

type FlagStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * 這一頁的 gen2 旗標。?gen2=1 → 寫入 'delve.gen2' = '1' 並回 true；?gen2=0 → 刪鍵回 false（網址決定這一次，寫入失敗也一樣）；
 * 都沒有 → store 的值是 '1' 才算開；store 是 null 或丟例外 → false。
 */
export function gen2Flag(search: string, store: FlagStore | null): boolean {
  const q = new URLSearchParams(search).get('gen2');
  if (q === '1' || q === '0') {
    try { if (q === '1') store?.setItem(GEN2_FLAG_KEY, '1'); else store?.removeItem(GEN2_FLAG_KEY); } catch { /* 無痕 / 被停用：只影響下一次 */ }
    return q === '1';
  }
  try { return store?.getItem(GEN2_FLAG_KEY) === '1'; } catch { return false; }
}
