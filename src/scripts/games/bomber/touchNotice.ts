// src/scripts/games/bomber/touchNotice.ts

/**
 * 純函式：是否該顯示「需用鍵盤、請用電腦」提示並收掉遊玩入口。
 *
 * Dungeon Bomber 與 Tetris 一樣是純鍵盤操作（WASD/方向鍵 + Space + E/Shift），
 * 觸控裝置（手機／平板，多半無實體鍵盤）進場會無法移動／放炸彈，
 * 線上對戰更會直接被判離場（forfeit）。因此偵測到 coarse pointer 即顯示提示、
 * 攔掉遊玩與線上入口。
 *
 * 決定性：只依輸入的 coarse 旗標，不碰 matchMedia/Date.now/Math.random
 *（呼叫端負責把 matchMedia('(pointer: coarse)').matches 傳進來）。
 */
export function shouldShowTouchNotice(coarse: boolean): boolean {
  return coarse === true;
}
