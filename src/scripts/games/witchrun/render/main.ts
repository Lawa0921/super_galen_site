import { Container } from 'pixi.js';
import { WitchGame } from '../engine/game';
import { FIELD_W, FIELD_H } from '../engine/constants';
import { KEYMAP } from '../input/keymap';
import { attachTouch } from '../input/touch';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { makePlaceholderTextures } from './assets';
import { BackgroundView } from './BackgroundView';
import { BulletView } from './BulletView';
import { EntityView } from './EntityView';
import { HudView } from './HudView';
import { RELICS } from '../engine/relics';
import type { RelicId } from '../engine/types';

export interface WitchHandle { game: WitchGame; destroy(): void; }

export async function startWitchrun(canvas: HTMLCanvasElement): Promise<WitchHandle> {
  const stage = await PixiStage.create(canvas);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const game = new WitchGame({ seed });
  const sound = new SoundManager();

  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* fallback monospace */ }

  const tex = makePlaceholderTextures(stage.app.renderer);
  const bg = new BackgroundView(stage.bgLayer, FIELD_W, FIELD_H);
  const bullets = new BulletView(stage.bulletLayer, tex);
  const entities = new EntityView(stage.entityLayer, stage.fxLayer, tex);
  const hud = new HudView(stage.hudLayer);

  // 場域等比縮放置中（bgLayer 與 content 同步變換）
  function relayout(): void {
    const scale = Math.min(stage.width / FIELD_W, stage.height / FIELD_H);
    for (const c of [stage.bgLayer, stage.content] as Container[]) {
      c.scale.set(scale);
      c.x = (stage.width - FIELD_W * scale) / 2;
      c.y = (stage.height - FIELD_H * scale) / 2;
    }
  }
  relayout();
  stage.app.renderer.on('resize', relayout);

  // ---- DOM overlays（遺物三選一 / game over / 過關）----
  const draftEl = document.getElementById('witch-draft');
  const draftBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-relic-slot]'));
  const overEl = document.getElementById('witch-over');
  const overStats = document.getElementById('witch-over-stats');
  const clearEl = document.getElementById('witch-clear');
  const clearStats = document.getElementById('witch-clear-stats');

  function showDraft(choices: RelicId[]): void {
    draftBtns.forEach((btn, i) => {
      const id = choices[i];
      btn.hidden = !id;
      if (!id) return;
      btn.dataset.relicId = id;
      const name = btn.querySelector('.relic-name');
      const desc = btn.querySelector('.relic-desc');
      if (name) name.textContent = RELICS[id].name;
      if (desc) desc.textContent = RELICS[id].desc;
    });
    draftEl?.removeAttribute('hidden');
  }
  const onDraftClick = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.relicId as RelicId | undefined;
    if (!id) return;
    draftEl?.setAttribute('hidden', '');
    game.pickRelic(id);
    sound.pickup();
  };
  draftBtns.forEach((b) => b.addEventListener('click', onDraftClick));

  document.getElementById('witch-continue')?.addEventListener('click', () => {
    overEl?.setAttribute('hidden', '');
    game.continueRun();
  });

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
      else if (ev.kind === 'bellToll') { stage.shake(6); sound.bell(); }
      else if (ev.kind === 'bossDefeat') { stage.shake(16); sound.inferno(); }
      else if (ev.kind === 'draftOpen') showDraft(ev.choices);
      else if (ev.kind === 'gameover') {
        sound.gameover();
        if (overStats) overStats.textContent = `STAGE ${game.getState().stage} · SCORE ${game.getState().score}`;
        overEl?.removeAttribute('hidden');
      } else if (ev.kind === 'cleared') {
        sound.clear();
        const s = game.getState();
        const best = Math.max(s.score, Number(localStorage.getItem('witchrun-best') ?? 0));
        localStorage.setItem('witchrun-best', String(best));
        if (clearStats) clearStats.textContent = `SCORE ${s.score} · BEST ${best}`;
        clearEl?.removeAttribute('hidden');
      }
    }
    const s = game.getState();
    bg.update(dt);
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
      detachTouch();
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };
  (window as unknown as { __witchDebug?: unknown }).__witchDebug = { game, handle, stage };
  return handle;
}
