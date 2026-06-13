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

export interface VersusHandle {
  match: VersusMatch;
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

/** 固定時間步長（與日後 lockstep 對齊；render 累積真實 dt、以此固定增量推進）。 */
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
 * 掛載並啟動 Dungeon Bomber VERSUS（本機熱座 debug 模式）。
 * 純本機：兩位玩家共用同一鍵盤、同一 VersusMatch。網路同步留待後續 Task。
 */
export async function startVersus(
  canvas: HTMLCanvasElement,
  opts: VersusBootOptions = {},
): Promise<VersusHandle> {
  const stage = await PixiStage.create(canvas);

  const players = opts.players ?? [
    { id: 'P1', character: 'lena' as CharacterId },
    { id: 'P2', character: 'mira' as CharacterId },
  ];
  // 預設 arena 0（有真實磚組）；arena 越界則夾回 0 但仍允許 5-7（以回退磚組）。
  const rawArena = opts.arenaId ?? 0;
  const arenaId = rawArena >= 0 && rawArena < ARENAS.length ? rawArena : 0;
  const seed = opts.seed ?? 0x5eed1234;

  const match = new VersusMatch({ seed, arenaId, players });
  const theme = ARENAS[arenaId].theme;

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

  // ---- 結束 overlay（簡單版：WINNER: <id> / DRAW） ----
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

  // ---- 鍵盤輸入（兩套 keymap，hotseat 共用同鍵盤） ----
  const onKeyDown = (e: KeyboardEvent) => {
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

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code in P1_DIR) match.setHeld('P1', P1_DIR[e.code], false);
    else if (e.code in P2_DIR) match.setHeld('P2', P2_DIR[e.code], false);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ---- 固定步長 ticker（累積真實 dt → 以 FIXED_DT 固定增量步進） ----
  let acc = 0;
  const MAX_CATCHUP = FIXED_DT * 5; // 防止分頁背景化後一次補太多步

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    acc = Math.min(acc + dt, MAX_CATCHUP + FIXED_DT);
    while (acc >= FIXED_DT) {
      match.step(FIXED_DT);
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
    destroy() {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      retryBtn?.removeEventListener('click', onRetry);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };

  // e2e / 除錯掛鉤
  (window as unknown as { __bomberVersusDebug?: unknown }).__bomberVersusDebug = { match, handle, stage };

  return handle;
}
