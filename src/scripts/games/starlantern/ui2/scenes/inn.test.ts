import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng, memoryStorage } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { InnScene } from './inn';
import { LEGACY_LINEUP } from '../../engine/party';

function setup(storage = memoryStorage()) {
  const game = new Game(constRng(0.5), storage, undefined, 0, LEGACY_LINEUP);
  const root = document.createElement('div');
  const sfx = { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() };
  const s = new InnScene({ game, art: NO_ART, sfx, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity, 0);
  s.enter(root);
  s.onAction('confirm');
  const opts = () => [...root.querySelectorAll('.slx-cmd [role=option]')].map((o) => o.querySelector('.slx-label')!.textContent);
  return { game, root, s, sfx, storage, opts };
}

describe('InnScene', () => {
  afterEach(() => vi.useRealTimers());

  it('rests and saves after a yes', async () => {
    const { game, s, root, storage } = setup();
    game.state.party.roster.scarlet.hp = 1;
    const gold = game.state.gold;
    s.onAction('confirm');                 // 休息
    s.onAction('up');                      // 是
    s.onAction('confirm');
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('已存檔。'));
    expect(game.state.party.roster.scarlet.hp).toBeGreaterThan(1);
    expect(game.state.gold).toBeLessThan(gold);
    expect(storage.map.get('starlantern-save')).toBeTruthy();
  });

  it('ignores every key while the night passes, and stops the night timer on exit', async () => {
    vi.useFakeTimers();
    const game = new Game(constRng(0.5), memoryStorage(), undefined, 0, LEGACY_LINEUP);
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new InnScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity, 1000);
    s.enter(root);
    s.onAction('confirm');                 // greeting
    s.onAction('confirm'); s.onAction('up'); s.onAction('confirm');   // 休息 → 是
    expect(root.querySelector('.slx-night')).not.toBeNull();
    s.onAction('cancel');
    s.onAction('confirm');
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    s.exit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('.slx-talk')!.hasAttribute('hidden')).toBe(true);   // no line typed onto a scene that has gone
  });

  it('explains when nobody needs reviving', () => {
    const { s, root } = setup();
    s.onAction('down');                    // 復活
    s.onAction('confirm');
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('大家都很有精神呢。');
    expect(root.querySelector('.slx-layer')).toBeNull();
  });

  it('revives a fallen member for gold', () => {
    const { game, s } = setup();
    game.state.party.roster.liz.hp = 0;
    s.onAction('down'); s.onAction('confirm');   // 復活
    s.onAction('confirm');                       // 莉茲
    expect(game.state.party.roster.liz.hp).toBeGreaterThan(0);
  });

  it('the inn offers 休息, 復活 and 重置配點', () => {
    const { opts } = setup();
    expect(opts()).toEqual(['休息（20 G）', '復活', '重置配點', '離開']);
  });

  it('重置配點 lists members with their price and resets after a yes', async () => {
    const { game, s, root, opts, storage } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 重置配點
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    expect(rows.map((r) => r.querySelector('.slx-label')!.textContent)).toContain('絲嘉蕾');
    expect(rows[0].textContent).toContain('25 G');
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');                                           // 絲嘉蕾
    expect(root.querySelector('.slx-confirm')!.textContent).toContain('25 G');
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });   // not before the yes
    s.onAction('up'); s.onAction('confirm');                         // 是
    expect(game.state.party.roster.scarlet.talents).toEqual({});
    expect(game.state.gold).toBe(gold - 25);
    expect(storage.map.get('starlantern-save')).toBeTruthy();   // saved
    await vi.waitFor(() => expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，點數可以重新分配了。'));
    expect(opts().length).toBe(4);
  });

  /** Opens 重置配點 and says yes for 絲嘉蕾, who has one talent point spent. */
  const respecScarlet = (r: ReturnType<typeof setup>) => {
    r.game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    r.s.onAction('down'); r.s.onAction('down'); r.s.onAction('confirm');   // 重置配點
    const rows = [...r.root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((x) => x.textContent!.includes('絲嘉蕾'));
    const from = rows.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    for (let i = from; i < at; i++) r.s.onAction('down');
    r.s.onAction('confirm');                                         // 絲嘉蕾
    r.s.onAction('up'); r.s.onAction('confirm');                     // 是
  };

  it('a respec whose save fails says so, and leaves no notice for the town', async () => {
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('denied'); } };
    const r = setup(storage);
    const gold = r.game.state.gold;
    respecScarlet(r);
    expect(r.game.state.party.roster.scarlet.talents).toEqual({});   // the reset happened in play
    expect(r.game.state.gold).toBe(gold - 25);
    await vi.waitFor(() => expect(r.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，但存檔失敗了……瀏覽器不允許儲存。'));
    expect(r.game.notice).toBeNull();
  });

  it('a respec that saves leaves no stale 已存檔 notice for the town to speak later', async () => {
    const r = setup();
    respecScarlet(r);
    await vi.waitFor(() => expect(r.root.querySelector('.slx-talk .slx-text')!.textContent).toBe('絲嘉蕾的配點已重置，點數可以重新分配了。'));
    expect(r.game.notice).toBeNull();
  });

  it('the respec list says free for a member who has one', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    game.state.party.roster.scarlet.freeRespec = true;
    game.state.party.roster.noel = { ...game.state.party.roster.noel, level: 4, tree: { 'fire-star': 1, 'ice-star': 1 } };
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');   // 重置配點
    const rows = [...root.querySelectorAll<HTMLElement>('.slx-list [role=option]')];
    const right = (name: string) => rows.find((x) => x.textContent!.includes(name))!.querySelector('.slx-right')!.textContent;
    expect(right('絲嘉蕾')).toBe('免費');
    expect(right('諾艾兒')).toBe(`${25 * 4} G`);
  });

  it('the free respec is asked without a price, costs nothing and is used up', () => {
    const r = setup();
    r.game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    r.game.state.party.roster.scarlet.freeRespec = true;
    r.s.onAction('down'); r.s.onAction('down'); r.s.onAction('confirm');   // 重置配點
    const rows = [...r.root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((x) => x.textContent!.includes('絲嘉蕾'));
    const from = rows.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    for (let i = from; i < at; i++) r.s.onAction('down');
    r.s.onAction('confirm');                                         // 絲嘉蕾
    const ask = r.root.querySelector('.slx-confirm')!.textContent!;
    expect(ask).toContain('免費');
    expect(ask).not.toContain(' G');
    const gold = r.game.state.gold;
    r.s.onAction('up'); r.s.onAction('confirm');                     // 是
    expect(r.game.state.party.roster.scarlet.talents).toEqual({});
    expect(r.game.state.gold).toBe(gold);
    expect(r.game.state.party.roster.scarlet).not.toHaveProperty('freeRespec');
  });

  it('the respec list greys out members with nothing spent', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    const rows = [...root.querySelectorAll<HTMLElement>('.slx-list [role=option]')];
    const scarlet = rows.find((x) => x.textContent!.includes('絲嘉蕾'))!;
    expect(scarlet.getAttribute('aria-disabled')).not.toBe('true');
    expect(rows.filter((x) => x !== scarlet).every((x) => x.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(scarlet.getAttribute('aria-selected')).toBe('true');                 // the cursor starts on one that can be reset
  });

  it('with nobody to reset, 重置配點 says so without opening the list', () => {
    const { s, root, game } = setup();
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    expect(root.querySelector('.slx-list')).toBeNull();
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toBe('還沒有配過點，不需要重置。');
    expect(game.state.gold).toBe(150);
  });

  it('no leaves everything as it was', () => {
    const { game, s, root } = setup();
    game.state.party.roster.scarlet.talents = { 'scarlet-t01': 1 };
    const gold = game.state.gold;
    s.onAction('down'); s.onAction('down'); s.onAction('confirm');
    const rows = [...root.querySelectorAll('.slx-list [role=option]')];
    const at = rows.findIndex((r) => r.textContent!.includes('絲嘉蕾'));
    for (let i = 0; i < at; i++) s.onAction('down');
    s.onAction('confirm');
    s.onAction('confirm');                                           // cursor starts on 否
    expect(game.state.party.roster.scarlet.talents).toEqual({ 'scarlet-t01': 1 });
    expect(game.state.gold).toBe(gold);
  });
});
