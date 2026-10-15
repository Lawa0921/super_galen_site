import { SoundManager } from '../audio/SoundManager';
import { Game } from '../engine/game';
import { mulberry32 } from '../engine/rng';
import { SAVE_KEY } from '../engine/save';
import { TextureBank, loadManifest } from '../render/textures';
import { bindUiInput } from './input';
import { Router, type SceneName } from './scene';
import { TitleScene } from './scenes/title';
import { TownScene } from './scenes/town';

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export async function mountNext(): Promise<void> {
  const ui = document.getElementById('sl-ui');
  if (!ui) return;
  const storage = safeStorage();
  let game = Game.boot(mulberry32(Date.now() >>> 0), storage);
  const sfx = new SoundManager();
  const bank = new TextureBank();
  const make = (name: SceneName, ctx: Parameters<ConstructorParameters<typeof Router>[1]>[1]) =>
    name === 'title' ? new TitleScene(ctx) : new TownScene(ctx);
  const ctx = {
    get game() { return game; },
    art: bank, sfx,
    hasSave: () => { try { return !!storage?.getItem(SAVE_KEY); } catch { return false; } },
    newGame: () => { game = new Game(mulberry32(Date.now() >>> 0), storage); },
  };
  const router = new Router(ui, make, ctx);
  bindUiInput(window, (a) => { sfx.ensure(); router.onAction(a); });
  // Menu screens need only their own art; load that first (each request times out), then show the title.
  // The game art streams in afterwards without re-entering a scene, so no key press is ever dropped.
  const urls = [...(await loadManifest())];
  const menuArt = urls.filter((u) => /\/(scene|npc)\/|\/ui\/(logo|window|cursor)\.png$/.test(u));
  await bank.preload(menuArt);
  void bank.preload(urls.filter((u) => !menuArt.includes(u)));
  ui.dataset.ready = 'true';
  await router.go('title');
}
