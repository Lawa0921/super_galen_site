import { CHARACTERS, CHARACTER_IDS } from '../../data/characters';
import { EQUIPMENT } from '../../data/equipment';
import { SKILLS } from '../../data/skills';
import { T } from '../../data/text.zh-TW';
import { ULTIMATES } from '../../data/ultimates';
import { learnedSkills, recruit, setFormation, statsOf } from '../../engine/party';
import { equip, unequip } from '../../engine/town';
import type { CharacterId, Slot } from '../../engine/types';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import { portraitImg, standeeImg } from '../../ui/art';
import { Menu, type MenuItem } from '../menu';
import type { SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';
import { FacilityScene } from './facility';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const name = (id: CharacterId) => CHARACTERS[id].name;

export class GuildScene extends FacilityScene {
  constructor(ctx: SceneCtx, cps?: number) { super(ctx, 'guild', cps); }

  protected commands(): MenuItem[] {
    const g = T.ui2.guild;
    const canRecruit = CHARACTER_IDS.some((id) => !this.ctx.game.state.party.recruited.includes(id));
    return [{ id: 'formation', label: g.formation }, { id: 'recruit', label: g.recruit, disabled: !canRecruit }, { id: 'equip', label: g.equip }, { id: 'status', label: g.status }];
  }

  protected onCommand(id: string): void {
    if (id === 'formation') this.formation();
    if (id === 'recruit') this.recruitList();
    if (id === 'equip') this.pickMember((m) => this.slots(m));
    if (id === 'status') this.pickMember((m) => this.status(m));
  }

  private list(items: MenuItem[], pick: (it: MenuItem) => void, cls = '', start = 0): MenuView {
    const v = new MenuView(new Menu(items, start), { pick: (it) => { this.ctx.sfx.confirm(); pick(it); }, moved: () => this.ctx.sfx.cursor(), cancel: () => this.pop() });
    this.push({ el: win(`slx-list ${cls}`, [v.el]), onAction: (a) => v.onAction(a) });
    return v;
  }

  private faceIcon(id: CharacterId): string | undefined {
    return this.ctx.art.has(art.portrait(id, 'normal')) ? art.portrait(id, 'normal') : undefined;
  }

  private formation(keep = 0): void {
    const p = this.ctx.game.state.party;
    const g = T.ui2.guild;
    const slots = [...p.front.map((id, i) => ({ row: 'front' as const, i, id })), ...p.back.map((id, i) => ({ row: 'back' as const, i, id }))];
    this.list(slots.map((s, k) => ({
      id: String(k), icon: s.id ? this.faceIcon(s.id) : undefined,
      label: (s.row === 'front' ? g.front : g.back)(s.i + 1, s.id ? name(s.id) : g.empty),
    })), (it) => this.chooseFor(slots, Number(it.id)), 'slx-formation', keep);
  }

  private chooseFor(slots: { row: 'front' | 'back'; i: number; id: CharacterId | null }[], k: number): void {
    const p = this.ctx.game.state.party;
    const items: MenuItem[] = [...p.recruited.map((id) => ({ id, label: name(id), icon: this.faceIcon(id) })), { id: '', label: T.ui2.guild.empty }];
    this.list(items, (it) => {
      const chosen = (it.id || null) as CharacterId | null;
      const ids = slots.map((s) => s.id);
      const from = chosen ? ids.indexOf(chosen) : -1;
      if (from >= 0) ids[from] = ids[k];
      ids[k] = chosen;
      const r = setFormation(p, ids.slice(0, 3), ids.slice(3));
      this.popAll();
      if (!r.ok) { this.fail(r.reason); this.formation(k); return; }
      this.ctx.game.state.party = r.party;
      this.formation(k);
    });
  }

  private recruitList(): void {
    const p = this.ctx.game.state.party;
    const ids = CHARACTER_IDS.filter((id) => !p.recruited.includes(id));
    const info = win('slx-info');
    const show = (id: CharacterId | undefined) => {
      if (!id) return;
      info.replaceChildren(...[standeeImg(this.ctx.art, id)].filter((n): n is HTMLImageElement => !!n),
        el('p', { text: `${CHARACTERS[id].title} ${name(id)}` }), el('p', { class: 'slx-desc', text: T.ui2.guild.roles[id] }));
    };
    const v = new MenuView(new Menu(ids.map((id) => ({ id, label: `${CHARACTERS[id].title} ${name(id)}`, icon: this.faceIcon(id) }))), {
      pick: (it) => { this.ctx.sfx.confirm(); this.askRecruit(it.id as CharacterId); },
      moved: () => { this.ctx.sfx.cursor(); show(v.menu.current()?.id as CharacterId); },
      cancel: () => { info.remove(); this.pop(); },
    });
    show(ids[0]);
    this.stage.append(info);
    this.push({ el: win('slx-list', [v.el]), onAction: (a) => v.onAction(a) });
  }

  private askRecruit(id: CharacterId): void {
    const box = confirmBox(T.ui2.guild.ask(name(id)), (yes) => {
      this.pop();
      if (!yes) return;
      this.ctx.game.state.party = recruit(this.ctx.game.state.party, id);
      this.popAll();
      this.stage.querySelector('.slx-info')?.remove();
      this.refresh();
      void this.say(T.ui2.guild.recruited(name(id)), 'happy');
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.push({ el: box.el, onAction: (a) => box.view.onAction(a) });
  }

  private pickMember(next: (id: CharacterId) => void): void {
    const p = this.ctx.game.state.party;
    this.list(p.recruited.map((id) => ({ id, label: name(id), icon: this.faceIcon(id), right: `Lv ${p.roster[id].level}` })), (it) => next(it.id as CharacterId));
  }

  private slots(id: CharacterId): void {
    const m = this.ctx.game.state.party.roster[id];
    const g = T.ui2.guild;
    this.list(SLOTS.map((slot) => ({ id: slot, label: g.slot(T.slot[slot], m.equip[slot] ? EQUIPMENT[m.equip[slot]!].name : g.none) })), (it) => this.gear(id, it.id as Slot));
  }

  private gear(id: CharacterId, slot: Slot): void {
    const s = this.ctx.game.state;
    const m = s.party.roster[id];
    const base = statsOf(m);
    const delta = (eid: string | null) => {
      const after = statsOf({ ...m, equip: { ...m.equip, [slot]: eid ?? undefined } });
      return (['atk', 'def', 'mag', 'res', 'spd', 'hp'] as const).map((k) => [k, after[k] - base[k]] as const).filter(([, d]) => d !== 0)
        .map(([k, d]) => `${T.stat[k]}${d > 0 ? '+' : ''}${d}`).join(' ') || '±0';
    };
    const items: MenuItem[] = Object.entries(s.inventory).filter(([eid, n]) => EQUIPMENT[eid]?.slot === slot && n > 0)
      .map(([eid, n]) => ({ id: eid, label: EQUIPMENT[eid].name, icon: this.ctx.art.has(art.icon(eid)) ? art.icon(eid) : undefined, right: `${delta(eid)} ×${n}` }));
    if (m.equip[slot]) items.push({ id: '', label: T.ui2.guild.unequip, right: delta(null) });
    if (!items.length) { this.fail('stock'); return; }
    this.list(items, (it) => {
      const r = this.ctx.game.apply(it.id ? equip(s, id, it.id) : unequip(s, id, slot));
      this.popAll();
      if (!r.ok) { this.fail(r.reason); return; }
      void this.say(T.ui2.guild.equipped, 'happy');
      this.slots(id);
    });
  }

  private status(id: CharacterId): void {
    const m = this.ctx.game.state.party.roster[id];
    const st = statsOf(m);
    const g = T.ui2.guild;
    const learned = new Set(learnedSkills(id, m.level));
    const skills = CHARACTERS[id].skills.map((sk) => el('li', { text: learned.has(sk) ? SKILLS[sk].name : `${SKILLS[sk].name}（${g.learnedAt(SKILLS[sk].learnLevel)}）` }));
    const u = ULTIMATES[id];
    const sheet = win('slx-status', [
      ...[standeeImg(this.ctx.art, id) ?? portraitImg(this.ctx.art, id, m.hp, st.hp)].filter((n): n is HTMLImageElement => !!n),
      el('h3', { text: `${CHARACTERS[id].title} ${name(id)}　Lv ${m.level}` }),
      el('p', { text: `HP ${m.hp}/${st.hp}　TP ${m.tp}/${st.tp}` }),
      el('p', { text: (['atk', 'def', 'mag', 'res', 'spd'] as const).map((k) => `${T.stat[k]} ${st[k]}`).join('　') }),
      el('ul', { class: 'slx-skills' }, skills),
      el('p', { text: `${g.ultimate}：${u.name}（${g.gauge(m.limit ?? 0)}）` }),
      el('p', { class: 'slx-desc', text: u.desc }),
    ]);
    this.push({ el: sheet, onAction: (a) => { if (a === 'cancel' || a === 'confirm') { this.pop(); return true; } return false; } });
  }
}
