import { describe, it, expect } from 'vitest';
import { shouldShowTouchNotice } from './touchNotice';

describe('shouldShowTouchNotice', () => {
  it('coarse pointer（觸控裝置）→ true（顯示提示、收掉入口）', () => {
    expect(shouldShowTouchNotice(true)).toBe(true);
  });

  it('fine pointer（桌機滑鼠）→ false（行為與一般桌機相同）', () => {
    expect(shouldShowTouchNotice(false)).toBe(false);
  });

  it('純函式：同輸入結果一致', () => {
    expect(shouldShowTouchNotice(true)).toBe(shouldShowTouchNotice(true));
    expect(shouldShowTouchNotice(false)).toBe(shouldShowTouchNotice(false));
  });
});
