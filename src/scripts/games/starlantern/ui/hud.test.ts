import { describe, it, expect, vi } from 'vitest';
import { renderHud } from './hud';
import { Game } from '../engine/game';
import { constRng } from '../engine/testing';
import type { UiHooks } from './dom';
import { art } from '../render/artPaths';
import { NO_ART, type ArtIndex } from '../render/textures';

const some = (...urls: string[]): ArtIndex => ({ has: (u: string) => urls.includes(u) });

function setup(index: ArtIndex = NO_ART) {
  const game = new Game(constRng(0.99), null);
  game.depart(1);
  const root = document.createElement('div');
  const hooks: UiHooks = { refresh: vi.fn(() => renderHud(root, game, hooks)), say: vi.fn(), move: vi.fn(), art: index, sfx: { menu: vi.fn(), bump: vi.fn() } as never };
  renderHud(root, game, hooks);
  return { game, root, hooks };
}

describe('hud', () => {
  it('shows a portrait only for members whose art is published', () => {
    expect(setup(some(art.portrait('scarlet', 'normal'), art.portrait('liz', 'normal'))).root.querySelectorAll('.sl-party .sl-portrait')).toHaveLength(2);
    expect(setup().root.querySelectorAll('.sl-party .sl-portrait')).toHaveLength(0);
  });
  it('enables return only on the entrance', () => {
    const { game, root, hooks } = setup();
    expect((root.querySelector('#sl-return') as HTMLButtonElement).disabled).toBe(false);
    game.move('right');
    hooks.refresh();
    expect((root.querySelector('#sl-return') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the danger colour', () => {
    const { game, root, hooks } = setup();
    game.encounter = 80;
    hooks.refresh();
    expect(root.querySelector('.sl-danger')!.className).toContain('sl-danger--red');
  });
  it('routes the touch pad through ui.move', () => {
    const { root, hooks } = setup();
    (root.querySelector('[data-dir="left"]') as HTMLButtonElement).click();
    expect(hooks.move).toHaveBeenCalledWith('left');
  });
  it('uses the lamp', () => {
    const { game, root } = setup();
    (root.querySelector('#sl-lamp') as HTMLButtonElement).click();
    expect(game.phase).toBe('town');
  });
});
