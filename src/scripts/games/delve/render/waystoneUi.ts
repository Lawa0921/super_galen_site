// waystoneUi.ts — 傳送碑面板（DOM）：按使用打開（engine 的 stone open 事件），列出已解鎖的碑（名字、方向與距離），
// 目前這顆標「你在這裡」不可按；其他按鈕 data-stone → game.travelStone。比照 settleUi 的傳送列表與關閉行為：
// × / Esc（closeTop）關閉、走出伸手距離（同箱子：reach + 1.5）自動收起、傳送成功收起並把鏡頭對過去。
// 伸手距離內就打得開，但要站到碑旁（stoneHere：footprint ± 2 格）才能傳：不在碑旁時目的地按鈕停用、顯示提示。
// 另外：走到碑旁時提示一次「按使用鍵開啟傳送碑」。內容一律 textContent / class 組成。
import type { DelveGame } from '../engine/game';
import type { Waystone } from '../engine/waystones';
import type { Renderer } from './renderer';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 從 from 欄到 to 欄的方向與距離：「東 3,240 格」/「西 12 格」/「就在這裡」 */
export function stoneDistText(from: number, to: number): string {
  const d = to - from;
  if (d === 0) return '就在這裡';
  return `${d > 0 ? '東' : '西'} ${Math.abs(d).toLocaleString('en-US')} 格`;
}

export class WaystoneUi {
  private readonly offs: (() => void)[] = [];
  /** 開著的面板是哪一顆碑的；null = 關著 */
  private stoneId: number | null = null;
  private sig = '';
  private frame = 0;
  /** 上一次「站在碑旁」是哪一顆（提示只在換到另一顆時跳一次） */
  private nearId: number | null = null;

  constructor(private root: HTMLElement, private game: DelveGame, private renderer: Renderer,
    private onToast: (m: string) => void = () => {}) {
    const on = (sel: string, fn: (e: Event) => void): void => {
      const b = root.querySelector(sel);
      if (!b) return;
      b.addEventListener('click', fn);
      this.offs.push(() => b.removeEventListener('click', fn));
    };
    on('#delve-stone-close', () => this.close());
    on('#delve-stone-list', (e) => this.onClick(e));
  }
  private q<T extends HTMLElement = HTMLElement>(sel: string): T | null { return this.root.querySelector<T>(sel); }

  get isOpen(): boolean { return !(this.q('#delve-stone')?.hidden ?? true); }
  open(id: number): void {
    this.stoneId = id;
    const p = this.q('#delve-stone');
    if (p) p.hidden = false;
    this.sig = '';
    this.render();
  }
  close(): void {
    const p = this.q('#delve-stone');
    if (p) p.hidden = true;
    this.stoneId = null;
  }
  /** Esc：開著就關掉 → true */
  closeTop(): boolean {
    if (!this.isOpen) return false;
    this.close();
    return true;
  }

  private here(): Waystone | null {
    return this.stoneId === null ? null : this.game.waystones.byId(this.stoneId);
  }
  private render(): void {
    const list = this.q('#delve-stone-list'), here = this.here(), g = this.game;
    if (!list) return;
    if (!here) { this.close(); return; }
    const stones = g.unlockedStones();
    const ready = g.stoneHere()?.id === here.id;
    const sig = `${here.id}#${ready ? 1 : 0}#${stones.map((s) => s.id).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const title = this.q('#delve-stone-title');
    if (title) title.textContent = here.name;
    const note = this.q('#delve-stone-note');
    if (note) note.textContent = ready ? '選一顆已解鎖的傳送碑傳過去。碰到新的傳送碑就會解鎖（同一個世界的人共用）。' : '走到傳送碑旁邊才能傳送。';
    list.replaceChildren();
    for (const s of stones) {
      const li = el('li', 'delve-stone-row');
      const b = el('button', s.id === here.id ? 'delve-btn delve-stone-item is-here' : 'delve-btn delve-stone-item');
      b.type = 'button';
      b.dataset.stone = String(s.id);
      b.disabled = s.id === here.id || !ready;
      b.append(el('span', 'delve-stone-name', s.name), el('span', 'delve-stone-dist', s.id === here.id ? '你在這裡' : stoneDistText(here.x, s.x)));
      li.appendChild(b);
      list.appendChild(li);
    }
  }
  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-stone]');
    if (!t || t.disabled || this.stoneId === null) return;
    if (this.game.act({ op: 'travelStone', to: Number(t.dataset.stone) })) { this.close(); this.renderer.snapCamera(); return; }
    this.sig = '';
    this.render();
  }

  // ── 每幀 ──
  tick(): void {
    this.frame++;
    if ((this.frame & 15) !== 0) return;
    const g = this.game, near = g.stoneHere();
    const nid = near ? near.id : null;
    if (nid !== this.nearId) {
      this.nearId = nid;
      if (nid !== null && !this.isOpen) this.onToast('按使用鍵開啟傳送碑');
    }
    if (!this.isOpen) return;
    // 走出伸手距離（同箱子：reach + 1.5）→ 收起
    const s = this.here(), r = g.reach() + 1.5;
    if (!s || g.dead || (!g.canReach(s.x, s.y - 1, r) && !g.canReach(s.x + 1, s.y - 1, r))) { this.close(); return; }
    this.render();
  }
  destroy(): void {
    for (const f of this.offs) f();
    this.offs.length = 0;
    this.close();
  }
}
