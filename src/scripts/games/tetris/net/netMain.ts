import { Text } from 'pixi.js';
import { type Side } from '../engine/match';
import { getCells } from '../engine/piece';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { PixiStage } from '../render/PixiStage';
import { BoardView } from '../render/BoardView';
import { HudView } from '../render/HudView';
import { Effects } from '../render/Effects';
import { GarbageMeter } from '../render/GarbageMeter';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from '../render/assets';
import { pieceTint } from '../render/layout';
import { computeMatchLayout, P1_TINT, P2_TINT, type MatchLayout } from '../render/matchLayout';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { Lockstep } from './lockstep';
import { WebRtcTransport } from './webrtcTransport';
import { createRoom, putSlot, pollSlot } from './signalClient';

const SIM_DT = 1000 / 60;
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export interface NetStatus {
  phase: 'creating' | 'waiting' | 'connecting' | 'connected' | 'error';
  room?: string;
  message?: string;
}
export type StatusCb = (s: NetStatus) => void;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/** Host：建房 → 等對手 → 連上後開局（為 A 方）。 */
export async function hostGame(canvas: HTMLCanvasElement, onStatus: StatusCb): Promise<void> {
  const transport = new WebRtcTransport();
  try {
    onStatus({ phase: 'creating' });
    const room = await createRoom();
    onStatus({ phase: 'waiting', room });
    const offer = await transport.createOffer();
    await putSlot(room, 'offer', offer);
    const answer = await pollSlot(room, 'answer');
    await transport.acceptAnswer(answer);
    await transport.waitOpen();
    const seed = randomSeed();
    transport.send(JSON.stringify({ t: 'seed', seed }));
    onStatus({ phase: 'connected', room });
    runGame(canvas, transport, seed, 'A');
  } catch (e) {
    onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    transport.close();
  }
}

/** Guest：以房號加入 → 連上後開局（為 B 方）。 */
export async function joinGame(canvas: HTMLCanvasElement, room: string, onStatus: StatusCb): Promise<void> {
  const transport = new WebRtcTransport();
  try {
    onStatus({ phase: 'connecting', room });
    // 先掛上 seed 接收（Lockstep 之後會接管 onMessage）
    let resolveSeed: (n: number) => void = () => {};
    const seedPromise = new Promise<number>((res) => (resolveSeed = res));
    transport.onMessage((raw) => {
      try {
        const m = JSON.parse(raw) as { t?: string; seed?: number };
        if (m.t === 'seed' && typeof m.seed === 'number') resolveSeed(m.seed);
      } catch { /* ignore */ }
    });

    const offer = await pollSlot(room, 'offer');
    const answer = await transport.createAnswer(offer);
    await putSlot(room, 'answer', answer);
    await transport.waitOpen();
    const seed = await seedPromise;
    onStatus({ phase: 'connected', room });
    runGame(canvas, transport, seed, 'B');
  } catch (e) {
    onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    transport.close();
  }
}

/** 連上後的對戰主迴圈：固定步長驅動 lockstep，渲染重用雙盤。 */
function runGame(canvas: HTMLCanvasElement, transport: WebRtcTransport, seed: number, localSide: Side): void {
  void PixiStage.create(canvas).then(async (stage) => {
    const tex = await loadGameTextures();
    stage.setBackground(tex.bg);
    try {
      await document.fonts.load('14px "Press Start 2P"');
      await document.fonts.ready;
    } catch { /* fallback */ }

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
      style: { fontFamily: '"Press Start 2P", monospace', fontSize: 24, fill: 0xffffff, align: 'center' },
    });
    banner.anchor.set(0.5);
    stage.hudLayer.addChild(banner);

    const youTag = new Text({
      text: 'YOU',
      style: { fontFamily: '"Press Start 2P", monospace', fontSize: 11, fill: localSide === 'A' ? P1_TINT : P2_TINT },
    });
    youTag.anchor.set(0.5);
    stage.hudLayer.addChild(youTag);

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
      const me = localSide === 'A' ? lay.a.origin : lay.b.origin;
      youTag.position.set(me.x + (lay.cellSize * BOARD_WIDTH) / 2, me.y - lay.cellSize * 0.7);
    }
    relayout();
    stage.app.renderer.on('resize', relayout);

    const lockstep = new Lockstep({ seed, localSide, transport });
    const input = new InputController((a) => lockstep.pressLocal(a), { das: 150, arr: 35 });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
      const a = KEYMAP_1P[e.code];
      if (!a) return;
      e.preventDefault();
      sound.ensure();
      if (e.repeat) return;
      input.press(a);
      if (a === 'left' || a === 'right') sound.move();
      else if (a === 'rotateCW' || a === 'rotateCCW') sound.rotate();
      else if (a === 'hold') sound.hold();
      else if (a === 'hardDrop') { stage.shake(4); sound.hardDrop(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const a = KEYMAP_1P[e.code];
      if (a) input.release(a);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const fxFor = (side: Side) => (side === 'A' ? fxA : fxB);
    const boardCenter = (side: Side) => {
      const o = side === 'A' ? lay.a.origin : lay.b.origin;
      return { x: o.x + (lay.cellSize * BOARD_WIDTH) / 2, y: o.y + (lay.cellSize * VISIBLE_HEIGHT) / 2 };
    };
    const boardRect = (side: Side) => {
      const o = side === 'A' ? lay.a.origin : lay.b.origin;
      return { x: o.x, y: o.y, w: lay.cellSize * BOARD_WIDTH, h: lay.cellSize * VISIBLE_HEIGHT };
    };

    function handleEvents(): void {
      for (const ev of lockstep.match.drainEvents()) {
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

    let acc = 0;
    let resultShown = false;
    let disconnected = false;
    transport.onClose(() => { disconnected = true; });

    const tick = (ticker: { deltaMS: number }) => {
      const dt = ticker.deltaMS;
      const match = lockstep.match;

      if (match.phase === 'playing' && !disconnected) {
        acc += dt;
        let guard = 0;
        while (acc >= SIM_DT && guard < 8) { // guard 防卡頓時暴衝
          input.update(SIM_DT);
          lockstep.tick();
          guard++;
          acc -= SIM_DT;
        }
        handleEvents();
      }

      if (disconnected && !resultShown) {
        resultShown = true;
        banner.text = 'OPPONENT\nDISCONNECTED';
        banner.style.fontSize = 22;
        banner.visible = true;
      } else if (match.phase === 'result' && !resultShown) {
        resultShown = true;
        const youWin = match.winner === localSide;
        banner.text = `${youWin ? 'YOU WIN' : 'YOU LOSE'}`;
        banner.style.fontSize = 28;
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

    (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = { lockstep, get match() { return lockstep.match; }, stage };
  });
}
