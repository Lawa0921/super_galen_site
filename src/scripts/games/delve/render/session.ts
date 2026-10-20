// session.ts — 頁面流程：標題畫面（即時背景場景、選單：繼續 / 新世界 / 匯入匯出 / 說明 / 設定）、
// 像素抖動轉場 + 分段生成世界的進度、選單（存檔 / 匯出 / 匯入 / 回到標題）、自動存檔、debug 鉤。
import { DelveGame } from '../engine/game';
import { generateWorldSteps, GEN_STAGE_COUNT, type GenResult } from '../engine/worldgen';
import { GEN_VERSION } from '../engine/constants';
import { restoreGame, COMPAT_GEN, type SaveData } from '../save/serialize';
import {
  listWorlds, startAutosave, requestPersistence, exportBlob, importBlob, hasIndexedDB, idbSplitStore, DbBlockedError, type SlotMeta,
} from '../save/storage';
import { SplitSession, planContinue, saveSplit, commitMigration, type ContinuePlan } from '../save/split';
import { decodeAnySave, encodeWorld, restoreSplit, type AnySave, type WorldData } from '../save/worldSave';
import type { DelveCharacter } from '../save/character';
import { startDelve, type DelveHandle } from './main';
import { autostartPlan, newWorldPlan, helpSeen, HELP_KEY } from './model';
import { SoundManager } from '../audio/SoundManager';
import { TitleScene } from './titleScene';
import { TitleUi, PEACEFUL_KEY, publishVolume } from './titleUi';
import { Wipe } from './wipe';
import { genProgress, genStageLabel, GEN_STAGE_LABELS, readVolume, rollWorldName, summarizeGame } from './titleModel';
import { liveCounts, type LiveCounts } from './live';
import { GEN_PHASES, GenSectionView, genPhaseLabel, genPhaseOf } from './genSection';
import { Wardrobe } from './wardrobe';
import { loadDefaultAppearance, saveDefaultAppearance, setAppearance, type Appearance } from '../engine/appearance';
import { dollKey, plainLook } from '../engine/doll';
import { dollPreview } from './dollPreview';
import { toCanvas } from './pixel';

const SLOT = 'main';
/** 匯入的世界檔沒有內嵌角色（不是從遊戲匯出的檔） */
const NO_CHARACTER_MSG = '讀取失敗：這個存檔沒有角色資料。';
/** 進度條格數 */
const PROGRESS_CELLS = 20;
/** 生成畫面的地層剖面大小（像素；4200×1200 的世界每像素 = 15×15 格） */
const SECTION_W = 280, SECTION_H = 80;

/** debug / e2e 鉤（唯一的型別宣告；tests/e2e/delve.spec.ts 也用這個） */
export interface DelveDebug { game: DelveGame; handle: DelveHandle; save: () => Promise<void> }
declare global {
  interface Window { __delveDebug?: DelveDebug; __delveTitle?: TitleScene; __delveLive?: () => LiveCounts }
}

export interface Session { destroy(): void; }

/** 新世界的預設難度：網址 ?peaceful=1 / 0 優先，否則用上次的選擇（localStorage） */
function defaultPeaceful(): boolean {
  const q = new URLSearchParams(location.search).get('peaceful');
  if (q === '1') return true;
  if (q === '0') return false;
  try { return globalThis.localStorage?.getItem(PEACEFUL_KEY) === '1'; } catch { return false; }
}

function reducedMotion(): boolean {
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

/** 下一個可以畫進度的時機（分頁隱藏時 rAF 不跑 → 改用 setTimeout） */
function nextTick(fn: () => void): void {
  if (document.hidden) setTimeout(fn, 0); else requestAnimationFrame(() => fn());
}

export function bootDelve(root: HTMLElement): Session {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);
  const canvas = $<HTMLCanvasElement>('#delve-canvas');
  const title = $('#delve-title');
  const hudEl = $('#delve-hud');
  const menu = $('#delve-menu');
  const titleMsg = $('#delve-title-msg');
  const menuMsg = $('#delve-menu-msg');
  const fileInput = $<HTMLInputElement>('#delve-import-file');
  const confirmEl = $('#delve-confirm');
  const confirmMsg = $('#delve-confirm-msg');
  const confirmOk = $<HTMLButtonElement>('#delve-confirm-ok');
  const confirmCancel = $<HTMLButtonElement>('#delve-confirm-cancel');
  const loading = $('#delve-loading');
  const loadingText = $('#delve-loading-text');
  const loadingStage = $('#delve-loading-stage');
  const progress = $('#delve-progress');
  const wipeCanvas = $<HTMLCanvasElement>('#delve-wipe');
  const upgradeNew = $<HTMLButtonElement>('#delve-upgrade-new');
  if (!canvas || !title || !hudEl || !menu) throw new Error('delve: missing page elements');
  // 觸控裝置：一載入就切到觸控版介面（虛擬按鍵、觸控版說明），不必等第一次觸碰
  try { if (globalThis.matchMedia?.('(pointer: coarse)').matches) root.dataset.touch = '1'; } catch { /* 舊瀏覽器 */ }
  const helpEl = $('#delve-help');
  const helpClose = $<HTMLButtonElement>('#delve-help-close');
  const reduced = reducedMotion();
  if (reduced) root.dataset.reduced = '1';

  let storage: Storage | undefined;
  try { storage = globalThis.localStorage; } catch { storage = undefined; }
  // 這頁沒有遊戲廳的音量面板：自己把存著的音效音量發布出去（SoundManager 跟著它）
  publishVolume(readVolume(storage));

  let handle: DelveHandle | null = null;
  /** 這場遊戲的存檔身分（角色 + 世界）；begin 設定，每次存檔都寫世界 + 角色兩份 */
  let split: SplitSession | null = null;
  let stopAutosave: (() => void) | null = null;
  let persisted = false;
  let busy = false;
  /** 進行中的轉場（開局掀開動畫還在播時按「回到標題」→ 等它播完再走） */
  let inFlight: Promise<void> = Promise.resolve();
  const offs: (() => void)[] = [];
  const on = (el: EventTarget | null, type: string, fn: EventListener): void => {
    if (!el) return;
    el.addEventListener(type, fn);
    offs.push(() => el.removeEventListener(type, fn));
  };

  const say = (el: HTMLElement | null, msg: string): void => { if (el) el.textContent = msg; };
  const uiSound = new SoundManager();
  const unlock = (): void => uiSound.ensure();
  on(root, 'pointerdown', unlock);
  on(window, 'keydown', unlock);
  const wipe = wipeCanvas ? new Wipe(wipeCanvas, reduced) : null;
  const wardrobeEl = $('#delve-wardrobe');
  const wardrobe = wardrobeEl ? new Wardrobe(root, wardrobeEl, uiSound) : null;
  /** 新世界用的預設外觀（localStorage） */
  const defaultLook = (): Appearance => loadDefaultAppearance(storage);

  // ── 標題背景：第一次繪製之後才生成小世界（不擋住標題畫面出現） ──
  let scene: TitleScene | null = null;
  let sceneTimer = 0;
  /** 建立並啟動標題背景場景（已有就不重建）；skipIntro = 直接停在洞窟構圖（從遊戲回到標題時） */
  function startScene(skipIntro: boolean): void {
    if (root.dataset.phase !== 'title' || scene) return;
    try {
      scene = new TitleScene(canvas!, { reducedMotion: reduced, appearance: defaultLook() });
      window.__delveTitle = scene;
      if (skipIntro) scene.skipIntro();
      scene.start();
      root.dataset.scene = '1';
    } catch (e) { console.warn('[delve] title scene failed', e); }
  }
  if (!new URLSearchParams(location.search).get('autostart')) {
    sceneTimer = window.setTimeout(() => { sceneTimer = 0; startScene(false); }, 60);
  }
  function stopScene(): void {
    if (sceneTimer) { clearTimeout(sceneTimer); sceneTimer = 0; }
    scene?.destroy();
    scene = null;
    delete window.__delveTitle;
    delete root.dataset.scene;
  }

  /**
   * 所有存檔路徑（自動存檔 / pagehide / 手動 / 回到標題 / 匯入後開局）都走這裡：世界 + 角色在同一個 transaction。
   * 一次只寫一筆（排隊）：角色 rev 照順序落地，不會被晚到的舊快照蓋掉。
   */
  let saveQueue: Promise<unknown> = Promise.resolve();
  function writeSave(game: DelveGame, s: SplitSession): Promise<SlotMeta> {
    const run = (): Promise<SlotMeta> => saveSplit(idbSplitStore, SLOT, s, game, Date.now(), summarizeGame(game, s.nick));
    const p = saveQueue.then(run, run);
    saveQueue = p.catch(() => undefined);
    return p;
  }
  function markPersisted(): void {
    if (!persisted) { persisted = true; void requestPersistence(); }
  }
  async function saveNow(): Promise<void> {
    if (!handle || !split || !hasIndexedDB()) return;
    await writeSave(handle.game, split);
    markPersisted();
  }

  const peacefulBtn = $<HTMLButtonElement>('#delve-peaceful');
  function syncPeaceful(): void {
    const p = Boolean(handle?.game.peaceful);
    if (peacefulBtn) {
      peacefulBtn.textContent = p ? '難度：和平（不生怪）' : '難度：一般';
      peacefulBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
    }
  }
  function setMenu(open: boolean): void {
    if (!menu || leaving) return;
    if (wardrobe?.isOpen) { wardrobe.close(); return; }
    menu.hidden = !open;
    handle?.setPaused(open);
    say(menuMsg, '');
    syncPeaceful();
  }

  // ── 操作說明：第一次進遊戲自動打開，看過記在 localStorage；選單 / 標題「操作說明」可再打開 ──
  let helpFocus: HTMLElement | null = null;
  function setHelp(open: boolean): void {
    if (!helpEl) return;
    helpEl.hidden = !open;
    if (open) {
      root.dataset.help = '1';
      helpFocus = document.activeElement as HTMLElement | null;
      handle?.setPaused(true);
      helpClose?.focus();
    } else {
      delete root.dataset.help;
      try { globalThis.localStorage?.setItem(HELP_KEY, '1'); } catch { /* 私密模式：下次還會再顯示 */ }
      handle?.setPaused(!menu!.hidden);
      helpFocus?.focus?.();
    }
  }

  function begin(game: DelveGame, s: SplitSession): void {
    stopAutosave?.();
    handle?.destroy();
    split = s;
    stopScene();
    ui.closePanel(false);
    title!.hidden = true;
    hudEl!.hidden = false;
    root.dataset.phase = 'playing';
    setMenu(false);
    handle = startDelve({ root, canvas: canvas!, game, onMenu: () => setMenu(menu!.hidden) });
    window.__delveDebug = { game, handle, save: saveNow };
    if (!helpSeen(storage)) setHelp(true);
    if (hasIndexedDB()) {
      stopAutosave = startAutosave({
        save: () => writeSave(game, s),
        onSaved: markPersisted,
        onError: (e) => console.warn('[delve] autosave failed', e),
      });
      void saveNow().catch((e: unknown) => console.warn('[delve] save failed', e));
    }
  }

  /**
   * 遊戲中「回到標題」：先存檔（失敗就留在遊戲裡回報，不丟進度）→ 轉場蓋上 → 收掉遊戲（迴圈 / 輸入 / 音效 / 自動存檔）
   * → 標題畫面（場景直接停在洞窟、選單模式、「繼續」摘要是剛存的）→ 掀開。之後的繼續 / 新世界走一般流程。
   */
  /** 沒有 IndexedDB（無法存檔）時第一次按「回到標題」只警告；再按一次才真的離開 */
  let noSaveWarned = false;
  /** 正在「回到標題」（存檔 / 轉場中）：選單與 Esc 不再切換暫停 */
  let leaving = false;
  async function returnToTitle(): Promise<void> {
    if (busy) await inFlight;
    if (busy || !handle) return;
    if (!hasIndexedDB() && !noSaveWarned) {
      noSaveWarned = true;
      say(menuMsg, '這個瀏覽器不能存檔：離開後進度會消失。要保留請先「匯出存檔」，確定要離開就再按一次「回到標題」。');
      return;
    }
    busy = true;
    leaving = true;
    // 離開途中遊戲保持暫停、選單不能再操作（存完檔之後的動作不會被丟掉）
    handle.setPaused(true);
    if (menu) menu.inert = true;
    try {
      say(menuMsg, '存檔中…');
      try { await saveNow(); } catch (e) {
        say(menuMsg, `存檔失敗，沒有離開：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      uiSound.uiBack();
      await wipe?.cover();
      stopAutosave?.();
      stopAutosave = null;
      handle.destroy();
      handle = null;
      split = null;
      delete window.__delveDebug;
      if (menu) menu.hidden = true;
      noSaveWarned = false;
      say(menuMsg, '');
      if (helpEl && !helpEl.hidden) { helpEl.hidden = true; delete root.dataset.help; }
      hudEl!.hidden = true;
      title!.hidden = false;
      root.dataset.phase = 'title';
      root.dataset.title = 'menu';
      say(titleMsg, '');
      ui.setSave(await titleSlot());
      startScene(true);
      ui.focusFirst(true);
      await wipe?.reveal();
      ui.focusFirst(true);
    } finally {
      if (menu) menu.inert = false;
      leaving = false;
      busy = false;
    }
  }

  /** 目前存檔槽；沒有存檔 / 無 IndexedDB 時 null。資料庫被別的分頁擋住 → 丟 DbBlockedError（不能當成「沒有存檔」） */
  async function existingSlot(): Promise<SlotMeta | null> {
    if (!hasIndexedDB()) return null;
    try {
      return (await listWorlds()).find((m) => m.slot === SLOT) ?? null;
    } catch (e) {
      if (e instanceof DbBlockedError) throw e;
      return null;
    }
  }
  /** 標題畫面用：被擋住時在標題訊息顯示原因，當作沒有存檔可繼續 */
  async function titleSlot(): Promise<SlotMeta | null> {
    try { return await existingSlot(); } catch (e) {
      say(titleMsg, e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  async function existingSeed(): Promise<string | null> { return (await existingSlot())?.seed ?? null; }

  // ── 轉場 + 分段生成 ──
  const sectionCanvas = $<HTMLCanvasElement>('#delve-gen-map');
  const section = sectionCanvas ? new GenSectionView(sectionCanvas, SECTION_W, SECTION_H, reduced) : null;
  const phaseEls = [...root.querySelectorAll<HTMLElement>('#delve-gen-phases .delve-gen-phase')];
  /** 大階段清單：已完成 / 進行中（-1 = 全部還沒開始；GEN_PHASES.length = 全部完成） */
  function setPhase(k: number): void {
    phaseEls.forEach((el, i) => { el.dataset.state = i < k ? 'done' : i === k ? 'now' : ''; });
  }
  function setProgress(p: number, stage: string): void {
    if (progress) {
      const n = Math.round(p * PROGRESS_CELLS);
      progress.querySelectorAll('.delve-progress-cell').forEach((c, i) => c.classList.toggle('is-on', i < n));
      progress.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    }
    say(loadingStage, stage);
  }
  const TIPS = [
    '晚上怪物比較多：先蓋個小屋、放張床當重生點',
    '火把可以插在牆上；洞穴越深越需要光',
    '銅鎬挖得動鐵礦，鐵鎬挖得動銀礦',
    '按 M 打開地圖，點一下可以放標記',
    '日誌（J）記錄你發現的地區、碑文與珍寶',
    '水碰到熔岩會變成黑曜石',
  ];
  // 載入畫面的字是之後才放進去的：先把點陣字（Google Fonts 依字分段下載）的字形載好，免得第一次顯示時是系統字
  try {
    void document.fonts?.load("16px 'DotGothic16'", ['生成世界中…載入世界中…完成提示：', ...GEN_STAGE_LABELS, ...GEN_PHASES.map((p) => p.zh + p.label), ...TIPS].join('')).catch(() => { /* 離線：用系統字 */ });
  } catch { /* 舊瀏覽器 */ }
  function showLoading(text: string): void {
    say(loadingText, text);
    say($('#delve-loading-tip'), `提示：${TIPS[Math.floor(Math.random() * TIPS.length)]}`);
    setProgress(0, '');
    setPhase(-1);
    section?.reset(null);
    if (loading) loading.hidden = false;
    root.dataset.phase = 'loading';
  }
  function hideLoading(): void { if (loading) loading.hidden = true; }

  /** 在段與段之間讓出主執行緒（每批最多 ~14 ms），邊生成邊畫進度條 */
  function generate(seed: string, size: { width?: number; height?: number }): Promise<GenResult> {
    // 剖面直接看生成中的世界：每批段落做完重新取樣一次（取樣 ~1 ms，比一段生成便宜得多）
    const it = generateWorldSteps(seed, { ...size, peek: (w) => section?.reset(w) });
    let i = 0, phase = -1;
    return new Promise((resolve, reject) => {
      const pump = (): void => {
        const t0 = performance.now();
        try {
          for (;;) {
            const r = it.next();
            if (r.done) {
              setProgress(1, '完成');
              setPhase(GEN_PHASES.length);
              section?.finish();
              resolve(r.value);
              return;
            }
            i++;
            phase = genPhaseOf(r.value, phase);
            setPhase(phase);
            setProgress(genProgress(i, GEN_STAGE_COUNT), `${genPhaseLabel(phase)}…`);
            if (performance.now() - t0 > 14) break;
          }
          section?.update();
        } catch (e) { section?.reset(null); reject(e); return; }
        nextTick(pump);
      };
      nextTick(pump);
    });
  }

  /** 轉場要開的局：遊戲 + 它的存檔身分 */
  interface Opened { game: DelveGame; session: SplitSession }
  /** 蓋上轉場 → 生成 / 讀檔 → 開局 → 掀開；失敗時回到原畫面並回報 */
  function transition(text: string, work: () => Promise<Opened | null>, from: 'title' | 'menu'): Promise<void> {
    if (busy) return inFlight;
    busy = true;
    inFlight = runTransition(text, work, from);
    return inFlight;
  }
  async function runTransition(text: string, work: () => Promise<Opened | null>, from: 'title' | 'menu'): Promise<void> {
    const prevPhase = root.dataset.phase ?? 'title';
    try {
      uiSound.uiDelve();
      await wipe?.cover();
      showLoading(text);
      const opened = await work();
      if (opened) {
        begin(opened.game, opened.session);
        hideLoading();
        await wipe?.reveal();
      } else {
        hideLoading();
        root.dataset.phase = prevPhase;
        await wipe?.reveal(220);
        if (from === 'title') ui.focusFirst(true);
      }
    } catch (e) {
      console.error('[delve] start failed', e);
      hideLoading();
      root.dataset.phase = prevPhase;
      say(from === 'title' ? titleMsg : menuMsg, `開局失敗：${e instanceof Error ? e.message : String(e)}`);
      await wipe?.reveal(220);
    } finally {
      busy = false;
    }
  }

  function startFresh(seed: string, peaceful = defaultPeaceful()): void {
    const s = seed.trim() || rollWorldName(Math.random);
    void transition('生成世界中…', async () => {
      const gen = await generate(s, {});
      return { game: new DelveGame({ seed: s, peaceful, gen, appearance: defaultLook() }), session: SplitSession.fresh(s, Date.now()) };
    }, 'title');
  }

  // ── 覆蓋確認對話框（頁內，不用 window.confirm） ──
  let pending: { seed: string; peaceful: boolean } | null = null;
  let lastFocus: HTMLElement | null = null;
  function askOverwrite(existing: string, seed: string, peaceful: boolean): void {
    if (!confirmEl) return;
    pending = { seed, peaceful };
    say(confirmMsg, `這個瀏覽器已有一個存檔（種子 ${existing}）。開新世界會覆蓋它，舊世界無法復原。要先備份的話請按取消，再從標題的「匯出存檔」下載。`);
    lastFocus = document.activeElement as HTMLElement | null;
    confirmEl.hidden = false;
    root.dataset.confirm = '1';
    confirmCancel?.focus();
  }
  function closeConfirm(): void {
    if (!confirmEl) return;
    confirmEl.hidden = true;
    delete root.dataset.confirm;
    lastFocus?.focus?.();
  }

  async function newWorld(seed: string, peaceful: boolean): Promise<void> {
    if (busy) return;
    let existing: string | null;
    // 讀不到存檔槽（被別的分頁擋住）就不開新世界：之後擋住解除時，自動存檔會不經確認蓋掉舊存檔
    try { existing = await existingSeed(); } catch (e) { say(titleMsg, e instanceof Error ? e.message : String(e)); return; }
    if (newWorldPlan(existing, false) === 'confirm') askOverwrite(existing as string, seed, peaceful);
    else startFresh(seed, peaceful);
  }

  function restoreError(r: Extract<ReturnType<typeof restoreGame>, { ok: false }>, msgEl: HTMLElement | null): void {
    if (r.error === 'gen_version') {
      say(msgEl, `這個存檔是舊版地圖產生器（v${r.saveGenVersion ?? '?'}）做的，新版地圖重做了洞穴、地層、生態區形狀並加入地城，舊世界無法繼續。可以先從選單匯出備份，再按下面的按鈕開一個新世界。`);
      if (upgradeNew && msgEl === titleMsg) upgradeNew.hidden = false;
    } else if (r.error === 'size') say(msgEl, '這個存檔的世界大小不正確，可能不是有效的 DELVE 存檔或已損毀。');
    else say(msgEl, '讀取失敗：這不是有效的 DELVE 存檔，或檔案已損毀 / 不完整。');
  }

  const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  /**
   * 舊合併存檔（format ≤ 9）→ 遊戲：先看檔頭（舊生成器立即回報，不必先生成世界），再分段生成同一個世界（顯示進度）後還原；
   * 還原成功 → commitMigration 寫成世界 + 角色（backup = 先把舊記錄原封備份到 main.v9.bak），寫完才開局。
   * 寫入失敗 → 回報、不開局；舊記錄沒動，下次「繼續」再試一次。
   */
  function openLegacy(data: SaveData, msgEl: HTMLElement | null, from: 'title' | 'menu', backup: boolean): void {
    const h = data.header;
    const migrate = h.format <= 5 && COMPAT_GEN.includes(h.genVersion);
    if (h.genVersion !== GEN_VERSION && !migrate) {
      const r = restoreGame(data);
      if (!r.ok) restoreError(r, msgEl);
      return;
    }
    void transition('載入世界中…', async () => {
      const gen = await generate(h.seed, { width: h.width, height: h.height });
      const r = restoreGame(data, { gen });
      if (!r.ok) { restoreError(r, msgEl); return null; }
      // 沒有 IndexedDB（無痕 / 被停用）：不能存，但仍照舊版行為開局（saveNow 也是無操作）
      if (!hasIndexedDB()) return { game: r.game, session: SplitSession.fresh(r.game.seed, Date.now()) };
      try {
        const session = await commitMigration(idbSplitStore, SLOT, r.game, Date.now(), { backup, summary: summarizeGame(r.game) });
        return { game: r.game, session };
      } catch (e) {
        say(msgEl, `存檔轉換失敗，沒有開始遊戲（原本的存檔沒有改動）：${errText(e)}`);
        return null;
      }
    }, from);
  }

  /** 世界檔 + 角色 → 遊戲（角色第一次來這個世界 → 從出生點開始）；先看生成器版本，不對就不必先生成世界 */
  function openSplit(world: WorldData, character: DelveCharacter, msgEl: HTMLElement | null, from: 'title' | 'menu'): void {
    const h = world.header;
    if (h.genVersion !== GEN_VERSION) {
      const r = restoreSplit(world, character);
      if (!r.ok) restoreError(r, msgEl);
      return;
    }
    void transition('載入世界中…', async () => {
      const gen = await generate(h.seed, { width: h.width, height: h.height });
      const r = restoreSplit(world, character, { gen });
      if (!r.ok) { restoreError(r, msgEl); return null; }
      return { game: r.game, session: SplitSession.fromLoaded(r.world, character) };
    }, from);
  }

  /**
   * 匯入的檔案：壞檔立即回報；舊合併檔 → 轉成世界 + 角色（不備份：匯入本來就會換掉存檔槽）；
   * 世界檔要有內嵌角色（遊戲匯出的檔才有）。開局時 begin 立刻存一次（世界 + 角色）。
   */
  function openImport(bytes: Uint8Array, msgEl: HTMLElement | null, from: 'title' | 'menu'): void {
    let any: AnySave;
    try { any = decodeAnySave(bytes); } catch {
      const r = restoreGame(bytes);
      if (!r.ok) restoreError(r, msgEl);
      return;
    }
    if (any.kind === 'legacy') { openLegacy(any.data, msgEl, from, false); return; }
    const character = any.data.header.character;
    if (!character) { say(msgEl, NO_CHARACTER_MSG); return; }
    openSplit(any.data, character, msgEl, from);
  }

  async function continueGame(): Promise<void> {
    if (busy) return;
    let plan: ContinuePlan;
    try { plan = await planContinue(idbSplitStore, SLOT); } catch (e) {
      say(titleMsg, `讀取存檔失敗：${errText(e)}`);
      return;
    }
    if (plan.kind === 'none') say(titleMsg, '找不到存檔');
    else if (plan.kind === 'error') say(titleMsg, plan.message);
    else if (plan.kind === 'legacy') openLegacy(plan.data, titleMsg, 'title', true);
    else openSplit(plan.world, plan.character, titleMsg, 'title');
  }

  function download(blob: Blob, name: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /** 匯出檔 = 世界檔 + 內嵌角色（D4）：一個檔案就能在別的瀏覽器接著玩 */
  const exportBytes = (world: WorldData, character: DelveCharacter): Uint8Array =>
    encodeWorld({ ...world, header: { ...world.header, character } });
  async function exportSave(): Promise<void> {
    if (!handle || !split) return;
    const g = handle.game;
    try {
      const { world, character } = split.snapshot(g, Date.now());
      download(await exportBlob(exportBytes(world, character)), `delve-${g.seed}.delve`);
      say(menuMsg, '已匯出存檔檔案');
    } catch (e) {
      say(menuMsg, `匯出失敗：${errText(e)}`);
    }
  }
  /** 標題的「匯出存檔」：直接把存檔槽打包下載（不必先進遊戲）；還沒轉換的舊存檔原樣匯出 */
  async function exportSlot(): Promise<void> {
    try {
      const plan = await planContinue(idbSplitStore, SLOT);
      if (plan.kind === 'none') { say(titleMsg, '找不到存檔'); return; }
      if (plan.kind === 'error') {
        // 存檔槽讀不了（角色遺失 / 損毀）：「開新世界」的覆蓋提示叫玩家先匯出，所以這裡把存檔槽的原始位元組照樣匯出（備份路徑不能斷）
        const raw = await idbSplitStore.getSlot(SLOT);
        if (!raw) { say(titleMsg, '找不到存檔'); return; }
        download(await exportBlob(raw.bytes), 'delve-save.delve');
        say(titleMsg, '已匯出存檔檔案（原始資料，存檔本身有問題）');
        return;
      }
      let bytes: Uint8Array | undefined, seed: string;
      if (plan.kind === 'split') { bytes = exportBytes(plan.world, plan.character); seed = plan.world.header.seed; }
      else { bytes = (await idbSplitStore.getSlot(SLOT))?.bytes; seed = plan.data.header.seed; }
      if (!bytes) { say(titleMsg, '找不到存檔'); return; }
      download(await exportBlob(bytes), `delve-${seed}.delve`);
      say(titleMsg, '已匯出存檔檔案');
    } catch (e) {
      say(titleMsg, `匯出失敗：${errText(e)}`);
    }
  }

  let importFrom: HTMLElement | null = titleMsg;
  on(fileInput, 'change', () => {
    const f = fileInput?.files?.[0];
    if (!f) return;
    const msgEl = importFrom;
    importBlob(f)
      .then((bytes) => openImport(bytes, msgEl, msgEl === titleMsg ? 'title' : 'menu'))
      .catch((e: unknown) => say(msgEl, `匯入失敗：${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { if (fileInput) fileInput.value = ''; });
  });

  const ui = new TitleUi(root, {
    onContinue: () => void continueGame(),
    onCreate: (seed, peaceful) => void newWorld(seed, peaceful),
    onImport: () => { importFrom = titleMsg; fileInput?.click(); },
    onExport: () => void exportSlot(),
    onHelp: () => setHelp(true),
    onPressStart: () => scene?.skipIntro(),
    onLook: () => {
      wardrobe?.open(defaultLook(), {
        onDone: (a) => { saveDefaultAppearance(storage, a); scene?.game.setAppearance(a); syncLookPreview(); },
      });
    },
    onBody: (body) => {
      const a = setAppearance(defaultLook(), 'body', body);
      saveDefaultAppearance(storage, a);
      scene?.game.setAppearance(a);
      uiSound.ensure(); uiSound.uiMove();
      syncLookPreview();
    },
  }, { reducedMotion: reduced, storage, sound: uiSound, peaceful: defaultPeaceful() });
  /** 新世界面板的角色小預覽（跟著預設外觀） */
  function syncLookPreview(): void {
    const l = plainLook(defaultLook());
    ui.setLookPreview(toCanvas(dollPreview(l, dollKey(l), 'idle', 0)) as HTMLCanvasElement);
    ui.syncBody(l.app.body);
  }
  syncLookPreview();
  // 遊戲中選單「角色外觀」：換的是這個世界的角色（身上的裝備照樣穿著），也記成新世界的預設
  on($('#delve-look-menu'), 'click', () => {
    const g = handle?.game;
    if (!g || !wardrobe || !menu) return;
    menu.hidden = true;
    handle?.setPaused(true);
    wardrobe.open(g.appearance, {
      look: (a) => ({ ...g.doll().look, app: a }),
      onDone: (a) => { g.setAppearance(a); saveDefaultAppearance(storage, a); },
      onClose: () => { if (handle) { menu.hidden = false; handle.setPaused(true); $('#delve-look-menu')?.focus(); } },
    });
  });

  on(upgradeNew, 'click', () => { if (upgradeNew) upgradeNew.hidden = true; ui.openPanel('#delve-newpanel', '#delve-seed'); });
  on(confirmOk, 'click', () => {
    closeConfirm();
    const p = pending;
    pending = null;
    if (p) startFresh(p.seed, p.peaceful);
  });
  on(confirmCancel, 'click', () => { pending = null; closeConfirm(); });
  on(confirmEl, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); pending = null; closeConfirm(); }
  });
  on($('#delve-resume'), 'click', () => setMenu(false));
  on($('#delve-help-btn'), 'click', () => { setMenu(false); setHelp(true); });
  on($('#delve-calendar-btn'), 'click', () => { setMenu(false); handle?.calendar.setOpen(true); });
  on($('#delve-settle-menu'), 'click', () => { setMenu(false); handle?.settleUi.toggleSettle(); });
  on($('#delve-quests-menu'), 'click', () => { setMenu(false); handle?.folkUi.setQuests(true); });
  on(helpClose, 'click', () => setHelp(false));
  on(helpEl, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); setHelp(false); }
  });
  on($('#delve-menu-btn'), 'click', () => setMenu(true));
  on($('#delve-to-title'), 'click', () => void returnToTitle());
  on($('#delve-save'), 'click', () => {
    saveNow().then(() => say(menuMsg, '已存檔')).catch((e: unknown) => say(menuMsg, `存檔失敗：${String(e)}`));
  });
  on($('#delve-export'), 'click', () => void exportSave());
  on(peacefulBtn, 'click', () => {
    if (!handle) return;
    handle.game.peaceful = !handle.game.peaceful;
    try { globalThis.localStorage?.setItem(PEACEFUL_KEY, handle.game.peaceful ? '1' : '0'); } catch { /* 私密模式 */ }
    syncPeaceful();
    say(menuMsg, handle.game.peaceful ? '和平模式：不會再生成怪物（首領仍可召喚）' : '一般模式：怪物會依地區與晝夜出現');
  });
  on($('#delve-import-menu'), 'click', () => { importFrom = menuMsg; fileInput?.click(); });

  window.__delveLive = () => liveCounts(performance.now());
  root.dataset.ready = '1';
  // 有存檔才顯示「繼續」（附存檔摘要）與「匯出存檔」
  ui.setSave(null);
  if (hasIndexedDB()) {
    void titleSlot().then((s) => {
      ui.setSave(s);
      if (root.dataset.phase === 'title') ui.focusFirst();
    });
  }
  requestAnimationFrame(() => { if (root.dataset.phase === 'title') ui.focusFirst(); });

  // e2e / 深連結：?seed=xxx&autostart=1[&fresh=1]。已有存檔時，沒有 fresh=1 不會直接覆蓋（改為詢問）。
  if (new URLSearchParams(location.search).get('autostart') === '1') {
    void existingSeed().then((existing) => {
      const plan = autostartPlan(location.search, existing);
      if (plan.kind === 'start') startFresh(plan.seed ?? '');
      else if (plan.kind === 'confirm') askOverwrite(plan.existing, plan.seed ?? '', defaultPeaceful());
    }).catch((e: unknown) => say(titleMsg, e instanceof Error ? e.message : String(e)));
  }

  return {
    destroy(): void {
      stopAutosave?.();
      handle?.destroy();
      stopScene();
      ui.destroy();
      wardrobe?.destroy();
      wipe?.destroy();
      section?.destroy();
      uiSound.destroy();
      for (const f of offs) f();
      delete window.__delveLive;
    },
  };
}
