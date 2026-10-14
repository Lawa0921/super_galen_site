import { describe, expect, it } from 'vitest';
import { createMatch } from './engine';
import { HudLists } from './hud-lists';

function setup() {
  const feed = document.createElement('div'), scores = document.createElement('tbody');
  return { feed, scores, hud: new HudLists(feed, scores), match: createMatch('attack') };
}

describe('HUD list updates', () => {
  it('keeps unchanged score cells and feed nodes across simulation updates', () => {
    const { feed, scores, hud, match } = setup();
    match.feed.push({ text: 'KESTREL › VIPER', at: 0, team: 'attack' });
    hud.update(match);
    const cell = scores.querySelector('td'), event = feed.firstChild;
    for (let i = 0; i < 30; i++) { match.time += .08; hud.update(match); }
    expect(scores.querySelector('td')).toBe(cell);
    expect(feed.firstChild).toBe(event);
  });
  it('updates kills, deaths, status and a new match team without replacing actor rows', () => {
    const { scores, hud, match } = setup(); hud.update(match);
    const row = scores.firstElementChild!;
    match.actors[0].kills = 2; match.actors[0].deaths = 1; match.actors[0].hp = 0;
    hud.update(match);
    expect([...row.children].map(c => c.textContent)).toEqual(['你', '攻方', '2', '1', '陣亡']);
    hud.update(createMatch('defend'));
    expect(scores.firstElementChild).toBe(row);
    expect([...row.children].map(c => c.textContent)).toEqual(['你', '守方', '0', '0', '作戰中']);
    expect(scores.children).toHaveLength(6);
  });
  it('expires messages exactly at six seconds and clears them for a new match', () => {
    const { feed, hud, match } = setup();
    match.feed.push({ text: 'first', at: 0, team: 'attack' }, { text: 'second', at: 1, team: 'defend' });
    match.time = 5.99; hud.update(match); expect(feed.children).toHaveLength(2);
    match.time = 6; hud.update(match); expect(feed.textContent).toBe('second');
    hud.update(createMatch('defend')); expect(feed.children).toHaveLength(0);
  });
});
