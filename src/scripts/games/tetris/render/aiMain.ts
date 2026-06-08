import { Text } from 'pixi.js';
import { TetrisMatch, type Side } from '../engine/match';
import { getCells } from '../engine/piece';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { AiController, type Difficulty } from '../ai/AiController';
import { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { Effects } from './Effects';
import { GarbageMeter } from './GarbageMeter';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from './assets';
import { pieceTint } from './layout';
import { computeMatchLayout, P1_TINT, P2_TINT, type MatchLayout } from './matchLayout';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export interface AiHandle {
  destroy(): void;
  /** 暫停模擬（vs-AI 為本機對戰、可暫停）。 */
  pause(): void;
  resume(): void;
}

/** vs AI 對戰：A = 人類（1P 鍵位）、B = bot。重用 Phase 3 雙盤渲染/攻擊/垃圾/結算。 */
export async function startAi(canvas: HTMLCanvasElement, difficulty: Difficulty = 'normal'): Promise<AiHandle> {
  const stage = await PixiStage.create(canvas);
  const tex = await loadGameTextures();
  stage.setBackground(tex.bg);
  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* fallback monospace */ }

  const boardA = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, { frameTint: P1_TINT });
  const boardB = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, { frameTint: P2_TINT });
  const hudA = new HudView(stage.hudLayer, tex.block, 3);
  const hudB = new HudView(stage.hudLayer, tex.block, 3);
  const fxA = new Effects(stage.fxLayer, { spark: tex.spark, ring: tex.ring, glow: tex.glow });
  const fxB = new Effects(stage.fxLayer, { spark: tex.spark, ring: tex.ring, glow: tex.glow });
  const meter = new GarbageMeter(stage.playLayer);
  const sound = new SoundManager();

  const banner = new Text({
    text: '',
    style: { fontFamily: '"Press Start 2P", monospace', fontSize: 30, fill: 0xffffff, align: 'center' },
  });
  banner.anchor.set(0.5);
  stage.hudLayer.addChild(banner);

  let lay: MatchLayout = computeMatchLayout(stage.width, stage.height);
  function relayout(): void {
    lay = computeMatchLayout(stage.width, stage.height);
    stage.layoutBackground();
    boardA.setLayout(lay.cellSize, lay.a.origin);
    boardB.setLayout(lay.cellSize, lay.b.origin);
    hudA.setLayout(lay.a.hudAnchor, lay.cellSize);
    hudB.setLayout(lay.b.hudAnchor, lay.cellSize);
    fxA.setLayout(lay.cellSize, lay.a.origin);
    fxB.setLayout(lay.cellSize, lay.b.origin);
    meter.setLayout(lay.meter);
    banner.position.set(stage.width / 2, stage.height / 2);
  }
  relayout();
  stage.app.renderer.on('resize', relayout);

  const boardCenter = (side: Side) => {
    const o = side === 'A' ? lay.a.origin : lay.b.origin;
    return { x: o.x + lay.cellSize * BOARD_WIDTH / 2, y: o.y + lay.cellSize * VISIBLE_HEIGHT / 2 };
  };
  const boardRect = (side: Side) => {
    const o = side === 'A' ? lay.a.origin : lay.b.origin;
    return { x: o.x, y: o.y, w: lay.cellSize * BOARD_WIDTH, h: lay.cellSize * VISIBLE_HEIGHT };
  };

  let match = new TetrisMatch({ seed: Math.floor(Math.random() * 1_000_000_000) });
  // A = 人類；B = AI（透過相同的 match.input API）
  const inA = new InputController((a) => match.input('A', a), { das: 150, arr: 35 });
  let ai = new AiController((act) => match.input('B', act), () => match.b.getState(), difficulty);

  let introMs = 2400;
  let started = false;
  let resultShown = false;
  let paused = false;

  function reset(): void {
    match = new TetrisMatch({ seed: Math.floor(Math.random() * 1_000_000_000) });
    ai = new AiController((act) => match.input('B', act), () => match.b.getState(), difficulty);
    introMs = 2400;
    started = false;
    resultShown = false;
    banner.style.fontSize = 30;
    banner.visible = true;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
    if (e.code === 'KeyR' && match.phase === 'result') { e.preventDefault(); reset(); return; }
    if (paused) return; // 暫停時不吃操作鍵
    const a = KEYMAP_1P[e.code];
    if (!a) return;
    e.preventDefault();
    sound.ensure();
    if (e.repeat || !started || match.phase !== 'playing') return;
    inA.press(a);
    if (a === 'left' || a === 'right') sound.move();
    else if (a === 'rotateCW' || a === 'rotateCCW') sound.rotate();
    else if (a === 'hold') sound.hold();
    else if (a === 'hardDrop') { stage.shake(4); sound.hardDrop(); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP_1P[e.code];
    if (a) inA.release(a);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const fxFor = (side: Side) => (side === 'A' ? fxA : fxB);

  function handleEvents(): void {
    for (const ev of match.drainEvents()) {
      if (ev.kind === 'lock') {
        fxFor(ev.side).lockBurst(getCells(ev.piece), pieceTint(ev.piece.type));
        sound.lock();
      } else if (ev.kind === 'lineClear') {
        stage.shake(3 + ev.count * 2);
        fxFor(ev.side).lineClear(ev.rows, 0x9fefff);
        sound.lineClear(ev.count, ev.tSpin !== 'none' || ev.count >= 4);
        if (ev.combo >= 1) sound.combo(ev.combo);
        let shift = 0;
        if (ev.tSpin !== 'none') { fxFor(ev.side).popup('T-SPIN!', 0xc15cff, true, shift); shift += 28; }
        fxFor(ev.side).popup(`${CLEAR_NAMES[ev.count] ?? ''}!`, ev.count >= 4 ? 0xffd23f : 0x9fefff, ev.count >= 4, shift);
        shift += 28;
        if (ev.combo >= 1) fxFor(ev.side).popup(`${ev.combo} COMBO`, 0x4dff88, false, shift);
      } else if (ev.kind === 'attack') {
        const opp: Side = ev.from === 'A' ? 'B' : 'A';
        const f = boardCenter(ev.from);
        const t = boardCenter(opp);
        fxFor(ev.from).attackBeam(f.x, f.y, t.x, t.y, ev.from === 'A' ? P1_TINT : P2_TINT);
        sound.attack(ev.amount);
      } else if (ev.kind === 'garbageIn') {
        fxFor(ev.side).garbageInFlash(boardRect(ev.side));
        stage.shake(4);
        sound.garbageIn(ev.amount);
      }
    }
  }

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;
    if (paused) { stage.update(dt); return; } // 凍結模擬，但保留 CRT 動畫

    if (!started) {
      introMs -= dt;
      const n = Math.ceil(introMs / 700);
      banner.text = introMs <= 0 ? '' : n >= 3 ? 'READY' : n <= 0 ? 'FIGHT!' : String(n);
      banner.visible = introMs > 0;
      if (introMs <= -250) { started = true; banner.visible = false; }
    } else if (match.phase === 'playing') {
      inA.update(dt);
      ai.update(dt);
      match.step(dt);
      handleEvents();
    } else if (match.phase === 'result' && !resultShown) {
      resultShown = true;
      banner.text = `${match.winner === 'A' ? 'YOU WIN' : 'AI WINS'}\n\nPRESS R`;
      banner.style.fontSize = 26;
      banner.visible = true;
      stage.shake(12);
      sound.topout();
    }

    boardA.render(match.a.getState());
    boardB.render(match.b.getState());
    hudA.render(match.a.getState());
    hudB.render(match.b.getState());
    meter.render(match.pendingGarbage('A'), match.pendingGarbage('B'), dt);
    fxA.update(dt);
    fxB.update(dt);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = {
    get match() { return match; },
    get ai() { return ai; },
    stage, fxA, fxB,
  };

  return {
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };
}
