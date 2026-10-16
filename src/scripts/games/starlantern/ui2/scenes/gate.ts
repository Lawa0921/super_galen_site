import { CONDITIONS } from '../../data/conditions';
import { ENEMIES } from '../../data/enemies';
import { FLOORS } from '../../data/floors';
import { MATERIALS } from '../../data/materials';
import { REGIONS, type RegionId } from '../../data/regions';
import { T } from '../../data/text.zh-TW';
import { startDepths, terrainOf, type Portal } from '../../engine/dungeon/run';
import { depthLevel, encounterTable } from '../../engine/scaling';
import { ART_BASE, art } from '../../render/artPaths';
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
    const affinity = [r.weak.length ? G.weak(els(r.weak)) : '', r.resist.length ? G.resist(els(r.resist)) : ''].filter(Boolean).join('　');
    const c = win(`slx-portal slx-portal-${p.region}`, [
      ...(has(portalArt.card(p.region)) ? [el('img', { class: 'slx-portal-art', attrs: { src: portalArt.card(p.region), alt: '' } })] : []),
      el('div', { class: 'slx-portal-name', text: r.name }),
      el('div', { class: 'slx-portal-trait', attrs: { 'data-trait': icon ?? 'none' } }, [...traitIcon, el('span', { text: traitText })]),
      ...(affinity ? [el('div', { class: 'slx-portal-affinity', text: affinity })] : []),
      el('div', { class: 'slx-portal-label', text: G.monsters }),
      el('div', { class: 'slx-portal-monsters', text: monsterNames(p.region, reached).join('、') }),
      el('div', { class: 'slx-portal-cond' }, [el('span', { class: 'slx-portal-label', text: G.condition }), el('b', { text: cond.name })]),
      el('div', { class: 'slx-portal-desc', text: cond.desc }),
      el('div', { class: 'slx-portal-drop', text: G.drop(r.material ? MATERIALS[r.material]?.name ?? r.material : G.commonDrop) }),
      el('div', { class: 'slx-portal-gear', text: G.gear }),
      el('div', { class: 'slx-portal-depth', text: reached > 0 ? G.deepest(reached) : G.notYet }),
    ]);
    c.setAttribute('role', 'option');
    c.setAttribute('data-region', p.region);
    // Same pointer rules as MenuView: pointermove (not enter) so a window opening under a resting mouse keeps the cursor.
    c.addEventListener('pointermove', () => { if (!this.locked() && this.cursor !== i) { this.cursor = i; this.render(); this.ctx.sfx.cursor(); } });
    c.addEventListener('click', () => { if (this.locked()) return; this.cursor = i; this.render(); this.on.pick(i); });
    return c;
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
    return a === 'up' || a === 'down';
  }
}

/** The portal plaza: three portals (the mainline first), a start depth, a confirmation, then into the labyrinth. */
export class GateScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'gate', cps); }

  protected sceneArt(): string {
    return this.ctx.art.has(portalArt.plaza) ? portalArt.plaza : art.scene('gate');
  }

  protected commands(): MenuItem[] {
    return [{ id: 'portals', label: T.ui2.gate.choose }];
  }

  protected onCommand(): void {
    const portals = this.ctx.game.state.dungeon.portals;
    const cards = new PortalCards(this.ctx, portals, {
      pick: (i) => { this.ctx.sfx.confirm(); this.chooseDepth(portals[i]); },
      cancel: () => this.pop(),
    });
    this.push({ el: cards.el, onAction: (a) => cards.onAction(a) });
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

  private askDepart(p: Portal, n: number): void {
    const box = confirmBox(T.ui2.gate.ask(REGIONS[p.region].name, n, CONDITIONS[p.condition].name), (yes) => {
      this.pop();
      if (!yes) return;
      const r = this.ctx.game.depart(p, n);
      if (!r.ok) { this.popAll(); this.fail(r.reason); return; }
      this.ctx.go('dungeon');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }
}
