// session.ts — 頁面流程：標題畫面（即時背景場景、選單：繼續 / 開始遊戲（角色 → 世界）/ 匯入 / 說明 / 設定）、
// 像素抖動轉場 + 分段生成世界的進度、選單（存檔 / 匯出 / 匯入 / 回到標題）、自動存檔、debug 鉤。
// 存檔身分 = 目前的存檔槽（多世界）＋ 目前的角色：標題選角色 → 選 / 建世界；新世界永遠另開存檔槽，匯入也是。
import { DelveGame } from '../engine/game';
import { generateWorldSteps, GEN_STAGE_COUNT, type GenResult } from '../engine/legacy/worldgen';
import { GEN_VERSION_V2 } from '../engine/constants';
import { restoreGame, type SaveData } from '../save/serialize';
import { genBlocker } from '../save/genCheck';
import { bakeApplies, upgradeSlot } from '../save/bake';
import {
  startAutosave, requestPersistence, exportBlob, importBlob, hasIndexedDB, idbSplitStore, DbBlockedError, previewOf, type CharacterMeta, type SlotMeta,
} from '../save/storage';
import {
  SplitSession, planContinue, planPlay, planNewWorld, importWorld, saveSplit, commitMigration,
  newWorldSlot, CHARACTER_MISSING_MSG, NO_CHARACTER_MSG, type ContinuePlan,
} from '../save/split';
import { decodeAnySave, encodeWorld, restoreSplit, type AnySave, type WorldData } from '../save/worldSave';
import { createCharacter, decodeCharacter, DEFAULT_NICK, type DelveCharacter } from '../save/character';
import { startDelve, type DelveHandle } from './main';
import { fullMapLabels, fullMapPins } from './mapView';
import { autostartPlan, helpSeen, HELP_KEY } from './model';
import { SoundManager } from '../audio/SoundManager';
import { TitleScene } from './titleScene';
import { TitleUi, PEACEFUL_KEY, publishVolume } from './titleUi';
import { Wipe } from './wipe';
import { continueSlot, importPlan, genProgress, genStageLabel, GEN_STAGE_LABELS, needsPendingConfirm, readVolume, restoreErrorText, rollWorldName, summarizeGame } from './titleModel';
import { gen2Flag } from './gen2Flag';
import { liveCounts, type LiveCounts } from './live';
import { GEN_PHASES, GenSectionView, genPhaseLabel, genPhaseOf } from './genSection';
import { Wardrobe } from './wardrobe';
import { RACES, createLook, loadDefaultAppearance, saveDefaultAppearance, setAppearance, type Appearance } from '../engine/appearance';
import { ITEMS } from '../engine/items';
import { restyledLook } from '../engine/doll';
import { PlayLocks, PLAY_LOCKED_MSG, browserLocks, charLock, heldElsewhere, worldLock } from './playLock';
import { CoopHostSession } from '../net/hostSession';
import { CoopGuestSession, type CoopGuestPhase } from '../net/guestSession';
import { JOIN_ERROR_TEXT, JoinError, hostOpenErrorText, normalizeRoom, realSignalApi } from '../net/rtcSignal';
import { createRtcPeer } from '../net/rtcLink';
import { workerTicker } from '../net/workerTicker';
import { DELVE_BUILD } from '../net/build';
import { guestRemoteViews, hostRemoteViews, type RemoteView } from './remotePlayers';
import type { OwnPose } from '../net/guest';
import { CoopUi, type CoopRow } from './coopUi';

/** 進度條格數 */
const PROGRESS_CELLS = 20;
/** 生成畫面的地層剖面大小（像素；4200×1200 的世界每像素 = 15×15 格） */
const SECTION_W = 280, SECTION_H = 80;

/** debug / e2e 鉤（唯一的型別宣告；tests/e2e/delve.spec.ts 也用這個） */
export interface DelveDebug {
  game: DelveGame; handle: DelveHandle; save: () => Promise<void>;
  /** 大地圖目前會畫的圖示（地標、解鎖的傳送碑、線索、標記） */
  mapPins(): { icon: string; x: number; y: number; name: string }[];
  /** 大地圖目前會畫的地域 / 地層名字（已知地區表裡發現過的；只讀） */
  mapLabels(): { id: number; name: string; x: number; y: number }[];
  /** 連線（M-C）：房主開房之後 / 客人進場之後才有；phase 房主開著房 = 'live'，客人 = CoopGuestSession.phase */
  coop?: { role: 'host' | 'guest'; room: string | null; phase: string; players(): { pid: string; nick: string }[] };
}

/** 選到上次在朋友的世界斷線、最後一筆交易沒確認的角色（C1） */
const PENDING_WORLD_MSG = '這個角色上次在朋友的世界斷線時，最後一筆交易還沒確認。回到那個世界會以主機的紀錄為準；先在別的世界玩，那筆物品可能重複或消失。要繼續嗎？';
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
  const confirmTitle = $('#delve-confirm-title');
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
  /** 1b M1 開發旗標（啟動時讀一次、只在開發版有效）：新世界用 gen2、讀到舊世界（v7）時烘焙升級；讀 genVersion 8 的存檔不看它 */
  const gen2 = gen2Flag(location.search, storage ?? null, import.meta.env.DEV);
  // 這頁沒有遊戲廳的音量面板：自己把存著的音效音量發布出去（SoundManager 跟著它）
  publishVolume(readVolume(storage));

  let handle: DelveHandle | null = null;
  /** 這場遊戲的存檔身分（角色 + 世界）；begin 設定，每次存檔都寫世界 + 角色兩份 */
  let split: SplitSession | null = null;
  /** 標題選定的角色（角色列表 → 世界列表 → 進 / 建世界） */
  let picked: string | null = null;
  /** 最後一次讀到的角色 / 世界列表（世界列表標題的暱稱、刪除確認的名字） */
  let charList: CharacterMeta[] = [];
  let worldList: SlotMeta[] = [];
  /** 沒有 IndexedDB 時建立的角色只活在記憶體（存不了，但照樣能開局） */
  const memChars = new Map<string, DelveCharacter>();
  let stopAutosave: (() => void) | null = null;
  /**
   * 這一場遊戲握著的跨分頁鎖（角色 + 世界，playLock.ts）：開局前拿、回到標題 / 關閉才放，
   * 同一個角色或世界不會在兩個分頁同時被玩（各自自動存檔會互相覆蓋）。
   */
  let playLocks: PlayLocks | null = null;
  /** 沒有 IndexedDB 就存不了檔、不會互相覆蓋：不上鎖 */
  const newLocks = (): PlayLocks => new PlayLocks(hasIndexedDB() ? browserLocks() : undefined);
  let persisted = false;
  let busy = false;
  /**
   * 標題上的存檔操作（開始遊戲的轉換、選角色、建 / 刪角色或世界、匯出、繼續）一次一件：
   * 它們的 await 之間再點別的（例如「開始遊戲」轉換中又按「繼續冒險」）直接忽略，不會插隊。
   */
  let titleBusy = false;
  async function exclusive<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    if (busy || titleBusy) return fallback;
    titleBusy = true;
    try { return await fn(); } finally { titleBusy = false; }
  }
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
  /** 新角色用的預設外觀（localStorage）：只留身體部分、穿基本布衣（舊版存的可能還穿著別的衣服 / 頭飾 / 眼鏡） */
  const defaultLook = (): Appearance => createLook(loadDefaultAppearance(storage));

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
   * 所有存檔路徑（自動存檔 / pagehide / 手動 / 回到標題 / 開局）都走這裡：寫到 s.slot，世界 + 角色在同一個 transaction。
   * 一次只寫一筆（排隊）：角色 rev 照順序落地，不會被晚到的舊快照蓋掉。
   */
  let saveQueue: Promise<unknown> = Promise.resolve();
  function writeSave(game: DelveGame, s: SplitSession): Promise<SlotMeta> {
    const run = (): Promise<SlotMeta> => saveSplit(idbSplitStore, s, game, Date.now(), summarizeGame(game, s.nick));
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
    if (open) syncCoop();
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

  /** 衣櫥現在是梳妝台開的（走遠 / 被拆的關閉事件只關它，不關別的用途） */
  let mirrorOpen = false;
  /**
   * 梳妝台（遊戲裡按使用）：開衣櫥 'mirror' 模式——身體特徵（沒有種族）+ 身上每件時裝的主色 / 副色 + 布衣配色，免費。
   * 開著時暫停模擬（比照舊的「角色外觀」）；完成 → setBodyLook + 每件 recolorWorn；關掉一律通知遊戲 closeMirror。
   * 改的是這台機器上的玩家自己（連線時別人用房主的梳妝台，也是改他自己的角色）。
   */
  function setMirror(game: DelveGame, open: boolean): void {
    if (!open) { if (mirrorOpen) wardrobe?.close(); return; }
    if (!wardrobe || wardrobe.isOpen || handle?.game !== game) { game.act({ op: 'mirrorClose' }); return; }
    mirrorOpen = true;
    handle.setPaused(true);
    wardrobe.open(game.appearance, {
      mode: 'mirror',
      tints: game.mirrorTints().map((t) => ({ slot: t.slot, tint: t.tint, name: ITEMS[t.item].name.zh, channels: t.channels })),
      look: (a, tints) => restyledLook(game.doll().look, a, tints),
      onDone: (a) => game.act({ op: 'bodyLook', look: a }),
      onTints: (ts) => { for (const t of ts) game.act({ op: 'recolor', slot: t.slot, tint: t.tint }); if (handle?.game === game) handle.hud.refresh(); },
      onClose: () => {
        mirrorOpen = false;
        game.act({ op: 'mirrorClose' });
        if (handle?.game === game) handle.setPaused(!menu!.hidden);
      },
    });
  }

  /**
   * 轉生之藥（手持按使用）：開衣櫥 'race' 模式——只有種族一列，OK 才換；暫停模擬。
   * 取消、或選回同一族 → 不消耗（game.rebirth 回 false 就什麼都不動）。
   */
  function setRebirth(game: DelveGame): void {
    if (!wardrobe || wardrobe.isOpen || handle?.game !== game) return;
    handle.setPaused(true);
    wardrobe.open(game.appearance, {
      mode: 'race',
      look: (a) => restyledLook(game.doll().look, a, []),
      onDone: (a) => {
        if (game.act({ op: 'rebirth', race: a.race })) { handle?.hud.refresh(); handle?.hud.toast(`轉生成${RACES[a.race]?.zh ?? ''}`, 2400); }
        else handle?.hud.toast('種族沒有改變，轉生之藥沒有用掉');
      },
      onClose: () => { if (handle?.game === game) handle.setPaused(!menu!.hidden); },
    });
  }

  /**
   * begin / beginGuest 共用：收掉上一場、換鎖、藏標題、開 HUD、startDelve（remotes = 其他玩家的來源）。
   * 上一場還開著房 / 還在朋友的房裡（例如沒有 IndexedDB 時從暫停選單匯入直接開局）→ 先關房 / 離開，
   * 舊的 NetHost / NetLoop 不會繼續跑被丟掉的那場；關房的 requestSave 存的還是上一場（split 在 enter 之後才換）。
   */
  function enter(game: DelveGame, locks: PlayLocks, remotes: () => RemoteView[], ownPose?: () => OwnPose | null): DelveHandle {
    if (hostCoop) void closeHost();
    if (guestCoop) { void guestCoop.s.leave(); dropGuest(); }
    stopAutosave?.();
    stopAutosave = null;
    handle?.destroy();
    if (playLocks !== locks) playLocks?.release();
    playLocks = locks;
    stopScene();
    ui.closePanel(false);
    title!.hidden = true;
    hudEl!.hidden = false;
    root.dataset.phase = 'playing';
    setMenu(false);
    return startDelve({ root, canvas: canvas!, game, onMenu: () => setMenu(menu!.hidden), onMirror: (open) => setMirror(game, open), onRebirth: () => setRebirth(game), remotes, ownPose });
  }

  function begin(game: DelveGame, s: SplitSession, locks: PlayLocks): void {
    // 單機時 actors 只有自己（空清單）；按「開放加入」之後客人進來就畫得到
    handle = enter(game, locks, () => hostRemoteViews(game));
    split = s;
    window.__delveDebug = { game, handle, save: saveNow, mapPins: () => fullMapPins(game), mapLabels: () => fullMapLabels(game) };
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

  // ── 連線（M-C）：房主在遊戲中「開放加入」（C8），客人在標題的世界列表「加入朋友的世界」 ──
  const coopUi = new CoopUi(root);
  const coopBtn = $<HTMLButtonElement>('#delve-coop');
  const toTitleBtn = $<HTMLButtonElement>('#delve-to-title');
  const joinMsg = $('#delve-join-msg');
  /** 房主：開著的房間（open 還在等房號時就有；關房 / createRoom 失敗 → null） */
  let hostCoop: CoopHostSession | null = null;
  /** 上次 syncCoop 看到的 hostCoop.serviceDown：只在變化時提示（信令服務掛了 / 恢復） */
  let hostServiceDown = false;
  /** 客人：進場之後的房間（連線中、同步中還在轉場裡，不算） */
  let guestCoop: { s: CoopGuestSession; room: string; nick: string } | null = null;
  /** HUD 名單的延遲每秒更新一次（主執行緒計時器只管 UI，C10） */
  let coopTimer = 0;
  function coopTick(on: boolean): void {
    if (on && !coopTimer) coopTimer = window.setInterval(syncCoop, 1000);
    else if (!on && coopTimer) { clearInterval(coopTimer); coopTimer = 0; }
  }
  /** HUD 房號 + 名單、暫停選單「開放加入」的文字跟著目前的連線狀態 */
  function syncCoop(): void {
    const h = hostCoop, g = guestCoop;
    if (h?.room) {
      // 還在 hello / 同步中的客人暱稱可能是空的：live 了才列出來（同加入的 toast）
      const ps = h.players().filter((p) => p.self || p.phase === 'live');
      const rows: CoopRow[] = ps.map((p) => (p.self ? { nick: p.nick, self: true } : { nick: p.nick, self: false, rttMs: p.rttMs }));
      // 停止加入之後，只要還有客人在，房號和名單就留著
      coopUi.update({ show: h.joining || ps.length > 1, room: h.room, rows });
      coopUi.setButton({ joining: h.joining });
      if (h.serviceDown !== hostServiceDown) {
        hostServiceDown = h.serviceDown;
        // 房號拿到了但信令服務讀不到：客人其實進不來，要講實話（不是靜默的「已開放加入」）
        if (hostServiceDown) { say(menuMsg, JOIN_ERROR_TEXT.service); handle?.hud.toast(JOIN_ERROR_TEXT.service, 2400); }
        else if (h.joining) say(menuMsg, `已開放加入：房號 ${h.room}`);
      }
    } else if (g) {
      const rows: CoopRow[] = [{ nick: g.nick, self: true, rttMs: g.s.rttMs }, ...g.s.peers().filter((p) => p.nick).map((p) => ({ nick: p.nick, self: false }))];
      coopUi.update({ show: true, room: g.room, rows });
    } else coopUi.hide();
  }

  /** 暫停選單 #delve-coop：沒開房 → 開房；開放中 → 停止加入；停止後（手動 / 閒置自動）→ 重新開放 */
  async function toggleCoop(): Promise<void> {
    if (!handle || !split || guestCoop || leaving) return;
    const cur = hostCoop;
    if (cur) {
      if (!cur.room) return;   // 還在拿房號
      if (cur.joining) cur.stopJoin(); else cur.reopenJoin();
      say(menuMsg, cur.joining ? `已重新開放加入：房號 ${cur.room}` : '已停止加入：房裡的人不受影響');
      syncCoop();
      return;
    }
    const s = split;
    const host = new CoopHostSession(handle.game, {
      signal: realSignalApi, makePeer: () => createRtcPeer(), ticker: workerTicker(), build: DELVE_BUILD,
      visits: s, nick: s.nick,
      requestSave: () => { void saveNow().catch((e: unknown) => console.warn('[delve] save failed', e)); },
    });
    hostCoop = host;
    hostServiceDown = false;
    host.onChange((e) => {
      if (hostCoop !== host) return;
      handle?.hud.toast(e.type === 'join' ? `「${e.nick}」加入了世界` : `「${e.nick}」離開了世界`, 2400);
      syncCoop();
    });
    if (coopBtn) coopBtn.disabled = true;
    say(menuMsg, '開放加入中…');
    try {
      await host.open();
    } catch (e) {
      // createRoom 失敗：這個 session 已經自己退回單機、永久關閉；再按一次就建新的
      // 信令服務掛了 → JoinError('service') 的文案；其他錯誤照舊帶「開放加入失敗：」
      if (hostCoop === host) { hostCoop = null; say(menuMsg, hostOpenErrorText(e)); }
      return;
    } finally {
      if (coopBtn) coopBtn.disabled = false;
    }
    if (hostCoop !== host) return;   // 等房號時回到標題（已經關房）
    root.dataset.coop = 'host';
    say(menuMsg, `已開放加入：房號 ${host.room}`);
    if (window.__delveDebug) {
      window.__delveDebug.coop = {
        role: 'host',
        get room() { return host.room; },
        get phase() { return hostCoop === host ? 'live' : 'ended'; },
        players: () => host.players().map((p) => ({ pid: p.pid, nick: p.nick })),
      };
    }
    syncCoop();
    coopTick(true);
  }

  /** 房主關房（回到標題 / 關頁）：每位客人最後的 chk + bye，resolve 時 mode 已回 solo */
  async function closeHost(): Promise<void> {
    const h = hostCoop;
    if (!h) return;
    hostCoop = null;
    coopTick(false);
    coopUi.hide();
    delete root.dataset.coop;
    if (window.__delveDebug) delete window.__delveDebug.coop;
    await h.close();
  }

  /** 客人進場：同 begin，但不取世界鎖、不自動存檔，save 是無操作（角色由 CoopGuestSession 的 persist 寫） */
  function beginGuest(o: { guest: CoopGuestSession; room: string; nick: string }, locks: PlayLocks): void {
    const guest = o.guest, game = guest.game;
    if (!game) throw new Error('coop guest: no replica');
    split = null;
    // 別人：內插過的 pose + 同一個延遲時鐘（揮擊進度跟身體同步）；自己的攻擊 / 挖掘 / 釣魚 / 無敵用房主回報的（D3）
    handle = enter(game, locks, () => guestRemoteViews(guest.peers(), guest.peerTime()), () => guest.ownPose());
    guestCoop = { s: guest, room: o.room, nick: o.nick };
    root.dataset.coop = 'guest';
    say(toTitleBtn, '離開房間');
    window.__delveDebug = {
      game, handle, save: async () => { /* 客人不存世界 */ }, mapPins: () => fullMapPins(game), mapLabels: () => fullMapLabels(game),
      coop: {
        role: 'guest', room: o.room,
        get phase() { return guest.phase; },
        players: () => [{ pid: game.localPid, nick: o.nick }, ...guest.peers().map((p) => ({ pid: p.pid, nick: p.nick }))],
      },
    };
    // 房主關房 / 斷線 / 被踢：回到標題，顯示原因（自己按「離開房間」時 returnToTitle 已經在跑，這裡會被擋掉）
    const ended = (): void => { if (guestCoop?.s === guest) void returnToTitle(guest.endText ?? '連線已結束'); };
    guest.onPhase((p) => { if (p === 'ended') ended(); });
    if (guest.phase === 'ended') ended();   // live 之後、進場之前就斷了
    if (!helpSeen(storage)) setHelp(true);
    syncCoop();
    coopTick(true);
  }
  /** 客人的連線 UI 收掉（handle 已經 destroy 之後） */
  function dropGuest(): void {
    guestCoop = null;
    coopTick(false);
    coopUi.hide();
    delete root.dataset.coop;
    say(toTitleBtn, '回到標題');
  }

  /**
   * 遊戲中「回到標題」：先存檔（失敗就留在遊戲裡回報，不丟進度）→ 轉場蓋上 → 收掉遊戲（迴圈 / 輸入 / 音效 / 自動存檔）
   * → 標題畫面（場景直接停在洞窟、選單模式、「繼續」摘要是剛存的）→ 掀開。之後的繼續 / 新世界走一般流程。
   */
  /** 沒有 IndexedDB（無法存檔）時第一次按「回到標題」只警告；再按一次才真的離開 */
  let noSaveWarned = false;
  /** 正在「回到標題」（存檔 / 轉場中）：選單與 Esc 不再切換暫停 */
  let leaving = false;
  /**
   * 連線中：房主先關房（await close，客人拿到最後的 chk + bye）再存檔；客人不存世界，按「離開房間」= await leave()
   * （最後的 chk 寫好）再走。endMsg = 客人被房主結束時標題訊息要顯示的原因。
   */
  async function returnToTitle(endMsg?: string): Promise<void> {
    if (busy) await inFlight;
    if (busy || !handle) return;
    const guest = guestCoop;
    if (!guest && !hasIndexedDB() && !noSaveWarned) {
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
      if (guest) {
        say(menuMsg, '離開房間中…');
        await guest.s.leave();
      } else {
        if (hostCoop) { say(menuMsg, '關閉房間中…'); await closeHost(); }
        say(menuMsg, '存檔中…');
        try { await saveNow(); } catch (e) {
          say(menuMsg, `存檔失敗，沒有離開：${e instanceof Error ? e.message : String(e)}`);
          return;
        }
      }
      if (wardrobe?.isOpen) wardrobe.close();   // 被房主結束時衣櫥可能開著
      uiSound.uiBack();
      await wipe?.cover();
      stopAutosave?.();
      stopAutosave = null;
      handle.destroy();
      handle = null;
      split = null;
      if (guest) dropGuest();
      // 最後一次存檔已寫完、自動存檔已停：放掉角色 / 世界鎖（別的分頁現在可以玩它們了）
      playLocks?.release();
      playLocks = null;
      delete window.__delveDebug;
      if (menu) menu.hidden = true;
      noSaveWarned = false;
      say(menuMsg, '');
      if (helpEl && !helpEl.hidden) { helpEl.hidden = true; delete root.dataset.help; }
      hudEl!.hidden = true;
      title!.hidden = false;
      root.dataset.phase = 'title';
      root.dataset.title = 'menu';
      say(titleMsg, endMsg ?? '');
      await refreshTitle();
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

  /**
   * 讀角色 + 世界列表、算出「繼續冒險」指向的世界（continueSlot；同 planContinue() 的挑法）。無 IndexedDB → 只有記憶體裡的角色。
   * 資料庫被別的分頁擋住 → 丟 DbBlockedError（不能當成「沒有存檔」）。
   */
  async function readLists(): Promise<{ chars: CharacterMeta[]; worlds: SlotMeta[]; cont: SlotMeta | null }> {
    if (!hasIndexedDB()) return { chars: [...memChars.values()].map(metaOf), worlds: [], cont: null };
    const [chars, worlds] = await Promise.all([idbSplitStore.listCharacters(), idbSplitStore.listWorlds()]);
    return { chars, worlds, cont: continueSlot(worlds, chars) };
  }
  /** 標題上的「繼續冒險」摘要 + 角色 / 世界列表重讀一次（開頁 / 回到標題 / 刪除 / 匯入之後）；讀不到就在標題訊息顯示原因 */
  async function refreshTitle(): Promise<void> {
    let l: Awaited<ReturnType<typeof readLists>>;
    try { l = await readLists(); } catch (e) {
      say(titleMsg, e instanceof DbBlockedError ? e.message : `讀取存檔失敗：${errText(e)}`);
      ui.setSave(null);
      return;
    }
    charList = l.chars;
    worldList = l.worlds;
    if (picked && !charList.some((c) => c.id === picked)) picked = null;
    ui.setSave(l.cont);
    ui.setCharacters(charList);
    ui.setWorlds(worldList, pickedNick());
  }
  const pickedNick = (): string => charList.find((c) => c.id === picked)?.nick ?? '';
  function metaOf(c: DelveCharacter): CharacterMeta {
    return { id: c.id, nick: c.nick, savedAt: c.savedAt, rev: c.rev, ...previewOf(c) };
  }

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
    void document.fonts?.load("16px 'DotGothic16'", ['生成世界中…載入世界中…連線中…同步世界中…完成提示：', ...GEN_STAGE_LABELS, ...GEN_PHASES.map((p) => p.zh + p.label), ...TIPS].join('')).catch(() => { /* 離線：用系統字 */ });
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

  /** 舊生成器（genVersion 7）的世界：在段與段之間讓出主執行緒（每批最多 ~14 ms），邊生成邊畫進度條。gen2 / 烘焙世界不必預先生成 */
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

  /** 轉場要開的局：遊戲 + 它的存檔身分；或客人進朋友的世界（副本在 guest.game） */
  type Opened = { game: DelveGame; session: SplitSession } | { guest: CoopGuestSession; room: string; nick: string };
  /**
   * 蓋上轉場 → 生成 / 讀檔 → 開局 → 掀開；失敗時回到原畫面並回報。
   * locks = 這一場要握著的鎖（呼叫端開局前已拿好，work 裡還可以再加）：開局 → 交給 begin 握著；沒開局 / 失敗 → 放掉。
   */
  function transition(text: string, work: () => Promise<Opened | null>, from: 'title' | 'menu', locks: PlayLocks): Promise<void> {
    if (busy) { locks.release(); return inFlight; }
    busy = true;
    inFlight = runTransition(text, work, from, locks);
    return inFlight;
  }
  async function runTransition(text: string, work: () => Promise<Opened | null>, from: 'title' | 'menu', locks: PlayLocks): Promise<void> {
    const prevPhase = root.dataset.phase ?? 'title';
    try {
      uiSound.uiDelve();
      await wipe?.cover();
      showLoading(text);
      const opened = await work();
      if (opened) {
        if ('guest' in opened) {
          // 客人已經 live 了才進場：進場失敗要離開房間，房主那邊不會留著一個不會動的客人
          try { beginGuest(opened, locks); } catch (e) {
            void opened.guest.leave();
            if (guestCoop?.s === opened.guest) dropGuest();
            throw e;
          }
        } else begin(opened.game, opened.session, locks);
        hideLoading();
        await wipe?.reveal();
      } else {
        locks.release();
        hideLoading();
        root.dataset.phase = prevPhase;
        await wipe?.reveal(220);
        // 角色 / 世界列表還開著（例如選的世界打不開）→ 焦點留在列表裡，不跳回被蓋住的主選單
        if (from === 'title' && !ui.panelOpen) ui.focusFirst(true);
      }
    } catch (e) {
      locks.release();
      console.error('[delve] start failed', e);
      hideLoading();
      root.dataset.phase = prevPhase;
      say(from === 'title' ? titleMsg : menuMsg, `開局失敗：${e instanceof Error ? e.message : String(e)}`);
      await wipe?.reveal(220);
    } finally {
      busy = false;
    }
  }

  /**
   * 開局前（生成 / 讀檔之前，不讓玩家白等）先拿遊玩鎖；別的分頁正在玩這個角色或世界 → 在 msgEl 說明、回 null（不開局）。
   * 瀏覽器的 Web Locks 本身出錯 → 照舊開局、不上鎖。
   */
  async function lockFor(names: string[], msgEl: HTMLElement | null): Promise<PlayLocks | null> {
    const locks = newLocks();
    try {
      if (await locks.acquire(names)) return locks;
    } catch (e) {
      console.warn('[delve] play lock failed', e);
      return new PlayLocks(undefined);
    }
    say(msgEl, PLAY_LOCKED_MSG);
    return null;
  }

  /**
   * 生成新世界（進度畫面；只生成一次）→ 角色就地套上（planNewWorld）→ 新存檔槽開局。gen2 旗標開著 → gen2 世界（不預先生成）。
   * character = null → 新的預設角色（旅人、預設外觀），建立當下就寫進角色庫（B2）。
   * 既有角色在生成前就先鎖住；新存檔槽（與新角色）的 id 是剛產生的，開局前補鎖（一定拿得到，別的分頁才看得到這一場在玩）。
   */
  async function newWorldWith(seed: string, peaceful: boolean, character: DelveCharacter | null): Promise<void> {
    const s = seed.trim() || rollWorldName(Math.random);
    const locks = await lockFor(character ? [charLock(character.id)] : [], titleMsg);
    if (!locks) return;
    return transition('生成世界中…', async () => {
      const gen = gen2 ? null : await generate(s, {});
      let c = character;
      if (!c) {
        c = createCharacter(DEFAULT_NICK, defaultLook(), Date.now());
        await keepCharacter(c);
      }
      const game = gen
        ? new DelveGame({ seed: s, peaceful, gen, appearance: c.appearance })
        : new DelveGame({ seed: s, peaceful, appearance: c.appearance, worldGen: { kind: 'gen2' } });
      const opened = planNewWorld(game, c, Date.now());
      if (!(await locks.acquire([...(character ? [] : [charLock(c.id)]), worldLock(opened.session.slot)]))) {
        say(titleMsg, PLAY_LOCKED_MSG);
        return null;
      }
      return opened;
    }, 'title', locks);
  }
  /** 新角色寫進角色庫（沒有 IndexedDB → 記在記憶體） */
  async function keepCharacter(c: DelveCharacter): Promise<void> {
    if (hasIndexedDB()) await idbSplitStore.putCharacter(c); else memChars.set(c.id, c);
  }
  async function loadCharacter(id: string): Promise<DelveCharacter | null> {
    const mem = memChars.get(id);
    if (mem) return mem;
    if (!hasIndexedDB()) return null;
    const b = await idbSplitStore.getCharacter(id);
    return b ? decodeCharacter(b) : null;
  }

  /**
   * 新世界 + 新的預設角色（旅人、預設外觀）：?autostart=1 走這裡的情況 = 有 fresh=1、或給了 seed（就算已有存檔，
   * ?seed=x&autostart=1 也是新世界 + 新的旅人）、或還沒有任何存檔（autostartPlan）。另開存檔槽，不覆蓋任何存檔。
   */
  function startFresh(seed: string, peaceful = defaultPeaceful()): void {
    void newWorldWith(seed, peaceful, null);
  }

  // ── 確認對話框（頁內，不用 window.confirm）：刪除角色 / 世界 ──
  let confirmDone: ((ok: boolean) => void) | null = null;
  let lastFocus: HTMLElement | null = null;
  /** 顯示確認框；按確認 → true，取消 / Esc → false */
  function askConfirm(msg: string, okLabel: string, heading = '確定嗎？'): Promise<boolean> {
    if (!confirmEl) return Promise.resolve(false);
    confirmDone?.(false);
    say(confirmTitle, heading);
    say(confirmMsg, msg);
    say(confirmOk, okLabel);
    lastFocus = document.activeElement as HTMLElement | null;
    confirmEl.hidden = false;
    root.dataset.confirm = '1';
    confirmCancel?.focus();
    return new Promise((resolve) => { confirmDone = resolve; });
  }
  function closeConfirm(ok: boolean): void {
    if (!confirmEl) return;
    confirmEl.hidden = true;
    delete root.dataset.confirm;
    lastFocus?.focus?.();
    const done = confirmDone;
    confirmDone = null;
    done?.(ok);
  }

  /**
   * 還原失敗（或 genBlocker 擋下）→ 訊息（restoreErrorText）。舊生成器的存檔：標題主選單上顯示「開始新世界」鈕（#delve-upgrade-new）並指向它；
   * 角色 / 世界列表開著（或 listing = 轉換完就要打開列表）時那顆鈕被面板蓋住 → 不顯示，改指向世界列表的「新世界」。
   * 存檔比遊戲新（newer）→ 只請玩家重新整理更新，不建議開新世界（鈕藏起來）。
   */
  function restoreError(r: Parameters<typeof restoreErrorText>[0], msgEl: HTMLElement | null, listing = false): void {
    const t = restoreErrorText(r, msgEl !== titleMsg ? 'menu' : listing || ui.panelOpen ? 'list' : 'title');
    say(msgEl, t.text);
    if (upgradeNew && t.upgrade !== undefined) upgradeNew.hidden = !t.upgrade;
  }

  const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  /**
   * 舊合併存檔（format ≤ 9，只會在 'main'）→ 世界 + 角色：先看檔頭（genBlocker：生成器版本不對立即回報，不必先生成世界），再分段生成同一個世界
   * （顯示進度；genVersion 8 不生成）後還原；還原成功 → commitMigration（先把舊記錄原封備份到 <slot>.v9.bak），寫完才開局。
   * （這裡不烘焙：gen2 旗標開著時，轉換出來的 v7 世界檔下次由 openSplit 升級。）
   * enter = false：只轉換、不開局（「開始遊戲」進角色列表前 B5；世界列表選到還沒轉換的舊存檔），轉完回到標題的列表。
   * 寫入失敗 → 回報；舊記錄沒動，下次再試。轉換期間鎖住這個存檔槽（別的分頁不會同時轉換 / 遊玩它）。
   */
  async function openLegacy(data: SaveData, slot: string, msgEl: HTMLElement | null, from: 'title' | 'menu', enter = true): Promise<void> {
    const h = data.header;
    const blocked = genBlocker(h);
    if (blocked) { restoreError(blocked, msgEl, !enter); return; }
    const locks = await lockFor([worldLock(slot)], msgEl);
    if (!locks) return;
    return transition(enter ? '載入世界中…' : '轉換舊存檔中…', async () => {
      const gen = h.genVersion === GEN_VERSION_V2 ? undefined : await generate(h.seed, { width: h.width, height: h.height });
      const r = restoreGame(data, { gen });
      if (!r.ok) { restoreError(r, msgEl, !enter); return null; }
      // 沒有 IndexedDB（無痕 / 被停用）：不能存，但仍照舊版行為開局（saveNow 也是無操作）
      if (!hasIndexedDB()) return enter ? { game: r.game, session: SplitSession.fresh(r.game.seed, Date.now(), slot) } : null;
      let session: SplitSession;
      try {
        session = await commitMigration(idbSplitStore, slot, r.game, Date.now(), { backup: true, summary: summarizeGame(r.game) });
      } catch (e) {
        say(msgEl, `存檔轉換失敗，沒有開始遊戲（原本的存檔沒有改動）：${errText(e)}`);
        return null;
      }
      if (!enter) return null;
      await locks.acquire([charLock(session.charId)]); // 轉換出來的新角色（新 id，一定拿得到）
      return { game: r.game, session };
    }, from, locks);
  }

  /**
   * 世界檔 + 角色 → 遊戲（角色第一次來這個世界 → 從出生點開始）；先看生成器版本（genBlocker），不對就不必先生成世界。
   * genVersion 8（gen2 / 烘焙過的）→ 不生成、直接還原（不看旗標）。genVersion 7：照舊生成後還原；gen2 旗標開著、正式尺寸、
   * 有 IndexedDB（世界檔就在 idbSplitStore 的 slot）→ 生成後烘焙升級（upgradeSlot；失敗 → 回報、不開局、存檔原封不動）。
   */
  async function openSplit(world: WorldData, character: DelveCharacter, slot: string, msgEl: HTMLElement | null, from: 'title' | 'menu'): Promise<void> {
    const h = world.header;
    const blocked = genBlocker(h);
    if (blocked) { restoreError(blocked, msgEl); return; }
    const upgrade = gen2 && bakeApplies(h) && hasIndexedDB();
    // 生成世界之前先鎖角色 + 世界：別的分頁正在玩其中一個 → 直接回報，不必等生成
    const locks = await lockFor([charLock(character.id), worldLock(slot)], msgEl);
    if (!locks) return;
    return transition(upgrade ? '升級舊世界中…' : '載入世界中…', async () => {
      if (h.genVersion === GEN_VERSION_V2) {
        const r = restoreSplit(world, character);
        if (!r.ok) { restoreError(r, msgEl); return null; }
        return { game: r.game, session: SplitSession.fromLoaded(r.world, character, slot) };
      }
      const gen = await generate(h.seed, { width: h.width, height: h.height });
      if (upgrade) {
        const u = await upgradeSlot(idbSplitStore, slot, character, gen, Date.now());
        if (!u.ok) { say(msgEl, u.message); return null; }
        return { game: u.game, session: u.session };
      }
      const r = restoreSplit(world, character, { gen });
      if (!r.ok) { restoreError(r, msgEl); return null; }
      return { game: r.game, session: SplitSession.fromLoaded(r.world, character, slot) };
    }, from, locks);
  }

  /** planContinue / planPlay 的結果 → 開局（舊存檔先轉換）或在標題回報；用到的角色記成選定的角色（「開始新世界」鈕用它） */
  function openPlan(plan: ContinuePlan, noneMsg: string): Promise<void> {
    if (plan.kind === 'none') say(titleMsg, noneMsg);
    else if (plan.kind === 'error') say(titleMsg, plan.message);
    else if (plan.kind === 'legacy') return openLegacy(plan.data, plan.slot, titleMsg, 'title');
    else { picked = plan.character.id; return openSplit(plan.world, plan.character, plan.slot, titleMsg, 'title'); }
    return Promise.resolve();
  }

  /**
   * 「繼續冒險」（B1）：最近存檔的世界 + 該世界記錄的角色；'main' 還是舊存檔 → 先轉換（B5）再開局。
   * 那個角色待同步（pendingWorld）→ 同選角色時先確認（C1）；取消 → 留在標題。
   */
  function continueGame(): Promise<void> {
    return exclusive(undefined, async () => {
      let plan: ContinuePlan;
      let chars: CharacterMeta[];
      try { [plan, chars] = await Promise.all([planContinue(idbSplitStore), idbSplitStore.listCharacters()]); } catch (e) {
        say(titleMsg, `讀取存檔失敗：${errText(e)}`);
        return;
      }
      if (needsPendingConfirm(plan, chars) && !(await askConfirm(PENDING_WORLD_MSG, '繼續'))) return;
      await openPlan(plan, '找不到存檔');
    });
  }

  /**
   * 「開始遊戲」（B5）：還沒轉換的舊存檔（沒有 charId 的槽）先轉換成世界 + 角色（列表永遠只有新格式），
   * 重讀列表後打開角色列表面板。
   */
  function startPressed(): Promise<void> {
    return exclusive(undefined, async () => {
      try {
        if (hasIndexedDB()) {
          for (const m of await idbSplitStore.listWorlds()) {
            if (m.charId) continue;
            const p = await planContinue(idbSplitStore, m.slot);
            if (p.kind === 'legacy') { await openLegacy(p.data, p.slot, titleMsg, 'title', false); break; }
          }
        }
      } catch (e) { say(titleMsg, `讀取存檔失敗：${errText(e)}`); }
      await refreshTitle();
      if (root.dataset.phase === 'title') ui.showPanel('chars');
    });
  }

  // ── 角色 / 世界（標題面板呼叫） ──
  /** 選角色 → 世界列表面板（標題「以 <暱稱> 進入」） */
  async function showWorldsFor(id: string): Promise<void> {
    picked = id;
    try { if (hasIndexedDB()) worldList = await idbSplitStore.listWorlds(); } catch (e) { say(titleMsg, `讀取存檔失敗：${errText(e)}`); }
    ui.setWorlds(worldList, pickedNick() || DEFAULT_NICK);
    ui.showPanel('worlds');
  }
  /** 上次在朋友的世界斷線、最後一筆交易沒確認（pendingWorld）的角色：先確認（C1） */
  const pickCharacter = (id: string): Promise<void> => exclusive(undefined, async () => {
    if (charList.find((c) => c.id === id)?.pendingWorld && !(await askConfirm(PENDING_WORLD_MSG, '繼續'))) return;
    await showWorldsFor(id);
  });
  /** 新角色：建立當下就寫進角色庫（B2），選定它並打開世界列表；失敗 → null（標題訊息回報） */
  function newCharacter(nick: string, appearance: Appearance): Promise<CharacterMeta | null> {
    return exclusive<CharacterMeta | null>(null, async () => {
      // 建角只決定身體：衣服 / 頭飾 / 眼鏡要在遊戲裡收集
      const c = createCharacter(nick, createLook(appearance), Date.now());
      try { await keepCharacter(c); } catch (e) {
        say(titleMsg, `建立角色失敗：${errText(e)}`);
        return null;
      }
      const meta = metaOf(c);
      charList = [meta, ...charList.filter((m) => m.id !== meta.id)];
      ui.setCharacters(charList);
      await showWorldsFor(c.id);
      return meta;
    });
  }
  /** 別的分頁正在玩這個角色 / 世界（握著它的鎖）→ 不能刪：在標題訊息說明、回 true。查不了鎖 → 當作沒人在玩 */
  async function lockedElsewhere(names: string[]): Promise<boolean> {
    if (!hasIndexedDB()) return false;
    let held = false;
    try { held = await heldElsewhere(browserLocks(), names); } catch (e) { console.warn('[delve] lock query failed', e); }
    if (held) say(titleMsg, PLAY_LOCKED_MSG);
    return held;
  }
  /** 刪角色（B3）：先確認；只刪角色記錄，世界裡的 visit 留著（沒有 IndexedDB → 只有記憶體裡的角色可刪）；別的分頁正在玩它 → 不刪 */
  function removeCharacter(id: string): Promise<void> {
    return exclusive(undefined, async () => {
      const nick = charList.find((c) => c.id === id)?.nick ?? DEFAULT_NICK;
      if (await lockedElsewhere([charLock(id)])) return;
      if (!(await askConfirm(`刪除角色「${nick}」？角色的背包、裝備、等級都會消失，無法復原。`, '刪除', '刪除角色？'))) return;
      if (await lockedElsewhere([charLock(id)])) return; // 確認的時候別的分頁剛開始玩它
      try {
        memChars.delete(id);
        if (hasIndexedDB()) await idbSplitStore.deleteCharacter(id);
      } catch (e) { say(titleMsg, `刪除失敗：${errText(e)}`); return; }
      if (picked === id) picked = null;
      await refreshTitle();
    });
  }
  /**
   * 用選定的角色進世界（這個角色第一次來 → 出生點）。
   * 選到還沒轉換的舊存檔（'main'）：先照「開始遊戲」轉換（commitMigration，含備份；不開局），成功 → 重讀列表、
   * 再用選定的角色照一般 planPlay 進去；失敗 → 原因已在標題訊息，留在世界列表（不會改用轉換出來的 旅人 開局）。
   */
  function pickWorld(slot: string): Promise<void> {
    return exclusive(undefined, async () => {
      const id = picked;
      if (!id) { say(titleMsg, '請先選擇角色'); return; }
      let plan: ContinuePlan;
      try { plan = await planPlay(idbSplitStore, slot, id); } catch (e) {
        say(titleMsg, `讀取存檔失敗：${errText(e)}`);
        return;
      }
      if (plan.kind === 'legacy') {
        await openLegacy(plan.data, plan.slot, titleMsg, 'title', false);
        await refreshTitle();
        try { plan = await planPlay(idbSplitStore, slot, id); } catch (e) {
          say(titleMsg, `讀取存檔失敗：${errText(e)}`);
          return;
        }
        if (plan.kind === 'legacy') return;
      }
      await openPlan(plan, '找不到這個世界');
    });
  }
  /** 用選定的角色建新世界（另開存檔槽；和平模式屬於世界，B7） */
  function createWorld(name: string, peaceful: boolean): Promise<void> {
    return exclusive(undefined, async () => {
      if (!picked) { say(titleMsg, '請先選擇角色'); return; }
      let c: DelveCharacter | null;
      try { c = await loadCharacter(picked); } catch (e) {
        say(titleMsg, `讀取角色失敗：${errText(e)}`);
        return;
      }
      if (!c) { say(titleMsg, CHARACTER_MISSING_MSG); return; }
      await newWorldWith(name, peaceful, c);
    });
  }
  /**
   * 加入朋友的世界（客人）：房號不對 → 面板說明；鎖住角色（不鎖世界：世界在房主那裡）→ 轉場「連線中…」→ 信令 / RTC →
   * 「同步世界中…」（welcome 時副本同步生成，會卡住主執行緒幾秒）→ live 才進場。失敗回到加入面板顯示原因。
   */
  function joinFriend(raw: string): Promise<void> {
    return exclusive(undefined, async () => {
      const room = normalizeRoom(raw);
      if (!room) { ui.setJoinMsg(JOIN_ERROR_TEXT.badRoom); return; }
      const id = picked;
      if (!id) { ui.setJoinMsg('請先選擇角色'); return; }
      let c: DelveCharacter | null;
      try { c = await loadCharacter(id); } catch (e) {
        ui.setJoinMsg(`讀取角色失敗：${errText(e)}`);
        return;
      }
      if (!c) { ui.setJoinMsg(CHARACTER_MISSING_MSG); return; }
      const character = c;
      const locks = await lockFor([charLock(id)], joinMsg);
      if (!locks) return;
      ui.setJoinMsg('');
      return transition('連線中…', async () => {
        const guest = new CoopGuestSession({
          signal: realSignalApi, makePeer: () => createRtcPeer(), ticker: workerTicker(), build: DELVE_BUILD, character,
          // 原本的待同步標記：只有回到那個世界的 chk 才清掉
          pendingWorld: charList.find((m) => m.id === id)?.pendingWorld ?? null,
          // savedAt 由 session 蓋（C4）；pendingWorld = null 清掉標記
          persist: (ch, pendingWorld) => {
            if (hasIndexedDB()) return idbSplitStore.putCharacter(ch, { pendingWorld });
            memChars.set(ch.id, ch);
            return Promise.resolve();
          },
        });
        guest.onPhase((p) => { if (p === 'connecting' || p === 'syncing') say(loadingText, '同步世界中…'); });
        try { await guest.join(room); } catch (e) {
          ui.setJoinMsg(e instanceof JoinError ? JOIN_ERROR_TEXT[e.code] : `加入失敗：${errText(e)}`);
          return null;
        }
        if (!(await untilLive(guest))) {
          // 被房主拒絕（滿了 / 版本不同 / 角色已在房裡）或同步途中斷線
          ui.setJoinMsg(guest.endText ?? JOIN_ERROR_TEXT.rtc);
          void guest.leave();
          return null;
        }
        return { guest, room, nick: character.nick };
      }, 'title', locks);
    });
  }
  /** 等到客人 live（true）或結束 / 失敗（false） */
  function untilLive(g: CoopGuestSession): Promise<boolean> {
    return new Promise((resolve) => {
      const check = (p: CoopGuestPhase): void => {
        if (p === 'live') resolve(true);
        else if (p === 'ended' || p === 'failed') resolve(false);
      };
      g.onPhase(check);
      check(g.phase);
    });
  }

  /** 沒有 IndexedDB 就沒有存著的世界（列表永遠是空的）：刪除 / 匯出世界直接說明原因 */
  const NO_IDB_WORLD_MSG = '這個瀏覽器不能存檔，沒有存著的世界';
  /** 刪世界（B3）：先確認；只刪這個槽，不碰 *.bak 備份 */
  function removeWorld(slot: string): Promise<void> {
    return exclusive(undefined, async () => {
      if (!hasIndexedDB()) { say(titleMsg, NO_IDB_WORLD_MSG); return; }
      const name = worldList.find((m) => m.slot === slot)?.seed ?? slot;
      if (await lockedElsewhere([worldLock(slot)])) return;
      if (!(await askConfirm(`刪除世界「${name}」？世界裡的建築和箱子都會消失，無法復原。`, '刪除', '刪除世界？'))) return;
      if (await lockedElsewhere([worldLock(slot)])) return;
      try { await idbSplitStore.deleteWorld(slot); } catch (e) { say(titleMsg, `刪除失敗：${errText(e)}`); return; }
      await refreshTitle();
    });
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
  /** 世界列表的「匯出」：把一個存檔槽打包下載（不必先進遊戲）：世界檔 + 該世界最後進場的角色；還沒轉換的舊存檔原樣匯出 */
  const exportSlot = (slot: string): Promise<void> => exclusive(undefined, () => exportSlotNow(slot));
  async function exportSlotNow(slot: string): Promise<void> {
    if (!hasIndexedDB()) { say(titleMsg, NO_IDB_WORLD_MSG); return; }
    try {
      const plan = await planContinue(idbSplitStore, slot);
      if (plan.kind === 'none') { say(titleMsg, '找不到存檔'); return; }
      if (plan.kind === 'error') {
        // 存檔槽讀不了（角色遺失 / 損毀）：把存檔槽的原始位元組照樣匯出（備份路徑不能斷）
        const raw = await idbSplitStore.getSlot(slot);
        if (!raw) { say(titleMsg, '找不到存檔'); return; }
        download(await exportBlob(raw.bytes), 'delve-save.delve');
        say(titleMsg, '已匯出存檔檔案（原始資料，存檔本身有問題）');
        return;
      }
      let bytes: Uint8Array | undefined, seed: string;
      if (plan.kind === 'split') { bytes = exportBytes(plan.world, plan.character); seed = plan.world.header.seed; }
      else { bytes = (await idbSplitStore.getSlot(slot))?.bytes; seed = plan.data.header.seed; }
      if (!bytes) { say(titleMsg, '找不到存檔'); return; }
      download(await exportBlob(bytes), `delve-${seed}.delve`);
      say(titleMsg, '已匯出存檔檔案');
    } catch (e) {
      say(titleMsg, `匯出失敗：${errText(e)}`);
    }
  }
  /**
   * 匯入（B4）：有 IndexedDB → 一律另開新存檔槽，既有世界不動、不直接進遊戲；完成後重刷「繼續冒險」與列表並回報。
   * 沒有 IndexedDB（沒有列表可放）→ 照舊直接開局（存不了，但「匯出 → 匯入」仍能接著玩）。
   */
  async function importFile(file: File, msgEl: HTMLElement | null): Promise<void> {
    try {
      const bytes = await importBlob(file);
      if (!hasIndexedDB()) { openImported(bytes, msgEl); return; }
      const r = await importWorld(idbSplitStore, bytes, Date.now());
      if ('error' in r) { say(msgEl, r.error); return; }
      await refreshTitle();
      const name = worldList.find((m) => m.slot === r.slot)?.seed ?? '';
      say(msgEl, msgEl === titleMsg
        ? `已匯入世界「${name}」：按「繼續冒險」就能進去`
        : `已匯入世界「${name}」：回到標題後就能進去（目前的世界沒有改動）`);
    } catch (e) {
      say(msgEl, `匯入失敗：${errText(e)}`);
    }
  }
  /** 沒有 IndexedDB 的匯入：解碼 → 直接開局（新存檔槽名，存檔是無操作）；壞檔立即回報 */
  function openImported(bytes: Uint8Array, msgEl: HTMLElement | null): void {
    const from = msgEl === titleMsg ? 'title' : 'menu';
    let any: AnySave;
    try { any = decodeAnySave(bytes); } catch {
      const r = restoreGame(bytes);
      if (!r.ok) restoreError(r, msgEl);
      return;
    }
    const plan = importPlan(false, any);
    if (plan.kind === 'legacy') void openLegacy(plan.data, newWorldSlot(), msgEl, from);
    else if (plan.kind === 'world') void openSplit(plan.world, plan.character, newWorldSlot(), msgEl, from);
    else if (plan.kind === 'nochar') say(msgEl, NO_CHARACTER_MSG);
  }
  let importFrom: HTMLElement | null = titleMsg;
  on(fileInput, 'change', () => {
    const f = fileInput?.files?.[0];
    if (!f) return;
    void importFile(f, importFrom).finally(() => { if (fileInput) fileInput.value = ''; });
  });

  const ui = new TitleUi(root, {
    onContinue: () => void continueGame(),
    onImport: (file) => {
      if (file) { void importFile(file, titleMsg); return; }
      importFrom = titleMsg;
      fileInput?.click();
    },
    onStart: () => void startPressed(),
    onPickCharacter: (id) => void pickCharacter(id),
    onCreateCharacter: (nick, appearance) => newCharacter(nick, appearance),
    onDeleteCharacter: (id) => void removeCharacter(id),
    onPickWorld: (slot) => void pickWorld(slot),
    onCreateWorld: (name, peaceful) => void createWorld(name, peaceful),
    onDeleteWorld: (slot) => void removeWorld(slot),
    onExportWorld: (slot) => void exportSlot(slot),
    onJoin: (room) => void joinFriend(room),
    onHelp: () => setHelp(true),
    onPressStart: () => scene?.skipIntro(),
    onLook: () => {
      wardrobe?.open(defaultLook(), {
        mode: 'create',
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
  /** 新角色面板的外觀（小預覽 + 體型）跟著預設外觀（delve.appearance）；建立角色時用它 */
  function syncLookPreview(): void {
    ui.setLookPreview(defaultLook());
  }
  syncLookPreview();

  // 「開始新世界」（舊生成器的存檔打不開時）：有選定的角色 → 直接新世界面板；沒有 → 先選角色
  on(upgradeNew, 'click', () => {
    if (upgradeNew) upgradeNew.hidden = true;
    if (picked && charList.some((c) => c.id === picked)) ui.showPanel('newworld');
    else void startPressed();
  });
  on(confirmOk, 'click', () => closeConfirm(true));
  on(confirmCancel, 'click', () => closeConfirm(false));
  on(confirmEl, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); closeConfirm(false); }
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
  on(coopBtn, 'click', () => void toggleCoop());
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
  // 有可繼續的世界才顯示「繼續」（附存檔摘要）與「匯出存檔」
  ui.setSave(null);
  if (hasIndexedDB()) {
    void refreshTitle().then(() => { if (root.dataset.phase === 'title') ui.focusFirst(); });
  }
  requestAnimationFrame(() => { if (root.dataset.phase === 'title') ui.focusFirst(); });

  // e2e / 深連結：?autostart=1[&seed=xxx][&fresh=1]。新世界另開存檔槽（不覆蓋）；只有 autostart=1 且有存檔 → 繼續冒險。
  if (new URLSearchParams(location.search).get('autostart') === '1') {
    void (async () => {
      let hasSave = false;
      if (autostartPlan(location.search, true).kind === 'continue') {
        try { hasSave = (await readLists()).cont !== null; } catch (e) { say(titleMsg, errText(e)); return; }
      }
      const plan = autostartPlan(location.search, hasSave);
      if (plan.kind === 'fresh') startFresh(plan.seed ?? '');
      else if (plan.kind === 'continue') await continueGame();
    })();
  }

  return {
    destroy(): void {
      confirmDone?.(false);
      confirmDone = null;
      coopTick(false);
      if (hostCoop) { const h = hostCoop; hostCoop = null; void h.close(); }
      if (guestCoop) { void guestCoop.s.leave(); guestCoop = null; }
      stopAutosave?.();
      handle?.destroy();
      playLocks?.release();
      playLocks = null;
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
