import { BomberGame } from '../engine/game';
import { KEYMAP } from '../input/keymap';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { GridView } from './GridView';
import { EntityView } from './EntityView';
import { HudView } from './HudView';
import { computeLayout } from './layout';
import { loadBomberTextures } from './assets';
import type { Dir, CharacterId } from '../engine/types';

export interface BomberHandle {
  game: BomberGame;
  destroy(): void;
}

/** 掛載並啟動 Dungeon Bomber 到指定 canvas（SOLO 模式）。 */
export async function startBomber(
  canvas: HTMLCanvasElement,
  character: CharacterId = 'lena',
): Promise<BomberHandle> {
  const stage = await PixiStage.create(canvas);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const game = new BomberGame({ seed, character });

  const textures = await loadBomberTextures();
  const grid = new GridView(stage.gridLayer, textures);
  const entity = new EntityView(stage.entityLayer, stage.fxLayer, textures);

  // 確保街機點陣字載入後再建立 HUD（否則 Pixi 會以 fallback 字測量、之後不更新）
  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch {
    /* 字型載入失敗則退回 monospace */
  }
  const hud = new HudView(stage.hudLayer, textures);
  const sound = new SoundManager();

  let lay = computeLayout(stage.width, stage.height);
  hud.setLayout(stage.width, stage.height);

  function relayout(): void {
    lay = computeLayout(stage.width, stage.height);
    hud.onResize(stage.width, stage.height);
    grid.invalidate(); // force grid redraw at new cell size
  }
  stage.app.renderer.on('resize', relayout);

  // ---- 遊戲結束 overlay ----
  const overEl = document.getElementById('bomber-over') as HTMLElement | null;
  const overStatsEl = document.getElementById('bomber-over-stats') as HTMLElement | null;
  const retryBtn = document.getElementById('bomber-restart') as HTMLElement | null;
  const onRetry = () => location.reload();
  retryBtn?.addEventListener('click', onRetry);

  let gameoverShown = false;

  function showGameover(floor: number, score: number): void {
    if (gameoverShown) return;
    gameoverShown = true;
    if (overStatsEl) overStatsEl.textContent = `FLOOR ${floor}  ·  SCORE ${score}`;
    if (overEl) overEl.removeAttribute('hidden');
  }

  // ---- 鍵盤輸入 ----
  const DIRS = new Set<string>(['up', 'down', 'left', 'right']);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyM') {
      e.preventDefault();
      sound.ensure();
      sound.toggle();
      return;
    }
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    sound.ensure(); // 首次手勢解鎖 AudioContext
    if (action === 'bomb') {
      if (!e.repeat) {
        game.input('bomb');
        sound.place();
      }
    } else if (action === 'ability') {
      if (!e.repeat) {
        game.input('ability');
      }
    } else if (DIRS.has(action)) {
      game.setHeld(action as Dir, true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code];
    if (!action || !DIRS.has(action)) return;
    game.setHeld(action as Dir, false);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ---- Ticker ----
  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    game.step(dt);

    // 消費引擎事件 → fx + sound
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'explode') {
        stage.shake(8);
        sound.explode();
      } else if (ev.kind === 'crateBreak') {
        // 輕微震動（箱子炸碎）
        stage.shake(3);
      } else if (ev.kind === 'pickup') {
        sound.pickup();
      } else if (ev.kind === 'enemyKill') {
        stage.shake(4);
      } else if (ev.kind === 'playerHit') {
        stage.shake(10);
        sound.hit();
      } else if (ev.kind === 'floorClear') {
        sound.descend();
        stage.shake(4);
      } else if (ev.kind === 'descend') {
        sound.descend();
        grid.invalidate(); // 新樓層：強制格子重繪
      } else if (ev.kind === 'ability') {
        stage.shake(6);
        sound.explode();
      } else if (ev.kind === 'gameover') {
        sound.gameover();
        const s = game.getState();
        showGameover(s.floor, s.score);
      }
    }

    const s = game.getState();
    grid.render(s, lay);
    entity.render(s, lay, dt);
    hud.render(s);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  const handle: BomberHandle = {
    game,
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
  (window as unknown as { __bomberDebug?: unknown }).__bomberDebug = { game, handle, stage };

  return handle;
}
