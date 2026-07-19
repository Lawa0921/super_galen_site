import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FIELD_W, FIELD_H } from '../engine/engine';

type Kind = 'flash' | 'spark' | 'poof' | 'ring' | 'screen';
interface Fx { g: Graphics; kind: Kind; age: number; dur: number; r: number; color: number; active: boolean; }
interface Pop { t: Text; age: number; dur: number; x: number; y: number; active: boolean; }
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 塔防爽度效果（物件池、全程式繪製）：開火閃光/命中火花/死亡迸裂/爆炸環/分數浮字。 */
export class Effects {
  private fx: Fx[] = [];
  private pops: Pop[] = [];
  constructor(private layer: Container) {}

  private acq(): Fx {
    let e = this.fx.find((f) => !f.active);
    if (!e) { e = { g: new Graphics(), kind: 'spark', age: 0, dur: 0, r: 0, color: 0xffffff, active: false }; this.layer.addChild(e.g); this.fx.push(e); }
    e.active = true; e.age = 0; e.g.visible = true; e.g.alpha = 1; e.g.scale.set(1); e.g.clear();
    return e;
  }

  flash(x: number, y: number, color: number): void {
    const e = this.acq(); e.kind = 'flash'; e.dur = 130; e.r = 11; e.color = color; e.g.x = x; e.g.y = y;
    e.g.circle(0, 0, 1).fill(color);
  }
  spark(x: number, y: number, color: number): void {
    const e = this.acq(); e.kind = 'spark'; e.dur = 200; e.r = 12; e.g.x = x; e.g.y = y;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; e.g.moveTo(0, 0).lineTo(Math.cos(a), Math.sin(a)); }
    e.g.stroke({ width: 1.5, color });
  }
  poof(x: number, y: number, color: number): void {
    const e = this.acq(); e.kind = 'poof'; e.dur = 320; e.r = 22; e.g.x = x; e.g.y = y;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; e.g.moveTo(0, 0).lineTo(Math.cos(a), Math.sin(a)); }
    e.g.stroke({ width: 2, color });
  }
  ring(x: number, y: number, maxR: number, color: number): void {
    const e = this.acq(); e.kind = 'ring'; e.dur = 360; e.r = maxR; e.color = color; e.g.x = x; e.g.y = y;
  }
  /** 全屏閃光（Boss 登場等），r=起始強度。 */
  screen(color: number, alpha = 0.5): void {
    const e = this.acq(); e.kind = 'screen'; e.dur = 380; e.r = alpha; e.color = color; e.g.x = 0; e.g.y = 0;
    e.g.rect(0, 0, FIELD_W, FIELD_H).fill(color);
  }
  popup(x: number, y: number, text: string, color: number): void {
    let p = this.pops.find((q) => !q.active);
    if (!p) {
      const t = new Text({ text: '', style: new TextStyle({ fontFamily: '"Press Start 2P", monospace', fontSize: 9, fill: 0xffffff }) });
      t.anchor.set(0.5); this.layer.addChild(t);
      p = { t, age: 0, dur: 560, x: 0, y: 0, active: false }; this.pops.push(p);
    }
    p.active = true; p.age = 0; p.x = x; p.y = y;
    p.t.visible = true; p.t.text = text; p.t.style.fill = color; p.t.x = x; p.t.y = y; p.t.alpha = 1;
  }

  update(dt: number): void {
    for (const e of this.fx) {
      if (!e.active) continue;
      e.age += dt; const t = clamp01(e.age / e.dur);
      if (t >= 1) { e.active = false; e.g.visible = false; continue; }
      if (e.kind === 'flash') { e.g.scale.set(e.r * (0.5 + t)); e.g.alpha = 1 - t; }
      else if (e.kind === 'spark') { e.g.scale.set(e.r * (0.4 + 0.6 * t)); e.g.alpha = 1 - t; }
      else if (e.kind === 'poof') { e.g.scale.set(e.r * (0.3 + 0.7 * t)); e.g.alpha = 1 - t; }
      else if (e.kind === 'ring') { const rr = e.r * (1 - (1 - t) * (1 - t)); e.g.clear().circle(0, 0, rr).stroke({ width: 3 * (1 - t) + 1, color: e.color, alpha: 0.8 * (1 - t) }); }
      else if (e.kind === 'screen') { e.g.alpha = e.r * (1 - t); }
    }
    for (const p of this.pops) {
      if (!p.active) continue;
      p.age += dt; const t = clamp01(p.age / p.dur);
      if (t >= 1) { p.active = false; p.t.visible = false; continue; }
      p.t.y = p.y - 20 * t; p.t.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
  }
}
