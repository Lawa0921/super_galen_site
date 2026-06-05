import { TetrisGame } from '../engine/game';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { getCells } from '../engine/piece';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { Effects } from './Effects';
import { loadGameTextures } from './assets';
import { pieceTint, type Point } from './layout';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

interface Layout {
  cellSize: number;
  origin: Point;
  hudAnchor: Point;
}

/** 依畫面尺寸算出單盤 + 右側 HUD 的版面。 */
function computeLayout(stageW: number, stageH: number): Layout {
  const hudCols = 5;
  const byHeight = (stageH * 0.86) / VISIBLE_HEIGHT;
  const byWidth = (stageW * 0.92) / (BOARD_WIDTH + hudCols);
  const cellSize = Math.max(12, Math.floor(Math.min(byHeight, byWidth)));

  const wellW = cellSize * BOARD_WIDTH;
  const wellH = cellSize * VISIBLE_HEIGHT;
  const hudW = cellSize * hudCols;
  const gap = cellSize * 1.4;
  const groupW = wellW + gap + hudW;

  const originX = Math.round((stageW - groupW) / 2);
  const originY = Math.round((stageH - wellH) / 2);
  return {
    cellSize,
    origin: { x: originX, y: originY },
    hudAnchor: { x: originX + wellW + gap, y: originY },
  };
}

export interface TetrisHandle {
  game: TetrisGame;
  destroy(): void;
}

/** 掛載並啟動單人俄羅斯方塊到指定 canvas。 */
export async function startTetris(canvas: HTMLCanvasElement): Promise<TetrisHandle> {
  const stage = await PixiStage.create(canvas);
  const tex = await loadGameTextures();
  stage.setBackground(tex.bg);

  const seed = Math.floor(Math.random() * 1_000_000_000);
  const game = new TetrisGame({ seed });

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
    hud.setLayout(lay.hudAnchor, lay.cellSize);
    fx.setLayout(lay.cellSize, lay.origin);
  }
  relayout();
  const onResize = () => relayout();
  window.addEventListener('resize', onResize);

  const input = new InputController((action) => game.input(action), { das: 150, arr: 35 });

  const onKeyDown = (e: KeyboardEvent) => {
    const action = KEYMAP_1P[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // 用自家 DAS/ARR，忽略 OS 連發
    input.press(action);
    if (action === 'hardDrop') stage.shake(5); // 硬降衝擊
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
    input.update(dt);
    game.step(dt);

    // 互動特效：消費引擎事件
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'lock') {
        fx.lockBurst(getCells(ev.piece), pieceTint(ev.piece.type));
      } else if (ev.kind === 'lineClear') {
        stage.shake(4 + ev.count * 3);
        fx.lineClear(ev.rows, 0x9fefff);
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
      }
    }

    const state = game.getState();
    if (state.level > lastLevel) {
      lastLevel = state.level;
      fx.popup(`LEVEL ${state.level}`, 0x36e6ff, true);
      stage.shake(6);
    }

    board.render(state);
    hud.render(state);
    fx.update(dt);
    stage.update(dt); // CRT 動畫 + 震屏衰減
  };
  stage.app.ticker.add(tick);

  const handle: TetrisHandle = {
    game,
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };

  // e2e / 除錯掛鉤
  (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = { game, handle, stage, fx };
  return handle;
}
