import { VersusMatch } from '../versus/versusMatch';
import { ARENAS } from '../versus/arenas';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { GridView } from './GridView';
import { VersusEntityView } from './VersusEntityView';
import { computeLayout } from './layout';
import { loadBomberTextures } from './assets';
import type { Dir, CharacterId } from '../engine/types';
import type { VersusInput } from '../versus/types';
import type { BomberLockstep, VersusAction } from '../net/bomberLockstep';

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
): Promise<VersusHandle> {
  const stage = await PixiStage.create(canvas);
  const theme = ARENAS[arenaId]?.theme ?? 0;

  const textures = await loadBomberTextures();
  const grid = new GridView(stage.gridLayer, textures);
  const entity = new VersusEntityView(stage.entityLayer, stage.fxLayer, textures);
  const sound = new SoundManager();

  let lay = computeLayout(stage.width, stage.height);

  function relayout(): void {
    lay = computeLayout(stage.width, stage.height);
    grid.invalidate();
  }
  stage.app.renderer.on('resize', relayout);

  // ---- 結束 overlay（簡單版：VICTORY: <id> / DRAW） ----
  const overEl = document.getElementById('bomber-over') as HTMLElement | null;
  const overStatsEl = document.getElementById('bomber-over-stats') as HTMLElement | null;
  const titleEl = overEl?.querySelector('.ms-title') as HTMLElement | null;
  const retryBtn = document.getElementById('bomber-restart') as HTMLElement | null;
  const onRetry = () => location.reload();
  retryBtn?.addEventListener('click', onRetry);

  let finishShown = false;
  function showFinish(winnerId: string | null): void {
    if (finishShown) return;
    finishShown = true;
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
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  const handle: VersusHandle = {
    match,
    lockstep,
    destroy() {
      stage.app.renderer.off('resize', relayout);
      retryBtn?.removeEventListener('click', onRetry);
      onDestroyExtra();
      stage.app.ticker.remove(tick);
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

  void localId; // 本端玩家身分已由 lockstep（localId）持有；輸入即視為該玩家的動作

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
  );
}
