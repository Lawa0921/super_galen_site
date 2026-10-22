// coopUi.ts — 連線 HUD（M-C Task 8）：#delve-coop-box 的房號 chip 與玩家名單、暫停選單 #delve-coop 的文字。
// 只管 DOM；誰在房裡、延遲多少由 session.ts 從 CoopHostSession / CoopGuestSession 讀出來給這裡。

/**
 * 名單的一列。rttMs：數字 = 延遲（ms）；null = 還沒量到（顯示 …）；不給 = 沒有延遲的概念
 * （房主自己；客人看到的其他同伴——客人只量得到自己到房主的延遲，C5）。
 */
export interface CoopRow { nick: string; self: boolean; rttMs?: number | null }
/** 房主的加入狀態（null = 還沒開房） */
export type CoopJoinState = { joining: boolean } | null;

export const roomChipText = (room: string): string => `房號 ${room}`;

export function playerLine(r: CoopRow): string {
  const name = `${r.nick}${r.self ? '（你）' : ''}`;
  if (r.rttMs === undefined) return name;
  return `${name} · ${r.rttMs === null ? '…' : `${Math.round(r.rttMs)}ms`}`;
}

/** 沒開房「開放加入」；開放中「停止加入」；停止後（手動或閒置自動停止）「重新開放加入」 */
export function coopButtonLabel(s: CoopJoinState): string {
  if (!s) return '開放加入';
  return s.joining ? '停止加入' : '重新開放加入';
}

export class CoopUi {
  private readonly box: HTMLElement | null;
  private readonly chip: HTMLElement | null;
  private readonly list: HTMLElement | null;
  private readonly btn: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.box = root.querySelector('#delve-coop-box');
    this.chip = root.querySelector('#delve-room-chip');
    this.list = root.querySelector('#delve-players');
    this.btn = root.querySelector('#delve-coop');
  }

  /** show = false 只藏起來（房號 / 名單照樣更新）；自己排第一，其餘照給的順序 */
  update(s: { show: boolean; room: string | null; rows: CoopRow[] }): void {
    if (this.box) this.box.hidden = !s.show;
    const chip = s.room ? roomChipText(s.room) : '';
    if (this.chip && this.chip.textContent !== chip) this.chip.textContent = chip;
    const list = this.list;
    if (!list) return;
    const rows = [...s.rows.filter((r) => r.self), ...s.rows.filter((r) => !r.self)];
    // 每秒更新一次：沿用既有的 li，只改文字（不重建，免得閃）
    while (list.children.length > rows.length) list.lastElementChild?.remove();
    rows.forEach((r, i) => {
      let li = list.children[i] as HTMLElement | undefined;
      if (!li) { li = document.createElement('li'); list.appendChild(li); }
      const t = playerLine(r);
      if (li.textContent !== t) li.textContent = t;
      li.classList.toggle('is-self', r.self);
    });
  }

  setButton(s: CoopJoinState): void {
    const t = coopButtonLabel(s);
    if (this.btn && this.btn.textContent !== t) this.btn.textContent = t;
  }

  /** 離開連線：藏起來、清空名單、按鈕回到「開放加入」 */
  hide(): void {
    this.update({ show: false, room: null, rows: [] });
    this.setButton(null);
  }
}
