import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { FLOORS } from '../data/floors';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { T } from '../data/text.zh-TW';
import type { Game } from '../engine/game';
import { recruit, setFormation, statsOf } from '../engine/party';
import { buy, equip, innCost, isUnlocked, reviveCost, revive, sell, unequip, type TownResult } from '../engine/town';
import type { CharacterId, Slot } from '../engine/types';
import { iconImg, portraitImg, standeeImg } from './art';
import { button, el, itemName, meter, present, type UiHooks } from './dom';

export type TownTab = 'guild' | 'shop' | 'inn' | 'depart';
let tab: TownTab = 'guild';
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

function report(r: TownResult, ui: UiHooks): void {
  if (!r.ok) { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
  else ui.sfx.menu();
  ui.refresh();
}

function guild(game: Game, ui: UiHooks): HTMLElement {
  const p = game.state.party;
  const slots = [...p.front, ...p.back];
  const selects = slots.map((cur, i) => {
    const s = el('select', { attrs: { 'aria-label': i < 3 ? T.guild.front(i + 1) : T.guild.back(i - 2) } });
    s.append(el('option', { text: T.guild.none, attrs: { value: '' } }));
    for (const id of p.recruited) s.append(el('option', { text: CHARACTERS[id].name, attrs: { value: id } }));
    s.value = cur ?? '';
    s.addEventListener('change', () => {
      const ids = selects.map((x) => (x.value || null) as CharacterId | null);
      const r = setFormation(game.state.party, ids.slice(0, 3), ids.slice(3));
      if (r.ok) { game.state.party = r.party; ui.sfx.menu(); }
      else { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
      ui.refresh();
    });
    return s;
  });
  const formation = el('div', { class: 'sl-formation' }, [
    el('h3', { text: T.guild.formation }),
    el('div', { class: 'sl-row' }, selects.slice(0, 3).map((s, i) => el('label', {}, [T.guild.front(i + 1), s]))),
    el('div', { class: 'sl-row' }, selects.slice(3).map((s, i) => el('label', {}, [T.guild.back(i + 1), s]))),
  ]);
  const recruits = el('div', { class: 'sl-row' }, CHARACTER_IDS.filter((id) => !p.recruited.includes(id)).map((id) =>
    button(T.guild.recruit(CHARACTERS[id].title, CHARACTERS[id].name), () => {
      game.state.party = recruit(game.state.party, id);
      ui.sfx.menu();
      ui.refresh();
    }, { id: `sl-recruit-${id}` })));
  for (const b of recruits.querySelectorAll<HTMLButtonElement>('button')) {
    const face = portraitImg(ui.art, b.id.slice('sl-recruit-'.length), 1, 1);
    if (face) b.prepend(face);
  }
  const members = p.recruited.map((id) => {
    const m = p.roster[id];
    const st = statsOf(m);
    const gear = SLOTS.map((slot) => {
      const s = el('select', { attrs: { 'aria-label': `${CHARACTERS[id].name} ${T.slot[slot]}` } });
      s.append(el('option', { text: m.equip[slot] ? itemName(m.equip[slot]!) : T.guild.unequipped, attrs: { value: m.equip[slot] ?? '' } }));
      if (m.equip[slot]) s.append(el('option', { text: T.guild.unequipped, attrs: { value: '' } }));
      for (const [eid, n] of Object.entries(game.state.inventory)) {
        if (EQUIPMENT[eid]?.slot === slot && n > 0) s.append(el('option', { text: `${itemName(eid)} ×${n}`, attrs: { value: eid } }));
      }
      s.addEventListener('change', () => report(s.value ? game.apply(equip(game.state, id, s.value)) : game.apply(unequip(game.state, id, slot)), ui));
      return el('label', {}, [T.slot[slot], s]);
    });
    return el('article', { class: 'sl-card' }, [
      ...present([standeeImg(ui.art, id)]),
      el('h4', { text: `${CHARACTERS[id].title} ${CHARACTERS[id].name} ${T.guild.level(m.level)}` }),
      el('div', { class: 'sl-bars' }, [`HP ${m.hp}/${st.hp}`, meter(m.hp, st.hp, 'sl-hp'), `TP ${m.tp}/${st.tp}`, meter(m.tp, st.tp, 'sl-tp')]),
      el('p', { class: 'sl-stats', text: (['atk', 'def', 'mag', 'res', 'spd'] as const).map((k) => `${T.stat[k]} ${st[k]}`).join('　') }),
      el('div', { class: 'sl-row' }, gear),
    ]);
  });
  return el('div', {}, [formation, recruits, el('h3', { text: T.guild.members }), el('div', { class: 'sl-cards' }, members)]);
}

function shop(game: Game, ui: UiHooks): HTMLElement {
  const mats = Object.entries(game.state.inventory).filter(([id, n]) => MATERIALS[id] && n > 0);
  const sellList = mats.length
    ? mats.map(([id, n]) => el('div', { class: 'sl-row' }, [
      ...present([iconImg(ui.art, id)]),
      `${T.shop.price(MATERIALS[id].name, MATERIALS[id].price)} ×${n}`,
      button(T.shop.sellOne, () => report(game.apply(sell(game.state, id, 1)), ui), { id: `sl-sell-${id}` }),
      button(T.shop.sellAll, () => report(game.apply(sell(game.state, id, n)), ui), { id: `sl-sell-all-${id}` }),
    ]))
    : [el('p', { text: T.shop.nothing })];
  const goods = [...Object.values(ITEMS), ...Object.values(EQUIPMENT)].map((g) => {
    const icon = iconImg(ui.art, g.id);
    const locked = 'slot' in g && !isUnlocked(game.state, g.id);
    const need = locked ? (g.unlock ?? []).map((u) => T.shop.needs(MATERIALS[u.mat].name, u.qty)).join('、') : '';
    return el('div', { class: 'sl-row' }, [
      ...present([icon]),
      button(T.shop.price(g.name, g.price), () => report(game.apply(buy(game.state, g.id)), ui), { id: `sl-buy-${g.id}`, disabled: locked }),
      el('span', { class: 'sl-note', text: need || `${game.state.inventory[g.id] ?? 0}` }),
    ]);
  });
  return el('div', {}, [el('h3', { text: T.shop.sell }), ...sellList, el('h3', { text: T.shop.buy }), ...goods]);
}

function inn(game: Game, ui: UiHooks): HTMLElement {
  const p = game.state.party;
  const dead = p.recruited.filter((id) => p.roster[id].hp <= 0);
  return el('div', {}, [
    button(T.inn.rest(innCost(p)), () => report(game.rest(), ui), { id: 'sl-rest' }),
    ...dead.map((id) => button(T.inn.revive(CHARACTERS[id].name, reviveCost(p.roster[id].level)),
      () => report(game.apply(revive(game.state, id)), ui), { id: `sl-revive-${id}` })),
  ]);
}

function depart(game: Game, ui: UiHooks): HTMLElement {
  return el('div', {}, FLOORS.filter((f) => f.id <= game.state.dungeon.reachedFloor).map((f) =>
    button(T.departTo(f.id, f.name), () => {
      const r = game.depart(f.id);
      if (!r.ok) { ui.say(T.reasons[r.reason]); ui.sfx.bump(); }
      ui.refresh();
    }, { id: `sl-depart-${f.id}` })));
}

export function renderTown(root: HTMLElement, game: Game, ui: UiHooks): void {
  const tabs = (Object.keys(T.tabs) as TownTab[]).map((t) => {
    const b = button(T.tabs[t], () => { tab = t; ui.refresh(); }, { id: `sl-tab-${t}`, class: t === tab ? 'sl-tab sl-tab--on' : 'sl-tab' });
    b.setAttribute('aria-pressed', String(t === tab));
    return b;
  });
  const body = tab === 'guild' ? guild(game, ui) : tab === 'shop' ? shop(game, ui) : tab === 'inn' ? inn(game, ui) : depart(game, ui);
  root.replaceChildren(el('nav', { class: 'sl-tabs' }, tabs), el('div', { class: 'sl-panel' }, [body]));
}
