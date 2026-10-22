import { SoundManager } from '../audio/SoundManager';
import { Game } from '../engine/game';
import { mulberry32, seedFrom } from '../engine/rng';
import { SAVE_KEY } from '../engine/save';
import { art } from '../render/artPaths';
import { TextureBank, loadManifest } from '../render/textures';
import { bindUiInput, toggleFullscreen } from './input';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Stage } from './stage';
import { Router, type SceneName } from './scene';
import { TitleScene } from './scenes/title';
import { TownScene } from './scenes/town';
import { GuildScene } from './scenes/guild';
import { ShopScene } from './scenes/shop';
import { InnScene } from './scenes/inn';
import { GateScene } from './scenes/gate';
import { ForgeScene } from './scenes/forge';
import { DungeonScene } from './scenes/dungeon';
import { BattleScene } from './scenes/battle';
import { ClearScene } from './scenes/clear';
import { SettingsScene } from './scenes/settings';
import { FormationScene } from './scenes/formation';
import { StatusScene } from './scenes/status';
import { EquipScene } from './scenes/equip';
import { HandbookScene } from './scenes/handbook';
import { WorkshopScene } from './scenes/workshop';
import { BuildsScene } from './scenes/builds';

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export async function mountNext(): Promise<void> {
  const ui = document.getElementById('sl-ui');
  if (!ui) return;
  const storage = safeStorage();
  const q = new URLSearchParams(location.search);
  const seed = seedFrom(q.get('seed'), Date.now());
  const fast = q.get('fast') === '1';
  // The forge salt of a new game is this session's seed: fixed once the game starts, then kept in its save.
  let game = Game.boot(mulberry32(seed), storage, seed);
  const sfx = new SoundManager();
  let settings: Settings = loadSettings(storage);
  sfx.setVolume(settings.volume / 100);
  const settingsStore = {
    get: () => settings,
    set: (s: Settings) => { settings = s; sfx.setVolume(s.volume / 100); saveSettings(storage, s); },
  };
  const bank = new TextureBank();
  const stage = new Stage(document.getElementById('sl-screen')!, bank, fast);
  const make = (name: SceneName, ctx: Parameters<ConstructorParameters<typeof Router>[1]>[1]) => {
    switch (name) {
      case 'title': return new TitleScene(ctx);
      case 'town': return new TownScene(ctx);
      case 'guild': return new GuildScene(ctx);
      case 'shop': return new ShopScene(ctx);
      case 'inn': return new InnScene(ctx);
      case 'gate': return new GateScene(ctx);
      case 'forge': return new ForgeScene(ctx);
      case 'dungeon': return new DungeonScene(ctx);
      case 'battle': return new BattleScene(ctx);
      case 'clear': return new ClearScene(ctx);
      case 'settings': return new SettingsScene(ctx);
      case 'formation': return new FormationScene(ctx);
      case 'status': return new StatusScene(ctx);
      case 'equip': return new EquipScene(ctx);
      case 'workshop': return new WorkshopScene(ctx);
      case 'handbook': return new HandbookScene(ctx);
      case 'builds': return new BuildsScene(ctx);
    }
  };
  const ctx = {
    get game() { return game; },
    art: bank, sfx,
    hasSave: () => { try { return !!storage?.getItem(SAVE_KEY); } catch { return false; } },
    newGame: () => { game = Game.fresh(mulberry32(seed), storage, seed); },
    // The title's boot may have migrated and saved an old save: its notice is still owed (Game.boot `previous`).
    continueGame: () => { game = Game.boot(mulberry32(seed), storage, seed, game); },
    stage, fast,
    settings: settingsStore,
    vibrate: (ms: number) => { if (settings.vibrate) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } } },
    fullscreen: () => toggleFullscreen(document.documentElement),   // the page, not #sl-screen: :fullscreen sets transform: none (legibility 2a)
  };
  const router = new Router(ui, make, ctx);
  bindUiInput(window, (a) => { sfx.ensure(); router.onAction(a); });
  // Menu screens need only their own art; load that first (each request times out), then show the title.
  // The game art streams in afterwards without re-entering a scene, so no key press is ever dropped.
  const urls = [...(await loadManifest())];
  const menuArt = urls.filter((u) => /\/(scene|npc)\/|\/ui\/(logo|window|cursor)\.png$/.test(u));
  await bank.preload(menuArt);
  void bank.preload(urls.filter((u) => !menuArt.includes(u)));
  document.getElementById('sl-screen')?.classList.toggle('slx-skinned', bank.has(art.window) && bank.has(art.cursor));
  (window as unknown as { __starlanternDebug?: unknown }).__starlanternDebug = {
    get game() { return game; }, stage,
    /** Tests only: straight to a scene, as the router goes there; it changes nothing in the game. */
    go: (name: SceneName, arg?: string) => router.go(name, arg),
  };
  ui.dataset.ready = 'true';
  await router.go('title');
}
