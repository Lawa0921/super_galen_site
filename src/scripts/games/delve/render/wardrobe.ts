// wardrobe.ts — 「角色外觀」客製化畫面（DOM）：左邊放大的即時預覽（待機 → 走路 → 跳躍 → 爬繩 → 掛著 → 攀上邊緣輪播），
// 右邊一列列選項（髮型 / 髮色 / 呆毛 / 瞳色 / 眼型 / 膚色 / 眼鏡 / 服裝 / 主色 / 副色 / 頭飾）＋ 隨機 / 取消 / 完成。
// 鍵盤：↑↓ 換列、←→ 換選項、Enter 完成、Esc 取消；Tab 只在面板裡循環。手機：預覽在上、選項在下捲動。
// 模式決定列出哪些欄位（APPEARANCE_FIELDS 不刪列，只在這裡藏）：'create' = 新角色（身體特徵 + 種族 + 布衣配色）、
// 'mirror' = 梳妝台（身體特徵、沒有種族 + 身上每件時裝的主色 / 副色 + 布衣配色）、'full' = 全部欄位（舊行為，只留給內部 / 測試）。
import { toCanvas } from './pixel';
import {
  APPEARANCE_FIELDS, CLOTH_COLORS, OUTFIT_PLAIN, createLook, normalizeAppearance, randomAppearance, raceId, stepAppearance,
  type Appearance, type AppearanceField, type AppearanceKey, type AppearanceOption,
} from '../engine/appearance';
import type { VanitySlot } from '../engine/items';
import { dollKey, plainLook, type DollLook } from '../engine/doll';
import { RACE_BLURB } from '../engine/race';
import { dollPreview } from './dollPreview';
import { AV_FH, AV_FW, SHEET, type SheetAnim } from './avatarArt';
import { CLOTH_RAMPS, EYE_RAMPS, HAIR_RAMPS, SKIN_RAMPS } from './avatarPalette';
import type { SoundManager } from '../audio/SoundManager';

/** 預覽輪播：每段 [動畫, 播幾輪] */
const REEL: [SheetAnim, number][] = [['idle', 2], ['walk', 3], ['jump', 2], ['climb', 3], ['hang', 2], ['mantle', 2], ['blink', 1]];
const FPS = 10;
/** 種族說明的第二句：體型不綁髮型 / 服裝 / 裝備 */
const UNISEX_NOTE = '男女都能穿任何髮型、服裝與裝備。';
/** 預覽放大倍率（依 CSS 尺寸自動挑整數倍） */
const ZOOM = 1;
const PAD = 2;

/** 衣櫥模式：'create' = 建角、'mirror' = 梳妝台、'race' = 轉生之藥（只有種族一列）、'full' = 全部欄位（舊行為，不對玩家開放） */
export type WardrobeMode = 'create' | 'mirror' | 'race' | 'full';
/** 建角可選的欄位（P6）：身體特徵 + 種族 + 主色 / 副色（染基本布衣）；沒有服裝 / 頭飾 / 眼鏡 */
const CREATE_KEYS: readonly AppearanceKey[] = ['body', 'race', 'hair', 'hairColor', 'ahoge', 'eyes', 'eyeShape', 'skin', 'blush', 'color1', 'color2'];
/** 各模式列出的欄位（null = 全部）。梳妝台不能改種族；每件時裝的配色列由梳妝台另外加 */
const MODE_KEYS: Record<WardrobeMode, readonly AppearanceKey[] | null> = {
  create: CREATE_KEYS,
  mirror: CREATE_KEYS.filter((k) => k !== 'race'),
  race: ['race'],
  full: null,
};
/** 某模式要列出的欄位（照 APPEARANCE_FIELDS 的順序） */
export function wardrobeFields(mode: WardrobeMode): readonly AppearanceField[] {
  const keys = MODE_KEYS[mode];
  return keys ? APPEARANCE_FIELDS.filter((f) => keys.includes(f.key)) : APPEARANCE_FIELDS;
}

/** 一件時裝的配色（CLOTH_COLORS 索引的主色 / 副色） */
export interface SlotTint { slot: VanitySlot; tint: [number, number]; }
/** 梳妝台上一件身上時裝的配色列：name = 列組標題（物品名）、channels = 1 只列主色、2 主色 + 副色 */
export interface WardrobeTint extends SlotTint { name: string; channels: 1 | 2; }

export interface WardrobeOpen {
  /** 列出哪些欄位（預設 'full'：舊行為） */
  mode?: WardrobeMode;
  /** 梳妝台：身上每件看得出顏色的時裝（外觀欄順序），每件一組配色列 */
  tints?: readonly WardrobeTint[];
  /** 套上外觀（與梳妝台調的時裝配色）之後畫成什麼樣子（遊戲中 = 身上的裝備 + 新外觀；標題 = 只有外觀） */
  look?: (a: Appearance, tints: readonly SlotTint[]) => DollLook;
  onDone(a: Appearance): void;
  /** 梳妝台：完成時回報每件時裝的新配色（在 onDone 之後） */
  onTints?(t: SlotTint[]): void;
  onClose?(): void;
}

/** 一列：外觀欄位（f）或梳妝台的時裝配色（tint：第 i 件的主色 0 / 副色 1） */
interface Row {
  f: AppearanceField | null;
  tint: { i: number; ch: 0 | 1 } | null;
  options: readonly AppearanceOption[];
  el: HTMLElement;
  val: HTMLElement;
  sw: HTMLCanvasElement | null;
}

export class Wardrobe {
  private a: Appearance = normalizeAppearance(null);
  private opts: WardrobeOpen | null = null;
  /** 目前建好的列是哪個模式（換模式才重建） */
  private mode: WardrobeMode = 'full';
  private timer = 0;
  private tick = 0;
  /** 預覽面向左？（dollPreview 只產出面向右的格子；面向左 = 整張畫布水平鏡像，整數像素、不糊） */
  private faceLeft = false;
  private frames = new Map<string, HTMLCanvasElement[]>();
  private returnFocus: HTMLElement | null = null;
  private readonly rows: Row[] = [];
  /** 梳妝台：每件身上時裝正在調的配色（open 時複製一份；完成才回報） */
  private tints: WardrobeTint[] = [];
  /** 梳妝台：打開時的外觀（種族 / 服裝 / 頭飾 / 眼鏡固定用它的，換體型 / 隨機都不會改到） */
  private base: Appearance | null = null;
  private readonly offs: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly cap: HTMLElement | null;
  private blurb: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement, private readonly panel: HTMLElement, private readonly sound: SoundManager) {
    this.canvas = panel.querySelector<HTMLCanvasElement>('#delve-wr-doll')!;
    // 四周留 2 美術像素：走路時抬起的腳 / 飄起的頭髮不會被裁掉
    this.canvas.width = (AV_FW + PAD * 2) * ZOOM; this.canvas.height = (AV_FH + PAD * 2) * ZOOM;
    this.cap = panel.querySelector('#delve-wr-cap');
    this.build('full');
    const on = (el: EventTarget | null, t: string, fn: EventListener): void => { if (!el) return; el.addEventListener(t, fn); this.offs.push(() => el.removeEventListener(t, fn)); };
    on(panel.querySelector('#delve-wr-turn'), 'click', () => { this.sound.ensure(); this.sound.uiMove(); this.faceLeft = !this.faceLeft; this.draw(); });
    on(panel.querySelector('#delve-wr-random'), 'click', () => { this.sound.ensure(); this.sound.uiDice(); this.set(this.random()); });
    on(panel.querySelector('#delve-wr-cancel'), 'click', () => { this.sound.uiBack(); this.close(); });
    on(panel.querySelector('#delve-wr-done'), 'click', () => this.done());
    on(panel, 'keydown', (e) => this.onKey(e as KeyboardEvent));
  }

  get isOpen(): boolean { return !this.panel.hidden; }
  get appearance(): Appearance { return { ...this.a }; }

  open(initial: Appearance, o: WardrobeOpen): void {
    this.opts = o;
    const mode = o.mode ?? 'full';
    this.tints = mode === 'mirror' ? (o.tints ?? []).map((t) => ({ ...t, tint: [t.tint[0], t.tint[1]] })) : [];
    this.base = mode === 'mirror' || mode === 'race' ? normalizeAppearance(initial) : null;
    // 梳妝台的列跟著身上穿什麼變：每次都重建
    if (mode !== this.mode || mode === 'mirror') this.build(mode);
    const title = this.panel.querySelector('#delve-wr-title');
    if (title) title.textContent = mode === 'mirror' ? '梳妝台' : mode === 'race' ? '轉生之藥' : '角色外觀';
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.panel.hidden = false;
    this.root.dataset.wardrobe = '1';
    this.set(normalizeAppearance(initial));
    this.tick = 0;
    this.faceLeft = false;
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
    if (this.mode === 'mirror') o?.onTints?.(this.slotTints());
    this.close();
  }

  // ── 選項列 ──
  private build(mode: WardrobeMode): void {
    this.mode = mode;
    this.rows.length = 0;
    this.blurb = null;
    const list = this.panel.querySelector<HTMLElement>('#delve-wr-rows');
    if (!list) return;
    list.replaceChildren();
    const fields = wardrobeFields(mode);
    let group = '';
    // 建角 / 梳妝台的服裝組只剩主色 / 副色，染的是基本布衣
    const GROUP: Record<string, string> = { body: '體型', hair: '頭髮', face: '臉', outfit: mode === 'full' ? '服裝' : '布衣' };
    /** 目前這一組（標題下）放了幾列 */
    let inGroup = 0;
    const fill = (): void => {
      // 兩欄排版時，這一組是奇數列：最後補一格說明，右邊不會空一格（只算這個模式列出的列）
      if (group && inGroup % 2 === 1) {
        const note = document.createElement('p');
        note.className = 'delve-wr-note';
        note.textContent = group === 'outfit' ? '換服裝時主色 / 副色會換成那套的預設，之後可以再調。'
          : group.startsWith('tint:') ? '這件只有一個顏色。' : '左右鍵切換選項。';
        list.appendChild(note);
      }
    };
    /** 開新的一組；text = null 不加標題（體型只有一列、列名就寫著「體型」） */
    const heading = (g: string, text: string | null): void => {
      fill();
      group = g;
      inGroup = 0;
      if (text === null) return;
      const h = document.createElement('p');
      h.className = 'delve-wr-group';
      h.textContent = text;
      list.appendChild(h);
    };
    const add = (key: string, label: string, aria: string, color: boolean, options: readonly AppearanceOption[], f: AppearanceField | null, tint: Row['tint']): void => {
      const row = document.createElement('div');
      row.className = 'delve-wr-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'group');
      row.dataset.key = key;
      row.setAttribute('aria-label', aria);
      const lab = document.createElement('span');
      lab.className = 'delve-wr-label';
      lab.textContent = label;
      const val = document.createElement('span');
      val.className = 'delve-wr-val';
      val.setAttribute('aria-live', 'polite');
      let sw: HTMLCanvasElement | null = null;
      if (color) {
        sw = document.createElement('canvas');
        sw.width = 4; sw.height = 4;
        sw.className = 'delve-wr-swatch';
        sw.setAttribute('aria-hidden', 'true');
      }
      const name = document.createElement('span');
      name.className = 'delve-wr-name';
      if (sw) val.append(sw);
      val.append(name);
      const r: Row = { f, tint, options, el: row, val: name, sw };
      row.append(lab, this.arrowBtn(-1, aria, r), val, this.arrowBtn(1, aria, r));
      list.appendChild(row);
      this.rows.push(r);
      inGroup++;
    };
    const addField = (f: AppearanceField): void => {
      if (f.group !== group) heading(f.group, f.group === 'body' ? null : GROUP[f.group]);
      add(f.key, f.label, f.label, f.kind === 'color', f.options, f, null);
      if (f.key === 'race') {
        // 種族說明：跟著目前選的種族換（體型 + 種族兩列之後，整排寬）；第二句是不分男女的穿搭說明（體型組是偶數列，沒有補位說明可放）
        const b = document.createElement('p');
        b.className = 'delve-wr-blurb';
        b.setAttribute('aria-live', 'polite');
        list.appendChild(b);
        this.blurb = b;
      }
    };
    for (const f of fields) if (f.group !== 'outfit') addField(f);
    // 梳妝台：身上每件時裝一組（標題 = 物品名；單色的只有主色），放在布衣配色前面
    this.tints.forEach((t, i) => {
      heading(`tint:${i}`, t.name);
      add(`${t.slot}.color1`, '主色', `${t.name} 主色`, true, CLOTH_COLORS, null, { i, ch: 0 });
      if (t.channels === 2) add(`${t.slot}.color2`, '副色', `${t.name} 副色`, true, CLOTH_COLORS, null, { i, ch: 1 });
    });
    for (const f of fields) if (f.group === 'outfit') addField(f);
    fill();
  }
  private arrowBtn(dir: -1 | 1, label: string, r: Row): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'delve-ibtn delve-wr-arrow';
    b.tabIndex = -1;
    b.dataset.dir = String(dir);
    b.setAttribute('aria-label', `${dir < 0 ? '上一個' : '下一個'}${label}`);
    b.textContent = dir < 0 ? '◀' : '▶';
    b.addEventListener('click', () => this.step(r, dir));
    return b;
  }
  private step(r: Row, dir: number): void {
    this.sound.ensure(); this.sound.uiMove();
    if (r.tint) {
      const t = this.tints[r.tint.i].tint, n = CLOTH_COLORS.length;
      t[r.tint.ch] = (((t[r.tint.ch] + (dir < 0 ? -1 : 1)) % n) + n) % n;
      this.set(this.a);
    } else if (r.f) this.set(stepAppearance(this.a, r.f.key, dir));
  }
  /** 梳妝台調好的配色（回報 / 預覽用的副本） */
  private slotTints(): SlotTint[] { return this.tints.map((t) => ({ slot: t.slot, tint: [t.tint[0], t.tint[1]] })); }
  /** 隨機：建角時只抽身體特徵，配色沿用抽到那套衣服的配色、穿在布衣上 */
  private random(): Appearance {
    const r = randomAppearance(Math.random);
    return this.mode === 'create' ? { ...r, outfit: OUTFIT_PLAIN } : r;
  }
  private set(next: Appearance): void {
    // 建角：不管從哪來（舊的預設外觀、隨機、換體型）一律只留身體、穿布衣
    // 梳妝台：種族 / 服裝 / 頭飾 / 眼鏡固定是打開時的（只改身體特徵與布衣配色；隨機 / 換體型也一樣）
    const b = this.base;
    const a = this.mode === 'create' ? createLook(next)
      : this.mode === 'race' && b ? { ...b, race: next.race }
      : this.mode === 'mirror' && b ? { ...next, race: b.race, outfit: b.outfit, acc: b.acc, glasses: b.glasses } : next;
    this.a = a;
    for (const r of this.rows) {
      const v = r.tint ? this.tints[r.tint.i].tint[r.tint.ch] : r.f ? a[r.f.key] : 0;
      const idx = typeof v === 'boolean' ? (v ? 1 : 0) : v;
      const key = r.f?.key;
      r.val.textContent = r.options[idx]?.zh ?? '';
      r.el.dataset.value = String(idx);
      if (r.sw) {
        const ramp = key === 'hairColor' ? HAIR_RAMPS[idx] : key === 'eyes' ? EYE_RAMPS[idx] : key === 'skin' ? SKIN_RAMPS[idx] : CLOTH_RAMPS[idx];
        const ctx = r.sw.getContext('2d');
        if (ctx && ramp) {
          const c = (i: number): string => `rgb(${ramp[Math.min(ramp.length - 1, i)].join(',')})`;
          ctx.fillStyle = c(ramp.length > 3 ? 3 : 1); ctx.fillRect(0, 0, 4, 4);
          ctx.fillStyle = c(ramp.length > 3 ? 4 : 2); ctx.fillRect(0, 0, 2, 2);
          ctx.fillStyle = c(ramp.length > 3 ? 1 : 0); ctx.fillRect(2, 2, 2, 2);
        }
      }
    }
    if (this.blurb) this.blurb.textContent = `${RACE_BLURB[raceId(a)]}　${UNISEX_NOTE}`;
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
    const look = this.opts?.look?.(this.a, this.slotTints()) ?? plainLook(this.a);
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
    ctx.save();
    if (this.faceLeft) { ctx.translate(this.canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(fr[r.f] ?? fr[0], PAD * ZOOM, PAD * ZOOM, AV_FW * ZOOM, AV_FH * ZOOM);
    ctx.restore();
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
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && i >= 0) { e.preventDefault(); e.stopPropagation(); this.step(this.rows[i], k === 'ArrowLeft' ? -1 : 1); return; }
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

const LABEL: Partial<Record<SheetAnim, string>> = { idle: '待機', blink: '眨眼', walk: '走路', jump: '跳躍', climb: '爬繩', hang: '掛著', mantle: '攀上邊緣' };
