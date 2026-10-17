import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, plainItem } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { GuildScene } from './guild';
import { LEGACY_LINEUP, START_LINEUP, meet } from '../../engine/party';
import { T } from '../../data/text.zh-TW';
import { memoryStorage } from '../../engine/testing';

const HERO_LINEUP = ['hero', 'chizuru', 'liz', 'noel', 'selene'] as const;
/** Rin and the hero on the field, Bobby met and waiting. */
const benchBobby = (g: Game) => {
  g.state.party = meet(g.state.party, 'bobby', 1);
  g.state.party = { ...g.state.party, grid: g.state.party.grid.map((c) => (c === 'bobby' ? null : c)) };
};

function setup(from?: 'formation' | 'status', lineup: readonly string[] = LEGACY_LINEUP, prep?: (g: Game) => void) {
  const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, [...lineup] as never);
  prep?.(game);
  game.state.gold = 1000;
  game.state.bag = [plainItem('iron-sword', 1)];
  game.state.nextUid = 2;
  const root = document.createElement('div');
  const go = vi.fn();
  const s = new GuildScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn(), from }, Infinity);
  s.enter(root);
  if (!from) s.onAction('confirm'); // greeting
  const opts = () => [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  const pick = (label: string) => {
    const layer = root.querySelector('.slx-layer:last-child') ?? root.querySelector('.slx-cmd')!;
    const all = [...layer.querySelectorAll('[role=option]')];
    const i = all.findIndex((o) => o.querySelector('.slx-label')!.textContent === label);
    if (i < 0) throw new Error(`no option ${label}: ${all.map((o) => o.textContent).join('/')}`);
    (all[i] as HTMLElement).click();
  };
  return { game, root, s, opts, pick, go };
}

describe('GuildScene', () => {
  it('lists the guild commands', () => {
    const { root } = setup();
    expect([...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.textContent)).toEqual(['編隊', T.ui2.guild.recall, '裝備', '狀態', '技能樹', '天賦', '離開']);
  });

  it('recall is disabled when nobody waits', () => {
    const { root } = setup();
    const o = [...root.querySelectorAll('.slx-cmd [role=option]')].find((x) => x.textContent === T.ui2.guild.recall)!;
    expect(o.getAttribute('aria-disabled')).toBe('true');
  });

  it('recall with room asks once and places her', () => {
    const { game, pick, s, root } = setup(undefined, START_LINEUP, benchBobby);
    pick(T.ui2.guild.recall);
    expect(root.textContent).toContain(T.ui2.guild.roles.bobby);   // the info panel shows the list's first entry
    pick('技師 波比');
    expect(root.textContent).toContain(T.ui2.guild.recallAsk('波比'));
    s.onAction('up');      // confirm box defaults to 否; up wraps to 是
    s.onAction('confirm');
    expect(game.state.party.grid).toContain('bobby');
    expect(root.textContent).toContain(T.ui2.guild.welcomeBack('波比'));
  });

  it('declining the confirmation changes nothing', () => {
    const { game, pick, s } = setup(undefined, START_LINEUP, benchBobby);
    pick(T.ui2.guild.recall);
    pick('技師 波比');
    s.onAction('confirm');   // the box defaults to 否
    expect(game.state.party.grid).not.toContain('bobby');
  });

  it('recall with a full field asks who steps out', () => {
    const { game, pick, s, root } = setup(undefined, HERO_LINEUP, (g) => { g.state.party = meet(g.state.party, 'bobby', 1); });
    expect(game.state.party.grid).not.toContain('bobby');
    pick(T.ui2.guild.recall);
    pick('技師 波比');
    s.onAction('up');
    s.onAction('confirm');
    expect(root.textContent).toContain(T.ui2.guild.swapWho);
    const labels = [...root.querySelectorAll('.slx-layer:last-child [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent!);
    expect(labels).toHaveLength(4);
    expect(labels.some((l) => l.includes('洛恩'))).toBe(false);   // the hero never steps out
    pick(labels[0]);
    expect(game.state.party.grid).toContain('bobby');
    expect(game.state.party.grid.filter((c) => c).length).toBe(5);
  });

  it('opens the formation, equipment and status screens', () => {
    const { pick, go } = setup();
    pick('編隊');
    expect(go).toHaveBeenLastCalledWith('formation');
    pick('裝備');
    expect(go).toHaveBeenLastCalledWith('equip');
    pick('狀態');
    expect(go).toHaveBeenLastCalledWith('status');
  });

  it('技能樹 and 天賦 open the status screen on their tab', () => {
    const { pick, go } = setup();
    pick('技能樹');
    expect(go).toHaveBeenLastCalledWith('status', 'tab:tree');
    pick('天賦');
    expect(go).toHaveBeenLastCalledWith('status', 'tab:talent');
  });

  it('skips the greeting when coming back from one of its own screens, with the cursor on that command', () => {
    const { root } = setup('formation');
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('編隊');
    const back = setup('status');
    expect(back.root.querySelector('.slx-cmd [aria-selected=true]')!.textContent).toBe('狀態');
  });
});
