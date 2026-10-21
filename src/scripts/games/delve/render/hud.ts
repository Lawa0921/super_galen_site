// hud.ts — DOM HUD：快捷欄、背包 + 裝備 + 合成面板、狀態列、提示 toast、生命愛心 / 魔力、首領血條、死亡畫面、道具說明。
import type { DelveGame } from '../engine/game';
import { ITEMS, type ItemId } from '../engine/items';
import { HOTBAR_SIZE, INV_SIZE } from '../engine/constants';
import { EQUIP_SLOTS, isAccSlot, type EquipSlot } from '../engine/equipment';
import { STATION_NAME } from '../engine/crafting';
import { SET_BONUS } from '../engine/combat';
import { ENEMIES } from '../engine/enemies';
import { drawBmpIcon, drawIcon, type Atlas } from './textures';
import { fashionIcon } from './fashionIcon';
import { tintKey } from '../engine/tint';
import { countLabel, recipeRows, statusText } from './model';
import { CHEST_SLOTS } from '../engine/loot';
import { heartFills } from './tooltip';
import type { Stack } from '../engine/inventory';
import { RARITIES, affixDef, affixText, gearName, gearSlot, rarityOf, type Cost } from '../engine/gear';
import type { ForgeResult } from '../engine/game';
import { gearTooltip, statRows } from './gearTip';
import { ToastQueue, TOAST_NORMAL } from './toastQueue';
import { VANITY_SLOTS, type HideSlot, type VanitySlot } from '../engine/vanity';
import { buildDollLook, dollKey, pieceOf, type DollLook } from '../engine/doll';
import { dollPreview } from './dollPreview';
import { toCanvas } from './pixel';
import { SHEET, type SheetAnim } from './avatarArt';

/** 圖示以原生 16×16 烘進小 canvas，由 CSS 以整數倍（image-rendering: pixelated）放大 */
const ICON_PX = 16;

interface SlotEl { btn: HTMLButtonElement; ctx: CanvasRenderingContext2D | null; count: HTMLElement; sig: string; }

const CRAFT_FAIL: Record<string, string> = {
  missing: '材料不足', station: '需要靠近合成站', full: '背包放不下', unknown: '未知配方',
};
const SLOT_LABEL: Record<EquipSlot, string> = { head: '頭', body: '身', legs: '腿', acc0: '飾', acc1: '飾', acc2: '飾', acc3: '飾', acc4: '飾' };
const VANITY_LABEL: Record<VanitySlot, string> = { head: '頭', body: '身', legs: '腿', back: '背', acc: '飾品' };
const HIDE_LABEL: Record<HideSlot, string> = { head: '頭盔', body: '胸甲', legs: '護脛' };
/** 背包紙娃娃預覽輪播：待機 → 走路 */
const DOLL_REEL: [SheetAnim, number][] = [['idle', 3], ['walk', 2]];
/** 9×6 像素眼睛：睜眼 = 顯示、閉眼 + 斜線 = 隱藏 */
const EYE_OPEN = ['..#####..', '.#wwwww#.', '#ww##ww.#', '#ww##ww.#', '.#wwwww#.', '..#####..'];
const EYE_SHUT = ['.........', '#.......#', '.#.....#.', '..#####..', '.#..#..#.', '.........'];
function drawEye(c: HTMLCanvasElement, open: boolean): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  (open ? EYE_OPEN : EYE_SHUT).forEach((row, y) => { for (let x = 0; x < row.length; x++) {
    const ch = row[x];
    if (ch === '.') continue;
    ctx.fillStyle = ch === 'w' ? '#f2e2b0' : open ? '#93cc50' : '#e8701c';
    if (open && (x === 4 || x === 3) && (y === 2 || y === 3)) ctx.fillStyle = '#1c1424';
    ctx.fillRect(x, y, 1, 1);
  } });
}
/** 這件道具穿在身上看得見嗎（防具 / 時裝 / 看得見的飾品）。trinket = 裝備欄的飾品槽（acc0..acc4）；時裝的 acc = 外觀欄的飾品格 */
function wearSlot(item: ItemId): VanitySlot | 'trinket' | null {
  const d = ITEMS[item];
  if (d.vanity) return d.vanity.slot;
  if (d.armor) return d.armor.slot;
  if (['jump_boots', 'swift_boots', 'feather_charm', 'chitin_buckler', 'night_amulet', 'fang_charm', 'warden_heart', 'magma_ward', 'compass', 'depth_meter', 'magnet', 'explorer_map'].includes(item)) return 'trinket';
  return null;
}
const FORGE_FAIL: Record<Exclude<ForgeResult, { ok: true }>['reason'], string> = {
  none: '先在背包選一件裝備', station: '要在鐵砧旁（4 格內）才能鍛造', cost: '材料不足（碎晶 / 星塵）', max: '已經到上限了', unique: '傳奇詞條不能洗煉', locked: '已鎖定',
};
const costText = (c: Cost): string => `碎晶 ${c.shard}${c.dust ? ` · 星塵 ${c.dust}` : ''}`;

// 9×8 像素愛心（'#' 本體、'h' 亮點）
const HEART = ['.##...##.', '#h##.####', '#h#######', '#########', '.#######.', '..#####..', '...###...', '....#....'];
const HEART_W = 9, HEART_H = 8, HEART_GAP = 1, PER_ROW = 10;

export class Hud {
  private hotbar: SlotEl[] = [];
  private grid: SlotEl[] = [];
  private chestGrid: SlotEl[] = [];
  private equip: SlotEl[] = [];
  private vanity: SlotEl[] = [];
  private hideBtns: { slot: HideSlot; btn: HTMLButtonElement }[] = [];
  /** 紙娃娃預覽：快取（key|anim → 各格 canvas）與輪播計數 */
  private dollFrames = new Map<string, HTMLCanvasElement[]>();
  private dollTick = 0;
  private dollDrawn = '';
  private picked: number | null = null;
  private toastTimer = 0;
  private frame = 0;
  private recipeSig = '';
  private vitalsSig = '';
  private bossSig = '';
  private tipTimer = 0;
  private pressTimer = 0;
  /** 鍛造台面板正在處理的那件裝備（追蹤物件本身，換格 / 裝上卸下都跟著走；null = 關著） */
  private forgeTarget: Stack | null = null;
  private readonly toasts = new ToastQueue();
  private toastShown = '';
  private toastLast = 0;
  private forgeSig = '';
  private confirmFn: (() => void) | null = null;
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
    const vy = this.root.querySelector<HTMLElement>('#delve-vanity');
    if (vy) {
      vy.replaceChildren();
      VANITY_SLOTS.forEach((slot, k) => {
        const s = this.makeSlot(k, '');
        s.btn.dataset.vanity = slot;
        s.btn.classList.add('delve-slot--vanity');
        const lab = document.createElement('span');
        lab.className = 'delve-slot-label';
        lab.textContent = VANITY_LABEL[slot];
        s.btn.appendChild(lab);
        s.btn.addEventListener('click', () => this.clickVanity(slot));
        vy.appendChild(s.btn);
        this.vanity.push(s);
      });
    }
    const hr = this.root.querySelector<HTMLElement>('#delve-hide-row');
    if (hr) {
      hr.replaceChildren();
      for (const slot of ['head', 'body', 'legs'] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'delve-hide';
        b.dataset.hide = slot;
        const lab = document.createElement('span');
        lab.textContent = VANITY_LABEL[slot];
        const eye = document.createElement('canvas');
        eye.width = 9; eye.height = 6;
        eye.className = 'delve-hide-eye';
        eye.setAttribute('aria-hidden', 'true');
        b.append(lab, eye);
        b.addEventListener('click', () => { this.game.act({ op: 'hideArmor', slot, hide: !this.game.vanity.hide[slot] }); this.refresh(); });
        hr.appendChild(b);
        this.hideBtns.push({ slot, btn: b });
      }
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
        s.btn.addEventListener('click', () => { this.game.act({ op: 'chestTake', slot: i }); this.refresh(); });
        cg.appendChild(s.btn);
        this.chestGrid.push(s);
      }
    }
    const takeAll = this.root.querySelector('#delve-chest-takeall'), chestClose = this.root.querySelector('#delve-chest-close');
    const onTakeAll = (): void => {
      const n = this.game.act({ op: 'chestTakeAll' });
      if (n) this.toast(`拿了 ${n} 樣東西`);
      this.refresh();
    };
    const onChestClose = (): void => this.game.act({ op: 'chestClose' });
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
      const r = this.game.act({ op: 'craft', recipe: b.dataset.recipe });
      if (!r.ok) this.toast(CRAFT_FAIL[r.reason] ?? '無法合成');
      this.refresh();
    };
    rec.addEventListener('click', onRecipe);
    this.offs.push(() => rec.removeEventListener('click', onRecipe));
    this.bindGear();
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
  /** tinted = 用這件的實際顏色畫（外觀欄的格子）；其他格子用圖集的原色圖示 */
  private paintStack(s: SlotEl, st: Stack | null, i: number, tinted = false): void {
    const g = st?.gear;
    const sig = st ? `${st.item}:${st.count}:${g ? `${g.rarity}.${g.plus}.${g.locked ? 1 : 0}.${g.affixes.map((a) => a.id + a.value).join(',')}` : ''}:${tintKey(st.tint)}` : '';
    if (sig === s.sig) return;
    s.sig = sig;
    if (s.ctx) {
      const tintIcon = tinted && st?.tint ? fashionIcon(st.item, st.tint) : null;
      if (tintIcon) drawBmpIcon(s.ctx, tintIcon, ICON_PX);
      else drawIcon(this.atlas, s.ctx, st ? st.item : null, ICON_PX);
    }
    s.count.textContent = g?.plus ? `+${g.plus}` : countLabel(st);
    if (st) s.btn.dataset.item = st.item; else delete s.btn.dataset.item;
    // 稀有度外框（只有裝備才有；沒有詞條資料 = 普通）
    if (st && gearSlot(st.item)) s.btn.dataset.rarity = String(rarityOf(g)); else delete s.btn.dataset.rarity;
    s.btn.classList.toggle('is-locked', Boolean(g?.locked));
    s.btn.classList.toggle('is-filled', Boolean(st));
    const name = st ? (gearSlot(st.item) ? `${RARITIES[rarityOf(g)].zh} ${gearName(st.item, g)}` : ITEMS[st.item].name.zh) : '';
    s.btn.setAttribute('aria-label', st ? `${name} ×${st.count}${g?.locked ? '（已鎖定）' : ''}` : `空格 ${i + 1}`);
  }

  private clickInventory(i: number): void {
    if (this.game.openChest) {
      // 開著箱子時：點背包格 = 整堆放進箱子
      if (!this.game.act({ op: 'chestDeposit', slot: i })) this.toast('箱子放不下');
      this.refresh();
      return;
    }
    if (this.picked === null) {
      const st = this.game.inventory.slots[i];
      if (!st) return;
      // 鍛造台開著：點裝備 = 換成處理這件（不搬移）
      if (this.forgeTarget && gearSlot(st.item)) { this.setForge(st); this.refresh(); return; }
      this.picked = i;
    } else {
      if (this.picked !== i) this.game.act({ op: 'swap', a: this.picked, b: i });
      this.picked = null;
    }
    this.refresh();
  }
  /** 點裝備格：有選中的背包格 → 裝到這格；否則卸下 */
  private clickEquip(slot: EquipSlot): void {
    // 鍛造台開著：點裝備中的那件 = 換成處理它（不卸下）
    const eqSt = this.game.equipment.getStack(slot);
    if (this.forgeTarget && this.picked === null && eqSt) { this.setForge(eqSt); this.refresh(); return; }
    if (this.picked !== null) {
      const it = this.game.inventory.slots[this.picked]?.item;
      if (!this.game.act({ op: 'equip', slot: this.picked, to: slot })) this.toast(it ? `${ITEMS[it].name.zh}不能裝在這裡` : '不能裝在這裡');
      this.picked = null;
    } else if (this.game.equipment.get(slot)) {
      if (!this.game.act({ op: 'unequip', slot })) this.toast('背包已滿，卸不下來');
    }
    this.refresh();
  }
  /** 點外觀欄：有選中的背包格 → 放進來；否則卸下 */
  private clickVanity(slot: VanitySlot): void {
    if (this.picked !== null) {
      const it = this.game.inventory.slots[this.picked]?.item;
      if (!this.game.act({ op: 'equipVanity', slot: this.picked, to: slot })) this.toast(it ? `${ITEMS[it].name.zh}不能放在外觀欄的這一格` : '不能放在這裡');
      this.picked = null;
    } else if (this.game.vanity.get(slot)) {
      if (!this.game.act({ op: 'unequipVanity', slot })) this.toast('背包已滿，卸不下來');
    }
    this.refresh();
  }
  /** 背包第 i 格自動裝上（時裝 → 外觀欄） */
  private quickEquip(i: number): void {
    const st = this.game.inventory.slots[i];
    if (!st) return;
    if (ITEMS[st.item].vanity) {
      if (!this.game.act({ op: 'equipVanity', slot: i })) this.toast('放不進外觀欄');
      this.picked = null;
      this.refresh();
      return;
    }
    if (!this.game.act({ op: 'equip', slot: i })) this.toast(ITEMS[st.item].armor || ITEMS[st.item].accessory ? '已經裝了同一件' : '這不是裝備');
    this.picked = null;
    this.refresh();
  }

  get inventoryOpen(): boolean { return !this.q('#delve-inv').hidden; }
  setInventory(open: boolean): void {
    this.q('#delve-inv').hidden = !open;
    if (!open) this.setForge(null);
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
    // 選中的背包格被清空了（G 丟出、吃掉、放完最後一個…）：取消選取，免得點下一格變成「把空格換過去」
    if (this.picked !== null && !this.game.inventory.slots[this.picked]) this.picked = null;
    const sel = this.game.inventory.selected;
    for (let i = 0; i < this.hotbar.length; i++) this.paintSlot(this.hotbar[i], i, i === sel);
    const chest = this.game.chestSlots();
    if (chest) for (let i = 0; i < this.chestGrid.length; i++) this.paintSlot(this.chestGrid[i], i, false, chest);
    const held = this.game.inventory.selectedStack();
    const heldEl = this.q('#delve-held');
    heldEl.textContent = held ? gearName(held.item, held.gear) : '';
    heldEl.classList.add('delve-rar');
    if (held && gearSlot(held.item)) heldEl.dataset.rarity = String(rarityOf(held.gear)); else delete heldEl.dataset.rarity;
    if (!this.inventoryOpen) return;
    this.refreshGearActions();
    this.renderForge();
    for (let i = 0; i < this.grid.length; i++) {
      this.paintSlot(this.grid[i], i, i === sel);
      this.grid[i].btn.classList.toggle('is-picked', this.picked === i);
    }
    this.refreshEquip();
    const near = this.game.stations();
    const shared = this.game.storageChests();
    const rows = recipeRows(this.game.inventory, near, shared ?? undefined);
    const sig = `${near.workbench}${near.furnace}${near.anvil}${shared ? 's' : ''}|` + rows.map((r) => `${r.id}${r.craftable ? 1 : 0}${r.inputs.map((a) => `${a.have}:${a.fromChest ?? 0}`).join(',')}`).join(';');
    if (sig === this.recipeSig) return;
    this.recipeSig = sig;
    const names = (Object.keys(near) as (keyof typeof near)[]).filter((k) => near[k]).map((k) => STATION_NAME[k]);
    this.q('#delve-station').textContent = (names.length ? `附近的合成站：${names.join('、')} ✓` : '附近沒有合成站（工作台 / 熔爐 / 鐵砧）')
      + (shared ? ' · 共享儲物：據點箱子裡的材料也算（標「箱」的會從箱子拿）' : '');
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
      need.textContent = r.inputs.map((a) => `${ITEMS[a.item].name.zh} ${a.have}/${a.n}${a.fromChest ? `（箱 ${a.fromChest}）` : ''}`).join('、')
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
    const v = this.game.vanity;
    VANITY_SLOTS.forEach((slot, k) => { if (this.vanity[k]) this.paintStack(this.vanity[k], v.getStack(slot), k, true); });
    for (const h of this.hideBtns) {
      const on = v.hide[h.slot];
      h.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const eye = h.btn.querySelector<HTMLCanvasElement>('canvas');
      if (eye && eye.dataset.on !== String(on)) { eye.dataset.on = String(on); drawEye(eye, !on); }
      h.btn.title = `${HIDE_LABEL[h.slot]}：${on ? '隱藏中' : '顯示中'}`;
      h.btn.setAttribute('aria-label', `${on ? '顯示' : '隱藏'}${HIDE_LABEL[h.slot]}的樣子（數值照算）`);
    }
    this.drawDoll(true);
    const st = this.game.getState();
    const statsEl = this.root.querySelector('#delve-stats');
    if (statsEl) {
      const s = this.game.stats();
      const rows = statRows({
        defense: st.defense, hp: st.hp, maxHp: st.maxHp, damageMul: s.damageMul, crit: s.crit, gear: s.gear,
        setBonus: st.setBonus ? SET_BONUS[st.setBonus as keyof typeof SET_BONUS].text : null,
      });
      const sig = rows.map((r) => r.join(':')).join('|');
      if (statsEl.getAttribute('data-sig') !== sig) {
        statsEl.setAttribute('data-sig', sig);
        statsEl.replaceChildren(...rows.map(([k, v], i) => {
          const row = document.createElement('div');
          row.className = `delve-stat${i >= 4 && k !== '套裝' ? ' is-gear' : ''}${k === '套裝' || v.length > 8 ? ' delve-stat--wide' : ''}`;
          const a = document.createElement('span'), b = document.createElement('span');
          a.className = 'delve-stat-k'; a.textContent = k;
          b.className = 'delve-stat-v'; b.textContent = v;
          row.append(a, document.createTextNode(' '), b);
          return row;
        }));
      }
    }
    const btn = this.root.querySelector<HTMLElement>('#delve-equip-btn');
    if (btn) {
      const it = this.picked !== null ? this.game.inventory.slots[this.picked]?.item : undefined;
      btn.hidden = !(it && (ITEMS[it].armor || ITEMS[it].accessory || ITEMS[it].vanity));
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
  /** 不滅（傳奇詞條）的冷卻：裝著才顯示；可用 = 金色「不滅 ✓」，冷卻中 = 秒數 */
  private drawUndying(): void {
    const el = this.root.querySelector<HTMLElement>('#delve-undying');
    if (!el) return;
    const st = this.game.getState(), has = st.gear.undying > 0;
    el.hidden = !has;
    if (!has) return;
    const cd = Math.ceil(st.undyingCd);
    const text = cd > 0 ? `不滅 ${cd}s` : '不滅 ✓';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-ready', cd <= 0);
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
  /** 多人睡覺：有人躺好了、還在等其他人 → 「等待其他人 n/m」；其餘時候隱藏 */
  private drawSleepWait(): void {
    const el = this.root.querySelector<HTMLElement>('#delve-sleepwait');
    if (!el) return;
    const w = this.game.sleepWaiting();
    el.hidden = !w;
    if (!w) return;
    const text = `等待其他人 ${w.ready}/${w.total}`;
    if (el.textContent !== text) el.textContent = text;
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
      return el && el.dataset.item && el.dataset.item in ITEMS && this.root.contains(el) ? { el, item: el.dataset.item as ItemId } : null;
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
    const st = this.stackFor(anchor) ?? { item, count: 1 };
    const cmp = this.compareFor(st, anchor);
    const lines = gearTooltip(st, cmp.stack, cmp);
    tip.replaceChildren(...lines.map((l, i) => {
      const p = document.createElement('p');
      p.className = i === 0 ? 'delve-tip-name' : `delve-tip-line is-${l.tone}`;
      if (l.rarity !== undefined && (l.tone === 'name' || l.tone === 'rarity')) { p.classList.add('delve-rar'); p.dataset.rarity = String(l.rarity); }
      p.textContent = l.text;
      return p;
    }));
    if (gearSlot(st.item)) tip.dataset.rarity = String(rarityOf(st.gear)); else delete tip.dataset.rarity;
    // 穿得到身上的東西：小預覽「穿上去的樣子」
    const tryOn = this.tryOnLook(st);
    if (tryOn) {
      const c = toCanvas(dollPreview(tryOn, dollKey(tryOn), 'idle', 0)) as HTMLCanvasElement;
      c.className = 'delve-tip-doll';
      c.setAttribute('aria-hidden', 'true');
      c.dataset.testid = 'tip-doll';
      const cap = document.createElement('p');
      cap.className = 'delve-tip-line delve-tip-dollcap';
      cap.textContent = ITEMS[st.item].vanity ? '穿上去的樣子（外觀欄）' : '穿上去的樣子';
      tip.append(c, cap);
    }
    tip.hidden = false;
    const r = anchor.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left - rr.left, y = r.bottom - rr.top + 6;
    // 面板裡的格子：說明放到面板（含旁邊的箱子 / 鍛造台）右側，不蓋住裝備欄與能力總覽
    const panels = ['#delve-inv', '#delve-chest', '#delve-forge'].map((s) => this.root.querySelector<HTMLElement>(s)).filter((el): el is HTMLElement => Boolean(el && !el.hidden));
    if (panels.some((pn) => pn.contains(anchor))) {
      const right = Math.max(...panels.map((pn) => pn.getBoundingClientRect().right)) - rr.left + 8;
      if (right + tw <= rr.width - 6) { x = right; y = Math.min(r.top - rr.top, rr.height - th - 6); }
    }
    if (x + tw > rr.width - 6) x = rr.width - tw - 6;
    if (y + th > rr.height - 6) y = r.top - rr.top - th - 6;
    tip.style.setProperty('--tx', `${Math.max(6, Math.round(x))}px`);
    tip.style.setProperty('--ty', `${Math.max(6, Math.round(y))}px`);
    clearTimeout(this.tipTimer);
    if (ms) this.tipTimer = window.setTimeout(() => this.hideTip(), ms);
  }
  /** 說明框的試穿：目前的紙娃娃換上這件（時裝 → 外觀欄那格；防具 → 防具那格，外觀欄有東西時仍以外觀欄為準） */
  private tryOnLook(st: Stack): DollLook | null {
    const ws = wearSlot(st.item);
    if (!ws) return null;
    const g = this.game, cur = g.doll().look, d = ITEMS[st.item];
    const p = pieceOf(st);
    if (ws === 'trinket') {
      const e = g.equipment.clone();
      const s = e.autoSlot(st.item) ?? 'acc4';
      e.set(s, st.item, st.gear);
      return buildDollLook(g.appearance, e, g.vanity);
    }
    if (!p) return null;
    if (d.vanity) return { ...cur, [ws]: p };
    // 防具：外觀欄蓋著就看不出差別，照實顯示
    const vs = ws as VanitySlot;
    return g.vanity.get(vs) ? cur : { ...cur, [ws]: p };
  }
  /** 背包的紙娃娃（開著背包時每幾幀換一格；樣子變了立刻重畫） */
  private drawDoll(force = false): void {
    if (!this.inventoryOpen) return;
    const c = this.root.querySelector<HTMLCanvasElement>('#delve-doll-canvas');
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { look, key } = this.game.doll();
    const total = DOLL_REEL.reduce((n, [a, k]) => n + SHEET[a][1] * k, 0);
    let t = Math.floor(this.dollTick / 8) % total, anim: SheetAnim = 'idle', f = 0;
    for (const [a, k] of DOLL_REEL) { const len = SHEET[a][1] * k; if (t < len) { anim = a; f = t % SHEET[a][1]; break; } t -= len; }
    const sig = `${key}|${anim}|${f}`;
    if (!force && sig === this.dollDrawn) return;
    this.dollDrawn = sig;
    const fk = `${key}|${anim}`;
    let fr = this.dollFrames.get(fk);
    if (!fr) {
      fr = [];
      for (let i = 0; i < SHEET[anim][1]; i++) fr.push(toCanvas(dollPreview(look, key, anim, i)) as HTMLCanvasElement);
      this.dollFrames.set(fk, fr);
      if (this.dollFrames.size > 12) this.dollFrames.delete(this.dollFrames.keys().next().value as string);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(fr[f], 0, 0);
    const doll = this.root.querySelector<HTMLElement>('#delve-doll');
    if (doll) doll.dataset.key = key;
  }
  hideTip(): void {
    const tip = this.root.querySelector<HTMLElement>('#delve-tip');
    if (tip) tip.hidden = true;
  }

  /** 每幀呼叫；內部節流 */
  tick(): void {
    this.frame++;
    if (this.inventoryOpen) { this.dollTick++; this.drawDoll(); }
    this.drawVitals();
    if (this.frame % 6 === 0) this.drawUndying();
    this.drawBoss();
    this.drawSleepWait();
    this.drawDeath();
    if (this.frame % 10 === 0) {
      const g = this.game, f = g.feetTile(), w = g.world;
      // 區域：已發現的最小地區名（結構 > 生態區）；沒有就是未知之地
      const here = g.discovery.regionsAt(f.x, f.y).filter((r) => r.cat !== 'depth' && g.discovery.isFound(r.id)).sort((a, b) => a.w * a.h - b.w * b.h);
      const area = here[0]?.name ?? g.discovery.regionsAt(f.x, f.y).find((r) => g.discovery.isFound(r.id))?.name ?? '未知之地';
      const nav = g.navInfo();
      // 深度層線：中央照舊用全世界的 cavernY / moltenY；中央以外用該欄自己的（外圍生成器每欄加了雜訊）
      const L = f.x < 0 || f.x >= w.width ? w.layersAt(f.x) : null;
      this.q('#delve-status').textContent = statusText({
        clock: '', area, feetY: f.y, surface: w.surfaceAt(f.x), cavernY: L ? L.deep : w.cavernY, moltenY: (L ? L.molten : w.moltenY) || Infinity,
        east: nav.east, depth: nav.depth,
      });
    }
    if (this.frame % 30 === 0) this.refresh();
  }

  /** 提示：prio 0 = 次要（排在重要提示後面）、1 = 一般、2 = 重要（見 toastQueue） */
  toast(msg: string, ms = 1600, prio = TOAST_NORMAL): void {
    if (this.toasts.push({ text: msg, ms, prio }) === 'show') this.showToast();
    if (!this.toastTimer) this.pumpToast();
  }
  private showToast(): void {
    const el = this.q('#delve-toast'), cur = this.toasts.current;
    if (!cur) { el.classList.remove('is-on'); this.toastShown = ''; return; }
    if (this.toastShown !== cur.text || !el.classList.contains('is-on')) {
      el.textContent = cur.text;
      el.classList.add('is-on');
      this.toastShown = cur.text;
    }
  }
  /** 以 100ms 為單位推進提示佇列（分頁隱藏時 rAF 不跑，用計時器） */
  private pumpToast(): void {
    this.toastLast = performance.now();
    const step = (): void => {
      const now = performance.now(), dt = now - this.toastLast;
      this.toastLast = now;
      this.toasts.tick(dt);
      this.showToast();
      this.toastTimer = this.toasts.current ? window.setTimeout(step, 100) : 0;
    };
    this.toastTimer = window.setTimeout(step, 100);
  }
  /** 目前顯示中的提示文字（e2e / 除錯） */
  get toastText(): string { return this.toasts.current?.text ?? ''; }

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

  // ── 裝備詞條：說明對應的格子、比較對象 ─────────────────
  /** 說明框要顯示哪一格（背包 / 快捷欄 / 箱子 / 裝備欄 / 外觀欄 / 鍛造台） */
  private stackFor(el: HTMLElement): Stack | null {
    const g = this.game, slot = Number(el.dataset.slot);
    if (el.dataset.equip) return g.equipment.getStack(el.dataset.equip as EquipSlot);
    if (el.dataset.vanity) return g.vanity.getStack(el.dataset.vanity as VanitySlot);
    if (el.dataset.forgeItem !== undefined) return this.forgeTarget;
    if (!Number.isInteger(slot)) return null;
    if (el.closest('#delve-chest-grid')) return g.chestSlots()?.[slot] ?? null;
    if (el.closest('#delve-inv-grid') || el.closest('#delve-hotbar')) return g.inventory.slots[slot] ?? null;
    return null;
  }
  /**
   * 比較對象：防具 → 同部位裝著的；武器 → 手上的武器；鎬 → 使用中的鎬；
   * 飾品 → 裝上時實際會換掉的那格（裝著同一件就是它；有空槽 → 只提示；都滿 → 詞條最弱的那件）
   */
  private compareFor(st: Stack, el: HTMLElement): { stack: Stack | null; head?: string; note?: string } {
    if (el.dataset.equip || !gearSlot(st.item)) return { stack: null };
    const g = this.game, d = ITEMS[st.item];
    if (d.armor) return { stack: g.equipment.getStack(d.armor.slot) };
    if (d.weapon) { const h = g.inventory.selectedStack(); return { stack: h && h !== st && ITEMS[h.item].weapon ? h : null }; }
    if (d.pick) { const i = g.inventory.bestPickSlot(), p = i >= 0 ? g.inventory.slots[i] : null; return { stack: p && p !== st ? p : null }; }
    if (d.accessory) {
      const c = g.equipment.compareTarget(st.item);
      if (!c) return { stack: null };
      if (!c.stack) return { stack: null, note: '裝上會放進空的飾品槽（不會換掉任何飾品）' };
      if (c.stack === st) return { stack: null };
      return c.weakest
        ? { stack: c.stack, head: `飾品槽已滿：與詞條最弱的「${gearName(c.stack.item, c.stack.gear)}」比較（裝上會換掉它）：` }
        : { stack: c.stack };
    }
    return { stack: null };
  }

  // ── 裝備詞條：鎖定 / 分解 / 鍛造 ───────────────────────
  private bindGear(): void {
    const on = (sel: string, fn: (e: Event) => void): void => {
      const el = this.root.querySelector(sel);
      if (!el) return;
      el.addEventListener('click', fn);
      this.offs.push(() => el.removeEventListener('click', fn));
    };
    on('#delve-lock-btn', () => {
      if (this.picked === null) return;
      const r = this.game.act({ op: 'lock', at: this.picked });
      if (r !== null) this.toast(r ? '已鎖定：不會被分解' : '已解除鎖定');
      this.refresh();
    });
    on('#delve-salvage-btn', () => {
      const i = this.picked;
      if (i === null) return;
      const st = this.game.inventory.slots[i];
      if (!st || !gearSlot(st.item)) return;
      if (st.gear?.locked) { this.toast('已鎖定的裝備不能分解'); return; }
      const go = (): void => {
        const y = this.game.act({ op: 'salvage', at: i });
        if (y) this.toast(`分解了 ${gearName(st.item, st.gear)}：${costText(y)}`);
        this.picked = null;
        if (this.forgeTarget === st) this.setForge(null);
        this.refresh();
      };
      // 史詩以上：先確認
      if (rarityOf(st.gear) >= 3) this.askConfirm(`要分解 ${RARITIES[rarityOf(st.gear)].zh}「${gearName(st.item, st.gear)}」嗎？分解後無法復原。`, go);
      else go();
    });
    on('#delve-salvage-all', () => {
      const list = this.game.salvageTargets(0);
      if (!list.length) { this.toast('沒有可分解的普通裝備（快捷欄與鎖定的不算）'); return; }
      this.askConfirm(`要分解背包裡（快捷欄以外、沒鎖定）的 ${list.length} 件普通裝備嗎？`, () => {
        const r = this.game.act({ op: 'salvageAll', maxRarity: 0 });
        this.toast(`分解了 ${r.count} 件：${costText(r)}`);
        this.picked = null;
        this.refresh();
      });
    });
    on('#delve-forge-btn', () => {
      if (this.picked === null) return;
      const st = this.game.inventory.slots[this.picked];
      this.picked = null;
      if (st) this.setForge(st);
      this.refresh();
    });
    on('#delve-forge-close', () => this.setForge(null));
    on('#delve-forge', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-op]');
      const st = this.forgeTarget;
      if (!b || b.disabled || !st) return;
      const at = this.game.locate(st), op = b.dataset.op;
      if (at === null) { this.setForge(null); return; }
      if (op === 'lock') {
        const r = this.game.act({ op: 'lock', at });
        if (r !== null) this.toast(r ? '已鎖定：不會被分解' : '已解除鎖定');
      } else if (op === 'salvage') {
        const go = (): void => {
          const y = this.game.act({ op: 'salvage', at });
          if (y) this.toast(`分解了 ${gearName(st.item, st.gear)}：${costText(y)}`);
          this.setForge(null);
          this.refresh();
        };
        if (st.gear?.locked) this.toast('已鎖定的裝備不能分解');
        else this.askConfirm(`要分解${typeof at === 'number' ? '' : '裝備中的'} ${RARITIES[rarityOf(st.gear)].zh}「${gearName(st.item, st.gear)}」嗎？分解後無法復原。`, go);
      } else {
        const r = op === 'reroll' ? this.game.act({ op: 'reroll', at, affix: Number(b.dataset.affix) }) : op === 'upgrade' ? this.game.act({ op: 'upgrade', at }) : this.game.act({ op: 'ascend', at });
        if (!r.ok) this.toast(FORGE_FAIL[r.reason]);
        else this.toast(op === 'reroll' ? `洗煉完成：${gearName(st.item, st.gear)}` : op === 'upgrade' ? `強化成功：+${st.gear?.plus ?? 0}` : `升階成功：${RARITIES[rarityOf(st.gear)].zh}`);
      }
      this.forgeSig = '';
      this.refresh();
    });
    on('#delve-sc-cancel', () => this.closeConfirm());
    on('#delve-sc-ok', () => { const f = this.confirmFn; this.closeConfirm(); f?.(); });
  }
  private askConfirm(msg: string, fn: () => void): void {
    const box = this.root.querySelector<HTMLElement>('#delve-salvage-confirm');
    if (!box) { fn(); return; }
    const m = box.querySelector('#delve-sc-msg');
    if (m) m.textContent = msg;
    this.confirmFn = fn;
    box.hidden = false;
    box.querySelector<HTMLButtonElement>('#delve-sc-cancel')?.focus();
  }
  private closeConfirm(): void {
    const box = this.root.querySelector<HTMLElement>('#delve-salvage-confirm');
    if (box) box.hidden = true;
    this.confirmFn = null;
  }
  get confirmOpen(): boolean { return !(this.root.querySelector<HTMLElement>('#delve-salvage-confirm')?.hidden ?? true); }
  /** 關掉分解確認（Esc） */
  cancelConfirm(): void { this.closeConfirm(); }
  private refreshGearActions(): void {
    const st = this.picked !== null ? this.game.inventory.slots[this.picked] : null;
    const gear = Boolean(st && gearSlot(st.item));
    const lock = this.root.querySelector<HTMLElement>('#delve-lock-btn');
    if (lock) { lock.hidden = !gear; lock.textContent = st?.gear?.locked ? '解除鎖定' : '鎖定'; }
    const sv = this.root.querySelector<HTMLButtonElement>('#delve-salvage-btn');
    if (sv) { sv.hidden = !gear; sv.disabled = Boolean(st?.gear?.locked); }
    const fb = this.root.querySelector<HTMLElement>('#delve-forge-btn');
    if (fb) fb.hidden = !gear;
    const mats = this.root.querySelector('#delve-mats');
    if (mats) mats.textContent = `碎晶 ${this.game.inventory.count('gear_shard')} · 星塵 ${this.game.inventory.count('stardust')}`;
  }
  get forgeOpen(): boolean { return this.forgeTarget !== null; }
  /** 提示用的裝備名稱 */
  gearLabel(st: Stack): string { return gearName(st.item, st.gear); }
  /** 打開（處理這件裝備；背包或裝備中的都可以）/ 關閉鍛造台面板 */
  setForge(target: Stack | null): void {
    this.forgeTarget = target && gearSlot(target.item) ? target : null;
    this.forgeSig = '';
    const el = this.root.querySelector<HTMLElement>('#delve-forge');
    if (el) el.hidden = this.forgeTarget === null;
    this.root.dataset.forge = this.forgeTarget === null ? '' : '1';
    if (this.forgeTarget) this.renderForge();
  }
  private renderForge(): void {
    const st = this.forgeTarget;
    if (!st) return;
    const g = this.game, at = g.locate(st);
    // 那件已經不在身上（分解 / 放進箱子 / 丟掉）→ 關閉
    if (at === null) { this.setForge(null); return; }
    const near = g.canForge(), costs = g.forgeCosts(at), shard = g.inventory.count('gear_shard'), dust = g.inventory.count('stardust');
    const gear = st.gear;
    const sig = `${at}|${near}|${shard}|${dust}|${st.item}|${JSON.stringify(gear ?? null)}`;
    if (sig === this.forgeSig) return;
    this.forgeSig = sig;
    const can = (c: Cost | null): boolean => Boolean(c) && near && shard >= c!.shard && dust >= c!.dust;
    const station = this.root.querySelector('#delve-forge-station');
    if (station) station.textContent = `${near ? '鐵砧就在旁邊 ✓' : '鍛造要站在鐵砧旁（4 格內）；鎖定 / 分解哪裡都可以'}。點背包或裝備欄的裝備可以換目標（裝備中的也行）`;
    const head = this.root.querySelector('#delve-forge-item');
    if (head) {
      const icon = document.createElement('canvas');
      icon.width = ICON_PX; icon.height = ICON_PX; icon.className = 'delve-slot-icon';
      const ctx = icon.getContext('2d');
      if (ctx) drawIcon(this.atlas, ctx, st.item, ICON_PX);
      const box = document.createElement('div');
      box.dataset.item = st.item; box.dataset.forgeItem = '1';
      const name = document.createElement('p');
      name.className = 'delve-forge-name delve-rar';
      name.dataset.rarity = String(rarityOf(gear));
      name.textContent = gearName(st.item, gear);
      const meta = document.createElement('p');
      meta.className = 'delve-forge-meta';
      meta.textContent = `${RARITIES[rarityOf(gear)].zh}・物品等級 ${gear?.ilvl ?? 1}・強化 +${gear?.plus ?? 0}${gear?.rerolls ? `・洗煉 ${gear.rerolls} 次` : ''}${typeof at === 'number' ? '' : '・裝備中'}${gear?.crafted ? '・合成品' : ''}`;
      box.append(name, meta);
      const manage = document.createElement('div');
      manage.className = 'delve-forge-manage';
      const mb = (op: string, text: string, disabled = false): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'delve-btn delve-btn--sm'; b.dataset.op = op; b.textContent = text; b.disabled = disabled;
        return b;
      };
      manage.append(mb('lock', gear?.locked ? '解除鎖定' : '鎖定'), mb('salvage', '分解', Boolean(gear?.locked)));
      head.replaceChildren(icon, box, manage);
    }
    const ul = this.root.querySelector('#delve-forge-affixes');
    if (ul) {
      const items = (gear?.affixes ?? []).map((a, k) => {
        const li = document.createElement('li');
        const uq = affixDef(a.id).kind === 'unique';
        li.className = `delve-forge-affix${uq ? ' is-unique' : ''}`;
        const t = document.createElement('span');
        t.textContent = uq ? `★ ${affixDef(a.id).word.slice(0, -1)}：${affixDef(a.id).desc ?? ''}` : `◆ ${affixText(a, st.item, gear!)}（T${a.tier}）`;
        li.appendChild(t);
        if (!uq && costs.reroll) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'delve-btn delve-btn--sm'; b.dataset.op = 'reroll'; b.dataset.affix = String(k);
          b.textContent = `洗煉（${costText(costs.reroll)}）`;
          b.disabled = !can(costs.reroll);
          li.appendChild(b);
        }
        return li;
      });
      if (!items.length) { const li = document.createElement('li'); li.className = 'delve-forge-affix'; li.textContent = '沒有詞條（普通）：先升階加上詞條'; items.push(li); }
      ul.replaceChildren(...items);
    }
    const ops = this.root.querySelector('#delve-forge-ops');
    if (ops) {
      const mk = (op: string, label: string, c: Cost | null, full: string): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'delve-btn delve-forge-op'; b.dataset.op = op;
        const a = document.createElement('span'); a.textContent = c ? label : full;
        const s = document.createElement('span'); s.className = 'delve-cost'; s.textContent = c ? costText(c) : '—';
        b.append(a, s);
        b.disabled = !can(c);
        return b;
      };
      const p = gear?.plus ?? 0, r = rarityOf(gear);
      ops.replaceChildren(
        mk('upgrade', `強化 +${p} → +${p + 1}`, costs.upgrade, '強化已滿（+5）'),
        mk('ascend', `升階 ${RARITIES[r].zh} → ${RARITIES[Math.min(5, r + 1)].zh}`, costs.ascend, r >= 5 ? '神話無法再升階' : '升階已到傳說（神話只能靠掉落）'),
      );
    }
    const m = this.root.querySelector('#delve-forge-mats');
    if (m) m.textContent = `持有：碎晶 ${shard} · 星塵 ${dust}（分解裝備取得；史詩以上才有星塵）`;
  }
}
