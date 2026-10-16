import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { ShopScene } from './shop';

function setup(gold = 100) {
  const game = new Game(constRng(0.5), null);
  game.state.gold = gold;
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new ShopScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
  s.enter(root);
  s.onAction('confirm');
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const o = [...layer.querySelectorAll('[role=option]')].find((x) => x.querySelector('.slx-label')!.textContent === label);
    if (!o) throw new Error(`no ${label}`);
    (o as HTMLElement).click();
  };
  return { game, root, s, pick, sfx };
}

describe('ShopScene', () => {
  it('buys a chosen quantity, capped by what the party can afford', () => {
    const { game, pick, s } = setup(100);
    pick('購買');
    pick('回復藥');                       // potion 20 G → at most 5
    s.onAction('up');                     // +10, clamped to 5
    expect(document.body).toBeTruthy();
    s.onAction('confirm');
    expect(game.state.inventory.potion).toBe(3 + 5);
    expect(game.state.gold).toBe(0);
  });

  it('refuses when even one is too expensive', () => {
    const { game, pick, sfx, root } = setup(10);
    pick('購買');
    pick('回復藥');
    expect(game.state.gold).toBe(10);
    expect(sfx.error).toHaveBeenCalled();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('金錢不足');
  });

  it('shows locked equipment as disabled with what it needs', () => {
    const { pick, root } = setup();
    pick('購買');
    const locked = [...root.querySelectorAll('.slx-layer [role=option]')].find((o) => o.getAttribute('aria-disabled') === 'true')!;
    expect(locked.querySelector('.slx-right')!.textContent).toContain('×');
  });

  it('sells materials by quantity and announces newly unlocked goods', () => {
    const { game, pick, s, root } = setup();
    game.state.inventory['thorn-fang'] = 5;
    pick('販賣');
    pick('荊棘牙');
    s.onAction('up');                     // all 5
    s.onAction('confirm');
    expect(game.state.inventory['thorn-fang'] ?? 0).toBe(0);
    expect(game.state.sold['thorn-fang']).toBe(5);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('荊棘槍');
  });

  it('says so when there is nothing to sell', () => {
    const { pick, root } = setup();
    pick('販賣');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的素材。');
  });

  it('buying a base adds it to the bag and the full bag is announced', () => {
    const { game, pick, s } = setup(1000);
    pick('購買');
    pick('鐵劍');
    s.onAction('confirm');
    expect(game.state.bag.map((x) => x.base)).toEqual(['iron-sword']);
    expect(game.state.inventory['iron-sword']).toBeUndefined();
    expect(game.state.gold).toBe(960);

    const full = setup(1000);
    full.game.state.bag = Array.from({ length: 60 }, (_, i) => plainItem('iron-sword', 100 + i));
    full.pick('購買');
    full.pick('鐵劍');
    expect(full.sfx.error).toHaveBeenCalled();
    expect(full.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('背包已滿（60 件）');
    expect(full.game.state.gold).toBe(1000);
  });

  it('the quantity box caps at the free bag slots', () => {
    const { game, pick, s, root } = setup(100000);
    game.state.bag = Array.from({ length: 58 }, (_, i) => plainItem('iron-sword', 100 + i));
    pick('購買');
    pick('鐵劍');
    s.onAction('up');                           // +10, clamped to the 2 free slots
    expect(root.querySelector('.slx-qty-n')!.textContent).toBe('× 2');
    s.onAction('confirm');
    expect(game.state.bag).toHaveLength(60);
    expect(game.state.gold).toBe(100000 - 2 * 40);
  });

  it('does not count leftover gear ids in the inventory as sellable materials', () => {
    const { game, pick, root } = setup();
    game.state.inventory = { 'iron-sword': 2 };
    pick('販賣');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('沒有可以賣的素材。');
    expect(game.state.sold['iron-sword']).toBeUndefined();
  });
});
