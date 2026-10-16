// session.ts — 頁面流程：標題畫面（新世界 / 繼續 / 匯入）、選單（存檔 / 匯出 / 匯入）、自動存檔、debug 鉤。
import { DelveGame } from '../engine/game';
import { serializeGame, restoreGame } from '../save/serialize';
import {
  saveSlot, loadSlot, listSlots, startAutosave, requestPersistence, exportBlob, importBlob, hasIndexedDB,
} from '../save/storage';
import { startDelve, type DelveHandle } from './main';
import { autostartPlan, newWorldPlan } from './model';

const SLOT = 'main';

declare global {
  interface Window { __delveDebug?: { game: DelveGame; handle: DelveHandle; save: () => Promise<void> } }
}

function randomSeed(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).slice(0, 8);
}

export interface Session { destroy(): void; }

export function bootDelve(root: HTMLElement): Session {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);
  const canvas = $<HTMLCanvasElement>('#delve-canvas');
  const title = $('#delve-title');
  const hudEl = $('#delve-hud');
  const menu = $('#delve-menu');
  const titleMsg = $('#delve-title-msg');
  const menuMsg = $('#delve-menu-msg');
  const seedInput = $<HTMLInputElement>('#delve-seed');
  const fileInput = $<HTMLInputElement>('#delve-import-file');
  const continueBtn = $<HTMLButtonElement>('#delve-continue');
  const confirmEl = $('#delve-confirm');
  const confirmMsg = $('#delve-confirm-msg');
  const confirmOk = $<HTMLButtonElement>('#delve-confirm-ok');
  const confirmCancel = $<HTMLButtonElement>('#delve-confirm-cancel');
  if (!canvas || !title || !hudEl || !menu) throw new Error('delve: missing page elements');

  let handle: DelveHandle | null = null;
  let stopAutosave: (() => void) | null = null;
  let persisted = false;
  const offs: (() => void)[] = [];
  const on = (el: EventTarget | null, type: string, fn: EventListener): void => {
    if (!el) return;
    el.addEventListener(type, fn);
    offs.push(() => el.removeEventListener(type, fn));
  };

  const say = (el: HTMLElement | null, msg: string): void => { if (el) el.textContent = msg; };

  async function saveNow(): Promise<void> {
    if (!handle || !hasIndexedDB()) return;
    const g = handle.game;
    await saveSlot(SLOT, g.seed, serializeGame(g));
    if (!persisted) { persisted = true; void requestPersistence(); }
  }

  function setMenu(open: boolean): void {
    if (!menu) return;
    menu.hidden = !open;
    handle?.setPaused(open);
    say(menuMsg, '');
  }

  function begin(game: DelveGame): void {
    stopAutosave?.();
    handle?.destroy();
    title!.hidden = true;
    hudEl!.hidden = false;
    root.dataset.phase = 'playing';
    setMenu(false);
    handle = startDelve({ root, canvas: canvas!, game, onMenu: () => setMenu(menu!.hidden) });
    window.__delveDebug = { game, handle, save: saveNow };
    if (hasIndexedDB()) {
      stopAutosave = startAutosave({
        slot: SLOT, seed: game.seed, getBytes: () => serializeGame(game),
        onSaved: () => { if (!persisted) { persisted = true; void requestPersistence(); } },
        onError: (e) => console.warn('[delve] autosave failed', e),
      });
      void saveNow().catch((e: unknown) => console.warn('[delve] save failed', e));
    }
  }

  /** 目前存檔槽的種子；沒有存檔 / 無 IndexedDB 時 null */
  async function existingSeed(): Promise<string | null> {
    if (!hasIndexedDB()) return null;
    try {
      return (await listSlots()).find((m) => m.slot === SLOT)?.seed ?? null;
    } catch {
      return null;
    }
  }

  function startFresh(seed?: string): void {
    const s = (seed ?? seedInput?.value ?? '').trim() || randomSeed();
    begin(new DelveGame({ seed: s }));
  }

  // ── 覆蓋確認對話框（頁內，不用 window.confirm） ──
  let pendingSeed: string | undefined;
  let lastFocus: HTMLElement | null = null;
  function askOverwrite(existing: string, seed: string | undefined): void {
    if (!confirmEl) return;
    pendingSeed = seed;
    say(confirmMsg, `這個瀏覽器已有一個存檔（種子 ${existing}）。開新世界會覆蓋它，舊世界無法復原。要先匯出備份的話請按取消，進入「繼續」後從選單匯出。`);
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

  async function newWorld(seed?: string): Promise<void> {
    const existing = await existingSeed();
    if (newWorldPlan(existing, false) === 'confirm') askOverwrite(existing as string, seed);
    else startFresh(seed);
  }

  function restoreBytes(bytes: Uint8Array, msgEl: HTMLElement | null): boolean {
    const r = restoreGame(bytes);
    if (!r.ok) {
      say(msgEl, r.error === 'gen_version' ? `存檔版本不相容（${r.message}）` : `存檔讀取失敗：${r.message}`);
      return false;
    }
    begin(r.game);
    return true;
  }

  async function continueGame(): Promise<void> {
    try {
      const bytes = await loadSlot(SLOT);
      if (!bytes) { say(titleMsg, '找不到存檔'); return; }
      restoreBytes(bytes, titleMsg);
    } catch (e) {
      say(titleMsg, `讀取存檔失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function exportSave(): Promise<void> {
    if (!handle) return;
    const g = handle.game;
    const blob = await exportBlob(serializeGame(g));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delve-${g.seed}.delve`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(menuMsg, '已匯出存檔檔案');
  }

  let importFrom: HTMLElement | null = titleMsg;
  on(fileInput, 'change', () => {
    const f = fileInput?.files?.[0];
    if (!f) return;
    importBlob(f)
      .then((bytes) => { if (restoreBytes(bytes, importFrom)) void saveNow(); })
      .catch((e: unknown) => say(importFrom, `匯入失敗：${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { if (fileInput) fileInput.value = ''; });
  });

  on($('#delve-new'), 'click', () => void newWorld());
  on(seedInput, 'keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void newWorld(); });
  on(confirmOk, 'click', () => { closeConfirm(); startFresh(pendingSeed); });
  on(confirmCancel, 'click', () => closeConfirm());
  on(confirmEl, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); closeConfirm(); }
  });
  on(continueBtn, 'click', () => void continueGame());
  on($('#delve-import'), 'click', () => { importFrom = titleMsg; fileInput?.click(); });
  on($('#delve-resume'), 'click', () => setMenu(false));
  on($('#delve-menu-btn'), 'click', () => setMenu(true));
  on($('#delve-save'), 'click', () => {
    saveNow().then(() => say(menuMsg, '已存檔')).catch((e: unknown) => say(menuMsg, `存檔失敗：${String(e)}`));
  });
  on($('#delve-export'), 'click', () => void exportSave());
  on($('#delve-import-menu'), 'click', () => { importFrom = menuMsg; fileInput?.click(); });

  // 有存檔才顯示「繼續」
  if (hasIndexedDB()) {
    listSlots().then((slots) => {
      const s = slots.find((m) => m.slot === SLOT);
      if (s && continueBtn) {
        continueBtn.hidden = false;
        continueBtn.textContent = `繼續（種子 ${s.seed}）`;
      }
    }).catch(() => { /* 私密模式等：沒有存檔功能 */ });
  }

  // e2e / 深連結：?seed=xxx&autostart=1[&fresh=1]。已有存檔時，沒有 fresh=1 不會直接覆蓋（改為詢問）。
  if (new URLSearchParams(location.search).get('autostart') === '1') {
    void existingSeed().then((existing) => {
      const plan = autostartPlan(location.search, existing);
      if (plan.kind === 'start') startFresh(plan.seed);
      else if (plan.kind === 'confirm') askOverwrite(plan.existing, plan.seed);
    });
  }

  return {
    destroy(): void {
      stopAutosave?.();
      handle?.destroy();
      for (const f of offs) f();
    },
  };
}
