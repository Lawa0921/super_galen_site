import { Text } from 'pixi.js';
import { TetrisMatch, type Side } from '../engine/match';
import { getCells } from '../engine/piece';
import { KEYMAP_2P_A, KEYMAP_2P_B } from '../input/keymap';
import { InputController } from '../input/InputController';
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

export interface MatchHandle {
  destroy(): void;
}

export async function startMatch(canvas: HTMLCanvasElement): Promise<MatchHandle> {
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

  // 盤面像素座標工具
  const boardCenter = (side: Side) => {
    const o = side === 'A' ? lay.a.origin : lay.b.origin;
    return { x: o.x + lay.cellSize * BOARD_WIDTH / 2, y: o.y + lay.cellSize * VISIBLE_HEIGHT / 2 };
  };
  const boardRect = (side: Side) => {
    const o = side === 'A' ? lay.a.origin : lay.b.origin;
    return { x: o.x, y: o.y, w: lay.cellSize * BOARD_WIDTH, h: lay.cellSize * VISIBLE_HEIGHT };
  };

  let match = new TetrisMatch({ seed: Math.floor(Math.random() * 1_000_000_000) });
  const inA = new InputController((a) => match.input('A', a), { das: 150, arr: 35 });
  const inB = new InputController((a) => match.input('B', a), { das: 150, arr: 35 });

  let introMs = 2400; // 開場倒數
  let started = false;
  let resultShown = false;

  function reset(): void {
    match = new TetrisMatch({ seed: Math.floor(Math.random() * 1_000_000_000) });
    introMs = 2400;
    started = false;
    resultShown = false;
    banner.visible = true;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
    if (e.code === 'KeyR' && match.phase === 'result') { e.preventDefault(); reset(); return; }
    const a = KEYMAP_2P_A[e.code];
    const b = KEYMAP_2P_B[e.code];
    if (!a && !b) return;
    e.preventDefault();
    sound.ensure();
    if (e.repeat || !started || match.phase !== 'playing') return;
    if (a) { inA.press(a); afterPress(a); }
    if (b) { inB.press(b); afterPress(b); }
  };
  const afterPress = (action: string) => {
    if (action === 'left' || action === 'right') sound.move();
    else if (action === 'rotateCW' || action === 'rotateCCW') sound.rotate();
    else if (action === 'hold') sound.hold();
    else if (action === 'hardDrop') { stage.shake(4); sound.hardDrop(); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP_2P_A[e.code];
    const b = KEYMAP_2P_B[e.code];
    if (a) inA.release(a);
    if (b) inB.release(b);
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
      } else if (ev.kind === 'ko') {
        // 結算於 render 區處理（讀 match.phase/winner）
      }
    }
  }

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS;

    if (!started) {
      introMs -= dt;
      const n = Math.ceil(introMs / 700);
      banner.text = introMs <= 0 ? '' : n >= 3 ? 'READY' : n <= 0 ? 'FIGHT!' : String(n);
      banner.visible = introMs > 0;
      if (introMs <= -250) { started = true; banner.visible = false; }
    } else if (match.phase === 'playing') {
      inA.update(dt);
      inB.update(dt);
      match.step(dt);
      handleEvents();
    } else if (match.phase === 'result' && !resultShown) {
      resultShown = true;
      const winText = match.winner === 'A' ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS';
      banner.text = `${winText}\n\nPRESS R`;
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
    stage, fxA, fxB,
  };

  return {
    destroy() {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };
}
