import { CHARACTERS } from '../../data/characters';
import { artIdOf } from '../../ui/art';
import { T } from '../../data/text.zh-TW';
import { MAX_ACTIVE, ROWS, rowOfCell } from '../../engine/formation';
import { activeIds } from '../../engine/party';
import type { CharacterId } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, backControl, win } from '../widgets';

/** Formation: a 3x3 grid (front row on top, nearest the enemies); pick a cell, then who stands there. */
export class FormationScene implements Scene {
  private body!: HTMLElement;
  private gridEl!: HTMLElement;
  private count!: HTMLElement;
  private msg!: HTMLElement;
  private cursor = 0;
  private pickView: MenuView | null = null;
  private pickWin: HTMLElement | null = null;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    const t = T.ui2.formation;
    this.gridEl = win('slx-formation-grid');
    this.count = el('p', { class: 'slx-formation-count' });
    this.msg = el('p', { class: 'slx-formation-msg', attrs: { role: 'status' } });
    const info = win('slx-formation-info', [
      el('h3', { text: t.title }), this.count,
      el('ul', { class: 'slx-formation-rules' }, t.rules.map((r) => el('li', { text: r }))),
      this.msg, el('p', { class: 'slx-hint', text: t.hint }),
    ]);
    const bg = this.ctx.art.has(art.scene('guild')) ? [el('img', { class: 'slx-bg slx-bg-dim', attrs: { src: art.scene('guild'), alt: '' } })] : [];
    this.body = el('div', { class: 'slx-scene slx-formation-scene' }, [...bg, this.gridEl, info, backControl(() => this.onAction('cancel'))]);
    root.append(this.body);
    this.render();
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.pickView) { this.pickView.onAction(a); return; }
    const [r, c] = [Math.floor(this.cursor / 3), this.cursor % 3];
    const move = (nr: number, nc: number) => {
      const next = Math.max(0, Math.min(2, nr)) * 3 + Math.max(0, Math.min(2, nc));
      if (next !== this.cursor) { this.cursor = next; this.ctx.sfx.cursor(); this.render(); }
    };
    if (a === 'up') move(r - 1, c);
    else if (a === 'down') move(r + 1, c);
    else if (a === 'left') move(r, c - 1);
    else if (a === 'right') move(r, c + 1);
    else if (a === 'confirm') this.openPick();
    else if (a === 'cancel') { this.ctx.sfx.cancel(); this.ctx.go(this.ctx.from ?? 'guild'); }
  }

  private get grid(): (CharacterId | null)[] { return this.ctx.game.state.party.grid; }

  /** The published normal face of a member (Rin's oath look after her oath), or nothing. */
  private faceUrl(id: CharacterId): string | undefined {
    const url = art.portrait(artIdOf(this.ctx.game.state.party.roster[id]), 'normal');
    return this.ctx.art.has(url) ? url : undefined;
  }

  private face(id: CharacterId): HTMLElement[] {
    const src = this.faceUrl(id);
    return src ? [el('img', { class: 'slx-cell-face', attrs: { src, alt: '' } })] : [];
  }

  private render(): void {
    const t = T.ui2;
    this.gridEl.replaceChildren(...ROWS.map((row, r) => el('div', { class: 'slx-formation-row' }, [
      el('span', { class: 'slx-row-label', text: t.rows[row] }),
      ...[0, 1, 2].map((c) => {
        const i = r * 3 + c;
        const id = this.grid[i];
        const cell = el('div', {
          class: ['slx-cell', id ? '' : 'slx-cell-empty', i === this.cursor ? 'slx-cell-sel' : ''].filter(Boolean).join(' '),
          attrs: { 'data-cell': String(i), role: 'button' },
        }, id ? [...this.face(id), el('span', { class: 'slx-cell-name', text: CHARACTERS[id].name })] : [el('span', { class: 'slx-cell-name', text: t.formation.empty })]);
        cell.addEventListener('click', () => {
          if (cell.closest('[inert]')) return;
          this.cursor = i;
          this.render();
          this.openPick();
        });
        return cell;
      }),
    ])));
    this.count.textContent = t.formation.count(activeIds(this.ctx.game.state.party).length, MAX_ACTIVE);
  }

  private openPick(): void {
    const p = this.ctx.game.state.party;
    const where = (id: CharacterId) => { const j = this.grid.indexOf(id); return j < 0 ? T.ui2.formation.reserve : T.ui2.rows[rowOfCell(j)]; };
    const items: MenuItem[] = p.recruited.map((id) => ({ id, label: CHARACTERS[id].name, right: where(id), icon: this.faceUrl(id) }));
    const here = this.grid[this.cursor];
    if (here && here !== 'hero') items.push({ id: '', label: T.ui2.formation.remove });
    this.ctx.sfx.confirm();
    this.pickView = new MenuView(new Menu(items), {
      pick: (it) => { this.closePick(); this.place((it.id || null) as CharacterId | null); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => { this.ctx.sfx.cancel(); this.closePick(); },
    }, 9);
    this.pickWin = win('slx-formation-pick', [el('div', { class: 'slx-who', text: T.ui2.formation.who }), this.pickView.el]);
    this.gridEl.setAttribute('inert', '');
    this.body.append(this.pickWin);
  }

  private closePick(): void {
    this.pickWin?.remove();
    this.pickWin = null;
    this.pickView = null;
    this.gridEl.removeAttribute('inert');
  }

  /** Put `id` in the cursor cell: someone already on the field swaps places; null takes the cell's member off. */
  private place(id: CharacterId | null): void {
    const g = [...this.grid];
    const i = this.cursor;
    if (id === null) g[i] = null;
    else {
      const j = g.indexOf(id);
      if (j >= 0) g[j] = g[i];
      g[i] = id;
    }
    const r = this.ctx.game.setFormation(g);
    if (!r.ok) {
      this.ctx.sfx.error();
      this.msg.textContent = T.reasons[r.reason] ?? T.reasons.invalid;
      return;
    }
    this.msg.textContent = '';
    this.ctx.sfx.confirm();
    this.render();
  }
}
