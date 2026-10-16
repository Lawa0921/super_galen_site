import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';
import { art, type FxKey } from './artPaths';
import { battleCues } from './battleCues';
import type { TextureBank } from './textures';

const PALETTE = [0x7fb069, 0x8e7dbe, 0xd1495b, 0x66a1d2, 0xe0a458, 0x5c946e, 0xb56576, 0x6d6875, 0xc44536];

function colorFor(defId: string): number {
  let h = 0;
  for (const ch of defId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Slot { box: Container; body: Container; texture: Texture | null }

/** Pause on each impact so a hit lands before the next thing happens. */
const HIT_STOP_MS = 80;
export type PartyCue = 'acting' | 'hit' | 'ultimate' | 'heal' | 'ko';

export class BattleView {
  readonly root = new Container();
  private slots = new Map<string, Slot>();
  private defIds = new Map<string, string>();
  /** Pending timers, animation frames and shatters of the current battle; cleared when a new battle is set up. */
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frames = new Set<number>();
  private shattering: Promise<void>[] = [];

  constructor(private fast = false, private bank: TextureBank | null = null) {}

  /** `left` and `bottom` reserve space (command window, party bar) so enemies and their names are never hidden behind them. */
  setup(state: BattleState, size: { width: number; height: number }, floor: number, left = 0, bottom = 0): void {
    for (const t of this.timers) clearTimeout(t);
    for (const f of this.frames) cancelAnimationFrame(f);
    this.timers.clear();
    this.frames.clear();
    this.shattering = [];
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.slots.clear();
    this.defIds.clear();
    for (const c of [...state.party, ...state.enemies]) this.defIds.set(c.key, c.defId);
    const bg = this.bank?.get(art.bg(floor)) ?? null;
    if (bg) {
      const s = new Sprite(bg);
      const k = Math.max(size.width / bg.width, size.height / bg.height);
      s.scale.set(k);
      s.x = (size.width - bg.width * k) / 2; s.y = (size.height - bg.height * k) / 2;
      this.root.addChild(s);
    } else {
      this.root.addChild(new Graphics().rect(0, 0, size.width, size.height).fill(0x141826));
    }
    const n = state.enemies.length;
    const slotW = (size.width - left) / (n + 1);
    const usable = size.height - bottom;
    const ground = bottom > 0 ? usable - 20 : size.height * 0.85;   // 20 px under the feet for the name
    state.enemies.forEach((e, i) => {
      const box = new Container();
      const body = new Container();
      const tex = this.bank?.get(art.enemy(e.defId)) ?? null;
      const maxH = (bottom > 0 ? usable : size.height) * (e.boss ? (bottom > 0 ? 0.62 : 0.7) : 0.45);
      if (tex) {
        const s = new Sprite(tex);
        const k = Math.min(maxH / tex.height, (slotW * 0.9) / tex.width);
        s.scale.set(k); s.anchor.set(0.5, 1);
        body.addChild(s);
      } else {
        const w = Math.min(160, slotW), h = w * 1.2;
        body.addChild(new Graphics().roundRect(-w / 2, -h, w, h, 12).fill(colorFor(e.defId)));
      }
      const label = new Text({ text: e.name, style: { fill: 0xffffff, fontSize: 14, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5, 0);
      box.addChild(body, label);
      box.x = left + slotW * (i + 1);
      box.y = ground;
      box.alpha = e.alive ? 1 : 0;
      this.root.addChild(box);
      this.slots.set(e.key, { box, body, texture: tex });
    });
  }

  /** Point just above an enemy, in stage coordinates, for the DOM target cursor. */
  anchor(key: string): { x: number; y: number } | null {
    const slot = this.slots.get(key);
    if (!slot || slot.box.destroyed) return null;
    return { x: slot.box.x, y: slot.box.y - slot.body.height };
  }

  /** Party members are drawn by the DOM party bar; these cues tell it what to show. */
  async play(
    state: BattleState, sfx: SoundManager,
    onParty?: (key: string, cue: PartyCue, name?: string, amount?: number, extra?: { fx: FxKey | null; weak: boolean }) => void | Promise<void>,
    onLine?: (index: number) => void,
  ): Promise<void> {
    for (const cue of battleCues(state.log, (k) => this.defIds.get(k) ?? null)) {
      if (cue.kind === 'wait') { await this.wait(cue.ms); continue; }
      if (cue.kind === 'line') { onLine?.(cue.index); continue; }
      const slot = this.slots.get(cue.key);
      if (cue.kind === 'ultimate') { if (!slot) await onParty?.(cue.key, 'ultimate', cue.name); continue; }
      if (cue.kind === 'act') {
        if (slot) await this.lunge(slot); else void onParty?.(cue.key, 'acting');
        continue;
      }
      if (cue.kind === 'hit') {
        if (cue.weak) sfx.weak(); else sfx.hit();
        if (cue.fx) sfx.element?.(cue.fx);
        if (slot) {
          this.flash(slot, cue.weak);
          this.popup(slot, String(cue.amount), cue.weak ? 0xffd166 : 0xffffff, cue.weak);
          if (cue.weak) this.shake(6);
        } else void onParty?.(cue.key, 'hit', undefined, cue.amount, { fx: cue.fx, weak: cue.weak });
      }
      if (cue.kind === 'fx' && cue.fx === 'heal') { sfx.heal(); if (!slot && cue.amount !== undefined) void onParty?.(cue.key, 'heal', undefined, cue.amount); }
      if ((cue.kind === 'hit' || cue.kind === 'fx') && cue.fx && slot) this.effect(slot, cue.fx);
      if (cue.kind === 'hit') await this.wait(HIT_STOP_MS);   // a beat on impact, once everything for the hit is drawn
      if (cue.kind === 'ko') {
        sfx.ko();
        if (slot) { this.shake(4); this.shattering.push(this.shatter(slot)); } else void onParty?.(cue.key, 'ko');
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
    slot.body.filters = [f];
    const x0 = slot.box.x;
    slot.box.x = x0 + (hard ? 14 : 9);
    this.later(50, () => { if (!slot.box.destroyed) slot.box.x = x0 + (hard ? -5 : -3); });
    this.later(100, () => { if (!slot.box.destroyed) slot.box.x = x0; });
    this.later(110, () => { if (!slot.body.destroyed) slot.body.filters = []; f.destroy(); });
  }

  /** An enemy about to act lunges toward the camera and settles back. */
  private lunge(slot: Slot): Promise<void> {
    if (this.fast || slot.box.destroyed) return Promise.resolve();
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
    if (this.fast) return;
    const steps = [px, -px, px * 0.6, -px * 0.6, px * 0.3, 0];
    steps.forEach((x, i) => this.later(i * 30, () => { this.root.x = x; }));
  }

  private effect(slot: Slot, key: Parameters<typeof art.fx>[0]): void {
    const tex = this.bank?.get(art.fx(key)) ?? null;
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.y = -slot.body.height / 2;
    s.scale.set(Math.min(2, (slot.body.width * 0.8) / tex.width));
    slot.box.addChild(s);
    this.later(220, () => { slot.box.removeChild(s); s.destroy(); });
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

  private popup(slot: Slot, text: string, color: number, weak = false): void {
    const t = new Text({ text, style: { fill: color, fontSize: weak ? 32 : 26, fontWeight: 'bold', stroke: { color: 0x000000, width: 5 } } });
    t.anchor.set(0.5);
    t.y = -slot.body.height - 12;
    t.scale.set(1.6);
    slot.box.addChild(t);
    const parts: Text[] = [t];
    if (weak) {
      const tag = new Text({ text: '弱點！', style: { fill: 0xffd166, fontSize: 14, fontWeight: 'bold', stroke: { color: 0x7a1a10, width: 4 } } });
      tag.anchor.set(0.5);
      tag.y = t.y - 26;
      slot.box.addChild(tag);
      parts.push(tag);
    }
    // A new battle may have torn the sprites down before these run.
    this.later(40, () => { if (!t.destroyed) t.scale.set(1.2); });
    this.later(80, () => { if (!t.destroyed) t.scale.set(1); });
    this.later(200, () => { if (!t.destroyed) t.y -= 4; });
    this.later(600, () => { for (const x of parts) if (!x.destroyed) { slot.box.removeChild(x); x.destroy(); } });
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, this.fast ? 0 : ms);
    this.timers.add(id);
  }

  private wait(ms: number): Promise<void> {
    return this.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
