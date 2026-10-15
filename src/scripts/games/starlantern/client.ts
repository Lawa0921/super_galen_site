import { SoundManager } from './audio/SoundManager';
import { FLOORS } from './data/floors';
import { T } from './data/text.zh-TW';
import type { Action } from './engine/battle';
import { Game } from './engine/game';
import type { Dir } from './engine/map';
import { mulberry32 } from './engine/rng';
import { bindKeys } from './input/keymap';
import { createApp } from './render/app';
import { BattleView } from './render/BattleView';
import { MapView } from './render/MapView';
import { art } from './render/artPaths';
import { TextureBank, loadManifest } from './render/textures';
import { BattleMenu } from './ui/battleMenu';
import { renderClear } from './ui/clear';
import { itemName, type UiHooks } from './ui/dom';
import { renderHud } from './ui/hud';
import { showMood } from './ui/art';
import { playCutIn } from './ui/cutin';
import { renderTown } from './ui/town';

function params(): { seed: number; fast: boolean } {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed'));
  return { seed: Number.isInteger(seed) && seed > 0 ? seed : Date.now() >>> 0, fast: q.get('fast') === '1' };
}

function safeStorage(): Storage | null {
  try {
    localStorage.setItem('starlantern-probe', '1');
    localStorage.removeItem('starlantern-probe');
    return localStorage;
  } catch {
    return null;
  }
}

export async function mountStarlantern(): Promise<void> {
  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const root = byId('sl-root');
  const notice = byId('sl-notice');
  const { seed, fast } = params();
  const game = Game.boot(mulberry32(seed), safeStorage());
  const sfx = new SoundManager();
  const bank = new TextureBank();
  await bank.preload(await loadManifest());
  root.classList.toggle('sl-framed', bank.has(art.frame));
  const mapView = new MapView(bank);
  const battleView = new BattleView(fast, bank);
  const app = await createApp(byId('sl-canvas') as HTMLCanvasElement).catch((err: unknown) => {
    console.error('[starlantern] renderer failed; the game stays playable without the canvas', err);
    return null;
  });
  if (app) {
    app.stage.addChild(mapView.root, battleView.root);
    app.ticker.add((t) => mapView.update(t.deltaTime));
  }
  let busy = false;
  let showingResult = false;

  const size = () => {
    app?.resize();
    return app ? { width: app.screen.width, height: app.screen.height } : { width: 0, height: 0 };
  };
  const say = (msg: string) => { notice.textContent = msg; notice.hidden = !msg; };
  /** Card reactions during playback: a momentary face and class, or the ultimate cut-in (awaited). */
  const pulseCard = async (key: string, cue: 'acting' | 'hit' | 'ultimate', name = ''): Promise<void> => {
    const card = document.querySelector<HTMLElement>(`#sl-battle .sl-member[data-key="${key}"]`);
    const face = card?.querySelector<HTMLImageElement>('.sl-portrait') ?? null;
    const before = face?.getAttribute('src') ?? null;
    if (face) showMood(bank, face, cue === 'acting' ? 'attack' : cue);
    const restore = () => { if (face && before) face.setAttribute('src', before); };
    if (cue === 'ultimate') {
      sfx.ultimate();
      const ult = art.portrait(key, 'ultimate');
      const portrait = bank.has(ult) ? ult : bank.has(art.portrait(key, 'normal')) ? art.portrait(key, 'normal') : null;
      await playCutIn(byId('sl-cutin'), { name, portrait, fast });
      restore();
      return;
    }
    if (!card) return;
    const cls = `sl-member--${cue}`;
    card.classList.remove(cls);
    void card.offsetWidth;
    card.classList.add(cls);
    setTimeout(() => { card.classList.remove(cls); restore(); }, fast ? 0 : 320);
  };

  const hooks: UiHooks = { refresh, say, sfx, move: onMove, art: bank };
  const menu = new BattleMenu(byId('sl-battle'), game, (actions) => void playRound(actions), bank);

  function refresh(): void {
    if (game.notice) { say(T.notices[game.notice]); game.notice = null; }
    byId('sl-gold').textContent = T.gold(game.state.gold);
    if (!showingResult) root.dataset.phase = game.phase;
    mapView.root.visible = root.dataset.phase === 'map';
    battleView.root.visible = root.dataset.phase === 'battle';
    if (root.dataset.phase === 'town') renderTown(byId('sl-town'), game, hooks);
    if (root.dataset.phase === 'map') { renderHud(byId('sl-hud'), game, hooks); mapView.draw(game, size()); }
    if (root.dataset.phase === 'clear') renderClear(byId('sl-clear'), game, hooks);
  }

  function onMove(dir: Dir): void {
    if (busy || showingResult) return;
    const r = game.move(dir);
    switch (r.kind) {
      case 'ignored': return;
      case 'blocked': sfx.bump(); break;
      case 'moved': case 'entrance': sfx.step(); break;
      case 'floor': sfx.stairs(); say(T.map.floor(r.floor, FLOORS[r.floor - 1].name)); break;
      case 'chest': sfx.chest(); say(T.map.chest(itemName(r.item), r.qty)); break;
      case 'battle': case 'boss':
        sfx.encounter();
        refresh();
        battleView.setup(game.battle!, size(), game.floor);
        menu.show(game.battle!);
        return;
    }
    refresh();
  }

  async function playRound(actions: Record<string, Action>): Promise<void> {
    if (busy) return;
    busy = true;
    let r: ReturnType<Game['submitRound']> = null;
    try {
      r = game.submitRound(actions);
      if (r) {
        menu.showLog(r.battle);
        await battleView.play(r.battle, sfx, pulseCard);
      }
    } catch (err) {
      console.error('[starlantern] round failed', err);
    } finally {
      busy = false;
    }
    if (!r) { if (game.battle) menu.show(game.battle); return; }
    if (!r.end) { menu.show(r.battle); return; }
    showingResult = true;
    if (r.end.outcome === 'win') sfx.win(); else if (r.end.outcome === 'lose') sfx.lose(); else sfx.menu();
    menu.showResult(r.end, r.battle, () => { showingResult = false; refresh(); });
  }

  bindKeys(window, (a) => {
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') onMove(a);
  });
  window.addEventListener('resize', () => {
    if (root.dataset.phase === 'map') mapView.draw(game, size());
  });
  (window as unknown as { __starlanternDebug?: { game: Game } }).__starlanternDebug = { game };
  refresh();
}
