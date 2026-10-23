import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Text, Texture, type ColorMatrix, type Filter } from 'pixi.js';
import { GlowFilter, OutlineFilter } from 'pixi-filters';
import { REGIONS, type RegionId } from '../data/regions';
import { T } from '../data/text.zh-TW';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';
import type { AilmentChip } from '../engine/ailments';
import type { Combatant } from '../engine/combatant';
import type { WeaponKind } from '../engine/types';
import { art, enemyArt, type FxKey } from './artPaths';
import { battleCues } from './battleCues';
import { AFFIX_FILL, AILMENT_FILL, AILMENT_MORE_FILL, bySeverity, fitLabel, fitRow, isHalting, textWidth } from './ailmentStyle';
import { NAME_PREFIXES } from '../engine/scaling';
import { MECH_FILL } from './mechStyle';
import type { MechCue, MechTone, MechWord } from '../engine/mechanics/index';
import type { TextureBank } from './textures';
import { pixelText } from './pixelText';


/** Colours of regional variants: the element's for fire, ice and thunder; by region for the element-less ones. */
export const TINT_COLORS = {
  fire: 0xff6a2a, ice: 0x5fe3f2, thunder: 0xffe14a,
  mire: 0x8fd14f, shade: 0xa274ff, iron: 0x9cb8dc,
} as const;
type TintKey = keyof typeof TINT_COLORS;
/**
 * Per colour: `mix` is how far the sprite is recoloured (its own shading is kept, so it stays readable); `glow` the
 * outer glow strength; `rim` a thin cool outline for steel, whose grey would otherwise vanish into the background.
 */
export const TINT_STYLE: Record<TintKey, { mix: number; glow: number; rim?: number }> = {
  fire: { mix: 0.56, glow: 2.6 },
  ice: { mix: 0.58, glow: 3.4 },
  thunder: { mix: 0.5, glow: 2.6 },
  mire: { mix: 0.48, glow: 2.4 },
  shade: { mix: 0.64, glow: 3.2 },
  iron: { mix: 0.72, glow: 3, rim: 0xdcecff },
};
const ELITE_GOLD = 0xffd34d;

/** The tint of an enemy: by element, or for `phys` and elites by the run's region (mire, shade and iron are all `phys`). */
function tintKey(tint: Combatant['tint'], region: RegionId | undefined): TintKey | null {
  if (!tint) return null;
  if (tint === 'fire' || tint === 'ice' || tint === 'thunder') return tint;
  if (!region || region === 'mainline') return null;
  const el = REGIONS[region].element;
  if (el === 'fire' || el === 'ice' || el === 'thunder') return el;
  return region === 'mire' || region === 'shade' || region === 'iron' ? region : null;
}

/**
 * A colour matrix that recolours the sprite toward `color` by `k`: each channel blends the original with the pixel's
 * brightness times the colour (slightly boosted), so any sprite hue reads as the tint while light and shadow stay.
 */
function tintMatrix(color: number, k: number): ColorMatrix {
  const c = [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
  const boost = 1.3, lift = 0.04;
  const row = (i: number) => {
    const out = [0.299, 0.587, 0.114].map((w) => k * w * c[i] * boost);
    out[i] += 1 - k;
    return [...out, 0, lift * c[i]];
  };
  const [r, g, b] = [row(0), row(1), row(2)];
  return [r[0], r[1], r[2], r[3], r[4], g[0], g[1], g[2], g[3], g[4], b[0], b[1], b[2], b[3], b[4], 0, 0, 0, 1, 0];
}

/** One enemy in the picture: its sprite, an HP bar under its name, and above its head its announced next move with its ailments just under it. */
interface Slot {
  key: string; box: Container; body: Container; texture: Texture | null; hp: number; max: number; bar: Graphics; intent: Text;
  name: Text;
  /** One coloured word per ailment, side by side above its head (`showAilments`). */
  ail: Container;
  /** Its regional colour and elite outline: always on; the hit flash and the target highlight are added on top. */
  base: Filter[];
  tint: { color: number | null; elite: boolean };
  /** A picture not loaded at setup: drawn when it lands (no placeholder body meanwhile), at the size it would have had. */
  want?: { url: string; maxH: number; slotW: number; ground: number };
}
const BAR_W = 64;
/**
 * With a party bar below (`bottom` > 0), the name and the HP bar are raised this far over the feet: the least that keeps
 * the bar clear of the party's one row of ailment words standing on the party bar (12 px and a 1 px margin above it).
 */
const NAME_LIFT = 8;
/** An enemy's ailment row: one line above its head, just under its intent, so it never covers a small sprite. */
const AIL_UNDER_INTENT = 2;
const AIL_GAP = 4;
/** The party's setups on a foe, in the order a crowded row keeps them: 暗記, 瞄準, 估價, 弱點. */
const SETUP_ORDER: readonly MechTone[] = ['mark', 'aim', 'coins', 'expose'];
const AIL_SIZE = 12;
/** Room kept between two enemies' ailment rows: each row fits its slot less this. */
const AIL_SLOT_MARGIN = 6;
/** An ailment row's height and an intent's: 12 px words with their outline (legibility Task 4: the pixel font's grid). */
const AIL_ROW_H = 14;
const INTENT_H = 14;
/** A name's line under the feet: 12 px words on the pixel font's 14 px grid. */
const NAME_H = 14;
/** Room kept between two foes' names, and between two intents: each fits its slot less this. */
const LABEL_SLOT_MARGIN = 4;

/**
 * A foe's name for its slot (legibility follow-up of the difficulty plan): whole when it fits; else without 深層 and its
 * region (the floor's badge and the message line carry them); else cut with 「…」 before its letter. ★ always stays.
 */
export function slotName(name: string, max: number): string {
  const star = name.startsWith('★') ? '★' : '';
  const rest = name.slice(star.length);
  const m = / ([A-Z])$/.exec(rest);
  const body = m ? rest.slice(0, -2) : rest;
  const parts = body.split('・');
  let i = 0;
  while (i < parts.length - 1 && NAME_PREFIXES.includes(parts[i])) i++;
  const bare = `${star}${parts.slice(i).join('・')}`;
  return fitLabel([name, m ? `${bare} ${m[1]}` : bare], max, ailLabelWidth, { head: bare, tail: m ? m[1] : '' });
}

/**
 * A foe's intent for its slot: whole when it fits; else without its area (（十字）); else the skill alone, marked; else the
 * skill alone; else cut. The whole intent is the target note's first line.
 */
export function slotIntent(label: string, max: number): string {
  const noArea = label.replace(/（[^）]*）/, '');
  const skill = noArea.split(' → ')[0];
  return fitLabel([`◆ ${label}`, `◆ ${noArea}`, `◆ ${skill}`, skill], max, ailLabelWidth, { head: skill });
}
/** A hit's tags (暴擊！ 弱點！ 抗性) stand side by side in one row of this height just over the number. */
const TAG_SIZE = 12;
const TAG_ROW_H = 16;
const TAG_GAP = 4;
/** A hit number drifts up this far while it shows; it and its tags keep this much more clear of the ailment row. */
const POP_RISE = 4;
const POP_CLEAR = 3;
type Box = { x: number; y: number; width: number; height: number };
type PopOpts = { weak?: boolean; crit?: boolean; resist?: boolean; small?: boolean };
/**
 * A hit's number is 24px, a small word (MISS) 12px (legibility Task 4). A crit stands out by its colour, its 暴擊！ tag and a
 * bigger pop (popup: 3x, then 2x, then 1x; another hit 2x, then 1x).
 */
const popSize = (o: PopOpts): 12 | 24 => (o.small ? 12 : 24);
/** A label's width at the ailment font size, estimated without measuring (render/ailmentStyle.ts `textWidth`). */
export const ailLabelWidth = (text: string): number => textWidth(text, AIL_SIZE);
/**
 * The message window (`.slx-msg`) covers the stage from y 6 to 70 with one line. Nothing in the picture may stand under
 * it: an intent line (anchored at its bottom) is held at least this low, so a tall boss's intent and its affix row show
 * (T8 acceptance: at 52 both were hidden behind the window). Keep in step with `.slx-msg` in _starlantern-ui.scss.
 */
const MSG_BOTTOM = 70;
const TOP_CLEAR = MSG_BOTTOM + 2 + INTENT_H;

/** Pop colours: a crit burns orange, a resisted hit is a cold grey-blue, a miss a pale grey. */
const CRIT_COLOR = 0xff9a3c;
const RESIST_COLOR = 0x9fb3c8;
const MISS_COLOR = 0xd8d4e6;
const T_CRIT = { text: T.battle.pop.crit, fill: 0xffb35c, stroke: 0x5a1a00 };
const T_WEAK = { text: T.battle.pop.weak, fill: 0xffd166, stroke: 0x7a1a10 };
const T_RESIST = { text: T.battle.pop.resist, fill: 0xc8d6e6, stroke: 0x1a2a3a };

/** Pause on each impact so a hit lands before the next thing happens. */
const HIT_STOP_MS = 80;
/** How far an enemy drops in from when a battle opens. */
const DROP_PX = 28;
/** `mech`: a mechanic's moment; its MechCue comes as the `name`. */
export type PartyCue = 'acting' | 'hit' | 'ultimate' | 'heal' | 'ko' | 'miss' | 'tp' | 'mech';
/** What the party bar needs to draw a hit: its effect, and whether it was a weak point, a crit or resisted. */
export interface HitExtra { fx: FxKey | null; weak: boolean; crit?: boolean; resist?: boolean }

export class BattleView {
  readonly root = new Container();
  private slots = new Map<string, Slot>();
  private defIds = new Map<string, string>();
  private weapons = new Map<string, WeaponKind>();
  /** Pending timers, animation frames and shatters of the current battle; cleared when a new battle is set up. */
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frames = new Set<number>();
  private shattering: Promise<void>[] = [];
  private size = { width: 640, height: 360 };
  /** How wide one enemy's ailment row may be: its slot, less a margin. */
  private ailMax = Infinity;
  /** How wide one enemy's name or intent may be: its slot, less a margin. */
  private labelMax = Infinity;
  private lit = new Map<string, ColorMatrixFilter>();
  /** Tint, glow and outline filters of the current battle, destroyed on the next setup. */
  private tintFilters: Filter[] = [];

  /** Everything in the picture lives here; the shake moves this layer so it adds to the root's push-in. */
  private scene = new Container();

  /** `calm`: the player prefers reduced motion; no shake, push-in, lunges, flashes or breathing. */
  constructor(private fast = false, private bank: TextureBank | null = null, private calm = false) {
    this.root.addChild(this.scene);
    // A picture that lands late (a slow network) is drawn then; nothing stands in for it meanwhile.
    this.bank?.onLoad?.((u) => this.arrived(u));
  }

  /** The backdrop's url while it has not loaded, and the size it is drawn at. */
  private bgWant: { url: string; size: { width: number; height: number } } | null = null;

  private arrived(url: string): void {
    const tex = this.bank?.get(url);
    if (!tex) return;
    if (this.bgWant?.url === url && !this.scene.destroyed) {
      const old = this.scene.children.find((c) => c.label === 'bg-plain');
      const s = this.backdrop(tex, this.bgWant.size);
      this.scene.addChildAt(s, 0);
      if (old) { this.scene.removeChild(old); old.destroy(); }
      this.bgWant = null;
    }
    for (const slot of this.slots.values()) {
      if (slot.want?.url !== url || slot.texture || slot.box.destroyed) continue;
      this.placeBody(slot, tex, slot.want.maxH, slot.want.slotW, slot.want.ground);
    }
  }

  private backdrop(bg: Texture, size: { width: number; height: number }): Sprite {
    const s = new Sprite(bg);
    const k = Math.max(size.width / bg.width, size.height / bg.height);
    s.scale.set(k);
    s.x = (size.width - bg.width * k) / 2; s.y = (size.height - bg.height * k) / 2;
    return s;
  }

  /** An enemy's picture in its body, fitted to its slot; its intent and ailment row stand above it. */
  private placeBody(slot: Slot, tex: Texture, maxH: number, slotW: number, ground: number): void {
    const s = new Sprite(tex);
    const k = Math.min(maxH / tex.height, (slotW * 0.9) / tex.width);
    s.scale.set(k); s.anchor.set(0.5, 1);
    slot.body.addChild(s);
    slot.texture = tex;
    delete slot.want;
    slot.intent.y = Math.max(TOP_CLEAR - ground, -slot.body.height - 30);
    slot.ail.y = slot.intent.y + AIL_UNDER_INTENT;
  }

  /**
   * `left` and `bottom` reserve space (command window, party bar) so enemies and their names are never hidden behind them.
   * `region`: the run's region, which colours its variants (mire, shade and iron share the `phys` tint).
   */
  setup(state: BattleState, size: { width: number; height: number }, floor: number, left = 0, bottom = 0, region?: RegionId): void {
    this.size = size;
    for (const f of this.lit.values()) f.destroy();
    this.lit.clear();
    for (const f of this.tintFilters) f.destroy();
    this.tintFilters = [];
    for (const t of this.timers) clearTimeout(t);
    for (const f of this.frames) cancelAnimationFrame(f);
    this.timers.clear();
    this.frames.clear();
    this.shattering = [];
    for (const c of this.scene.removeChildren()) c.destroy({ children: true });
    this.root.scale.set(1); this.root.x = 0; this.root.y = 0; this.scene.x = 0;
    this.slots.clear();
    this.defIds.clear();
    this.weapons.clear();
    for (const c of [...state.party, ...state.enemies]) { this.defIds.set(c.key, c.defId); if (c.weaponKind) this.weapons.set(c.key, c.weaponKind); }
    const bg = this.bank?.get(art.bg(floor)) ?? null;
    this.bgWant = null;
    if (bg) {
      this.scene.addChild(this.backdrop(bg, size));
    } else {
      // The window's own dark until the backdrop lands (a plain ground, not a stand-in picture).
      const plain = new Graphics().rect(0, 0, size.width, size.height).fill(0x141826);
      plain.label = 'bg-plain';
      this.scene.addChild(plain);
      this.bgWant = { url: art.bg(floor), size };
    }
    const n = state.enemies.length;
    const slotW = (size.width - left) / (n + 1);
    this.ailMax = slotW - AIL_SLOT_MARGIN;
    this.labelMax = slotW - LABEL_SLOT_MARGIN;
    const usable = size.height - bottom;
    const ground = bottom > 0 ? usable - 28 : size.height * 0.85;   // 28 px under the feet for the name and the HP bar
    state.enemies.forEach((e, i) => {
      const box = new Container();
      const body = new Container();
      const tex = this.bank?.get(enemyArt(e.defId)) ?? null;
      const maxH = (bottom > 0 ? usable : size.height) * (e.boss ? (bottom > 0 ? 0.62 : 0.7) : 0.45);
      const elite = e.tint === 'elite';
      const name = elite && !e.name.startsWith('★') ? `★${e.name}` : e.name;
      const label = pixelText(slotName(name, this.labelMax), 12, 0xffffff);
      label.anchor.set(0.5, 0);
      const lift = bottom > 0 ? NAME_LIFT : 0;
      label.y = -lift;
      const bar = new Graphics();
      bar.y = 19 - lift;
      const intent = pixelText('', 12, 0xffe08a);
      intent.anchor.set(0.5, 1);
      const ail = new Container();
      box.addChild(body, label, bar, ail, intent);
      box.x = left + slotW * (i + 1);
      box.y = ground;
      box.alpha = e.alive ? 1 : 0;
      this.scene.addChild(box);
      const key = tintKey(e.tint, region);
      const color = key ? TINT_COLORS[key] : null;
      const base = this.tintFor(key, elite);
      body.filters = base;
      const slot: Slot = { key: e.key, box, body, texture: null, hp: e.hp, max: e.max.hp, bar, intent, name: label, ail, base, tint: { color, elite } };
      // Its picture, or, until it lands, no body at all: just its name and bar (no placeholder art).
      if (tex) this.placeBody(slot, tex, maxH, slotW, ground);
      else {
        slot.want = { url: enemyArt(e.defId), maxH, slotW, ground };
        intent.y = Math.max(TOP_CLEAR - ground, -30);
        ail.y = intent.y + AIL_UNDER_INTENT;
      }
      this.slots.set(e.key, slot);
      this.drawBar(slot);
    });
    if (!this.fast && !this.calm) this.alive(size);
  }

  /** A regional variant: a colour matrix toward its colour and a soft outer glow. An elite: a gold outline. */
  private tintFor(key: TintKey | null, elite: boolean): Filter[] {
    const out: Filter[] = [];
    const style = key ? TINT_STYLE[key] : null;
    const color = key ? TINT_COLORS[key] : 0;
    if (style) {
      const m = new ColorMatrixFilter();
      m.matrix = tintMatrix(color, style.mix);
      out.push(m);
    }
    if (elite) out.push(new OutlineFilter({ thickness: 2, color: ELITE_GOLD, quality: 0.2 }));
    else if (style?.rim !== undefined) out.push(new OutlineFilter({ thickness: 1, color: style.rim, alpha: 0.85, quality: 0.2 }));
    if (style) out.push(new GlowFilter({ distance: 14, outerStrength: style.glow, innerStrength: 0, color, alpha: 0.8, quality: 0.3 }));
    this.tintFilters.push(...out);
    return out;
  }

  /** The always-on filters plus the target highlight, if this enemy has it. */
  private layered(slot: Slot): Filter[] {
    const lit = this.lit.get(slot.key);
    return lit ? [...slot.base, lit] : [...slot.base];
  }

  /** An enemy's tint colour (null: none) and whether it is an elite (for tests). */
  tintOf(key: string): { color: number | null; elite: boolean } {
    return { ...(this.slots.get(key)?.tint ?? { color: null, elite: false }) };
  }

  /** Filters on an enemy's body right now (for tests). */
  filtersOf(key: string): Filter[] {
    const f = this.slots.get(key)?.body.filters;
    return f ? [...(Array.isArray(f) ? f : [f])] : [];
  }

  /** The name shown under an enemy (for tests). */
  nameOf(key: string): string {
    return this.slots.get(key)?.name.text ?? '';
  }

  /** Point just above an enemy, in stage coordinates, for the DOM target cursor. */
  anchor(key: string): { x: number; y: number } | null {
    const slot = this.slots.get(key);
    if (!slot || slot.box.destroyed) return null;
    return { x: slot.box.x, y: slot.box.y - slot.body.height };
  }

  /** An enemy's HP bar with its black rim, in design px at rest (for layout checks). */
  hpBarRect(key: string): { x: number; y: number; width: number; height: number } | null {
    const s = this.slots.get(key);
    if (!s || s.box.destroyed) return null;
    return { x: s.box.x - BAR_W / 2 - 1, y: s.box.y + s.bar.y - 1, width: BAR_W + 2, height: 6 };
  }

  /** An enemy's name under its feet, in design px at rest (for layout checks): its line, as wide as its words. */
  nameRect(key: string): Box | null {
    const s = this.slots.get(key);
    if (!s || s.box.destroyed) return null;
    const w = textWidth(s.name.text, AIL_SIZE);
    return { x: s.box.x - w / 2, y: s.box.y + s.name.y, width: w, height: NAME_H };
  }

  /** Party members are drawn by the DOM party bar; these cues tell it what to show. */
  async play(
    state: BattleState, sfx: SoundManager,
    onParty?: (key: string, cue: PartyCue, name?: string, amount?: number, extra?: HitExtra) => void | Promise<void>,
    onLine?: (index: number) => void,
  ): Promise<void> {
    for (const cue of battleCues(state.log, (k) => this.defIds.get(k) ?? null, (k) => this.weapons.get(k))) {
      if (cue.kind === 'wait') { await (cue.keep ? this.hold(cue.ms) : this.wait(cue.ms)); continue; }
      if (cue.kind === 'line') { onLine?.(cue.index); continue; }
      const slot = this.slots.get(cue.key);
      if (cue.kind === 'ultimate') { if (!slot) await onParty?.(cue.key, 'ultimate', cue.name); continue; }
      if (cue.kind === 'act') {
        if (slot) await this.lunge(slot); else void onParty?.(cue.key, 'acting');
        continue;
      }
      if (cue.kind === 'tp') { if (!slot) void onParty?.(cue.key, 'tp', undefined, cue.amount); continue; }
      if (cue.kind === 'mech') { if (!slot) void onParty?.(cue.key, 'mech', cue.cue satisfies MechCue); continue; }
      if (cue.kind === 'miss') {
        if (slot) this.popup(slot, T.battle.pop.miss, MISS_COLOR, { small: true }); else void onParty?.(cue.key, 'miss');
        continue;
      }
      if (cue.kind === 'hit') {
        if (cue.weak || cue.crit) sfx.weak(); else sfx.hit();
        if (cue.fx) sfx.element?.(cue.fx);
        if (slot) {
          slot.hp = Math.max(0, slot.hp - cue.amount);
          if (!slot.bar.destroyed) this.drawBar(slot);
          this.flash(slot, cue.weak || !!cue.crit);
          const color = cue.crit ? CRIT_COLOR : cue.weak ? 0xffd166 : cue.resist ? RESIST_COLOR : 0xffffff;
          this.popup(slot, String(cue.amount), color, { weak: cue.weak, crit: cue.crit, resist: cue.resist });
          if (cue.weak || cue.crit) { this.shake(6); this.punch(); }
        } else void onParty?.(cue.key, 'hit', undefined, cue.amount, { fx: cue.fx, weak: cue.weak, ...(cue.crit ? { crit: true } : {}), ...(cue.resist ? { resist: true } : {}) });
      }
      if (cue.kind === 'fx' && cue.fx === 'heal') { sfx.heal(); if (!slot && cue.amount !== undefined) void onParty?.(cue.key, 'heal', undefined, cue.amount); }
      if ((cue.kind === 'hit' || cue.kind === 'fx') && cue.fx && slot) this.effect(slot, cue.fx);
      if (cue.kind === 'hit' && slot) this.elementFlash(cue.fx);
      if (cue.kind === 'hit') await this.wait(HIT_STOP_MS);   // a beat on impact, once everything for the hit is drawn
      if (cue.kind === 'ko') {
        sfx.ko();
        if (slot) { this.shake(4); this.punch(); this.shattering.push(this.shatter(slot)); } else void onParty?.(cue.key, 'ko');
      }
    }
    await Promise.all(this.shattering);
    this.shattering = [];
    for (const e of state.enemies) {
      const s = this.slots.get(e.key);
      if (s && !e.alive && !s.box.destroyed) s.box.alpha = 0;
    }
  }

  /** White flash and a knock back; harder on a weak point. */
  private flash(slot: Slot, hard = false): void {
    const f = new ColorMatrixFilter();
    f.brightness(3, false);
    slot.body.filters = [...this.layered(slot), f];
    const x0 = slot.box.x;
    slot.box.x = x0 + (hard ? 14 : 9);
    this.later(50, () => { if (!slot.box.destroyed) slot.box.x = x0 + (hard ? -5 : -3); });
    this.later(100, () => { if (!slot.box.destroyed) slot.box.x = x0; });
    this.later(110, () => { if (!slot.body.destroyed) slot.body.filters = this.layered(slot); f.destroy(); });
  }

  /** Fire, ice and thunder wash the picture in their colour for a moment; thunder strikes twice. */
  private elementFlash(fx: FxKey | null): void {
    if (this.calm) return;   // full-screen flashes are what reduced motion exists to avoid
    const color = fx === 'fire' ? 0xff7a1a : fx === 'ice' ? 0x7fe0ff : fx === 'thunder' ? 0xffffff : null;
    if (color === null) return;
    const g = new Graphics().rect(0, 0, this.size.width, this.size.height).fill(color);
    g.label = 'flash';
    g.blendMode = 'add';
    const steps = fx === 'thunder' ? [0.7, 0.1, 0.55, 0.05] : [0.4, 0.25, 0.1];
    g.alpha = steps[0];
    this.scene.addChild(g);
    steps.slice(1).forEach((a, i) => this.later(50 * (i + 1), () => { if (!g.destroyed) g.alpha = a; }));
    this.later(50 * steps.length, () => { if (!g.destroyed) { this.scene.removeChild(g); g.destroy(); } });
  }

  /**
   * Keeps the picture alive: enemies drop in one after another, then breathe (a slight squash from the feet) for as long
   * as the battle lasts. Runs on animation frames that setup() cancels.
   */
  private alive(size: { width: number; height: number }): void {
    void size;
    const t0 = performance.now();
    const order = new Map([...this.slots.keys()].map((k, i) => [k, i]));
    const rest = new Map([...this.slots].map(([k, s]) => [k, s.box.y]));
    const landing = new Set([...this.slots].filter(([, s]) => s.box.alpha > 0).map(([k]) => k));
    for (const k of landing) { const s = this.slots.get(k)!; s.box.alpha = 0; s.box.y -= DROP_PX; }
    const tick = () => {
      if (!this.root.visible) return;   // the battle is over; the next setup starts a fresh loop
      const t = (performance.now() - t0) / 1000;
      for (const [k, s] of this.slots) {
        if (s.box.destroyed) continue;
        const n = order.get(k) ?? 0;
        if (landing.has(k)) {
          const p = Math.min(1, Math.max(0, (t - n * 0.09) / 0.32));
          const ease = 1 - (1 - p) ** 3;
          s.box.alpha = ease;
          s.box.y = rest.get(k)! - DROP_PX * (1 - ease);
          if (p >= 1) landing.delete(k);
        }
        const b = Math.sin(t * 2.4 + n * 1.7);
        s.body.scale.set(1 - 0.008 * b, 1 + 0.018 * b);
      }
      this.frame(tick);
    };
    this.frame(tick);
  }

  /** A quick push in toward the centre and back, for weak-point hits and knockouts. */
  private punch(): void {
    if (this.fast || this.calm) return;
    const { width: w, height: h } = this.size;
    const set = (k: number) => { this.root.scale.set(k); this.root.x = -((k - 1) * w) / 2; this.root.y = -((k - 1) * h) / 2; };
    set(1.06);
    this.later(70, () => set(1.03));
    this.later(140, () => set(1));
  }

  /** Current shown HP of an enemy (for tests and the screen reader text). */
  enemyHp(key: string): { hp: number; max: number } | null {
    const s = this.slots.get(key);
    return s ? { hp: s.hp, max: s.max } : null;
  }

  intentText(key: string): string {
    return this.slots.get(key)?.intent.text ?? '';
  }

  /** What each enemy will do next ({} hides them all, e.g. while a round plays). */
  showIntents(byKey: Record<string, string>): void {
    for (const [k, s] of this.slots) if (!s.intent.destroyed) s.intent.text = byKey[k] ? slotIntent(byKey[k], this.labelMax) : '';
  }

  /**
   * Each enemy's ailments as coloured words above its head, centred on it, in one line inside its slot (「流血×3」「感電2」「+1」); a call replaces the whole
   * row, and an enemy missing from `byKey` or with an empty list shows none. `marks` are its mechanic words (「暗記」「弱點2」,
   * plan 8c): first in the same row, in the same type, in their own colours. `affixes` are an elite's or a boss's affix names
   * (difficulty plan Task 7b, ruling 24): they lead the row and fold last of all but freeze and sleep, so the row never
   * grows a second line toward the name and the HP bar under the feet.
   */
  showAilments(byKey: Record<string, AilmentChip[]>, marks: Record<string, MechWord[]> = {}, affixes: Record<string, readonly string[]> = {}): void {
    for (const [k, s] of this.slots) {
      if (s.ail.destroyed) continue;
      for (const c of s.ail.removeChildren()) c.destroy();
      const mech = marks[k] ?? [];
      const chips = bySeverity(byKey[k] ?? []);
      // One line inside its slot, by priority (plan 8c final): freeze and sleep (never folded), the party's own setups on
      // it (暗記, 瞄準, 估價, 弱點), the other ailments, the other words; what does not fit folds into +N.
      type W = { text: string; fill: number };
      const ofChip = (c: AilmentChip): W => ({ text: T.ailmentChip(c), fill: AILMENT_FILL[c.id] });
      const ofWord = (x: MechWord): W => ({ text: x.text, fill: MECH_FILL[x.tone] });
      const halting = chips.filter(isHalting);
      const setups = mech.filter((x) => x.setup).sort((a, b) => SETUP_ORDER.indexOf(a.tone) - SETUP_ORDER.indexOf(b.tone));
      // An affix folds after every other ailment and word, never before freeze or sleep; what stands shows the affixes first.
      const tags: W[] = (affixes[k] ?? []).map((text) => ({ text, fill: AFFIX_FILL }));
      const items: W[] = [...halting.map(ofChip), ...tags, ...setups.map(ofWord), ...chips.filter((c) => !isHalting(c)).map(ofChip), ...mech.filter((x) => !x.setup).map(ofWord)];
      const fit = fitRow(items, this.ailMax, (w) => ailLabelWidth(w.text), (n) => ailLabelWidth(T.ailmentMore(n)), AIL_GAP, halting.length);
      const more = fit.more;
      const shown = tags.length ? [...fit.shown.filter((w) => tags.includes(w)), ...fit.shown.filter((w) => !tags.includes(w))] : fit.shown;
      const word = (text: string, fill: number) => pixelText(text, AIL_SIZE, fill);
      const words = shown.map((w) => word(w.text, w.fill));
      if (more) words.push(word(T.ailmentMore(more), AILMENT_MORE_FILL));
      const widths = words.map((t) => ailLabelWidth(t.text));
      let x = -(widths.reduce((a, b) => a + b, 0) + AIL_GAP * Math.max(0, words.length - 1)) / 2;
      words.forEach((t, i) => {
        t.anchor.set(0.5, 0);
        t.x = x + widths[i] / 2;
        x += widths[i] + AIL_GAP;
        s.ail.addChild(t);
      });
    }
  }

  /** An enemy's whole picture (sprite, name, bar, words), for layout tests. */
  enemyBoxOf(key: string): Container | null {
    const s = this.slots.get(key);
    return s && !s.box.destroyed ? s.box : null;
  }

  /** Where an enemy's ailment row stands (its slot's width, one line high), in its box's px. */
  ailmentRowRect(key: string): Box | null {
    const s = this.slots.get(key);
    return s && !s.box.destroyed ? { x: -this.ailMax / 2, y: s.ail.y, width: this.ailMax, height: AIL_ROW_H } : null;
  }

  /** Where an enemy's intent line stands (anchored at its bottom), in its box's px; at least the row's width. */
  intentRect(key: string): Box | null {
    const s = this.slots.get(key);
    if (!s || s.box.destroyed) return null;
    const width = Math.max(this.ailMax, textWidth(s.intent.text, 12) + 6);
    return { x: -width / 2, y: s.intent.y - INTENT_H, width, height: INTENT_H };
  }

  /**
   * Where a hit's number and its tags stand on an enemy, in its box's px: the number at the body's middle, readable on a
   * small sprite, and the tags side by side in one row just over it; pushed down only as far as it takes to keep them
   * (and the number's drift) clear of the ailment row and the intent above the head.
   */
  popupLayout(key: string, text: string, o: PopOpts): { number: Box; tags: Box[] } | null {
    const s = this.slots.get(key);
    if (!s || s.box.destroyed) return null;
    const size = popSize(o);
    const tags = [o.crit && T_CRIT, o.weak && T_WEAK, o.resist && T_RESIST].filter((x): x is typeof T_CRIT => !!x);
    const tagRow = tags.length ? TAG_ROW_H : 0;
    const clear = s.ail.y + AIL_ROW_H + POP_CLEAR + POP_RISE + tagRow + size / 2;
    const mid = Math.max(-s.body.height / 2, clear);
    const w = textWidth(text, size);
    const number = { x: -w / 2, y: mid - size / 2, width: w, height: size };
    const widths = tags.map((g) => textWidth(g.text, TAG_SIZE));
    let x = -(widths.reduce((a, b) => a + b, 0) + TAG_GAP * Math.max(0, widths.length - 1)) / 2;
    const boxes = widths.map((tw) => { const b = { x, y: number.y - TAG_ROW_H, width: tw, height: TAG_ROW_H }; x += tw + TAG_GAP; return b; });
    return { number, tags: boxes };
  }

  /** The ailment words above an enemy's head, in order (for tests). */
  ailmentTexts(key: string): Text[] {
    const s = this.slots.get(key);
    return s && !s.ail.destroyed ? [...s.ail.children] as Text[] : [];
  }

  /** Set shown HP to the battle state's values (after a round). */
  syncHp(state: BattleState): void {
    for (const e of state.enemies) {
      const s = this.slots.get(e.key);
      if (s && !s.bar.destroyed) { s.hp = e.hp; s.max = e.max.hp; this.drawBar(s); }
    }
  }

  private drawBar(s: Slot): void {
    const k = Math.max(0, Math.min(1, s.hp / Math.max(1, s.max)));
    const color = k > 0.5 ? 0x6fd36f : k > 0.25 ? 0xe8c46a : 0xff5a4a;
    s.bar.clear()
      .rect(-BAR_W / 2 - 1, -1, BAR_W + 2, 6).fill(0x000000)
      .rect(-BAR_W / 2, 0, BAR_W, 4).fill(0x2a2b38)
      .rect(-BAR_W / 2, 0, Math.round(BAR_W * k), 4).fill(color);
  }

  /** The enemy under the target cursor glows; null clears it. */
  highlight(key: string | null): void {
    for (const [k, f] of this.lit) {
      if (k === key) continue;
      const slot = this.slots.get(k);
      this.lit.delete(k);
      if (slot && !slot.body.destroyed) slot.body.filters = [...slot.base];
      f.destroy();
    }
    const slot = key ? this.slots.get(key) : undefined;
    if (!key || !slot || slot.body.destroyed || this.lit.has(key)) return;
    const f = new ColorMatrixFilter();
    f.brightness(1.45, false);
    this.lit.set(key, f);
    slot.body.filters = this.layered(slot);
  }

  /** An enemy about to act lunges toward the camera and settles back. */
  private lunge(slot: Slot): Promise<void> {
    if (this.fast || this.calm || slot.box.destroyed) return Promise.resolve();
    const y0 = slot.box.y;
    const total = 14;
    let frame = 0;
    return new Promise((resolve) => {
      const tick = () => {
        if (slot.box.destroyed) { resolve(); return; }
        frame++;
        const t = Math.sin((frame / total) * Math.PI);   // out and back
        slot.box.scale.set(1 + 0.18 * t);
        slot.box.y = y0 + 16 * t;
        if (frame < total) { this.frame(tick); return; }
        slot.box.scale.set(1);
        slot.box.y = y0;
        resolve();
      };
      this.frame(tick);
    });
  }

  /** Jolt the whole battle picture for a few frames. */
  private shake(px: number): void {
    if (this.fast || this.calm) return;
    const steps = [px, -px, px * 0.6, -px * 0.6, px * 0.3, 0];
    steps.forEach((x, i) => this.later(i * 30, () => { if (!this.scene.destroyed) this.scene.x = x; }));
  }

  /**
   * The attack's effect on the enemy: the 4-frame sheet when it is published (a larger additive copy of the burst frame
   * behind it for a spark), else the single still.
   */
  private effect(slot: Slot, key: Parameters<typeof art.fx>[0]): void {
    const sheet = this.bank?.get(art.fxAnim(key)) ?? null;
    const still = this.bank?.get(art.fx(key)) ?? null;
    const base = sheet ?? still;
    if (!base) return;
    const frames = sheet
      ? [0, 1, 2, 3].map((i) => new Texture({ source: sheet.source, frame: new Rectangle(sheet.frame.x + (sheet.frame.width / 4) * i, sheet.frame.y, sheet.frame.width / 4, sheet.frame.height) }))
      : [base];
    const fw = frames[0].frame.width;
    const scale = Math.min(2.4, (slot.body.width * 0.9) / fw);
    const make = (tex: Texture, k: number, rot: number, alpha: number, label: string) => {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.y = -slot.body.height / 2;
      s.scale.set(scale * k);
      s.rotation = rot;
      s.alpha = alpha;
      s.label = label;
      return s;
    };
    const spark = make(frames[Math.min(1, frames.length - 1)], 1.7, 0.6, 0.5, 'fx-spark');
    spark.blendMode = 'add';
    const main = make(frames[0], 1, 0, 1, sheet ? 'fx-anim' : 'fx');
    slot.box.addChild(spark, main);
    const FRAME_MS = 70;
    frames.slice(1).forEach((t, n) => this.later(FRAME_MS * (n + 1), () => { if (!main.destroyed) main.texture = t; }));
    this.later(120, () => { if (!spark.destroyed) { slot.box.removeChild(spark); spark.destroy(); } });
    this.later(FRAME_MS * frames.length, () => {
      if (!main.destroyed) { slot.box.removeChild(main); main.destroy(); }
      if (sheet) for (const t of frames) t.destroy();
    });
  }

  private shatter(slot: Slot): Promise<void> {
    const tex = slot.texture;
    const sprite = slot.body.children[0];
    if (!tex || !(sprite instanceof Sprite) || this.fast) { slot.box.alpha = this.fast ? 0 : 0.15; return Promise.resolve(); }
    const { width: w, height: h } = tex.frame;
    const k = sprite.scale.x;
    sprite.visible = false;
    const pieces = [0, 1, 2, 3].map((i) => {
      const fx = (i % 2) * (w / 2), fy = Math.floor(i / 2) * (h / 2);
      const t = new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + fx, tex.frame.y + fy, w / 2, h / 2) });
      const p = new Sprite(t);
      p.scale.set(k);
      p.x = (fx - w / 2) * k; p.y = (fy - h) * k;
      slot.body.addChild(p);
      return { p, vx: (i % 2 ? 1 : -1) * 2.5, vy: i < 2 ? -2 : 1 };
    });
    let frame = 0;
    return new Promise((resolve) => {
      const tick = () => {
        if (slot.box.destroyed) { resolve(); return; }
        frame++;
        for (const { p, vx, vy } of pieces) { p.x += vx; p.y += vy + frame * 0.3; p.alpha = Math.max(0, 1 - frame / 24); }
        if (frame < 24) { this.frame(tick); return; }
        slot.box.alpha = 0;
        for (const { p } of pieces) p.texture.destroy();
        resolve();
      };
      this.frame(tick);
    });
  }

  private frame(fn: () => void): void {
    const id = requestAnimationFrame(() => { this.frames.delete(id); fn(); });
    this.frames.add(id);
  }

  /**
   * The number (or MISS) over an enemy, with small tags above it: 弱點！ for a weak point, 暴擊！ for a crit, 抗性 for a
   * resisted element. A crit's number is the biggest. Reduced motion keeps everything still; the words carry it.
   */
  private popup(slot: Slot, text: string, color: number, o: PopOpts = {}): void {
    const size = popSize(o);
    // On the body, clear of the ailment row and the intent above the head (popupLayout).
    const at = this.popupLayout(slot.key, text, o)!;
    const t = pixelText(text, size, color);
    t.anchor.set(0.5);
    t.y = at.number.y + at.number.height / 2;
    // Whole steps only (T4 review): the pixel font stays on its grid at every frame of the pop.
    t.scale.set(this.calm ? 1 : o.crit ? 3 : 2);
    slot.box.addChild(t);
    const parts: Text[] = [t];
    const tags = [o.crit && T_CRIT, o.weak && T_WEAK, o.resist && T_RESIST].filter((x): x is typeof T_CRIT => !!x);
    tags.forEach((g, i) => {
      const tag = pixelText(g.text, TAG_SIZE, g.fill, g.stroke);
      tag.anchor.set(0.5);
      const r = at.tags[i];
      tag.x = r.x + r.width / 2;
      tag.y = r.y + r.height / 2;
      slot.box.addChild(tag);
      parts.push(tag);
    });
    // A new battle may have torn the sprites down before these run.
    if (!this.calm) {
      this.later(40, () => { if (!t.destroyed) t.scale.set(o.crit ? 2 : 1); });
      this.later(80, () => { if (!t.destroyed) t.scale.set(1); });
      this.later(200, () => { if (!t.destroyed) t.y -= POP_RISE; });
    }
    this.later(600, () => { for (const x of parts) if (!x.destroyed) { slot.box.removeChild(x); x.destroy(); } });
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, this.fast ? 0 : ms);
    this.timers.add(id);
  }

  /** A wait kept even in fast mode (a mechanic's moment), on the view's tracked timers so a new fight clears it. */
  private hold(ms: number): Promise<void> {
    return new Promise((r) => {
      const id = setTimeout(() => { this.timers.delete(id); r(); }, ms);
      this.timers.add(id);
    });
  }

  private wait(ms: number): Promise<void> {
    return this.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
