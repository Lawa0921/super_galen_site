// hud.ts — DOM HUD：快捷欄、背包 + 裝備 + 合成面板、狀態列、提示 toast、生命愛心 / 魔力、首領血條、死亡畫面、道具說明。
import type { DelveGame } from '../engine/game';
import { ITEMS, type ItemId } from '../engine/items';
import { HOTBAR_SIZE, INV_SIZE } from '../engine/constants';
import { EQUIP_SLOTS, isAccSlot, type EquipSlot } from '../engine/equipment';
import { STATION_NAME } from '../engine/crafting';
import { SET_BONUS } from '../engine/combat';
import { ENEMIES } from '../engine/enemies';
import { drawIcon, type Atlas } from './textures';
import { countLabel, formatClock, recipeRows, statusText } from './model';
import { CHEST_SLOTS } from '../engine/loot';
import { heartFills, itemTooltip } from './tooltip';
import type { Stack } from '../engine/inventory';

/** 圖示以原生 16×16 烘進小 canvas，由 CSS 以整數倍（image-rendering: pixelated）放大 */
const ICON_PX = 16;

interface SlotEl { btn: HTMLButtonElement; ctx: CanvasRenderingContext2D | null; count: HTMLElement; sig: string; }

const CRAFT_FAIL: Record<string, string> = {
  missing: '材料不足', station: '需要靠近合成站', full: '背包放不下', unknown: '未知配方',
};
const SLOT_LABEL: Record<EquipSlot, string> = { head: '頭', body: '身', legs: '腿', acc0: '飾', acc1: '飾', acc2: '飾', acc3: '飾', acc4: '飾' };

// 9×8 像素愛心（'#' 本體、'h' 亮點）
const HEART = ['.##...##.', '#h##.####', '#h#######', '#########', '.#######.', '..#####..', '...###...', '....#....'];
const HEART_W = 9, HEART_H = 8, HEART_GAP = 1, PER_ROW = 10;

export class Hud {
  private hotbar: SlotEl[] = [];
  private grid: SlotEl[] = [];
  private chestGrid: SlotEl[] = [];
  private equip: SlotEl[] = [];
  private picked: number | null = null;
  private toastTimer = 0;
  private frame = 0;
  private recipeSig = '';
  private vitalsSig = '';
  private bossSig = '';
  private tipTimer = 0;
  private pressTimer = 0;
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
      // 右鍵：直接裝上（防具 / 飾品）
      s.btn.addEventListener('contextmenu', (e) => { e.preventDefault(); this.quickEquip(i); });
      g.appendChild(s.btn);
      this.grid.push(s);
    }
    const eq = this.root.querySelector<HTMLElement>('#delve-equip');
    if (eq) {
      eq.replaceChildren();
      EQUIP_SLOTS.forEach((slot, k) => {
        const s = this.makeSlot(k, '');
        s.btn.dataset.equip = slot;
        s.btn.classList.add(isAccSlot(slot) ? 'delve-slot--acc' : 'delve-slot--armor');
        const lab = document.createElement('span');
        lab.className = 'delve-slot-label';
        lab.textContent = SLOT_LABEL[slot];
        s.btn.appendChild(lab);
        s.btn.addEventListener('click', () => this.clickEquip(slot));
        eq.appendChild(s.btn);
        this.equip.push(s);
      });
    }
    const equipBtn = this.root.querySelector('#delve-equip-btn');
    const onEquipBtn = (): void => { if (this.picked !== null) this.quickEquip(this.picked); };
    equipBtn?.addEventListener('click', onEquipBtn);
    this.offs.push(() => equipBtn?.removeEventListener('click', onEquipBtn));
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
    this.bindTooltips();
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

  private paintSlot(s: SlotEl, i: number, selected: boolean, from: (Stack | null)[] = this.game.inventory.slots): void {
    this.paintStack(s, from[i] ?? null, i);
    s.btn.classList.toggle('is-selected', selected);
  }
  private paintStack(s: SlotEl, st: Stack | null, i: number): void {
    const sig = st ? `${st.item}:${st.count}` : '';
    if (sig === s.sig) return;
    s.sig = sig;
    if (s.ctx) drawIcon(this.atlas, s.ctx, st ? st.item : null, ICON_PX);
    s.count.textContent = countLabel(st);
    if (st) s.btn.dataset.item = st.item; else delete s.btn.dataset.item;
    s.btn.classList.toggle('is-filled', Boolean(st));
    s.btn.setAttribute('aria-label', st ? `${ITEMS[st.item].name.zh} ×${st.count}` : `空格 ${i + 1}`);
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
  /** 點裝備格：有選中的背包格 → 裝到這格；否則卸下 */
  private clickEquip(slot: EquipSlot): void {
    if (this.picked !== null) {
      const it = this.game.inventory.slots[this.picked]?.item;
      if (!this.game.equipFromInventory(this.picked, slot)) this.toast(it ? `${ITEMS[it].name.zh}不能裝在這裡` : '不能裝在這裡');
      this.picked = null;
    } else if (this.game.equipment.get(slot)) {
      if (!this.game.unequip(slot)) this.toast('背包已滿，卸不下來');
    }
    this.refresh();
  }
  /** 背包第 i 格自動裝上 */
  private quickEquip(i: number): void {
    const st = this.game.inventory.slots[i];
    if (!st) return;
    if (!this.game.equipFromInventory(i)) this.toast(ITEMS[st.item].armor || ITEMS[st.item].accessory ? '已經裝了同一件' : '這不是裝備');
    this.picked = null;
    this.refresh();
  }

  get inventoryOpen(): boolean { return !this.q('#delve-inv').hidden; }
  setInventory(open: boolean): void {
    this.q('#delve-inv').hidden = !open;
    this.picked = null;
    this.recipeSig = '';
    this.hideTip();
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
    this.refreshEquip();
    const near = this.game.stations();
    const rows = recipeRows(this.game.inventory, near);
    const sig = `${near.workbench}${near.furnace}${near.anvil}|` + rows.map((r) => `${r.id}${r.craftable ? 1 : 0}${r.inputs.map((a) => a.have).join(',')}`).join(';');
    if (sig === this.recipeSig) return;
    this.recipeSig = sig;
    const names = (Object.keys(near) as (keyof typeof near)[]).filter((k) => near[k]).map((k) => STATION_NAME[k]);
    this.q('#delve-station').textContent = names.length ? `附近的合成站：${names.join('、')} ✓` : '附近沒有合成站（工作台 / 熔爐 / 鐵砧）';
    const ul = this.q('#delve-recipes');
    ul.replaceChildren();
    // 可合成的排前面；缺站或缺料的排後面
    const sorted = [...rows].sort((a, b) => Number(b.craftable) - Number(a.craftable));
    for (const r of sorted) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'delve-recipe';
      b.dataset.recipe = r.id;
      b.dataset.item = r.out.item;
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
        + (r.needStation && r.station ? `（需${STATION_NAME[r.station]}）` : '');
      b.append(icon, name, need);
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  private refreshEquip(): void {
    const e = this.game.equipment;
    EQUIP_SLOTS.forEach((slot, k) => {
      const it = e.get(slot);
      this.paintStack(this.equip[k], it ? { item: it, count: 1 } : null, k);
    });
    const st = this.game.getState();
    const statsEl = this.root.querySelector('#delve-stats');
    if (statsEl) {
      const s = this.game.stats();
      statsEl.textContent = `防禦 ${st.defense}・生命 ${st.hp}/${st.maxHp}・傷害 ×${s.damageMul.toFixed(2)}・暴擊 +${Math.round(s.crit * 100)}%`
        + (st.setBonus ? `・套裝：${SET_BONUS[st.setBonus as keyof typeof SET_BONUS].text}` : '');
    }
    const btn = this.root.querySelector<HTMLElement>('#delve-equip-btn');
    if (btn) {
      const it = this.picked !== null ? this.game.inventory.slots[this.picked]?.item : undefined;
      btn.hidden = !(it && (ITEMS[it].armor || ITEMS[it].accessory));
    }
  }

  // ── 生命 / 魔力 / 首領 / 死亡 ─────────────────────────
  private drawVitals(): void {
    const st = this.game.getState();
    const showMana = st.mana < st.maxMana || ITEMS[st.held?.item ?? 'dirt'].weapon?.mana !== undefined;
    const sig = `${st.hp}/${st.maxHp}/${showMana ? st.mana : -1}`;
    if (sig === this.vitalsSig) return;
    this.vitalsSig = sig;
    const c = this.root.querySelector<HTMLCanvasElement>('#delve-hearts');
    const txt = this.root.querySelector('#delve-hp-text');
    if (txt) txt.textContent = `${st.hp} / ${st.maxHp}`;
    if (c) {
      const fills = heartFills(st.hp, st.maxHp);
      const cols = Math.min(PER_ROW, fills.length), rows = Math.ceil(fills.length / PER_ROW);
      const W = cols * (HEART_W + HEART_GAP) + 2, H = rows * (HEART_H + HEART_GAP) + 2;
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; c.dataset.rows = String(rows); }
      const x = c.getContext('2d');
      if (x) {
        x.clearRect(0, 0, W, H);
        fills.forEach((f, i) => {
          const ox = 1 + (i % PER_ROW) * (HEART_W + HEART_GAP), oy = 1 + Math.floor(i / PER_ROW) * (HEART_H + HEART_GAP);
          // 描邊
          x.fillStyle = '#0c0a12';
          HEART.forEach((row, ry) => [...row].forEach((v, rx) => { if (v !== '.') x.fillRect(ox + rx - 1, oy + ry - 1, 3, 3); }));
          HEART.forEach((row, ry) => [...row].forEach((v, rx) => {
            if (v === '.') return;
            const on = rx < Math.round(f * HEART_W);
            x.fillStyle = !on ? '#2c2838' : v === 'h' ? '#f2b888' : ry >= 5 ? '#a83a10' : '#e8701c';
            x.fillRect(ox + rx, oy + ry, 1, 1);
          }));
        });
      }
    }
    const m = this.root.querySelector<HTMLCanvasElement>('#delve-mana');
    if (m) {
      m.hidden = !showMana;
      if (showMana) {
        const x = m.getContext('2d');
        if (x) {
          const W = m.width, H = m.height, f = Math.round((st.mana / st.maxMana) * (W - 2));
          x.fillStyle = '#0c0a12'; x.fillRect(0, 0, W, H);
          x.fillStyle = '#18204a'; x.fillRect(1, 1, W - 2, H - 2);
          x.fillStyle = '#3e74c4'; x.fillRect(1, 1, f, H - 2);
          x.fillStyle = '#94c8ee'; x.fillRect(1, 1, f, 1);
          for (let k = 10; k < W - 1; k += 10) { x.fillStyle = '#0c0a12'; x.fillRect(k, 1, 1, H - 2); }
        }
      }
    }
  }
  private drawBoss(): void {
    const st = this.game.getState();
    const el = this.root.querySelector<HTMLElement>('#delve-boss');
    if (!el) return;
    const b = st.boss;
    const sig = b ? `${b.hp}/${b.maxHp}/${b.phase}` : '';
    if (sig === this.bossSig) return;
    this.bossSig = sig;
    el.hidden = !b;
    this.root.dataset.boss = b ? '1' : '';
    if (!b) return;
    const name = this.root.querySelector('#delve-boss-name');
    if (name) name.textContent = `${ENEMIES[b.kind].name.zh}${b.phase === 2 ? '・碎籠' : ''}`;
    const c = this.root.querySelector<HTMLCanvasElement>('#delve-boss-bar');
    const x = c?.getContext('2d');
    if (c && x) {
      const W = c.width, H = c.height, f = Math.round((b.hp / b.maxHp) * (W - 4));
      x.fillStyle = '#0c0a12'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#423f54'; x.fillRect(1, 1, W - 2, H - 2);
      x.fillStyle = '#1c1424'; x.fillRect(2, 2, W - 4, H - 4);
      x.fillStyle = b.phase === 2 ? '#e8701c' : '#2c8692'; x.fillRect(2, 2, f, H - 4);
      x.fillStyle = b.phase === 2 ? '#ffd86a' : '#a2c8b0'; x.fillRect(2, 2, f, 1);
      // 50% 刻度（第二階段門檻）
      x.fillStyle = '#ffd86a'; x.fillRect(2 + Math.round((W - 4) / 2), 1, 1, H - 2);
    }
  }
  private drawDeath(): void {
    const st = this.game.getState();
    const el = this.root.querySelector<HTMLElement>('#delve-death');
    if (!el) return;
    el.hidden = !st.dead;
    this.root.dataset.dead = st.dead ? '1' : '';
    if (st.dead) {
      const m = this.root.querySelector('#delve-death-msg');
      if (m) m.textContent = `${Math.ceil(st.respawnIn)} 秒後在${st.bed ? '床邊' : '出生點'}甦醒`;
    }
  }

  // ── 道具說明（滑鼠懸停 / 長按） ───────────────────────
  private bindTooltips(): void {
    const tip = this.root.querySelector<HTMLElement>('#delve-tip');
    if (!tip) return;
    const itemAt = (t: EventTarget | null): { el: HTMLElement; item: ItemId } | null => {
      const el = (t as HTMLElement | null)?.closest?.<HTMLElement>('[data-item]');
      return el && el.dataset.item && el.dataset.item in ITEMS ? { el, item: el.dataset.item as ItemId } : null;
    };
    const onOver = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      const h = itemAt(e.target);
      if (h) this.showTip(h.item, h.el); else this.hideTip();
    };
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse') return;
      const h = itemAt(e.target);
      clearTimeout(this.pressTimer);
      if (h) this.pressTimer = window.setTimeout(() => this.showTip(h.item, h.el, 2600), 420);
    };
    const onUp = (): void => { clearTimeout(this.pressTimer); };
    this.root.addEventListener('pointerover', onOver);
    this.root.addEventListener('pointerdown', onDown);
    this.root.addEventListener('pointerup', onUp);
    this.root.addEventListener('pointercancel', onUp);
    this.offs.push(() => {
      this.root.removeEventListener('pointerover', onOver);
      this.root.removeEventListener('pointerdown', onDown);
      this.root.removeEventListener('pointerup', onUp);
      this.root.removeEventListener('pointercancel', onUp);
    });
  }
  /** 顯示道具說明（放在格子下方；靠右 / 靠下時自動換邊，用 CSS 變數定位） */
  showTip(item: ItemId, anchor: HTMLElement, ms = 0): void {
    const tip = this.root.querySelector<HTMLElement>('#delve-tip');
    if (!tip) return;
    const lines = itemTooltip(item);
    tip.replaceChildren(...lines.map((l, i) => { const p = document.createElement('p'); p.className = i === 0 ? 'delve-tip-name' : 'delve-tip-line'; p.textContent = l; return p; }));
    tip.hidden = false;
    const r = anchor.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left - rr.left, y = r.bottom - rr.top + 6;
    if (x + tw > rr.width - 6) x = rr.width - tw - 6;
    if (y + th > rr.height - 6) y = r.top - rr.top - th - 6;
    tip.style.setProperty('--tx', `${Math.max(6, Math.round(x))}px`);
    tip.style.setProperty('--ty', `${Math.max(6, Math.round(y))}px`);
    clearTimeout(this.tipTimer);
    if (ms) this.tipTimer = window.setTimeout(() => this.hideTip(), ms);
  }
  hideTip(): void {
    const tip = this.root.querySelector<HTMLElement>('#delve-tip');
    if (tip) tip.hidden = true;
  }

  /** 每幀呼叫；內部節流 */
  tick(): void {
    this.frame++;
    this.drawVitals();
    this.drawBoss();
    this.drawDeath();
    if (this.frame % 10 === 0) {
      const g = this.game, f = g.feetTile(), w = g.world;
      // 區域：已發現的最小地區名（結構 > 生態區）；沒有就是未知之地
      const here = g.discovery.regionsAt(f.x, f.y).filter((r) => r.cat !== 'depth' && g.discovery.isFound(r.id)).sort((a, b) => a.w * a.h - b.w * b.h);
      const area = here[0]?.name ?? g.discovery.regionsAt(f.x, f.y).find((r) => g.discovery.isFound(r.id))?.name ?? '未知之地';
      const nav = g.navInfo();
      this.q('#delve-status').textContent = statusText({
        clock: formatClock(g.time), area, feetY: f.y, surface: w.surfaceAt(f.x), cavernY: w.cavernY, moltenY: w.moltenY || Infinity,
        east: nav.east, depth: nav.depth,
      });
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
    clearTimeout(this.tipTimer);
    clearTimeout(this.pressTimer);
    for (const f of this.offs) f();
    this.q('#delve-hotbar').replaceChildren();
    this.q('#delve-inv-grid').replaceChildren();
    this.root.querySelector('#delve-chest-grid')?.replaceChildren();
    this.root.querySelector('#delve-equip')?.replaceChildren();
  }
}
