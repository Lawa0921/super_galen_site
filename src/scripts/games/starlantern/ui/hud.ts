import { CHARACTERS } from '../data/characters';
import { FLOORS } from '../data/floors';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import type { Dir } from '../engine/map';
import { activeIds, statsOf } from '../engine/party';
import { button, el, meter, type UiHooks } from './dom';

const DIRS: Dir[] = ['up', 'left', 'right', 'down'];

export function renderHud(root: HTMLElement, game: Game, ui: UiHooks): void {
  const d = game.danger();
  const party = activeIds(game.state.party).map((id) => {
    const m = game.state.party.roster[id];
    const st = statsOf(m);
    return el('div', { class: m.hp > 0 ? 'sl-member' : 'sl-member sl-member--down' }, [
      el('div', { text: CHARACTERS[id].name }), meter(m.hp, st.hp, 'sl-hp'), meter(m.tp, st.tp, 'sl-tp'),
    ]);
  });
  const pad = el('div', { class: 'sl-pad' }, DIRS.map((dir) => {
    const b = button(T.map.dirs[dir], () => ui.move(dir), { class: `sl-btn sl-pad-${dir}` });
    b.dataset.dir = dir;
    return b;
  }));
  const lamps = game.state.inventory['return-lamp'] ?? 0;
  root.replaceChildren(
    el('div', { class: 'sl-row' }, [
      el('strong', { text: T.map.floor(game.floor, FLOORS[game.floor - 1].name) }),
      el('span', { class: `sl-danger sl-danger--${d}`, text: T.map.danger[d] }),
      button(T.map.returnTown, () => { if (game.returnToTown()) ui.sfx.menu(); ui.refresh(); }, { id: 'sl-return', disabled: !game.onEntrance() }),
      button(T.map.lamp(lamps), () => { if (game.useReturnLamp()) ui.sfx.menu(); ui.refresh(); }, { id: 'sl-lamp', disabled: lamps <= 0 }),
    ]),
    el('div', { class: 'sl-party' }, party),
    pad,
  );
}
