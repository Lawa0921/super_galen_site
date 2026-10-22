// nameplates.ts — 遠端玩家頭上的名牌（DOM span.delve-nameplate，放在 #delve-wlabels；--x / --y = 畫面 CSS px）
import { PLAYER_W } from '../engine/constants';
import type { RemoteView } from './remotePlayers';

export class Nameplates {
  private tags = new Map<string, HTMLElement>();
  constructor(private readonly container: HTMLElement) {}

  update(views: readonly RemoteView[], worldToScreen: (x: number, y: number) => { x: number; y: number }): void {
    const seen = new Set<string>();
    for (const v of views) {
      if (!v.nick) continue;
      seen.add(v.pid);
      let t = this.tags.get(v.pid);
      if (!t) {
        t = document.createElement('span');
        t.className = 'delve-nameplate';
        this.tags.set(v.pid, t);
        this.container.appendChild(t);
      }
      if (t.textContent !== v.nick) t.textContent = v.nick;
      t.classList.toggle('is-dead', v.dead);
      // 頭頂上方：碰撞盒頂再往上幾 px（CSS 把標籤的底邊對到 --y）
      const p = worldToScreen(v.x + PLAYER_W / 2, v.y - 4);
      t.style.setProperty('--x', `${Math.round(p.x)}px`);
      t.style.setProperty('--y', `${Math.round(p.y)}px`);
    }
    for (const [k, t] of this.tags) if (!seen.has(k)) { t.remove(); this.tags.delete(k); }
  }

  destroy(): void {
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
  }
}
