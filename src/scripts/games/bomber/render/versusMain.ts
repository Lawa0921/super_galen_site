import { VersusMatch } from '../versus/versusMatch';
import { ARENAS } from '../versus/arenas';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { GridView } from './GridView';
import { VersusEntityView } from './VersusEntityView';
import { VersusHudView } from './VersusHudView';
import { computeLayout } from './layout';
import { loadBomberTextures } from './assets';
import type { Dir, CharacterId } from '../engine/types';
import type { VersusInput } from '../versus/types';
import type { BomberLockstep, VersusAction } from '../net/bomberLockstep';
import { reportBomberRanked, type BomberRankResult } from '../net/bomberRanking';
import { liveStandings } from '../net/versusReplay';

export interface VersusHandle {
  match: VersusMatch;
  /** 線上模式：驅動該對局的鎖步（hotseat 為 undefined）。 */
  lockstep?: BomberLockstep;
  destroy(): void;
}

export interface VersusBootOptions {
  /** 競技場 id（0-7）。超出有材質範圍仍會載入，磚組以 GridView 回退繪製。 */
  arenaId?: number;
  /** 固定亂數種子（決定性）。 */
  seed?: number;
  /** 玩家設定（hotseat 預設 2 人 lena/mira）。 */
  players?: { id: string; character: CharacterId }[];
}

export interface VersusOnlineBootOptions {
  /** 由 BomberReady 建好的鎖步（已含 VersusMatch、seed、arena、players、transport）。 */
  lockstep: BomberLockstep;
  /** 本端玩家 id（BomberReady.localId）；本機鍵盤輸入只送這位玩家。 */
  localId: string;
  /** 競技場 id（決定 theme；與鎖步建構時一致，由 BomberReady.arenaId 傳入）。 */
  arenaId: number;
  /**
   * 排名結算接線（皆可選；缺 signMessage = casual，只顯示名次、不回報）。
   * matchId 由 `bomber-<seed.toString(36)>-<roomId>` 組出（與 Task 14 endpoint 解析相符）。
   */
  ranked?: {
    /** host 廣播的對局 seed（== lockstep replay seed）。 */
    seed: number;
    /** 房號（BomberReady.room）。 */
    roomId: string;
    /** 本端簽章地址（ranked 時為錢包地址，與 localId 一致）。 */
    reporterId: string;
    /** 錢包簽章函式；無 → casual（不回報，只顯示本機名次）。 */
    signMessage?: (msg: string) => Promise<string>;
    fetchFn?: typeof fetch;
  };
  /** REMATCH 按鈕（同房同設定、新 seed 重開）。未傳則該鈕隱藏。 */
  onRematch?: () => void;
  /** LOBBY 按鈕（返回大廳）。未傳則該鈕隱藏。 */
  onLobby?: () => void;
}

/** 固定時間步長（與 lockstep SIM_DT 對齊；render 累積真實 dt、以此固定增量推進）。 */
const FIXED_DT = 1000 / 60;

/** P1：WASD + Space(bomb) + E(ability)；以 KeyboardEvent.code 對應。 */
const P1_DIR: Record<string, Dir> = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
const P1_ACTION: Record<string, VersusInput> = {
  Space: 'bomb', KeyE: 'ability',
};

/** P2：方向鍵 + Enter(bomb) + Shift(ability)。 */
const P2_DIR: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
const P2_ACTION: Record<string, VersusInput> = {
  Enter: 'bomb', ShiftLeft: 'ability', ShiftRight: 'ability',
};

/**
 * 線上模式本端鍵盤：採 P1 風格（WASD + Space + E）+ 方向鍵備用，全部映射到「本端玩家」。
 * 線上單機只控制自己一位玩家，故同時接受兩套方向鍵讓玩家用慣哪套都行。
 */
const ONLINE_DIR: Record<string, Dir> = { ...P1_DIR, ...P2_DIR };
const ONLINE_ACTION: Record<string, VersusInput> = {
  Space: 'bomb', KeyE: 'ability', Enter: 'bomb', ShiftLeft: 'ability', ShiftRight: 'ability',
};

/** Pixi 舞台 + view + sound + 固定步長渲染/特效迴圈的共用骨架。
 *  hotseat 與 online 共用此渲染骨架，差別只在「輸入如何進到引擎」與「每步如何推進」。
 *
 *  @param stepOnce  每個固定步長呼叫一次：負責推進模擬（hotseat: match.step；online: lockstep.tick）。
 *  @param onDestroyExtra  destroy 時的額外清理（移除鍵盤監聽等）。
 */
async function mountVersusLoop(
  canvas: HTMLCanvasElement,
  match: VersusMatch,
  arenaId: number,
  stepOnce: () => void,
  attachInput: (sound: SoundManager) => void,
  onDestroyExtra: () => void,
  lockstep?: BomberLockstep,
  /** 線上模式覆寫：finish 時呼叫此 hook 顯示結算畫面（傳入後不顯示基本 overlay）。 */
  onFinish?: (winnerId: string | null) => void,
  /** 本端玩家 id（online 高亮其面板；hotseat 為 undefined → 不高亮）。 */
  localId?: string,
): Promise<VersusHandle> {
  const stage = await PixiStage.create(canvas);
  const theme = ARENAS[arenaId]?.theme ?? 0;

  const textures = await loadBomberTextures();
  const grid = new GridView(stage.gridLayer, textures);
  const entity = new VersusEntityView(stage.entityLayer, stage.fxLayer, textures);
  const hud = new VersusHudView(stage.hudLayer, textures);
  const sound = new SoundManager();

  let lay = computeLayout(stage.width, stage.height);
  hud.setLayout(stage.width, stage.height);

  function relayout(): void {
    lay = computeLayout(stage.width, stage.height);
    grid.invalidate();
    hud.onResize(stage.width, stage.height);
  }
  stage.app.renderer.on('resize', relayout);

  // ---- 結束 overlay（基本版：VICTORY: <id> / DRAW；online 改走 onFinish 結算畫面） ----
  const overEl = document.getElementById('bomber-over') as HTMLElement | null;
  const overStatsEl = document.getElementById('bomber-over-stats') as HTMLElement | null;
  const titleEl = overEl?.querySelector('.ms-title') as HTMLElement | null;
  const retryBtn = document.getElementById('bomber-restart') as HTMLElement | null;
  const onRetry = () => location.reload();
  // online 模式以結算畫面（onFinish）的 LOBBY/REMATCH 取代單機 RETRY。
  if (onFinish) { if (retryBtn) retryBtn.hidden = true; }
  else { retryBtn?.addEventListener('click', onRetry); }

  let finishShown = false;
  function showFinish(winnerId: string | null): void {
    if (finishShown) return;
    finishShown = true;
    // 線上：交給結算畫面 hook（standings/Elo/XP/REMATCH/LOBBY）。
    if (onFinish) { onFinish(winnerId); return; }
    // 單機/熱座：基本 VICTORY/DRAW。
    if (titleEl) titleEl.textContent = winnerId ? 'VICTORY' : 'DRAW';
    if (overStatsEl) overStatsEl.textContent = winnerId ? `WINNER: ${winnerId}` : 'DRAW';
    if (overEl) overEl.removeAttribute('hidden');
  }

  attachInput(sound);

  // ---- 固定步長 ticker（累積真實 dt → 以 FIXED_DT 固定增量步進） ----
  let acc = 0;
  const MAX_CATCHUP = FIXED_DT * 5; // 防止分頁背景化後一次補太多步

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    acc = Math.min(acc + dt, MAX_CATCHUP + FIXED_DT);
    while (acc >= FIXED_DT) {
      stepOnce();
      acc -= FIXED_DT;

      // 消費引擎事件 → fx + sound（每個固定步皆 drain，避免事件堆積）
      for (const ev of match.drainEvents()) {
        if (ev.kind === 'explode') {
          stage.shake(8);
          sound.explode();
        } else if (ev.kind === 'crateBreak') {
          stage.shake(3);
        } else if (ev.kind === 'pickup') {
          sound.pickup();
        } else if (ev.kind === 'playerDead') {
          stage.shake(10);
          sound.hit();
        } else if (ev.kind === 'ringCollapse') {
          stage.shake(6);
          sound.descend();
          grid.invalidate(); // 塌縮改了地形：強制格子重繪
        } else if (ev.kind === 'ability') {
          stage.shake(6);
          const p = match.getState().players.find((pl) => pl.id === ev.playerId);
          if (p) entity.triggerAbility(ev.id, p);
        } else if (ev.kind === 'finish') {
          sound.gameover();
          showFinish(ev.winnerId);
        }
      }
    }

    const s = match.getState();
    grid.render(s, lay, theme);
    entity.render(s, lay, dt);
    hud.render(s, lay, localId);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  let destroyed = false; // 冪等保護：host-drop abort 路徑可能呼叫 destroy() 兩次（abort + 重檢）
  const handle: VersusHandle = {
    match,
    lockstep,
    destroy() {
      if (destroyed) return; // 第二次起為 no-op，避免重複 teardown 拋錯
      destroyed = true;
      stage.app.renderer.off('resize', relayout);
      retryBtn?.removeEventListener('click', onRetry);
      onDestroyExtra();
      stage.app.ticker.remove(tick);
      hud.destroy();
      stage.app.destroy();
    },
  };

  // e2e / 除錯掛鉤
  (window as unknown as { __bomberVersusDebug?: unknown }).__bomberVersusDebug = { match, lockstep, handle, stage };

  return handle;
}

/**
 * 掛載並啟動 Dungeon Bomber VERSUS（本機熱座 debug 模式）。
 * 純本機：兩位玩家共用同一鍵盤、同一 VersusMatch。
 */
export async function startVersus(
  canvas: HTMLCanvasElement,
  opts: VersusBootOptions = {},
): Promise<VersusHandle> {
  const players = opts.players ?? [
    { id: 'P1', character: 'lena' as CharacterId },
    { id: 'P2', character: 'mira' as CharacterId },
  ];
  // 預設 arena 0（有真實磚組）；arena 越界則夾回 0 但仍允許 5-7（以回退磚組）。
  const rawArena = opts.arenaId ?? 0;
  const arenaId = rawArena >= 0 && rawArena < ARENAS.length ? rawArena : 0;
  const seed = opts.seed ?? 0x5eed1234;

  const match = new VersusMatch({ seed, arenaId, players });

  let onKeyDown: (e: KeyboardEvent) => void = () => {};
  let onKeyUp: (e: KeyboardEvent) => void = () => {};

  const attachInput = (sound: SoundManager): void => {
    // ---- 鍵盤輸入（兩套 keymap，hotseat 共用同鍵盤） ----
    onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        e.preventDefault();
        sound.ensure();
        sound.toggle();
        return;
      }

      // P1
      if (e.code in P1_DIR) {
        e.preventDefault();
        match.setHeld('P1', P1_DIR[e.code], true);
        return;
      }
      if (e.code in P1_ACTION) {
        e.preventDefault();
        sound.ensure();
        if (!e.repeat) {
          match.input('P1', P1_ACTION[e.code]);
          if (P1_ACTION[e.code] === 'bomb') sound.place();
        }
        return;
      }

      // P2
      if (e.code in P2_DIR) {
        e.preventDefault();
        match.setHeld('P2', P2_DIR[e.code], true);
        return;
      }
      if (e.code in P2_ACTION) {
        e.preventDefault();
        sound.ensure();
        if (!e.repeat) {
          match.input('P2', P2_ACTION[e.code]);
          if (P2_ACTION[e.code] === 'bomb') sound.place();
        }
        return;
      }
    };

    onKeyUp = (e: KeyboardEvent) => {
      if (e.code in P1_DIR) match.setHeld('P1', P1_DIR[e.code], false);
      else if (e.code in P2_DIR) match.setHeld('P2', P2_DIR[e.code], false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };

  return mountVersusLoop(
    canvas,
    match,
    arenaId,
    () => match.step(FIXED_DT),
    attachInput,
    () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
    undefined, // lockstep
    undefined, // onFinish
    // hotseat：兩位玩家共用同一鍵盤，無單一「本端」玩家 → 不高亮任何面板。
    undefined, // localId
  );
}

/**
 * 掛載並啟動 Dungeon Bomber VERSUS（線上鎖步模式）。
 * 本機鍵盤只控制「本端玩家」（localId）→ 透過 lockstep.queueLocal 排入；
 * 每個固定步呼叫 lockstep.tick()（推進＝全員齊備才 step，缺幀則自然等待）；
 * 渲染讀 lockstep.match.getState()。
 *
 * 決定性：UI/render 絕不直接呼叫 match.step / match.input / match.setHeld——
 * 一切輸入只經 lockstep.queueLocal（held 持平/放開、bomb、ability），
 * seed/arena/順序全來自 host 廣播的 BomberReady。
 */
export async function startVersusOnline(
  canvas: HTMLCanvasElement,
  opts: VersusOnlineBootOptions,
): Promise<VersusHandle> {
  const { lockstep, localId, arenaId } = opts;
  const match = lockstep.match;

  // 本端目前按住的方向（避免重複 queue 同一個 held=true；放開時才送 held=false）。
  const heldDirs = new Set<Dir>();

  let onKeyDown: (e: KeyboardEvent) => void = () => {};
  let onKeyUp: (e: KeyboardEvent) => void = () => {};

  const attachInput = (sound: SoundManager): void => {
    onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        e.preventDefault();
        sound.ensure();
        sound.toggle();
        return;
      }
      const dir = ONLINE_DIR[e.code];
      if (dir) {
        e.preventDefault();
        if (!heldDirs.has(dir)) {
          heldDirs.add(dir);
          lockstep.queueLocal({ t: 'held', d: dir, v: true });
        }
        return;
      }
      const action = ONLINE_ACTION[e.code];
      if (action) {
        e.preventDefault();
        sound.ensure();
        if (!e.repeat) {
          lockstep.queueLocal(action === 'bomb' ? { t: 'bomb' } : { t: 'ability' });
          if (action === 'bomb') sound.place();
        }
        return;
      }
    };

    onKeyUp = (e: KeyboardEvent) => {
      const dir = ONLINE_DIR[e.code];
      if (dir && heldDirs.has(dir)) {
        heldDirs.delete(dir);
        lockstep.queueLocal({ t: 'held', d: dir, v: false });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };

  // 本端玩家身分（localId）：輸入即視為該玩家動作，並用於 HUD 高亮本端面板。

  // ── 線上結算畫面：finish → 顯示名次 → 簽章回報 → 收到 results 後補 Elo±/XP ──
  const onFinish = (winnerId: string | null): void => {
    // 1) 先以本機名次即時顯示（不等網路；標題用本端視角 VICTORY/DEFEAT/DRAW）。
    //    liveStandings 與 endpoint 重建名次同源（playerIds 固定序 tie-break）→ 與回報一致。
    const standings = liveStandings(lockstep.match, lockstep.playerIds);
    renderResultOverlay({
      localId,
      winnerId,
      standings,
      characters: charactersOf(match),
      results: null, // ratings/xp 待回報結果回來再補
      onRematch: opts.onRematch,
      onLobby: opts.onLobby,
    });

    // 2) 簽章回報（各端各自送；後端共識 + SETTLED 去重）。casual 無 signMessage → 不送。
    const rk = opts.ranked;
    if (rk) {
      void reportBomberRanked({
        seed: rk.seed,
        roomId: rk.roomId,
        reporterId: rk.reporterId,
        replay: lockstep.getReplay(),
        signMessage: rk.signMessage,
        fetchFn: rk.fetchFn,
      }).then((report) => {
        if (report.outcome === 'applied' && report.results) {
          // 重繪：補上每位玩家 Elo before→after 與本端 XP/等級進度。
          renderResultOverlay({
            localId,
            winnerId,
            standings,
            characters: charactersOf(match),
            results: report.results,
            onRematch: opts.onRematch,
            onLobby: opts.onLobby,
          });
        }
      });
    }
  };

  return mountVersusLoop(
    canvas,
    match,
    arenaId,
    () => lockstep.tick(),
    attachInput,
    () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
    lockstep,
    onFinish,
    localId, // 線上：高亮本端玩家面板
  );
}

/** playerId → CharacterId（供結算表顯示角色）。 */
function charactersOf(match: VersusMatch): Record<string, CharacterId> {
  const out: Record<string, CharacterId> = {};
  for (const p of match.getState().players) out[p.id] = p.character;
  return out;
}

/**
 * 繪製線上結算畫面（標準名次表 + Elo± + XP 進度條 + REMATCH/LOBBY）。
 * 全英文、無行內樣式（樣式類別在 bomber.astro）。results 為 null 時只顯示名次（待回報）。
 */
function renderResultOverlay(o: {
  localId: string;
  winnerId: string | null;
  standings: string[];
  characters: Record<string, CharacterId>;
  results: BomberRankResult[] | null;
  onRematch?: () => void;
  onLobby?: () => void;
}): void {
  const overEl = document.getElementById('bomber-over') as HTMLElement | null;
  if (!overEl) return;
  const titleEl = overEl.querySelector('.ms-title') as HTMLElement | null;
  const statsEl = document.getElementById('bomber-over-stats') as HTMLElement | null;
  const tableEl = document.getElementById('bomber-over-standings') as HTMLElement | null;
  const xpEl = document.getElementById('bomber-over-xp') as HTMLElement | null;
  const actionsEl = document.getElementById('bomber-over-actions') as HTMLElement | null;
  const rematchBtn = document.getElementById('bomber-rematch') as HTMLButtonElement | null;
  const lobbyBtn = document.getElementById('bomber-lobby') as HTMLButtonElement | null;

  // 標題（本端視角）：本端冠軍→VICTORY、平局→DRAW、其餘→DEFEAT。
  if (titleEl) {
    titleEl.textContent = o.winnerId === null
      ? 'DRAW'
      : o.standings[0] === o.localId ? 'VICTORY' : 'DEFEAT';
  }
  if (statsEl) statsEl.textContent = '';

  const resultById = new Map<string, BomberRankResult>();
  if (o.results) for (const r of o.results) resultById.set(r.id, r);

  // ── 名次表（rank / player / character / Elo±） ──
  if (tableEl) {
    tableEl.replaceChildren();
    o.standings.forEach((id, i) => {
      const row = document.createElement('div');
      row.className = 'res-row' + (id === o.localId ? ' is-local' : '');

      const rank = document.createElement('span');
      rank.className = 'res-rank';
      rank.textContent = `#${i + 1}`;

      const name = document.createElement('span');
      name.className = 'res-name';
      name.textContent = id;

      const char = document.createElement('span');
      char.className = 'res-char';
      char.textContent = (o.characters[id] ?? '?').toUpperCase();

      const elo = document.createElement('span');
      elo.className = 'res-elo';
      const r = resultById.get(id);
      if (r) {
        const delta = r.ratingAfter - r.ratingBefore;
        const sign = delta > 0 ? '+' : '';
        elo.classList.add(delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat');
        elo.textContent = `${r.ratingBefore}→${r.ratingAfter} (${sign}${delta})`;
      } else {
        elo.classList.add('is-pending');
        elo.textContent = o.results ? '—' : '…';
      }

      row.append(rank, name, char, elo);
      tableEl.appendChild(row);
    });
  }

  // ── XP：本端獲得 XP + 等級 + 進度條 ──
  if (xpEl) {
    xpEl.replaceChildren();
    const mine = resultById.get(o.localId);
    if (mine) {
      const head = document.createElement('div');
      head.className = 'res-xp-head';
      const gain = document.createElement('span');
      gain.className = 'res-xp-gain';
      gain.textContent = `+${mine.xpGained} XP`;
      const lvl = document.createElement('span');
      lvl.className = 'res-xp-level';
      lvl.textContent = `LV ${mine.level}`;
      head.append(gain, lvl);

      // 進度條：本場 xpGained 占「目前等級跨距」的比例（近似視覺）。
      // 限制：endpoint 只回 level + xpGained（不回總 XP），無法精算本級已累積進度；
      // 故以「本場獲得 XP / 本級門檻跨距」呈現本場貢獻量，clamp 至 [0,100]%。
      const span = Math.max(1, xpAtLeastForLevel(mine.level + 1) - xpAtLeastForLevel(mine.level));
      const pct = Math.max(0, Math.min(100, Math.round((mine.xpGained / span) * 100)));
      const bar = document.createElement('div');
      bar.className = 'res-xp-bar';
      const fill = document.createElement('span');
      fill.className = 'res-xp-fill';
      // 進度以 CSS 自訂屬性驅動寬度（CSS 端 width: var(--res-xp-ratio)）——避免靜態行內樣式。
      fill.style.setProperty('--res-xp-ratio', `${pct}%`);
      bar.appendChild(fill);

      xpEl.append(head, bar);
    } else if (o.results === null) {
      const wait = document.createElement('div');
      wait.className = 'res-xp-head';
      wait.textContent = 'Reporting result…';
      xpEl.appendChild(wait);
    }
  }

  // ── REMATCH / LOBBY 按鈕（只在 online 顯示；缺 handler 則隱藏該鈕） ──
  if (actionsEl) actionsEl.hidden = !(o.onRematch || o.onLobby);
  if (rematchBtn) {
    rematchBtn.hidden = !o.onRematch;
    if (o.onRematch) { rematchBtn.onclick = () => o.onRematch?.(); }
  }
  if (lobbyBtn) {
    lobbyBtn.hidden = !o.onLobby;
    if (o.onLobby) { lobbyBtn.onclick = () => o.onLobby?.(); }
  }

  overEl.removeAttribute('hidden');
}

/** 本級門檻 XP（與 progression.xpForLevel 對齊：50*L*(L-1)）。用於 XP 進度條近似填充。 */
function xpAtLeastForLevel(level: number): number {
  return 50 * level * (level - 1);
}
