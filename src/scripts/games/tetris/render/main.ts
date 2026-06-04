import { TetrisGame } from '../engine/game';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { loadGameTextures } from './assets';
import { pieceTint, type Point } from './layout';

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
  const hud = new HudView(stage.hudLayer, tex.block, 3);

  function relayout(): void {
    const lay = computeLayout(stage.width, stage.height);
    stage.layoutBackground();
    board.setLayout(lay.cellSize, lay.origin);
    hud.setLayout(lay.hudAnchor, lay.cellSize);
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
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = KEYMAP_1P[e.code];
    if (!action) return;
    input.release(action);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    input.update(dt);
    game.step(dt);
    const state = game.getState();
    board.render(state);
    hud.render(state);
    game.drainEvents(); // Phase 3 會接特效；此階段先清空
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
  (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = { game, handle };
  return handle;
}
