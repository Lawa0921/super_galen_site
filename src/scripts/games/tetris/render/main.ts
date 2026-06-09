import { Graphics } from 'pixi.js';
import { TetrisGame } from '../engine/game';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { getCells } from '../engine/piece';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { Effects } from './Effects';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from './assets';
import { pieceTint, type Point } from './layout';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

interface Layout {
  cellSize: number;
  origin: Point;
  holdAnchor: Point;
  infoAnchor: Point;
}

/** 盤面置中 + HOLD 在盤左、NEXT/分數在盤右（左右平衡的單人版面）。 */
function computeLayout(stageW: number, stageH: number): Layout {
  const sideCols = 4.2; // 每側預留給 HUD 的欄數
  const byHeight = (stageH * 0.88) / VISIBLE_HEIGHT;
  const byWidth = (stageW * 0.94) / (BOARD_WIDTH + sideCols * 2);
  const cellSize = Math.max(12, Math.floor(Math.min(byHeight, byWidth)));

  const wellW = cellSize * BOARD_WIDTH;
  const wellH = cellSize * VISIBLE_HEIGHT;
  const originX = Math.round((stageW - wellW) / 2); // 盤面水平置中
  const originY = Math.round((stageH - wellH) / 2);
  const sideGap = cellSize * 0.9;
  const holdW = cellSize * 3.2;
  return {
    cellSize,
    origin: { x: originX, y: originY },
    holdAnchor: { x: Math.round(originX - sideGap - holdW), y: originY },
    infoAnchor: { x: Math.round(originX + wellW + sideGap), y: originY },
  };
}

export interface TetrisHandle {
  readonly game: TetrisGame;
  destroy(): void;
  /** 暫停模擬（單人可暫停）。 */
  pause(): void;
  resume(): void;
  /** 重新開始一局（game over 後）。 */
  restart(): void;
}

/** 掛載並啟動單人俄羅斯方塊到指定 canvas。onEnd 在 top-out（game over）時呼叫一次。 */
export async function startTetris(
  canvas: HTMLCanvasElement,
  opts: { onEnd?: () => void } = {},
): Promise<TetrisHandle> {
  const stage = await PixiStage.create(canvas);
  const tex = await loadGameTextures();
  stage.setBackground(tex.bg);

  // 盤面後方暗角 scrim：壓暗背景、讓方塊更聚焦（置於背景圖之上、盤框之下）
  const scrim = new Graphics();
  stage.bgLayer.addChild(scrim);

  let game = new TetrisGame({ seed: Math.floor(Math.random() * 1_000_000_000) });

  const board = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, {
    frameTint: pieceTint('I'),
  });

  // 確保街機點陣字載入後再建立 HUD（否則 Pixi 會以 fallback 字測量、之後不更新）
  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch {
    /* 字型載入失敗則退回 monospace */
  }
  const hud = new HudView(stage.hudLayer, tex.block, 3);
  const fx = new Effects(stage.fxLayer, { spark: tex.spark, ring: tex.ring, glow: tex.glow });

  function relayout(): void {
    const lay = computeLayout(stage.width, stage.height);
    stage.layoutBackground();
    board.setLayout(lay.cellSize, lay.origin);
    hud.setLayoutSolo(lay.holdAnchor, lay.infoAnchor, lay.cellSize);
    fx.setLayout(lay.cellSize, lay.origin);
    // 重繪盤後暗角
    const w = lay.cellSize * BOARD_WIDTH;
    const h = lay.cellSize * VISIBLE_HEIGHT;
    const pad = lay.cellSize * 0.5;
    scrim.clear();
    scrim.roundRect(lay.origin.x - pad, lay.origin.y - pad, w + pad * 2, h + pad * 2, lay.cellSize * 0.6);
    scrim.fill({ color: 0x04060d, alpha: 0.58 });
  }
  relayout();
  // 綁 Pixi renderer 的 resize（畫布真的 resize 後才觸發，app.screen 已正確）；
  // 不要用 window 'resize'，那會在 Pixi 的 ResizeObserver 更新前就讀到舊尺寸 → 跑版。
  const onResize = () => relayout();
  stage.app.renderer.on('resize', onResize);

  const input = new InputController((action) => game.input(action), { das: 150, arr: 35 });
  const sound = new SoundManager();
  let paused = false;
  let gameOverShown = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyM') {
      e.preventDefault();
      sound.ensure();
      sound.toggle();
      return;
    }
    if (paused) return; // 暫停時不吃操作鍵
    const action = KEYMAP_1P[e.code];
    if (!action) return;
    e.preventDefault();
    sound.ensure(); // 首次手勢解鎖 AudioContext
    if (e.repeat) return; // 用自家 DAS/ARR，忽略 OS 連發
    input.press(action);
    if (action === 'left' || action === 'right') sound.move();
    else if (action === 'rotateCW' || action === 'rotateCCW') sound.rotate();
    else if (action === 'hold') sound.hold();
    else if (action === 'hardDrop') {
      stage.shake(5); // 硬降衝擊
      sound.hardDrop();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = KEYMAP_1P[e.code];
    if (!action) return;
    input.release(action);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let lastLevel = game.getState().level;
  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    if (paused) { stage.update(dt); return; } // 凍結模擬，但保留 CRT 動畫
    input.update(dt);
    game.step(dt);

    // 互動特效：消費引擎事件
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'lock') {
        fx.lockBurst(getCells(ev.piece), pieceTint(ev.piece.type));
        sound.lock();
      } else if (ev.kind === 'lineClear') {
        stage.shake(4 + ev.count * 3);
        fx.lineClear(ev.rows, 0x9fefff);
        sound.lineClear(ev.count, ev.tSpin !== 'none' || ev.count >= 4);
        if (ev.combo >= 1) sound.combo(ev.combo);
        let shift = 0;
        if (ev.tSpin !== 'none') {
          fx.popup('T-SPIN!', 0xc15cff, true, shift); shift += 30;
        }
        fx.popup(`${CLEAR_NAMES[ev.count] ?? ''}!`, ev.count >= 4 ? 0xffd23f : 0x36e6ff, ev.count >= 4, shift);
        shift += 30;
        if (ev.b2b) { fx.popup('BACK-TO-BACK', 0xff9a3c, false, shift); shift += 26; }
        if (ev.combo >= 1) fx.popup(`${ev.combo} COMBO`, 0x4dff88, false, shift);
      } else if (ev.kind === 'topout') {
        stage.shake(14);
        fx.topoutFlash();
        sound.topout();
      }
    }

    const state = game.getState();
    if (state.level > lastLevel) {
      lastLevel = state.level;
      fx.popup(`LEVEL ${state.level}`, 0x36e6ff, true);
      stage.shake(6);
      sound.levelUp();
    }
    if (state.status === 'topout' && !gameOverShown) {
      gameOverShown = true;
      opts.onEnd?.();
    }

    board.render(state);
    hud.render(state);
    fx.update(dt);
    stage.update(dt); // CRT 動畫 + 震屏衰減
  };
  stage.app.ticker.add(tick);

  const handle: TetrisHandle = {
    get game() { return game; },
    pause() { paused = true; },
    resume() { paused = false; },
    restart() {
      game = new TetrisGame({ seed: Math.floor(Math.random() * 1_000_000_000) });
      lastLevel = game.getState().level;
      gameOverShown = false;
      paused = false;
    },
    destroy() {
      stage.app.renderer.off('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };

  // e2e / 除錯掛鉤（game 用 getter，restart 後仍指向當前局）
  (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = { get game() { return game; }, handle, stage, fx };
  return handle;
}
