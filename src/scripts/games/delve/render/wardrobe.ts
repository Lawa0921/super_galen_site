// wardrobe.ts — 「角色外觀」客製化畫面（DOM）：左邊放大的即時預覽（待機 → 走路 → 爬繩 → 掛著 → 攀上邊緣輪播），
// 右邊一列列選項（髮型 / 髮色 / 呆毛 / 瞳色 / 眼型 / 膚色 / 眼鏡 / 服裝 / 主色 / 副色 / 頭飾）＋ 隨機 / 取消 / 完成。
// 鍵盤：↑↓ 換列、←→ 換選項、Enter 完成、Esc 取消；Tab 只在面板裡循環。手機：預覽在上、選項在下捲動。
// 標題畫面（主選單「角色外觀」、新世界面板）與遊戲中選單共用同一個面板。
import { toCanvas } from './pixel';
import {
  APPEARANCE_FIELDS, normalizeAppearance, randomAppearance, stepAppearance, type Appearance, type AppearanceField,
} from '../engine/appearance';
import { dollKey, plainLook, type DollLook } from '../engine/doll';
import { dollPreview } from './dollPreview';
import { AV_FH, AV_FW, SHEET, type SheetAnim } from './avatarArt';
import { CLOTH_RAMPS, EYE_RAMPS, HAIR_RAMPS, SKIN_RAMPS } from './avatarPalette';
import type { SoundManager } from '../audio/SoundManager';

/** 預覽輪播：每段 [動畫, 播幾輪] */
const REEL: [SheetAnim, number][] = [['idle', 2], ['walk', 3], ['climb', 3], ['hang', 2], ['mantle', 2], ['blink', 1]];
const FPS = 10;
/** 預覽放大倍率（依 CSS 尺寸自動挑整數倍） */
const ZOOM = 4;
const PAD = 2;

export interface WardrobeOpen {
  /** 套上外觀之後畫成什麼樣子（遊戲中 = 身上的裝備 + 新外觀；標題 = 只有外觀） */
  look?: (a: Appearance) => DollLook;
  onDone(a: Appearance): void;
  onClose?(): void;
}

export class Wardrobe {
  private a: Appearance = normalizeAppearance(null);
  private opts: WardrobeOpen | null = null;
  private timer = 0;
  private tick = 0;
  private frames = new Map<string, HTMLCanvasElement[]>();
  private returnFocus: HTMLElement | null = null;
  private readonly rows: { f: AppearanceField; el: HTMLElement; val: HTMLElement; sw: HTMLCanvasElement | null }[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly cap: HTMLElement | null;

  constructor(private readonly root: HTMLElement, private readonly panel: HTMLElement, private readonly sound: SoundManager) {
    this.canvas = panel.querySelector<HTMLCanvasElement>('#delve-wr-doll')!;
    // 四周留 2 美術像素：走路時抬起的腳 / 飄起的頭髮不會被裁掉
    this.canvas.width = (AV_FW + PAD * 2) * ZOOM; this.canvas.height = (AV_FH + PAD * 2) * ZOOM;
    this.cap = panel.querySelector('#delve-wr-cap');
    this.build();
    const on = (el: EventTarget | null, t: string, fn: EventListener): void => { if (!el) return; el.addEventListener(t, fn); this.offs.push(() => el.removeEventListener(t, fn)); };
    on(panel.querySelector('#delve-wr-random'), 'click', () => { this.sound.ensure(); this.sound.uiDice(); this.set(randomAppearance(Math.random)); });
    on(panel.querySelector('#delve-wr-cancel'), 'click', () => { this.sound.uiBack(); this.close(); });
    on(panel.querySelector('#delve-wr-done'), 'click', () => this.done());
    on(panel, 'keydown', (e) => this.onKey(e as KeyboardEvent));
  }

  get isOpen(): boolean { return !this.panel.hidden; }
  get appearance(): Appearance { return { ...this.a }; }

  open(initial: Appearance, o: WardrobeOpen): void {
    this.opts = o;
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.panel.hidden = false;
    this.root.dataset.wardrobe = '1';
    this.set(normalizeAppearance(initial));
    this.tick = 0;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => { this.tick++; this.draw(); }, 1000 / FPS);
    this.rows[0]?.el.focus();
  }
  close(): void {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    delete this.root.dataset.wardrobe;
    clearInterval(this.timer);
    this.timer = 0;
    const o = this.opts;
    this.opts = null;
    this.returnFocus?.focus?.();
    o?.onClose?.();
  }
  private done(): void {
    this.sound.ensure(); this.sound.uiConfirm();
    const a = this.appearance, o = this.opts;
    o?.onDone(a);
    this.close();
  }

  // ── 選項列 ──
  private build(): void {
    const list = this.panel.querySelector<HTMLElement>('#delve-wr-rows');
    if (!list) return;
    list.replaceChildren();
    let group = '';
    const GROUP: Record<string, string> = { hair: '頭髮', face: '臉', outfit: '服裝' };
    const fill = (): void => {
      // 兩欄排版時，這一組是奇數列：最後補一格說明，右邊不會空一格
      const n = APPEARANCE_FIELDS.filter((x) => x.group === group).length;
      if (group && n % 2 === 1) {
        const note = document.createElement('p');
        note.className = 'delve-wr-note';
        note.textContent = group === 'outfit' ? '換服裝時主色 / 副色會換成那套的預設，之後可以再調。' : '左右鍵切換選項。';
        list.appendChild(note);
      }
    };
    for (const f of APPEARANCE_FIELDS) {
      if (f.group !== group) {
        fill();
        group = f.group;
        const h = document.createElement('p');
        h.className = 'delve-wr-group';
        h.textContent = GROUP[group];
        list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'delve-wr-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'group');
      row.dataset.key = f.key;
      row.setAttribute('aria-label', f.label);
      const lab = document.createElement('span');
      lab.className = 'delve-wr-label';
      lab.textContent = f.label;
      const prev = this.arrowBtn(-1, f), next = this.arrowBtn(1, f);
      const val = document.createElement('span');
      val.className = 'delve-wr-val';
      val.setAttribute('aria-live', 'polite');
      let sw: HTMLCanvasElement | null = null;
      if (f.kind === 'color') {
        sw = document.createElement('canvas');
        sw.width = 4; sw.height = 4;
        sw.className = 'delve-wr-swatch';
        sw.setAttribute('aria-hidden', 'true');
      }
      const name = document.createElement('span');
      name.className = 'delve-wr-name';
      if (sw) val.append(sw);
      val.append(name);
      row.append(lab, prev, val, next);
      list.appendChild(row);
      this.rows.push({ f, el: row, val: name, sw });
    }
    fill();
  }
  private arrowBtn(dir: -1 | 1, f: AppearanceField): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'delve-ibtn delve-wr-arrow';
    b.tabIndex = -1;
    b.dataset.dir = String(dir);
    b.setAttribute('aria-label', `${dir < 0 ? '上一個' : '下一個'}${f.label}`);
    b.textContent = dir < 0 ? '◀' : '▶';
    b.addEventListener('click', () => this.step(f, dir));
    return b;
  }
  private step(f: AppearanceField, dir: number): void {
    this.sound.ensure(); this.sound.uiMove();
    this.set(stepAppearance(this.a, f.key, dir));
  }
  private set(a: Appearance): void {
    this.a = a;
    for (const r of this.rows) {
      const v = a[r.f.key];
      const idx = typeof v === 'boolean' ? (v ? 1 : 0) : v;
      r.val.textContent = r.f.options[idx]?.zh ?? '';
      r.el.dataset.value = String(idx);
      if (r.sw) {
        const ramp = r.f.key === 'hairColor' ? HAIR_RAMPS[idx] : r.f.key === 'eyes' ? EYE_RAMPS[idx] : r.f.key === 'skin' ? SKIN_RAMPS[idx] : CLOTH_RAMPS[idx];
        const ctx = r.sw.getContext('2d');
        if (ctx && ramp) {
          const c = (i: number): string => `rgb(${ramp[Math.min(ramp.length - 1, i)].join(',')})`;
          ctx.fillStyle = c(ramp.length > 3 ? 3 : 1); ctx.fillRect(0, 0, 4, 4);
          ctx.fillStyle = c(ramp.length > 3 ? 4 : 2); ctx.fillRect(0, 0, 2, 2);
          ctx.fillStyle = c(ramp.length > 3 ? 1 : 0); ctx.fillRect(2, 2, 2, 2);
        }
      }
    }
    this.panel.dataset.look = dollKey(plainLook(a));
    this.draw();
  }

  // ── 預覽 ──
  private reelAt(t: number): { anim: SheetAnim; f: number; label: string } {
    const total = REEL.reduce((s, [k, n]) => s + SHEET[k][1] * n, 0);
    let k = t % total;
    for (const [anim, n] of REEL) {
      const len = SHEET[anim][1] * n;
      if (k < len) return { anim, f: k % SHEET[anim][1], label: LABEL[anim] ?? '' };
      k -= len;
    }
    return { anim: 'idle', f: 0, label: '' };
  }
  private draw(): void {
    if (!this.isOpen) return;
    const look = this.opts?.look?.(this.a) ?? plainLook(this.a);
    const key = dollKey(look);
    // 慢動作：每 2 個 tick 換一格（10 fps → 5 fps 的格子速度，看得清楚）
    const r = this.reelAt(Math.floor(this.tick / 2));
    const fk = `${key}|${r.anim}`;
    let fr = this.frames.get(fk);
    if (!fr) {
      fr = [];
      for (let f = 0; f < SHEET[r.anim][1]; f++) fr.push(toCanvas(dollPreview(look, key, r.anim, f)) as HTMLCanvasElement);
      this.frames.set(fk, fr);
      if (this.frames.size > 40) this.frames.delete(this.frames.keys().next().value as string);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(fr[r.f] ?? fr[0], PAD * ZOOM, PAD * ZOOM, AV_FW * ZOOM, AV_FH * ZOOM);
    if (this.cap && this.cap.textContent !== r.label) this.cap.textContent = r.label;
  }

  // ── 鍵盤 ──
  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); this.sound.uiBack(); this.close(); return; }
    const i = this.rows.findIndex((r) => r.el === document.activeElement);
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      const n = this.rows.length, j = i < 0 ? 0 : (i + (k === 'ArrowDown' ? 1 : -1) + n) % n;
      this.rows[j].el.focus();
      this.sound.ensure(); this.sound.uiMove();
      return;
    }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && i >= 0) { e.preventDefault(); e.stopPropagation(); this.step(this.rows[i].f, k === 'ArrowLeft' ? -1 : 1); return; }
    if (k === 'Enter' && i >= 0) { e.preventDefault(); e.stopPropagation(); this.done(); return; }
    if (k === 'Tab') {
      const f = [...this.panel.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]')].filter((el) => !el.hidden);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      e.stopPropagation();
      return;
    }
    // 其他鍵不要漏到遊戲 / 標題的快捷鍵
    if (k.length === 1) e.stopPropagation();
  }

  destroy(): void {
    clearInterval(this.timer);
    for (const f of this.offs) f();
    this.offs.length = 0;
  }
}

const LABEL: Partial<Record<SheetAnim, string>> = { idle: '待機', blink: '眨眼', walk: '走路', climb: '爬繩', hang: '掛著', mantle: '攀上邊緣' };
