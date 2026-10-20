// titleUi.ts — 標題畫面的 DOM 控制：像素字標（整數倍放大、火把 3 格動畫）、選單圖示 / 游標、
// ↑↓ / Home / End 鍵盤移動、「新世界」面板（世界名 / 骰子 / 難度）、「設定」面板（音效音量 / 預設縮放 / 自動瞄準）、
// 「繼續」的存檔摘要、選單音效。遊戲流程（開局 / 讀檔 / 轉場）在 session.ts。
import { toCanvas } from './pixel';
import { cursorBmp, iconBmp, logoBmp, logoShineBmp, logoTorchTip, type TitleIcon } from './titleArt';
import { continueLines, menuMove, readVolume, rollWorldName, writeVolume, zoomPrefLabel } from './titleModel';
import { parseZoomPref } from './lowres';
import type { SoundManager } from '../audio/SoundManager';
import type { CharacterMeta, SlotMeta } from '../save/storage';
import type { Appearance } from '../engine/appearance';

export const PEACEFUL_KEY = 'delve.peaceful';
export const ZOOM_KEY = 'delve.zoom';
export const AIM_KEY = 'delve.autoaim';
/** 設定面板的縮放範圍（實際生效值仍會依畫面大小夾住） */
const ZOOM_MIN = -3, ZOOM_MAX = 4;

export interface TitleHandlers {
  /** 繼續冒險：最近存檔的世界 + 它記錄的角色 */
  onContinue(): void;
  /** 舊標題「新世界」面板：新的預設角色 + 新世界（Task 4 換成 onCreateWorld） */
  onCreate(seed: string, peaceful: boolean): void;
  /** 匯入：沒給檔案 → 打開檔案選擇；給檔案 → 匯入成新的世界（不進遊戲） */
  onImport(file?: File): void;
  /** 舊標題「匯出存檔」：匯出「繼續冒險」指向的世界 */
  onExport(): void;
  /** 開始遊戲（進角色列表前；舊存檔先轉換） */
  onStart(): void;
  onPickCharacter(id: string): void;
  /** 建立並選定新角色；失敗 → null */
  onCreateCharacter(nick: string, appearance: Appearance): Promise<CharacterMeta | null>;
  onDeleteCharacter(id: string): void;
  /** 用選定的角色進這個世界 */
  onPickWorld(slot: string): void;
  /** 用選定的角色建新世界 */
  onCreateWorld(name: string, peaceful: boolean): void;
  onDeleteWorld(slot: string): void;
  onExportWorld(slot: string): void;
  onHelp(): void;
  /** 「按任意鍵開始」→ 選單滑進來（場景跳過開場下降） */
  onPressStart(): void;
  /** 主選單「角色外觀」/ 新世界面板「更換外觀」 */
  onLook(): void;
  /** 新世界面板的體型（0 女、1 男） */
  onBody(body: number): void;
}

export interface TitleUiOptions {
  reducedMotion: boolean;
  storage: Storage | undefined;
  sound: SoundManager;
  /** 新世界面板的預設難度 */
  peaceful: boolean;
}

/** 音量改變：寫進遊戲廳共用的 window.__arcadeAudio 並廣播（SoundManager 會即時跟著變） */
export function publishVolume(sfxVolume: number): void {
  const w = window as unknown as { __arcadeAudio?: { musicVolume?: number; sfxVolume?: number } };
  const musicVolume = w.__arcadeAudio?.musicVolume ?? 0.5;
  w.__arcadeAudio = { musicVolume, sfxVolume };
  window.dispatchEvent(new CustomEvent('arcade-audio-change', { detail: { musicVolume, sfxVolume } }));
}

export class TitleUi {
  private readonly offs: (() => void)[] = [];
  private logoFrames: HTMLCanvasElement[] = [];
  private shineFrames: HTMLCanvasElement[] = [];
  private logoFrame = 0;
  private logoTick = 0;
  private logoTimer = 0;
  private logoK = 0;
  private peaceful: boolean;
  private panel: HTMLElement | null = null;
  private panelReturn: HTMLElement | null = null;
  private readonly items: HTMLElement[];
  private readonly $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => this.root.querySelector<T>(sel);

  constructor(private readonly root: HTMLElement, private readonly h: TitleHandlers, private readonly o: TitleUiOptions) {
    this.peaceful = o.peaceful;
    this.items = [...root.querySelectorAll<HTMLElement>('#delve-tmenu .delve-ti')];
    this.buildArt();
    this.wire();
    this.syncDifficulty();
    this.syncSettings();
  }

  private on(el: EventTarget | null, type: string, fn: EventListener): void {
    if (!el) return;
    el.addEventListener(type, fn);
    this.offs.push(() => el.removeEventListener(type, fn));
  }

  // ── 美術：字標 / 圖示 / 游標 ──
  private buildArt(): void {
    this.logoFrames = [0, 1, 2].map((f) => toCanvas(logoBmp(f)) as HTMLCanvasElement);
    const lw = this.logoFrames[0].width;
    for (let x = -16; x <= lw + 16; x += 5) this.shineFrames.push(toCanvas(logoShineBmp(x)) as HTMLCanvasElement);
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-icon]')) {
      const c = toCanvas(iconBmp(el.dataset.icon as TitleIcon)) as HTMLCanvasElement;
      c.className = 'delve-ti-icon';
      c.setAttribute('aria-hidden', 'true');
      el.prepend(c);
    }
    const cur = cursorBmp();
    for (const it of this.items) {
      const c = toCanvas(cur) as HTMLCanvasElement;
      c.className = 'delve-ti-cursor';
      c.setAttribute('aria-hidden', 'true');
      it.prepend(c);
    }
    this.layoutLogo();
    // 載入畫面的小字標（3 倍）
    const ll = this.$<HTMLCanvasElement>('#delve-loading-logo'), lf = this.logoFrames[0], lctx = ll?.getContext('2d');
    if (ll && lf && lctx) {
      ll.width = lf.width * 3; ll.height = lf.height * 3;
      lctx.imageSmoothingEnabled = false;
      lctx.drawImage(lf, 0, 0, ll.width, ll.height);
    }
    if (!this.o.reducedMotion) {
      // 12 fps：火焰每 2 拍換一格、餘燼往上飄、每 ~5 秒一道刷光掃過字身
      this.logoTimer = window.setInterval(() => {
        this.logoTick++;
        if ((this.logoTick & 1) === 0) this.logoFrame = (this.logoFrame + 1) % 3;
        this.drawLogo();
      }, 83);
    }
  }

  /** 字標整數倍放大：寬不超過畫面（扣邊距）、高不超過畫面高的 ~24% */
  private layoutLogo(): void {
    const c = this.$<HTMLCanvasElement>('#delve-logo'), f = this.logoFrames[0];
    if (!c || !f) return;
    const w = window.innerWidth, h = window.innerHeight, wideShort = h < 520 && w > h;
    // 橫放手機：字標在左欄，可以佔左半寬、四成高
    const availW = wideShort ? w * 0.46 : Math.min(w - 32, 820), availH = h * (wideShort ? 0.42 : 0.24);
    const k = Math.max(2, Math.min(10, Math.floor(availW / f.width), Math.floor(availH / f.height)));
    if (k !== this.logoK) {
      this.logoK = k;
      c.width = f.width * k;
      c.height = f.height * k;
    }
    this.drawLogo();
  }

  private drawLogo(): void {
    const c = this.$<HTMLCanvasElement>('#delve-logo'), f = this.logoFrames[this.logoFrame];
    const ctx = c?.getContext('2d');
    if (!c || !f || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(f, 0, 0, c.width, c.height);
    if (this.o.reducedMotion) return;
    const k = this.logoK, tick = this.logoTick;
    // 刷光
    const sweep = tick % 60;
    const sh = this.shineFrames[sweep];
    if (sh) ctx.drawImage(sh, 0, 0, c.width, c.height);
    // 餘燼：從火焰頂端往上飄、左右搖，越高越暗，飄到頂就熄
    const tip = logoTorchTip(), cols = ['#fff4c0', '#ffd86a', '#ffa93a', '#e8701c'];
    for (let i = 0; i < 5; i++) {
      const ph = ((tick / 24) + i / 5) % 1;
      if (ph > 0.85) continue;
      const ex = tip.x + Math.round(Math.sin(i * 2.3 + ph * 7) * 2.2), ey = tip.y - 1 - Math.floor(ph * 15);
      ctx.fillStyle = cols[Math.min(3, Math.floor(ph * 4.7))];
      ctx.fillRect(ex * k, ey * k, k, k);
    }
  }

  // ── 事件 ──
  private wire(): void {
    const click = (id: string, fn: () => void, sfx: 'confirm' | 'back' | 'none' = 'confirm'): void => {
      this.on(this.$(id), 'click', () => {
        this.o.sound.ensure();
        if (sfx === 'confirm') this.o.sound.uiConfirm(); else if (sfx === 'back') this.o.sound.uiBack();
        fn();
      });
    };
    click('#delve-continue', () => this.h.onContinue());
    click('#delve-new', () => this.openPanel('#delve-newpanel', '#delve-seed'));
    click('#delve-import', () => this.h.onImport());
    click('#delve-export-title', () => this.h.onExport());
    click('#delve-help-open', () => this.h.onHelp());
    click('#delve-settings-btn', () => this.openPanel('#delve-settings', '#delve-vol'));
    click('#delve-look', () => this.h.onLook());
    click('#delve-new-look', () => this.h.onLook());
    click('#delve-body-f', () => this.h.onBody(0), 'none');
    click('#delve-body-m', () => this.h.onBody(1), 'none');
    // 體型：左右鍵切換（radiogroup）
    this.on(this.$('#delve-body'), 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
      e.preventDefault();
      const next = this.$('#delve-body-f')?.getAttribute('aria-checked') === 'true' ? 1 : 0;
      this.h.onBody(next);
      this.$(next ? '#delve-body-m' : '#delve-body-f')?.focus();
    });
    click('#delve-back', () => { /* 連結本身導頁 */ });
    click('#delve-new-cancel', () => this.closePanel(), 'back');
    click('#delve-settings-close', () => this.closePanel(), 'back');
    click('#delve-create', () => this.create());
    click('#delve-dice', () => this.roll(), 'none');
    click('#delve-diff-normal', () => this.setDifficulty(false), 'none');
    click('#delve-diff-peaceful', () => this.setDifficulty(true), 'none');
    click('#delve-zp-dec', () => this.zoomBy(-1), 'none');
    click('#delve-zp-inc', () => this.zoomBy(1), 'none');
    click('#delve-aim-pref', () => this.toggleAim(), 'none');
    this.on(this.$('#delve-seed'), 'keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); this.o.sound.uiConfirm(); this.create(); } });
    const vol = this.$<HTMLInputElement>('#delve-vol');
    this.on(vol, 'input', () => {
      const v = Math.max(0, Math.min(100, Number(vol?.value ?? 60))) / 100;
      writeVolume(this.o.storage, v);
      publishVolume(v);
      this.syncSettings();
      this.o.sound.ensure();
      this.o.sound.uiMove();
    });
    // 難度：左右鍵切換（radiogroup）
    this.on(this.$('#delve-diff'), 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
      e.preventDefault();
      this.setDifficulty(!this.peaceful);
      (this.peaceful ? this.$('#delve-diff-peaceful') : this.$('#delve-diff-normal'))?.focus();
    });
    // 滑鼠移過選單項：游標跟著（同鍵盤焦點）
    for (const it of this.items) this.on(it, 'pointerenter', () => { if (document.activeElement !== it && !this.panel) { it.focus({ preventScroll: true }); this.o.sound.uiMove(); } });
    this.on(this.root, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    this.on(window, 'keydown', (e) => { if (e.target === document.body) this.onKey(e as KeyboardEvent); });
    // 開始畫面：點 / 觸碰標題任何地方（連結除外）
    this.on(this.$('#delve-title'), 'pointerdown', (e) => {
      if (this.root.dataset.title !== 'press' || (e.target as HTMLElement).closest('a')) return;
      e.preventDefault();
      this.pressStart();
    });
    this.on(this.$('#delve-press'), 'click', () => this.pressStart());
    this.on(window, 'resize', () => this.layoutLogo());
  }

  /** 按任意鍵開始：切到選單（選單 steps 滑入）、焦點給第一個選單項 */
  pressStart(): void {
    if (this.root.dataset.title !== 'press') return;
    this.root.dataset.title = 'menu';
    this.o.sound.ensure();
    this.o.sound.uiConfirm();
    this.h.onPressStart();
    this.focusFirst(true);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.root.dataset.phase !== 'title' || this.root.dataset.confirm || this.root.dataset.help || this.root.dataset.wardrobe) return;
    if (this.root.dataset.title === 'press') {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      this.pressStart();
      return;
    }
    if (this.panel) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.o.sound.uiBack(); this.closePanel(); }
      else if (e.key === 'Tab') this.trapTab(e);
      return;
    }
    if (e.key === 'Escape') {
      // 選單上 Esc：回到「按任意鍵開始」
      e.preventDefault();
      this.root.dataset.title = 'press';
      this.o.sound.uiBack();
      this.$('#delve-press')?.focus({ preventScroll: true });
      return;
    }
    const vis = this.items.map((it) => !it.hidden && !it.closest('[hidden]'));
    const cur = this.items.indexOf(document.activeElement as HTMLElement);
    const next = menuMove(vis, cur, e.key);
    if (next === null) return;
    e.preventDefault();
    if (next !== cur) { this.items[next].focus(); this.o.sound.ensure(); this.o.sound.uiMove(); }
  }

  /** 面板裡 Tab 只在面板內循環 */
  private trapTab(e: KeyboardEvent): void {
    const p = this.panel;
    if (!p) return;
    const f = [...p.querySelectorAll<HTMLElement>('button, input, [tabindex]')].filter((el) => !el.hidden && !(el as HTMLButtonElement).disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  openPanel(sel: string, focusSel: string): void {
    const p = this.$(sel);
    if (!p) return;
    this.closePanel(false);
    this.panelReturn = document.activeElement as HTMLElement | null;
    this.panel = p;
    p.hidden = false;
    this.root.dataset.tpanel = p.id;
    this.$(focusSel)?.focus();
  }

  closePanel(restore = true): void {
    if (!this.panel) return;
    this.panel.hidden = true;
    this.panel = null;
    delete this.root.dataset.tpanel;
    if (restore) this.panelReturn?.focus?.();
  }

  get panelOpen(): boolean { return this.panel !== null; }

  // ── 新世界 ──
  private roll(): void {
    const s = this.$<HTMLInputElement>('#delve-seed');
    if (!s) return;
    s.value = rollWorldName(Math.random);
    this.o.sound.ensure();
    this.o.sound.uiDice();
    s.focus();
    s.select();
  }

  private create(): void {
    const s = this.$<HTMLInputElement>('#delve-seed');
    const seed = (s?.value ?? '').trim() || rollWorldName(Math.random);
    this.h.onCreate(seed, this.peaceful);
  }

  private setDifficulty(p: boolean): void {
    this.peaceful = p;
    try { this.o.storage?.setItem(PEACEFUL_KEY, p ? '1' : '0'); } catch { /* 私密模式 */ }
    this.o.sound.ensure();
    this.o.sound.uiMove();
    this.syncDifficulty();
  }

  private syncDifficulty(): void {
    const n = this.$('#delve-diff-normal'), p = this.$('#delve-diff-peaceful'), hint = this.$('#delve-diff-hint');
    n?.setAttribute('aria-checked', this.peaceful ? 'false' : 'true');
    p?.setAttribute('aria-checked', this.peaceful ? 'true' : 'false');
    n?.setAttribute('tabindex', this.peaceful ? '-1' : '0');
    p?.setAttribute('tabindex', this.peaceful ? '0' : '-1');
    if (hint) hint.textContent = this.peaceful ? '不會自然生成怪物，專心挖礦與建造（首領仍可召喚）' : '怪物依地區與晝夜出現：晚上先蓋小屋、放張床';
  }

  // ── 設定 ──
  private zoomPref(): number {
    try { return parseZoomPref(this.o.storage?.getItem(ZOOM_KEY)); } catch { return 0; }
  }
  private zoomBy(d: number): void {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoomPref() + d));
    try { this.o.storage?.setItem(ZOOM_KEY, String(z)); } catch { /* 私密模式 */ }
    this.o.sound.ensure();
    this.o.sound.uiMove();
    this.syncSettings();
  }
  private aimPref(): boolean {
    try { return this.o.storage?.getItem(AIM_KEY) === '1'; } catch { return false; }
  }
  private toggleAim(): void {
    const on = !this.aimPref();
    try { this.o.storage?.setItem(AIM_KEY, on ? '1' : '0'); } catch { /* 私密模式 */ }
    this.o.sound.ensure();
    this.o.sound.uiMove();
    this.syncSettings();
  }
  private syncSettings(): void {
    const v = readVolume(this.o.storage);
    const vol = this.$<HTMLInputElement>('#delve-vol'), out = this.$('#delve-vol-val');
    if (vol && document.activeElement !== vol) vol.value = String(Math.round(v * 100));
    if (out) out.textContent = v <= 0 ? '靜音' : `${Math.round(v * 100)}%`;
    const z = this.zoomPref(), zv = this.$('#delve-zp-val');
    if (zv) zv.textContent = zoomPrefLabel(z);
    this.$<HTMLButtonElement>('#delve-zp-dec')!.disabled = z <= ZOOM_MIN;
    this.$<HTMLButtonElement>('#delve-zp-inc')!.disabled = z >= ZOOM_MAX;
    const aim = this.aimPref(), ab = this.$('#delve-aim-pref');
    if (ab) { ab.setAttribute('aria-checked', aim ? 'true' : 'false'); ab.textContent = aim ? '開' : '關'; }
  }

  /** 新世界面板的體型按鈕狀態 */
  syncBody(body: number): void {
    const f = this.$('#delve-body-f'), m = this.$('#delve-body-m');
    f?.setAttribute('aria-checked', body === 0 ? 'true' : 'false');
    m?.setAttribute('aria-checked', body === 1 ? 'true' : 'false');
    f?.setAttribute('tabindex', body === 0 ? '0' : '-1');
    m?.setAttribute('tabindex', body === 1 ? '0' : '-1');
  }

  /** 新世界面板的角色小預覽 */
  setLookPreview(img: HTMLCanvasElement): void {
    const c = this.$<HTMLCanvasElement>('#delve-new-doll'), ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
  }

  // ── 角色 / 世界列表（面板 DOM 在 Task 4；目前只記住最新的列表） ──
  private chars: CharacterMeta[] = [];
  private worlds: SlotMeta[] = [];
  private worldsFor = '';
  setCharacters(list: CharacterMeta[]): void { this.chars = list; }
  setWorlds(list: SlotMeta[], forNick: string): void { this.worlds = list; this.worldsFor = forNick; }

  // ── 存檔摘要 ──
  setSave(meta: SlotMeta | null): void {
    const btn = this.$('#delve-continue'), sub = this.$('#delve-continue-sub'), ex = this.$('#delve-export-title');
    if (btn) btn.hidden = !meta;
    if (ex) ex.hidden = !meta;
    this.root.dataset.save = meta ? '1' : '0';
    if (!meta || !sub) return;
    sub.replaceChildren(...continueLines(meta, Date.now()).map((t) => {
      const s = document.createElement('span');
      s.className = 'delve-ti-line';
      s.textContent = t;
      return s;
    }));
  }

  /** 焦點放到第一個看得到的選單項（沒有別的東西拿著焦點時） */
  focusFirst(force = false): void {
    if (this.root.dataset.title === 'press') { this.$('#delve-press')?.focus({ preventScroll: true }); return; }
    const a = document.activeElement;
    if (!force && a && a !== document.body && this.root.contains(a) && !this.items.includes(a as HTMLElement)) return;
    this.items.find((it) => !it.hidden && !it.closest('[hidden]'))?.focus({ preventScroll: true });
  }

  destroy(): void {
    clearInterval(this.logoTimer);
    for (const f of this.offs) f();
    this.offs.length = 0;
  }
}
