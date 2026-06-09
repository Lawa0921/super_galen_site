import { Container, Text, TextStyle, Graphics, Sprite } from 'pixi.js';
import type { BomberState } from '../engine/types';
import type { BomberTextures } from './assets';

const FONT_FAMILY = '"Press Start 2P", Consolas, monospace';

/** HUD 頂部列：FLOOR、命數（♥×n）、SCORE、道具指示器、アビリティ指示器。 */
export class HudView {
  private container = new Container();
  private bg = new Graphics();
  private floorText: Text;
  private livesText: Text;
  private scoreText: Text;
  private powerText: Text;
  private stageW = 800;

  // ---- Ability indicator (bottom-right corner, below HUD bar) ----
  private abilityContainer = new Container();
  private abilityFrame = new Graphics();
  private abilityIcon: Sprite;
  private abilityCooldownOverlay = new Graphics();
  private abilityCdText: Text;
  private abilityKeyHint: Text;
  private stageH = 600;

  constructor(private layer: Container, private textures: BomberTextures) {
    const style = (size: number, color = 0xfff2e6) =>
      new TextStyle({
        fontFamily: FONT_FAMILY,
        fontSize: size,
        fill: color,
        letterSpacing: 1,
      });

    this.floorText = new Text({ text: 'FLOOR 1', style: style(11, 0xff9d3c) });
    this.livesText = new Text({ text: '♥ ♥ ♥', style: style(11, 0xff4d6d) });
    this.scoreText = new Text({ text: 'SCORE 0', style: style(10, 0xffd23f) });
    this.powerText = new Text({ text: '', style: style(9, 0xc15cff) });

    // Ability icon sprite — starts with carpet texture as placeholder
    this.abilityIcon = new Sprite(textures.abCarpet);
    this.abilityIcon.width = 40;
    this.abilityIcon.height = 40;

    this.abilityCdText = new Text({ text: '', style: style(9, 0xfff2e6) });
    this.abilityKeyHint = new Text({ text: 'E', style: style(8, 0xffd23f) });

    this.abilityContainer.addChild(
      this.abilityFrame,
      this.abilityIcon,
      this.abilityCooldownOverlay,
      this.abilityCdText,
      this.abilityKeyHint,
    );

    this.container.addChild(this.bg, this.floorText, this.livesText, this.scoreText, this.powerText);
    layer.addChild(this.container, this.abilityContainer);
  }

  /** 設定畫面寬高（用於橫向佈局）。 */
  setLayout(w: number, h = 600): void {
    this.stageW = w;
    this.stageH = h;
    this.relayout();
  }

  render(state: BomberState): void {
    const { player, floor, score } = state;

    this.floorText.text = `FLOOR ${floor}`;
    this.livesText.text = '♥ '.repeat(Math.max(0, player.lives)).trim();
    this.scoreText.text = `SCORE ${score}`;

    // 道具指示器：火力 / 炸彈 / 速度 / 護盾
    const parts: string[] = [];
    if (player.fireRange > 1) parts.push(`F${player.fireRange}`);
    if (player.maxBombs > 1) parts.push(`B${player.maxBombs}`);
    if (player.speedLevel > 0) parts.push(`S${player.speedLevel}`);
    if (player.shield) parts.push('SH');
    this.powerText.text = parts.join(' ');

    // ---- Ability indicator ----
    const { abilityId, abilityCooldownMs, abilityMaxMs } = state;

    if (!abilityId) {
      this.abilityContainer.visible = false;
      return;
    }
    this.abilityContainer.visible = true;

    // Swap icon texture to match current character's ability
    const iconTex = abilityId === 'carpet'  ? this.textures.abCarpet
                  : abilityId === 'inferno' ? this.textures.abInferno
                  : abilityId === 'blink'   ? this.textures.abBlink
                  :                           this.textures.abBulwark;
    this.abilityIcon.texture = iconTex;

    // Cooldown overlay — vertical fill from top proportional to remaining %
    this.abilityCooldownOverlay.clear();
    if (abilityCooldownMs > 0 && abilityMaxMs > 0) {
      const ratio = Math.min(1, abilityCooldownMs / abilityMaxMs);
      const iconH = this.abilityIcon.height;
      const iconW = this.abilityIcon.width;
      this.abilityCooldownOverlay.rect(
        this.abilityIcon.x, this.abilityIcon.y,
        iconW, iconH * ratio,
      ).fill({ color: 0x000000, alpha: 0.65 });

      const secs = Math.ceil(abilityCooldownMs / 1000);
      this.abilityCdText.text = `${secs}`;
      this.abilityCdText.visible = true;
      this.abilityKeyHint.visible = false;
      this.abilityIcon.alpha = 0.55;
    } else {
      this.abilityCdText.visible = false;
      this.abilityKeyHint.visible = true;
      this.abilityIcon.alpha = 1;
    }
  }

  private relayout(): void {
    const w = this.stageW;
    const h = 56;

    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x04060d, alpha: 0.85 });
    this.bg.rect(0, h - 1, w, 1).fill({ color: 0xff9d3c, alpha: 0.2 });

    const vMid = h / 2;

    this.floorText.x = Math.round(w * 0.30);
    this.floorText.y = vMid - this.floorText.height / 2;

    this.scoreText.x = Math.round(w * 0.4);
    this.scoreText.y = vMid - this.scoreText.height / 2;

    this.livesText.x = Math.round(w * 0.68);
    this.livesText.y = vMid - this.livesText.height / 2;

    this.powerText.x = Math.round(w - 160);
    this.powerText.y = vMid - this.powerText.height / 2;

    // ---- Ability indicator layout (bottom-right corner) ----
    const ICON_SIZE = 40;
    const FRAME_PAD = 4;
    const FRAME_SIZE = ICON_SIZE + FRAME_PAD * 2;
    const totalH = this.stageH;

    // Position container at bottom-right, 8px margin
    this.abilityContainer.x = Math.round(w - FRAME_SIZE - 8);
    this.abilityContainer.y = Math.round(totalH - FRAME_SIZE - 8);

    // Amber frame box
    this.abilityFrame.clear();
    this.abilityFrame.rect(0, 0, FRAME_SIZE, FRAME_SIZE).fill({ color: 0x04060d, alpha: 0.85 });
    this.abilityFrame.rect(0, 0, FRAME_SIZE, FRAME_SIZE).stroke({ color: 0xff9d3c, width: 1, alpha: 0.7 });

    // Icon positioned inside frame
    this.abilityIcon.x = FRAME_PAD;
    this.abilityIcon.y = FRAME_PAD;
    this.abilityIcon.width = ICON_SIZE;
    this.abilityIcon.height = ICON_SIZE;

    // Countdown text — centered over icon
    this.abilityCdText.x = FRAME_PAD + Math.round(ICON_SIZE / 2 - 8);
    this.abilityCdText.y = FRAME_PAD + Math.round(ICON_SIZE / 2 - 8);

    // Key hint — small label below the frame
    this.abilityKeyHint.x = Math.round(FRAME_SIZE / 2 - 6);
    this.abilityKeyHint.y = FRAME_SIZE + 2;
  }

  /** 在 render 後、每次 stage resize 時呼叫。 */
  onResize(w: number, h?: number): void {
    this.setLayout(w, h);
  }
}
