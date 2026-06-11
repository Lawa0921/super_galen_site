import { Text } from 'pixi.js';
import { TetrisMatch, type Side } from '../engine/match';
import { getCells } from '../engine/piece';
import { applySkill, resetSlow } from '../engine/items';
import { SoloRun, type SkillId } from '../engine/run';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { AiController, type Difficulty } from '../ai/AiController';
import { PixiStage } from './PixiStage';
import { BoardView } from './BoardView';
import { HudView } from './HudView';
import { ItemHud } from './ItemHud';
import { Effects } from './Effects';
import { GarbageMeter } from './GarbageMeter';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from './assets';
import { resolveSkin } from './skins';
import { pieceTint, setSkinTints } from './layout';
import { computeMatchLayout, P1_TINT, P2_TINT, type MatchLayout } from './matchLayout';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export interface AiHandle {
  destroy(): void;
  /** 暫停模擬（vs-AI 為本機對戰、可暫停）。 */
  pause(): void;
  resume(): void;
  /** 重新開始一局（結算後）。 */
  restart(): void;
}

/** vs AI 對戰：A = 人類（1P 鍵位）、B = bot。重用 Phase 3 雙盤渲染/攻擊/垃圾/結算。 */
export async function startAi(
  canvas: HTMLCanvasElement,
  difficulty: Difficulty = 'normal',
  opts: { onEnd?: (winner: Side) => void; skinId?: string; skill?: SkillId | null } = {},
): Promise<AiHandle> {
  const stage = await PixiStage.create(canvas);
  // 等級守門在 UI 層（T4）做；渲染層信任呼叫端、只負責套用皮膚。
  const skin = resolveSkin(opts.skinId ?? 'neon', Number.POSITIVE_INFINITY);
  const tex = await loadGameTextures(skin.id);
  setSkinTints(skin.tints ?? null);
  stage.setBackground(tex.bg);
  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* fallback monospace */ }

  const boardA = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, { frameTint: P1_TINT });
  const boardB = new BoardView(stage.bgLayer, stage.playLayer, tex.block, tex.frameWell, { frameTint: P2_TINT });
  const hudA = new HudView(stage.hudLayer, tex.block, 3);
  const hudB = new HudView(stage.hudLayer, tex.block, 3);
  // 玩家（A）帶技能才建能量 HUD；vs-AI HUD 欄較擠 → 條高 3.2 格
  const skill = opts.skill ?? null;
  const itemHud = skill ? await ItemHud.create(stage.hudLayer, skill, 3.2) : null;
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
    // 能量條放 A 側 HUD 欄右半（HOLD/NEXT 內容寬約 2.2 格，2.8 起不重疊）
    itemHud?.setLayout({ x: lay.a.hudAnchor.x + lay.cellSize * 2.8, y: lay.a.hudAnchor.y }, lay.cellSize);
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

  let seed = Math.floor(Math.random() * 1_000_000_000);
  let match = new TetrisMatch({ seed });
  let run = new SoloRun({ skill, seed, mode: 'ai' }); // 玩家（A）側能量/技能；AI 不用技能（v1）
  let slowLeftMs = 0; // 時之沙剩餘（tick dt 倒數 → 暫停相容）
  // A = 人類；B = AI（透過相同的 match.input API）
  const inA = new InputController((a) => match.input('A', a), { das: 150, arr: 35 });
  let ai = new AiController((act) => match.input('B', act), () => match.b.getState(), difficulty);

  let introMs = 2400;
  let started = false;
  let resultShown = false;
  let paused = false;

  function reset(): void {
    seed = Math.floor(Math.random() * 1_000_000_000);
    match = new TetrisMatch({ seed }); // 新 match 的 gravityScale/shield 全新 → slow/盾自然重置
    run = new SoloRun({ skill, seed, mode: 'ai' });
    slowLeftMs = 0;
    ai = new AiController((act) => match.input('B', act), () => match.b.getState(), difficulty);
    introMs = 2400;
    started = false;
    resultShown = false;
    banner.style.fontSize = 30;
    banner.visible = true;
  }

  /** KeyV：玩家側發動技能（shield 需 match context；slow 倒數走 tick dt）。 */
  function activateSkill(): void {
    if (!run.canActivate()) return;
    const act = run.activate();
    if (!act) return;
    if (act.skill === 'shield') {
      applySkill({ game: match.a, match, side: 'A' }, 'shield', { shieldRows: act.shieldRows });
      fxA.popup('SHIELD!', 0x4dff88, true);
      sound.attack(8);
      return;
    }
    applySkill({ game: match.a }, act.skill, { bombRows: act.bombRows });
    if (act.skill === 'bomb') {
      stage.shake(10);
      fxA.popup('BOMB!', 0xff9a3c, true);
      sound.lineClear(4, true);
    } else if (act.skill === 'slow') {
      slowLeftMs = act.slowMs;
      fxA.popup('SLOW!', 0x36e6ff, true);
      sound.levelUp();
    } else if (act.skill === 'reroll') {
      fxA.popup('REROLL!', 0xc15cff, true);
      sound.hold();
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
    if (paused) return; // 暫停時不吃操作鍵
    if (e.code === 'KeyV') { // 技能發動（KeyC 已被 hold 佔用）
      e.preventDefault();
      sound.ensure();
      if (e.repeat || !started || match.phase !== 'playing') return;
      activateSkill();
      return;
    }
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
        if (ev.side === 'A') run.onLineClear(ev.count, ev.combo, ev.tSpin !== 'none'); // 只有玩家側充能
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
      // 時之沙倒數（dt 累計 → 暫停時不倒數）
      if (slowLeftMs > 0) {
        slowLeftMs -= dt;
        if (slowLeftMs <= 0) {
          slowLeftMs = 0;
          resetSlow(match.a);
        }
      }
    } else if (match.phase === 'result' && !resultShown) {
      resultShown = true;
      banner.text = match.winner === 'A' ? 'YOU WIN' : 'AI WINS';
      banner.style.fontSize = 30;
      banner.visible = true;
      stage.shake(12);
      sound.topout();
      opts.onEnd?.(match.winner ?? 'B');
    }

    boardA.render(match.a.getState());
    boardB.render(match.b.getState());
    hudA.render(match.a.getState());
    hudB.render(match.b.getState());
    itemHud?.render(run.energy, run.energyRequired, run.canActivate(), dt);
    meter.render(match.pendingGarbage('A'), match.pendingGarbage('B'), dt);
    fxA.update(dt);
    fxB.update(dt);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = {
    get match() { return match; },
    get ai() { return ai; },
    get run() { return run; },
    stage, fxA, fxB,
    /** e2e 鉤子：vs-AI 不出 perk（mode:'ai' 的 onLevelUp 回 null）→ 安全 no-op。 */
    triggerLevelUp() { run.onLevelUp(); },
  };

  return {
    pause() { paused = true; },
    resume() { paused = false; },
    restart() { reset(); },
    destroy() {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };
}
