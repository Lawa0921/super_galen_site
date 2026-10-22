// coopUi.test.ts — 連線 HUD（DOM，happy-dom）：房號 chip、玩家名單（自己第一、延遲格式）、暫停選單「開放加入」按鈕文字
import { describe, it, expect, beforeEach } from 'vitest';
import { CoopUi, coopButtonLabel, playerLine, roomChipText } from './coopUi';

function mount(): { root: HTMLElement; ui: CoopUi } {
  document.body.innerHTML = `
    <main id="delve-root">
      <div class="delve-coop-box" id="delve-coop-box" hidden>
        <p class="delve-chip" id="delve-room-chip"></p>
        <ul class="delve-players" id="delve-players"></ul>
      </div>
      <button class="delve-btn" id="delve-coop" type="button">開放加入</button>
    </main>`;
  const root = document.getElementById('delve-root')!;
  return { root, ui: new CoopUi(root) };
}
const box = (): HTMLElement => document.getElementById('delve-coop-box')!;
const lines = (): string[] => [...document.querySelectorAll('#delve-players li')].map((li) => li.textContent ?? '');

describe('coopUi', () => {
  let m: ReturnType<typeof mount>;
  beforeEach(() => { m = mount(); });

  it('玩家名單：自己排第一、延遲格式「暱稱 · 45ms」、沒有延遲顯示 …', () => {
    m.ui.update({ show: true, room: 'ABCDE', rows: [
      { nick: '乙', self: false, rttMs: 45.4 },
      { nick: '丙', self: false, rttMs: null },
      { nick: '甲', self: true, rttMs: 80 },
    ] });
    expect(box().hidden).toBe(false);
    expect(lines()).toEqual(['甲（你） · 80ms', '乙 · 45ms', '丙 · …']);
    expect(document.querySelector('#delve-players li')?.classList.contains('is-self')).toBe(true);
    // 沒有延遲的概念（房主自己、客人看到的其他同伴）→ 只有暱稱
    expect(playerLine({ nick: '房主', self: true })).toBe('房主（你）');
    expect(playerLine({ nick: '丁', self: false })).toBe('丁');
    // 名單變短：多的列拿掉
    m.ui.update({ show: true, room: 'ABCDE', rows: [{ nick: '甲', self: true }] });
    expect(lines()).toEqual(['甲（你）']);
  });

  it('房號 chip 文字', () => {
    expect(roomChipText('ABCDE')).toBe('房號 ABCDE');
    m.ui.update({ show: true, room: 'XYZ23', rows: [] });
    expect(document.getElementById('delve-room-chip')?.textContent).toBe('房號 XYZ23');
    m.ui.update({ show: false, room: 'XYZ23', rows: [] });
    expect(box().hidden).toBe(true);
    m.ui.update({ show: true, room: 'XYZ23', rows: [] });
    m.ui.hide();
    expect(box().hidden).toBe(true);
    expect(lines()).toEqual([]);
  });

  it('暫停選單按鈕：沒開房「開放加入」、開放中「停止加入」、停止後「重新開放加入」', () => {
    expect(coopButtonLabel(null)).toBe('開放加入');
    expect(coopButtonLabel({ joining: true })).toBe('停止加入');
    expect(coopButtonLabel({ joining: false })).toBe('重新開放加入');
    m.ui.setButton({ joining: true });
    expect(document.getElementById('delve-coop')?.textContent).toBe('停止加入');
    m.ui.setButton(null);
    expect(document.getElementById('delve-coop')?.textContent).toBe('開放加入');
  });
});
