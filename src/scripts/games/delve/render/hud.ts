// hud.ts — DOM HUD：快捷欄、背包 + 合成面板、狀態列、提示 toast。
import type { DelveGame } from '../engine/game';
import { ITEMS } from '../engine/items';
import { HOTBAR_SIZE, INV_SIZE } from '../engine/constants';
import { drawIcon, type Atlas } from './textures';
import { countLabel, depthLabel, formatClock, recipeRows, regionLabel } from './model';
import { CHEST_SLOTS } from '../engine/loot';

/** 圖示以原生 16×16 烘進小 canvas，由 CSS 以整數倍（image-rendering: pixelated）放大 */
const ICON_PX = 16;

interface SlotEl { btn: HTMLButtonElement; ctx: CanvasRenderingContext2D | null; count: HTMLElement; sig: string; }

const CRAFT_FAIL: Record<string, string> = {
  missing: '材料不足', station: '需要靠近工作台', full: '背包放不下', unknown: '未知配方',
};

export class Hud {
  private hotbar: SlotEl[] = [];
  private grid: SlotEl[] = [];
  private chestGrid: SlotEl[] = [];
  private picked: number | null = null;
  private toastTimer = 0;
  private frame = 0;
  private recipeSig = '';
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private game: DelveGame,
    private readonly atlas: Atlas,
  ) {
    const hb = this.q('#delve-hotbar');
    hb.replaceChildren();
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = this.makeSlot(i, String((i + 1) % 10));
      s.btn.addEventListener('click', () => { this.game.selectSlot(i); this.refresh(); });
      hb.appendChild(s.btn);
      this.hotbar.push(s);
    }
    const g = this.q('#delve-inv-grid');
    g.replaceChildren();
    for (let i = 0; i < INV_SIZE; i++) {
      const s = this.makeSlot(i, i < HOTBAR_SIZE ? String((i + 1) % 10) : '');
      s.btn.addEventListener('click', () => this.clickInventory(i));
      g.appendChild(s.btn);
      this.grid.push(s);
    }
    const cg = this.root.querySelector<HTMLElement>('#delve-chest-grid');
    if (cg) {
      cg.replaceChildren();
      for (let i = 0; i < CHEST_SLOTS; i++) {
        const s = this.makeSlot(i, '');
        s.btn.addEventListener('click', () => { this.game.takeChestSlot(i); this.refresh(); });
        cg.appendChild(s.btn);
        this.chestGrid.push(s);
      }
    }
    const takeAll = this.root.querySelector('#delve-chest-takeall'), chestClose = this.root.querySelector('#delve-chest-close');
    const onTakeAll = (): void => {
      const n = this.game.takeAllFromChest();
      if (n) this.toast(`拿了 ${n} 樣東西`);
      this.refresh();
    };
    const onChestClose = (): void => this.game.closeChest();
    takeAll?.addEventListener('click', onTakeAll);
    chestClose?.addEventListener('click', onChestClose);
    this.offs.push(() => takeAll?.removeEventListener('click', onTakeAll), () => chestClose?.removeEventListener('click', onChestClose));
    const close = this.root.querySelector('#delve-inv-close');
    const invBtn = this.root.querySelector('#delve-inv-btn');
    const onClose = (): void => this.setInventory(false);
    const onToggle = (): void => this.toggleInventory();
    close?.addEventListener('click', onClose);
    invBtn?.addEventListener('click', onToggle);
    this.offs.push(() => close?.removeEventListener('click', onClose), () => invBtn?.removeEventListener('click', onToggle));
    const rec = this.q('#delve-recipes');
    const onRecipe = (e: Event): void => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-recipe]');
      if (!b?.dataset.recipe) return;
      const r = this.game.craft(b.dataset.recipe);
      if (!r.ok) this.toast(CRAFT_FAIL[r.reason] ?? '無法合成');
      this.refresh();
    };
    rec.addEventListener('click', onRecipe);
    this.offs.push(() => rec.removeEventListener('click', onRecipe));
    this.refresh();
  }

  setGame(game: DelveGame): void { this.game = game; this.recipeSig = ''; this.refresh(); }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  }

  private makeSlot(i: number, key: string): SlotEl {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'delve-slot';
    btn.dataset.slot = String(i);
    const c = document.createElement('canvas');
    c.width = ICON_PX; c.height = ICON_PX;
    c.className = 'delve-slot-icon';
    const count = document.createElement('span');
    count.className = 'delve-slot-count';
    btn.append(c, count);
    if (key) {
      const k = document.createElement('span');
      k.className = 'delve-slot-key';
      k.textContent = key;
      btn.appendChild(k);
    }
    return { btn, ctx: c.getContext('2d'), count, sig: '' };
  }

  private paintSlot(s: SlotEl, i: number, selected: boolean, from: (import('../engine/inventory').Stack | null)[] = this.game.inventory.slots): void {
    const st = from[i] ?? null;
    const sig = st ? `${st.item}:${st.count}` : '';
    if (sig !== s.sig) {
      s.sig = sig;
      if (s.ctx) drawIcon(this.atlas, s.ctx, st ? st.item : null, ICON_PX);
      s.count.textContent = countLabel(st);
      s.btn.title = st ? `${ITEMS[st.item].name.zh} ${ITEMS[st.item].name.en}` : '';
      s.btn.setAttribute('aria-label', st ? `${ITEMS[st.item].name.zh} ×${st.count}` : `空格 ${i + 1}`);
    }
    s.btn.classList.toggle('is-selected', selected);
  }

  private clickInventory(i: number): void {
    if (this.game.openChest) {
      // 開著箱子時：點背包格 = 整堆放進箱子
      if (!this.game.depositToChest(i)) this.toast('箱子放不下');
      this.refresh();
      return;
    }
    if (this.picked === null) {
      if (!this.game.inventory.slots[i]) return;
      this.picked = i;
    } else {
      if (this.picked !== i) this.game.inventory.swap(this.picked, i);
      this.picked = null;
    }
    this.refresh();
  }

  get inventoryOpen(): boolean { return !this.q('#delve-inv').hidden; }
  setInventory(open: boolean): void {
    this.q('#delve-inv').hidden = !open;
    this.picked = null;
    this.recipeSig = '';
    this.refresh();
  }
  toggleInventory(): void { this.setInventory(!this.inventoryOpen); }

  /** 箱子開 / 關（遊戲事件驅動）：開箱時一併打開背包，方便放入 */
  setChest(open: boolean): void {
    const el = this.root.querySelector<HTMLElement>('#delve-chest');
    if (el) el.hidden = !open;
    this.root.dataset.chest = open ? '1' : '';
    if (open && !this.inventoryOpen) this.setInventory(true);
    else this.refresh();
  }

  /** 背包變動後呼叫（事件驅動 + 定期保底） */
  refresh(): void {
    const sel = this.game.inventory.selected;
    for (let i = 0; i < this.hotbar.length; i++) this.paintSlot(this.hotbar[i], i, i === sel);
    const chest = this.game.chestSlots();
    if (chest) for (let i = 0; i < this.chestGrid.length; i++) this.paintSlot(this.chestGrid[i], i, false, chest);
    const held = this.game.inventory.selectedStack();
    this.q('#delve-held').textContent = held ? ITEMS[held.item].name.zh : '';
    if (!this.inventoryOpen) return;
    for (let i = 0; i < this.grid.length; i++) {
      this.paintSlot(this.grid[i], i, i === sel);
      this.grid[i].btn.classList.toggle('is-picked', this.picked === i);
    }
    const near = this.game.nearWorkbench();
    const rows = recipeRows(this.game.inventory, near);
    const sig = `${near}|` + rows.map((r) => `${r.id}${r.craftable ? 1 : 0}${r.inputs.map((a) => a.have).join(',')}`).join(';');
    if (sig === this.recipeSig) return;
    this.recipeSig = sig;
    this.q('#delve-station').textContent = near ? '工作台：附近有 ✓' : '工作台：不在附近（部分配方需要）';
    const ul = this.q('#delve-recipes');
    ul.replaceChildren();
    for (const r of rows) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'delve-recipe';
      b.dataset.recipe = r.id;
      b.disabled = !r.craftable;
      b.classList.toggle('is-ready', r.craftable);
      const icon = document.createElement('canvas');
      icon.width = ICON_PX; icon.height = ICON_PX;
      icon.className = 'delve-slot-icon';
      const ictx = icon.getContext('2d');
      if (ictx) drawIcon(this.atlas, ictx, r.out.item, ICON_PX);
      const name = document.createElement('span');
      name.className = 'delve-recipe-name';
      name.textContent = `${ITEMS[r.out.item].name.zh}${r.out.n > 1 ? ` ×${r.out.n}` : ''}`;
      const need = document.createElement('span');
      need.className = 'delve-recipe-need';
      need.textContent = r.inputs.map((a) => `${ITEMS[a.item].name.zh} ${a.have}/${a.n}`).join('、')
        + (r.needStation ? '（需工作台）' : '');
      b.append(icon, name, need);
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  /** 每幀呼叫；內部節流 */
  tick(): void {
    this.frame++;
    if (this.frame % 10 === 0) {
      const g = this.game, f = g.feetTile(), w = g.world;
      const area = regionLabel(w.biomeAt(f.x), g.structures, f.x, f.y);
      this.q('#delve-status').textContent = `${formatClock(g.time)} · ${area} · ${depthLabel(f.y, w.surfaceAt(f.x), w.cavernY, w.moltenY || Infinity)} · X ${f.x}`;
    }
    if (this.frame % 30 === 0) this.refresh();
  }

  toast(msg: string, ms = 1600): void {
    const el = this.q('#delve-toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('is-on'), ms);
  }

  destroy(): void {
    clearTimeout(this.toastTimer);
    for (const f of this.offs) f();
    this.q('#delve-hotbar').replaceChildren();
    this.q('#delve-inv-grid').replaceChildren();
    this.root.querySelector('#delve-chest-grid')?.replaceChildren();
  }
}
