import { Container, Graphics, Text } from 'pixi.js';
import type { SoundManager } from '../audio/SoundManager';
import type { BattleState } from '../engine/battle';

const PALETTE = [0x7fb069, 0x8e7dbe, 0xd1495b, 0x66a1d2, 0xe0a458, 0x5c946e, 0xb56576, 0x6d6875, 0xc44536];

function colorFor(defId: string): number {
  let h = 0;
  for (const ch of defId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export class BattleView {
  readonly root = new Container();
  private sprites = new Map<string, Container>();

  constructor(private fast = false) {}

  setup(state: BattleState, size: { width: number; height: number }): void {
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.sprites.clear();
    this.root.addChild(new Graphics().rect(0, 0, size.width, size.height).fill(0x141826));
    const n = state.enemies.length;
    const w = Math.min(160, size.width / (n + 1));
    const h = w * 1.2;
    state.enemies.forEach((e, i) => {
      const c = new Container();
      const label = new Text({ text: e.name, style: { fill: 0xffffff, fontSize: 14 } });
      label.anchor.set(0.5, 0);
      c.addChild(new Graphics().roundRect(-w / 2, -h, w, h, 12).fill(colorFor(e.defId)), label);
      c.x = (size.width * (i + 1)) / (n + 1);
      c.y = size.height * 0.8;
      this.root.addChild(c);
      this.sprites.set(e.key, c);
    });
  }

  async play(state: BattleState, sfx: SoundManager): Promise<void> {
    for (const ev of state.log) {
      const s = 'target' in ev ? this.sprites.get(ev.target) : undefined;
      if (ev.type === 'damage') {
        if (ev.mult > 1) sfx.weak(); else sfx.hit();
        if (s) this.popup(s, String(ev.amount), ev.mult > 1 ? 0xffd166 : 0xffffff);
      }
      if (ev.type === 'heal') sfx.heal();
      if (ev.type === 'ko') { sfx.ko(); if (s) s.alpha = 0.15; }
      await this.wait(ev.type === 'act' ? 260 : 160);
    }
    for (const e of state.enemies) {
      const s = this.sprites.get(e.key);
      if (s) s.alpha = e.alive ? 1 : 0.15;
    }
  }

  private popup(s: Container, text: string, color: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 22, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5);
    t.y = -s.height - 12;
    s.addChild(t);
    const x0 = s.x;
    s.x = x0 + 6;
    setTimeout(() => { s.x = x0; }, 60);
    setTimeout(() => { s.removeChild(t); t.destroy(); }, this.fast ? 0 : 500);
  }

  private wait(ms: number): Promise<void> {
    return this.fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  }
}
