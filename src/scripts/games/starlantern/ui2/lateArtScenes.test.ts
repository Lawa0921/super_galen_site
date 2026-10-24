import { describe, expect, it, vi } from 'vitest';
import { Game } from '../engine/game';
import { LEGACY_LINEUP } from '../engine/party';
import { constRng } from '../engine/testing';
import { allArtUrls } from '../render/artPaths';
import type { ArtIndex } from '../render/textures';
import { drawLanded } from './lateArt';
import type { Scene, SceneCtx } from './scene';
import { BattleScene } from './scenes/battle';
import { DungeonScene } from './scenes/dungeon';
import { EquipScene } from './scenes/equip';
import { ForgeScene } from './scenes/forge';
import { FormationScene } from './scenes/formation';
import { GateScene } from './scenes/gate';
import { GuildScene } from './scenes/guild';
import { HandbookScene } from './scenes/handbook';
import { InnScene } from './scenes/inn';
import { SettingsScene } from './scenes/settings';
import { ShopScene } from './scenes/shop';
import { StatusScene } from './scenes/status';
import { TitleScene } from './scenes/title';
import { TownScene } from './scenes/town';

/**
 * Every screen drawn before its pictures landed (the game art streams in behind the title, ui2/main.ts) shows the same
 * pictures, once they land, as the same screen drawn with all of them already here: nothing it draws only when a picture
 * is loaded is left out for good (ui2/lateArt). The workshop and the build lists draw only rune icons, which they always
 * draw (ui2/runeArt), so they are not here.
 */
const ALL = allArtUrls();

type Make = (ctx: SceneCtx) => Scene;
const town = (): Game => new Game(constRng(0.5), null, undefined, 0, LEGACY_LINEUP);
const inDungeon = (): Game => {
  const g = new Game(constRng(0.99), null, undefined, 0, LEGACY_LINEUP);
  expect(g.depart({ region: 'mainline', condition: 'plain' }, 1)).toEqual({ ok: true });
  return g;
};
const inBattle = (): Game => {
  const g = inDungeon();
  g.encounter = 99;
  expect(g.move('right').kind).toBe('battle');
  return g;
};

const SCREENS: [string, () => Game, Make][] = [
  ['title', town, (c) => new TitleScene(c)],
  ['town', town, (c) => new TownScene(c, Infinity)],
  ['guild', town, (c) => new GuildScene(c, Infinity)],
  ['shop', town, (c) => new ShopScene(c, Infinity)],
  ['inn', town, (c) => new InnScene(c, Infinity)],
  ['gate', town, (c) => new GateScene(c, Infinity)],
  ['forge', town, (c) => new ForgeScene(c, Infinity)],
  ['settings', town, (c) => new SettingsScene(c)],
  ['formation', town, (c) => new FormationScene(c)],
  ['status', town, (c) => new StatusScene(c)],
  ['equip', town, (c) => new EquipScene(c)],
  ['handbook', town, (c) => new HandbookScene(c, Infinity)],
  ['dungeon', inDungeon, (c) => new DungeonScene(c, Infinity)],
  ['battle', inBattle, (c) => new BattleScene(c, Infinity)],
];

function draw(game: Game, make: Make, idx: ArtIndex): { root: HTMLElement; scene: Scene } {
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const scene = make({ game, art: idx, sfx, go: vi.fn(), hasSave: () => true, newGame: vi.fn(), stage: null, fast: true });
  scene.enter(root);
  return { root, scene };
}

/** What a screen shows of its art: each picture's src and class, and the logo's words when it has no picture. */
const pictures = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('img')].map((i) => `${i.getAttribute('src')} ${i.className}`).sort();

describe('a screen drawn before its art landed', () => {
  for (const [name, game, make] of SCREENS) {
    it(`${name}: gains every picture it would have drawn, once they land`, () => {
      const full = draw(game(), make, { has: () => true });
      const landed = new Set<string>();
      const late = draw(game(), make, { has: (u) => landed.has(u) });
      const want = pictures(full.root);
      expect(want.length, 'the full screen shows some art').toBeGreaterThan(0);
      for (const u of ALL) landed.add(u);
      const urls = new Set([...ALL, ...want.map((w) => w.split(' ')[0])]);
      for (const u of urls) landed.add(u);
      drawLanded(late.root, urls);
      late.scene.artArrived?.(urls);
      expect(pictures(late.root)).toEqual(want);
      full.scene.exit();
      late.scene.exit();
    });

    it(`${name}: art landing in several batches shows, after each, what a screen drawn with that much art shows`, () => {
      const full = draw(game(), make, { has: () => true });
      const urls = [...new Set([...ALL, ...pictures(full.root).map((w) => w.split(' ')[0])])];
      const landed = new Set<string>();
      const late = draw(game(), make, { has: (u) => landed.has(u) });
      // Three batches, each a spread of the whole list (faces, icons and backgrounds mixed), as a slow network brings them.
      for (let b = 0; b < 3; b++) {
        const batch = new Set(urls.filter((_, i) => i % 3 === b));
        for (const u of batch) landed.add(u);
        drawLanded(late.root, batch);
        late.scene.artArrived?.(batch);
        const now = draw(game(), make, { has: (u) => landed.has(u) });
        expect(pictures(late.root), `after batch ${b + 1}`).toEqual(pictures(now.root));
        now.scene.exit();
      }
      expect(pictures(late.root)).toEqual(pictures(full.root));
      full.scene.exit();
      late.scene.exit();
    });

    it(`${name}: a picture the screen does not wait for changes nothing on it`, () => {
      const late = draw(game(), make, { has: () => false });
      const seen = new MutationObserver(() => {});
      seen.observe(late.root, { subtree: true, childList: true, attributes: true, characterData: true });
      // Urls of every kind a screen draws (an icon, a face, a background, gear), none of them one this screen asked for.
      const others = new Set(['icon/', 'portraits/', 'bg/', 'gear/', 'scenes/'].map((k) => `/assets/games/starlantern/${k}not-on-this-screen.webp`));
      drawLanded(late.root, others);
      late.scene.artArrived?.(others);
      expect(seen.takeRecords()).toEqual([]);
      seen.disconnect();
      late.scene.exit();
    });
  }
});
