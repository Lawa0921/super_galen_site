import { Graphics } from 'pixi.js';
import { WitchGame } from '../engine/game';
import { FIELD_W, FIELD_H } from '../engine/constants';
import { KEYMAP } from '../input/keymap';
import { attachTouch } from '../input/touch';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { loadWitchTextures } from './assets';
import { BackgroundView } from './BackgroundView';
import { BulletView } from './BulletView';
import { EntityView } from './EntityView';
import { HudView } from './HudView';
import { RELICS } from '../engine/relics';
import type { RelicId } from '../engine/types';
import { DEFAULT_CHARACTER, type CharacterId } from '../engine/characters';

interface TelegraphLine { g: Graphics; ttlMs: number; durMs: number; }

export interface WitchHandle { game: WitchGame; destroy(): void; }

/** Volt 連鎖電弧：兩點間畫一道鋸齒閃電（外暈 + 亮核）。 */
function makeBolt(x1: number, y1: number, x2: number, y2: number, color: number): Graphics {
  const segs = 6;
  const px = -(y2 - y1), py = x2 - x1;            // 垂直方向（抖動用）
  const plen = Math.hypot(px, py) || 1;
  const pts: Array<[number, number]> = [[x1, y1]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = (Math.random() - 0.5) * 12;
    pts.push([x1 + (x2 - x1) * t + (px / plen) * jitter, y1 + (y2 - y1) * t + (py / plen) * jitter]);
  }
  pts.push([x2, y2]);
  const g = new Graphics();
  const trace = (): void => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); };
  trace(); g.stroke({ width: 5, color, alpha: 0.25 });          // 外暈
  trace(); g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.95 }); // 亮核
  return g;
}

export async function startWitchrun(
  canvas: HTMLCanvasElement,
  opts: { character?: CharacterId } = {},
): Promise<WitchHandle> {
  const characterId = opts.character ?? DEFAULT_CHARACTER;
  const stage = await PixiStage.create(canvas);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const game = new WitchGame({ seed, character: characterId });
  const sound = new SoundManager();

  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* fallback monospace */ }

  const tex = await loadWitchTextures(stage.app.renderer, characterId);
  const bg = new BackgroundView(stage.bgLayer, FIELD_W, FIELD_H);
  await bg.load();
  const bullets = new BulletView(stage.bulletLayer, tex);
  const entities = new EntityView(stage.entityLayer, stage.fxLayer, tex);
  const hud = new HudView(stage.hudLayer);

  // 戰場框＋周邊壓暗（螢幕座標；置於 bgLayer 之上、content 之下，故 HUD/彈幕永遠在最上層）。
  const frameGfx = new Graphics();
  stage.app.stage.addChildAt(frameGfx, 1);

  // 戰場：等比 contain 置中（偏移走 baseX/baseY，震屏每幀重設 content 位置）。
  // 背景：cover 填滿整個 viewport（溢出裁切），消除手機上下／桌機左右的死黑邊。
  function relayout(): void {
    const W = stage.width;
    const H = stage.height;
    const scale = Math.min(W / FIELD_W, H / FIELD_H);
    const fw = FIELD_W * scale;
    const fh = FIELD_H * scale;
    const ox = (W - fw) / 2;
    const oy = (H - fh) / 2;
    stage.content.scale.set(scale);
    stage.baseX = ox;
    stage.baseY = oy;

    const bgScale = Math.max(W / FIELD_W, H / FIELD_H);
    stage.bgLayer.scale.set(bgScale);
    stage.bgLayer.x = (W - FIELD_W * bgScale) / 2;
    stage.bgLayer.y = (H - FIELD_H * bgScale) / 2;

    // 周邊壓暗（四條帶，避免依賴 even-odd 挖洞）＋ 戰場魔導邊框（外暈＋內亮線）。
    frameGfx.clear();
    const dim = { color: 0x05030f, alpha: 0.66 } as const;
    if (oy > 0.5) {
      frameGfx.rect(0, 0, W, oy).fill(dim);
      frameGfx.rect(0, oy + fh, W, H - (oy + fh)).fill(dim);
    }
    if (ox > 0.5) {
      frameGfx.rect(0, oy, ox, fh).fill(dim);
      frameGfx.rect(ox + fw, oy, W - (ox + fw), fh).fill(dim);
    }
    frameGfx.rect(ox - 1, oy - 1, fw + 2, fh + 2).stroke({ width: 6, color: 0x9a6bff, alpha: 0.16 });
    frameGfx.rect(ox, oy, fw, fh).stroke({ width: 2, color: 0xb98bff, alpha: 0.8 });
  }
  relayout();
  stage.app.renderer.on('resize', relayout);

  // ---- Telegraph 預警線陣列 ----
  const telegraphLines: TelegraphLine[] = [];

  // ---- DOM overlays（遺物三選一 / game over / 過關）----
  const draftEl = document.getElementById('witch-draft');
  const draftBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-relic-slot]'));
  const overEl = document.getElementById('witch-over');
  const overHeading = document.getElementById('witch-over-heading');
  const overStats = document.getElementById('witch-over-stats');
  const clearEl = document.getElementById('witch-clear');
  const clearStats = document.getElementById('witch-clear-stats');
  const continueBtn = document.getElementById('witch-continue');

  // 觸控按鈕只在「正在遊玩且無 overlay」時顯示：任一 overlay 開啟就標記 data-overlay。
  const witchRoot = canvas.closest('.witch') as HTMLElement | null;
  function syncOverlay(): void {
    const open = [draftEl, overEl, clearEl].some((el) => el != null && !el.hasAttribute('hidden'));
    if (open) witchRoot?.setAttribute('data-overlay', '');
    else witchRoot?.removeAttribute('data-overlay');
  }

  let badEndFlag = false;

  function showDraft(choices: RelicId[]): void {
    draftBtns.forEach((btn, i) => {
      const id = choices[i];
      btn.hidden = !id;
      if (!id) return;
      btn.dataset.relicId = id;
      const relic = RELICS[id];
      const name = btn.querySelector('.relic-name');
      const desc = btn.querySelector('.relic-desc');
      if (name) name.textContent = relic.name;
      if (desc) desc.textContent = relic.desc;
      btn.classList.toggle('relic-card--rare', relic.rarity === 'rare');
    });
    draftEl?.removeAttribute('hidden');
    syncOverlay();
  }
  const onDraftClick = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.relicId as RelicId | undefined;
    if (!id) return;
    draftEl?.setAttribute('hidden', '');
    syncOverlay();
    game.pickRelic(id);
    sound.pickup();
  };
  draftBtns.forEach((b) => b.addEventListener('click', onDraftClick));

  const onContinue = (): void => {
    overEl?.setAttribute('hidden', '');
    syncOverlay();
    badEndFlag = false;
    game.continueRun();
  };
  continueBtn?.addEventListener('click', onContinue);

  // ---- 鍵盤 ----
  const DIRS = new Set(['up', 'down', 'left', 'right']);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    sound.ensure();
    if (action === 'focus') game.setFocus(true);
    else if (action === 'bomb' || action === 'overdrive') { if (!e.repeat) game.input(action); }
    else if (DIRS.has(action)) game.setHeld(action as 'up' | 'down' | 'left' | 'right', true);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const action = KEYMAP[e.code];
    if (action === 'focus') game.setFocus(false);
    else if (action && DIRS.has(action)) game.setHeld(action as 'up' | 'down' | 'left' | 'right', false);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const detachTouch = attachTouch(canvas, game, () => sound.ensure());

  // ---- Ticker ----
  const tick = (ticker: { deltaMS: number }): void => {
    const dt = ticker.deltaMS;
    game.step(dt);
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'shoot') { /* 每發都響太吵：射擊聲由 SoundManager 內部節流 */ sound.shoot(); }
      else if (ev.kind === 'graze') sound.graze();
      else if (ev.kind === 'overdrive') { stage.shake(10); sound.overdrive(); }
      else if (ev.kind === 'inferno') { stage.shake(12); sound.inferno(); }
      else if (ev.kind === 'enemyKill') { stage.shake(2); sound.kill(); }
      else if (ev.kind === 'playerHit') { stage.shake(14); sound.hit(); }
      else if (ev.kind === 'coin') sound.coin();
      else if (ev.kind === 'bossSpawn') { stage.shake(8); sound.alarm(); }
      else if (ev.kind === 'bossPhase') { stage.shake(8); sound.alarm(); }
      else if (ev.kind === 'bellToll') { stage.shake(6); sound.toll(); }
      else if (ev.kind === 'bossDefeat') { stage.shake(16); sound.inferno(); }
      else if (ev.kind === 'eliteKill') { stage.shake(12); sound.kill(); }
      else if (ev.kind === 'drop') sound.drop();
      else if (ev.kind === 'badEnd') { badEndFlag = true; sound.gameover(); sound.toll(); }
      else if (ev.kind === 'telegraph') {
        const g = new Graphics()
          .moveTo(ev.x1, ev.y1)
          .lineTo(ev.x2, ev.y2)
          .stroke({ width: 3, color: 0xfff0c0 });
        stage.fxLayer.addChild(g);
        telegraphLines.push({ g, ttlMs: ev.durMs, durMs: ev.durMs });
      } else if (ev.kind === 'chainArc') {
        const g = makeBolt(ev.x1, ev.y1, ev.x2, ev.y2, tex.accent);
        stage.fxLayer.addChild(g);
        telegraphLines.push({ g, ttlMs: 150, durMs: 150 }); // 短暫閃電，沿用漸隱機制
      } else if (ev.kind === 'draftOpen') showDraft(ev.choices);
      else if (ev.kind === 'gameover') {
        if (overHeading) overHeading.textContent = badEndFlag ? 'THE BELL TOLLS TWELVE' : 'GAME OVER';
        if (continueBtn) continueBtn.hidden = badEndFlag;
        if (overStats) overStats.textContent = `STAGE ${game.getState().stage} · SCORE ${game.getState().score}`;
        overEl?.removeAttribute('hidden');
        syncOverlay();
        if (!badEndFlag) sound.gameover();
      } else if (ev.kind === 'cleared') {
        sound.clear();
        const s = game.getState();
        const best = Math.max(s.score, Number(localStorage.getItem('witchrun-best') ?? 0));
        localStorage.setItem('witchrun-best', String(best));
        if (clearStats) clearStats.textContent = `SCORE ${s.score} · BEST ${best}`;
        clearEl?.removeAttribute('hidden');
        syncOverlay();
      }
    }

    // telegraph 漸隱
    for (let i = telegraphLines.length - 1; i >= 0; i--) {
      const line = telegraphLines[i];
      line.ttlMs -= dt;
      if (line.ttlMs <= 0) {
        line.g.destroy();
        telegraphLines.splice(i, 1);
      } else {
        line.g.alpha = line.ttlMs / line.durMs;
      }
    }

    const s = game.getState();
    bg.update(dt, s.stage);
    bullets.render(s.enemyBullets, s.playerBullets);
    entities.render(s, dt);
    hud.render(s);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  const handle: WitchHandle = {
    game,
    destroy(): void {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      draftBtns.forEach((b) => b.removeEventListener('click', onDraftClick));
      continueBtn?.removeEventListener('click', onContinue);
      detachTouch();
      stage.app.ticker.remove(tick);
      stage.app.destroy(undefined, { texture: true, textureSource: true }); // 連同產生的佔位紋理回收
    },
  };
  (window as unknown as { __witchDebug?: unknown }).__witchDebug = { game, handle, stage };
  return handle;
}
