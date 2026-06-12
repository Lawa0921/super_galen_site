import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { WitchState } from '../engine/types';
import { OVERDRIVE_MAX, FIELD_W } from '../engine/constants';
import { STAGES } from '../engine/stage';

const style = (size: number, fill: number) =>
  new TextStyle({ fontFamily: '"Press Start 2P", monospace', fontSize: size, fill });

export class HudView {
  private score = new Text({ text: '0', style: style(12, 0xeafdff) });
  private lives = new Text({ text: '', style: style(10, 0xff5a4d) });
  private bombs = new Text({ text: '', style: style(10, 0xffa040) });
  private stageName = new Text({ text: '', style: style(8, 0x9a8ac0) });
  private odBar = new Graphics();
  private odLabel = new Text({ text: 'OVERDRIVE', style: style(7, 0x36e6ff) });
  private bossBar = new Graphics();

  constructor(layer: Container) {
    this.score.x = 8; this.score.y = 8;
    this.lives.x = 8; this.lives.y = 30;
    this.bombs.x = 8; this.bombs.y = 48;
    this.stageName.x = 8; this.stageName.y = 66;
    this.odLabel.x = 8; this.odLabel.y = 600;
    layer.addChild(this.score, this.lives, this.bombs, this.stageName, this.odBar, this.odLabel, this.bossBar);
  }

  render(s: WitchState): void {
    this.score.text = String(s.score).padStart(8, '0');
    this.lives.text = '♥'.repeat(Math.max(0, s.player.lives));
    this.bombs.text = '✦'.repeat(Math.max(0, s.player.bombs));
    this.stageName.text = `STAGE ${s.stage} ${STAGES[s.stage].name}`;

    // OVERDRIVE 槽（底部）
    const pct = s.overdrive.activeMs > 0 ? 1 : s.overdrive.gauge / OVERDRIVE_MAX;
    this.odBar.clear()
      .rect(8, 612, 160, 10).stroke({ width: 1, color: 0x36e6ff })
      .rect(9, 613, 158 * pct, 8).fill(s.overdrive.activeMs > 0 ? 0xffd23f : pct >= 1 ? 0xff5a4d : 0x36e6ff);

    // Boss 血條（頂部置中）
    this.bossBar.clear();
    if (s.boss) {
      const w = FIELD_W - 120;
      this.bossBar
        .rect(60, 4, w, 6).stroke({ width: 1, color: 0xff5a8a })
        .rect(61, 5, (w - 2) * (s.boss.hp / s.boss.maxHp), 4).fill(0xff5a8a);
    }
  }
}
