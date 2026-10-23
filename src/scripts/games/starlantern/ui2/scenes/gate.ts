import { CONDITIONS } from '../../data/conditions';
import { ENEMIES } from '../../data/enemies';
import { FLOORS } from '../../data/floors';
import { MATERIALS } from '../../data/materials';
import { SETS, SPECIALS, codexName, generalLegendaries, regionSpecials } from '../../data/gear';
import { REGIONS, type RegionId } from '../../data/regions';
import { rescuesFor } from '../../data/meetings';
import { leadOpen, nextLead } from '../../engine/story/leads';
import { storyStage } from '../../engine/story/events';
import { T } from '../../data/text.zh-TW';
import { capacity, carried, formatWeight } from '../../data/weights';
import { materialUses } from '../../engine/forge/uses';
import { BAG_SIZE } from '../../engine/loot/bag';
import { startDepths, terrainOf, type Portal } from '../../engine/dungeon/run';
import type { SceneId } from '../../data/story/scenes';
import { REGION_TRAITS_FROM, depthLevel, encounterTable } from '../../engine/scaling';
import { ART_BASE, art, codexArtId } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

export type TraitIcon = 'fire' | 'ice' | 'thunder' | 'poison' | 'shade' | 'iron';
const TRAIT_ICON: Partial<Record<RegionId, TraitIcon>> = { blaze: 'fire', frost: 'ice', storm: 'thunder', mire: 'poison', shade: 'shade', iron: 'iron' };

/**
 * Runtime paths of the portal art (art-factory contract, plan 4 Task 10). The art is generated but not approved: until a
 * file is published and listed in the manifest, `ctx.art.has` is false and the plaza shows words only.
 */
export const portalArt = {
  plaza: `${ART_BASE}/scene/portal-plaza.png`,
  card: (region: RegionId) => `${ART_BASE}/portal/${region}.png`,
  trait: (k: TraitIcon) => `${ART_BASE}/icon/trait-${k}.png`,
};

/** Names of the monsters a portal can show, from depth 1 to the deepest the region has been reached (the floors that exist so far). */
function monsterNames(region: RegionId, reached: number): string[] {
  const deepest = Math.min(Math.max(1, reached), FLOORS.length);
  const ids = new Set<string>();
  for (let d = 1; d <= deepest; d++) for (const group of encounterTable(region, d)) for (const id of group) ids.add(id);
  return [...ids].map((id) => ENEMIES[id]?.name ?? id);
}

/** Ids a regional card lists: its special items and its set. */
function gearIds(region: RegionId): string[] {
  return [...regionSpecials(region).map((s) => s.id), ...Object.values(SETS).filter((s) => s.region === region).map((s) => s.id)];
}

/** The departure confirm warns when the town bag has fewer free slots than this. */
const BAG_LOW = 5;

/** Three portal cards side by side: ←→ or the pointer chooses, Enter or a click goes in. */
class PortalCards {
  readonly el: HTMLElement;
  private cards: HTMLElement[];
  cursor = 0;

  constructor(private ctx: SceneCtx, portals: Portal[], private on: { pick(i: number): void; cancel(): void }) {
    this.cards = portals.map((p, i) => this.card(p, i));
    const row = el('div', { class: 'slx-portal-row', attrs: { role: 'listbox', 'aria-label': T.ui2.gate.choose } }, this.cards);
    this.el = el('div', { class: 'slx-portals' }, [row, el('p', { class: 'slx-portal-hint', text: T.ui2.gate.hint })]);
    this.render();
  }

  /** A region-only item's full name: until obtained it reads 「（未取得）」 after it; once in the codex it shows rarity. */
  private gearName(id: string): string {
    const rarity = SPECIALS[id]?.rarity ?? 'set';
    const known = this.ctx.game.state.codex.includes(id);
    return known && rarity !== 'set' ? `${codexName(id)}・${T.rarity[rarity]}` : known ? codexName(id) : T.ui2.gate.unknownGear(codexName(id));
  }

  private gearItem(id: string): HTMLElement {
    const rarity = SPECIALS[id]?.rarity ?? 'set';
    const known = this.ctx.game.state.codex.includes(id);
    // The names run on one line joined by 、 (legibility T3: the card fits at 12px). An unknown piece is its dim colour, its
    // silhouette in the strip above, its full 「（未取得）」 name as the tooltip, and a visible 「未取得」 tag after the name, so
    // a touch player reads it too (final review).
    return el('span', { class: `slx-codex-item slx-rarity-${rarity}${known ? '' : ' slx-codex-unknown'}`, attrs: { 'data-special': id, ...(known ? {} : { title: this.gearName(id) }) } }, [
      el('span', { class: 'slx-codex-name', text: known ? this.gearName(id) : codexName(id) }),
      ...(known ? [] : [el('span', { class: 'slx-codex-tag', text: T.ui2.gate.unknownTag })]),
    ]);
  }

  /**
   * The 限定裝備 heading with the pictures of the region's items in one strip, in list order, each named on hover. A
   * picture once published: the gear icon when obtained (a set shows its first piece), else only its silhouette file, so
   * the real icon is never requested before the piece is found. One strip, not a 28px picture on every name line, so all
   * three names still fit the card.
   */
  private gearHead(ids: string[]): HTMLElement {
    const known = (id: string) => this.ctx.game.state.codex.includes(id);
    const pics = ids.flatMap((id) => {
      const src = known(id) ? art.gear(codexArtId(id)) : art.gearSilhouette(id);
      return this.ctx.art.has(src)
        ? [el('img', { class: known(id) ? 'slx-codex-icon' : 'slx-codex-silhouette', attrs: { src, alt: '', title: this.gearName(id), 'data-special': id } })]
        : [];
    });
    return el('div', { class: 'slx-portal-gear-head' }, [
      // The count says what is obtained in words too, whatever art is published (T3 review).
      el('div', { class: 'slx-portal-label', text: T.ui2.gate.gearCount(ids.filter(known).length, ids.length) }),
      ...(pics.length ? [el('div', { class: 'slx-codex-pics' }, pics)] : []),
    ]);
  }

  /** The mainline's summary: the general legendaries drop anywhere, so they are counted, not listed as this portal's own. */
  private generalLine(): HTMLElement {
    const all = generalLegendaries();
    const got = all.filter((s) => this.ctx.game.state.codex.includes(s.id)).length;
    return el('div', { class: 'slx-portal-general', text: T.ui2.gate.general(got, all.length) });
  }

  /** What the region material is for, from `materialUses` in its short form (the card is narrow); the full wording is the tooltip. */
  private dropUse(material: string): HTMLElement {
    const uses = materialUses(material);
    const short = [...new Set(uses.map(T.forge.useShort))].join('、');
    return el('div', { class: 'slx-portal-drop-use', text: T.ui2.gate.dropUse(short), attrs: { title: T.forge.usedFor(uses.map(T.forge.use).join('、')) } });
  }

  /**
   * Someone sighted beyond this portal (6c Task 16), beside the portal's name so the card keeps its height: 「目擊・第三層」, or
   * on the portal of the guild's lead 「線索・第三層」 in gold. A region shows whoever is still unmet there, once the guild has
   * word from the regions at all (`leadOpen`, lore ledger I-124: not in the prologue, final review M-3); the main road (always
   * offered) only its lead, so it does not outshout the region's.
   */
  private sighting(region: RegionId): { lead: boolean; el: HTMLElement[] } {
    const s = this.ctx.game.state;
    const lead = nextLead(s);
    const isLead = lead?.region === region;
    const depths = Object.keys(rescuesFor(region, s.party.recruited)).map(Number);
    const heard = leadOpen({ region }, storyStage(s));
    const depth = isLead ? lead!.depth : region === 'mainline' || !heard || !depths.length ? null : Math.min(...depths);
    if (depth === null) return { lead: false, el: [] };
    const G = T.ui2.gate;
    const text = isLead ? G.leadAt(depth) : G.sighted(depth);
    const mark = el('span', { class: isLead ? 'slx-portal-sighting slx-portal-lead-tag' : 'slx-portal-sighting', attrs: isLead ? { title: G.lead } : {} }, [
      el('span', { class: 'slx-portal-sighting-depth', text }),
    ]);
    return { lead: isLead, el: [mark] };
  }

  private card(p: Portal, i: number): HTMLElement {
    const G = T.ui2.gate;
    const r = REGIONS[p.region];
    const cond = CONDITIONS[p.condition];
    const reached = this.ctx.game.state.dungeon.reached[p.region];
    const has = (u: string) => this.ctx.art.has(u);
    const icon = TRAIT_ICON[p.region];
    const traitIcon = icon && has(portalArt.trait(icon)) ? [el('img', { class: 'slx-portal-icon', attrs: { src: portalArt.trait(icon), alt: '' } })] : [];
    const traitText = `${G.element(r.element ? T.element[r.element] : null)}・${r.trait ? G.traits[r.trait] : G.noTrait}`;
    const els = (list: string[]) => list.map((e) => T.element[e as keyof typeof T.element]).join('、');
    // A run that can only start at depth 1 meets the region resist from REGION_TRAITS_FROM on (scaling.scaleEnemy), so the card says so.
    const firstOnly = startDepths(p.region, reached).every((d) => d < REGION_TRAITS_FROM);
    const resist = r.resist.length ? (firstOnly ? G.resistFrom(els(r.resist), REGION_TRAITS_FROM) : G.resist(els(r.resist))) : '';
    const affinity = [r.weak.length ? G.weak(els(r.weak)) : '', resist].filter(Boolean).join('　');
    const seen = this.sighting(p.region);
    const c = win(`slx-portal slx-portal-${p.region}${seen.lead ? ' slx-portal-lead' : ''}`, [
      ...(has(portalArt.card(p.region)) ? [el('img', { class: 'slx-portal-art', attrs: { src: portalArt.card(p.region), alt: '' } })] : []),
      el('div', { class: 'slx-portal-head' }, [el('div', { class: 'slx-portal-name', text: r.name }), ...seen.el]),
      el('div', { class: 'slx-portal-trait', attrs: { 'data-trait': icon ?? 'none' } }, [...traitIcon, el('span', { text: traitText })]),
      ...(affinity ? [el('div', { class: 'slx-portal-affinity', text: affinity })] : []),
      el('div', { class: 'slx-portal-monsters' }, [el('span', { class: 'slx-portal-label', text: G.monsters }), el('span', { text: monsterNames(p.region, reached).join('、') })]),
      // 本次狀況, the condition's gold name and its effect (final review: the label stays on screen).
      el('div', { class: 'slx-portal-cond' }, [el('span', { class: 'slx-portal-label', text: G.condition }), el('b', { text: cond.name }), el('span', { class: 'slx-portal-desc', text: cond.desc })]),
      el('div', { class: 'slx-portal-drop', text: G.drop(r.material ? MATERIALS[r.material]?.name ?? r.material : G.commonDrop) }),
      ...(r.material ? [this.dropUse(r.material)] : []),
      ...(p.region === 'mainline' ? [this.generalLine()] : [
        el('div', { class: 'slx-portal-gear' }, [this.gearHead(gearIds(p.region)), ...gearIds(p.region).map((id) => this.gearItem(id))]),
        el('div', { class: 'slx-codex-more', text: G.moreGear, attrs: { hidden: '' } }),
      ]),
      el('div', { class: 'slx-portal-depth', text: reached > 0 ? G.deepest(reached) : G.notYet }),
    ]);
    c.setAttribute('role', 'option');
    c.setAttribute('data-region', p.region);
    // Same pointer rules as MenuView: pointermove (not enter) so a window opening under a resting mouse keeps the cursor.
    c.addEventListener('pointermove', () => { if (!this.locked() && this.cursor !== i) { this.cursor = i; this.render(); this.ctx.sfx.cursor(); } });
    c.addEventListener('click', () => { if (this.locked()) return; this.cursor = i; this.render(); this.on.pick(i); });
    return c;
  }

  /** Once the cards are on screen: a list longer than its card (everything obtained) says it scrolls. */
  markOverflow(): void {
    for (const c of this.cards) {
      const list = c.querySelector<HTMLElement>('.slx-portal-gear');
      const more = c.querySelector<HTMLElement>('.slx-codex-more');
      if (list && more) more.hidden = list.scrollHeight <= list.clientHeight + 1;
    }
  }

  private locked(): boolean {
    return !!this.el.closest('[inert]');
  }

  private render(): void {
    this.cards.forEach((c, i) => {
      c.setAttribute('aria-selected', String(i === this.cursor));
      c.classList.toggle('slx-portal-on', i === this.cursor);
    });
  }

  onAction(a: UiAction): boolean {
    const n = this.cards.length;
    if (a === 'left' || a === 'right') {
      this.cursor = (this.cursor + (a === 'right' ? 1 : -1) + n) % n;
      this.render();
      this.ctx.sfx.cursor();
      return true;
    }
    if (a === 'confirm') { this.on.pick(this.cursor); return true; }
    if (a === 'cancel') { this.on.cancel(); return true; }
    if (a === 'up' || a === 'down') {
      // The chosen card's gear list scrolls when it is longer than the card (everything obtained).
      const list = this.cards[this.cursor].querySelector<HTMLElement>('.slx-portal-gear');
      if (list) list.scrollTop += a === 'down' ? 28 : -28;
      return true;
    }
    return false;
  }
}

/** The portal plaza: three portals (the mainline first), a start depth, a confirmation, then into the labyrinth. */
export class GateScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'gate', cps); }

  protected sceneArt(): string {
    return this.ctx.art.has(portalArt.plaza) ? portalArt.plaza : art.scene('gate');
  }

  protected commands(): MenuItem[] {
    const reroll = this.ctx.game.canReroll() ? [{ id: 'reroll', label: T.ui2.gate.reroll }] : [];
    return [{ id: 'portals', label: T.ui2.gate.choose }, ...reroll];
  }

  protected onCommand(id?: string): void {
    if (id === 'reroll') {
      this.ctx.game.rerollPortals();
      this.refresh();
      return;
    }
    const portals = this.ctx.game.state.dungeon.portals;
    const cards = new PortalCards(this.ctx, portals, {
      pick: (i) => { this.ctx.sfx.confirm(); this.chooseDepth(portals[i]); },
      cancel: () => this.pop(),
    });
    this.push({ el: cards.el, onAction: (a) => cards.onAction(a) });
    cards.markOverflow();
  }

  /** Depth 1 or a reached multiple of 5 (the mainline keeps a shortcut to every floor reached). */
  private chooseDepth(p: Portal): void {
    const depths = startDepths(p.region, this.ctx.game.state.dungeon.reached[p.region]);
    const items = depths.map((d) => ({
      id: String(d), label: T.ui2.gate.floor(d, p.region === 'mainline' ? FLOORS[terrainOf('mainline', d) - 1].name : undefined),
      icon: this.ctx.art.has(art.bg(terrainOf(p.region, d))) ? art.bg(terrainOf(p.region, d)) : undefined,
      right: T.ui2.gate.suggest(depthLevel(d)),
    }));
    const v = new MenuView(new Menu(items), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askDepart(p, Number(it.id)); },
      moved: () => this.ctx.sfx.cursor(),
      cancel: () => this.pop(),
    }, 6);
    this.push({ el: win('slx-depths', [el('div', { class: 'slx-who', text: `${REGIONS[p.region].name}　${T.ui2.gate.depthTitle}` }), v.el]), onAction: (a) => v.onAction(a) });
  }

  /**
   * The departure's own scenes, in order (`Game.departScenes`). Story L spec §4.8: once the eve's line is said, its memories
   * (`Game.eve`) are told as a night, under the night's card, with a beat between two.
   */
  private async departure(ids: SceneId[]): Promise<void> {
    for (const id of ids) {
      await this.play(id);
      if (id === 'finale-eve') await this.tellNight([...this.ctx.game.eve]);
    }
  }

  private askDepart(p: Portal, n: number): void {
    const box = confirmBox(T.ui2.gate.ask(REGIONS[p.region].name, n, CONDITIONS[p.condition].name), (yes) => {
      this.pop();
      if (!yes) return;
      // Story depth plan ruling 7: a departure that may go first plays the scenes it owes (story L: the night before the
      // descent, then the lone morning), with every window closed so the dialogue box is not under the cards; refused,
      // nothing plays and the scenes keep waiting.
      const refused = this.ctx.game.departCheck(p, n);
      if (refused) { this.popAll(); this.fail(refused); return; }
      const owed = this.ctx.game.departScenes();
      const go = (): void => {
        const r = this.ctx.game.depart(p, n);
        if (!r.ok) { this.popAll(); this.fail(r.reason); return; }
        this.ctx.go('dungeon');
      };
      if (!owed.length) { go(); return; }
      this.popAll();
      void this.departure(owed).then(go);
    });
    // Over the limit before setting out (the consumables alone): say so, but let the party go.
    const now = carried(this.ctx.game.state), cap = capacity(this.ctx.game.state.party);
    if (now > cap) box.view.el.before(el('p', { class: 'slx-confirm-warn', text: T.ui2.gate.heavy(formatWeight(now), formatWeight(cap)) }));
    // Fewer than BAG_LOW free bag slots: gear that does not fit will have to stay in its chest. Say so, but let the party go.
    const free = BAG_SIZE - this.ctx.game.state.bag.length;
    if (free < BAG_LOW) box.view.el.before(el('p', { class: 'slx-confirm-warn', text: T.ui2.gate.bagLow(Math.max(0, free)) }));
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
}
