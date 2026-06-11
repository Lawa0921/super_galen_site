import { Container, Text, TextStyle, Graphics, Sprite } from 'pixi.js';
import type { BomberState } from '../engine/types';
import type { BomberTextures } from './assets';

const FONT_FAMILY = '"Press Start 2P", Consolas, monospace';

/** HUD 頂部列：FLOOR、命數（♥×n）、SCORE、道具指示器、アビリティ指示器。 */
export class HudView {
  private container = new Container();
  private bg = new Graphics();
  private floorText: Text;
  private scoreText: Text;
  private powerText: Text;
  /** Heart sprites for lives (replaces the old '♥' text). */
  private heartPool: Sprite[] = [];
  private heartAnchorX = 0;
  private heartAnchorY = 0;
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
    this.scoreText = new Text({ text: 'SCORE 0', style: style(10, 0xffd23f) });
    this.powerText = new Text({ text: '', style: style(9, 0xc15cff) });

    // Ability icon sprite — placeholder texture; render() swaps per character
    this.abilityIcon = new Sprite(textures.abDetonate);
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

    this.container.addChild(this.bg, this.floorText, this.scoreText, this.powerText);
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
    this.scoreText.text = `SCORE ${score}`;

    // 生命：愛心貼圖（pool，最多顯示 8）
    const lives = Math.max(0, Math.min(8, player.lives));
    for (let i = 0; i < Math.max(lives, this.heartPool.length); i++) {
      let sp = this.heartPool[i];
      if (!sp && i < lives) {
        sp = new Sprite(this.textures.heart);
        sp.width = 18;
        sp.height = 18;
        this.container.addChild(sp);
        this.heartPool.push(sp);
      }
      if (!sp) continue;
      sp.visible = i < lives;
      sp.x = this.heartAnchorX + i * 22;
      sp.y = this.heartAnchorY;
    }

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
    const iconTex = abilityId === 'detonate' ? this.textures.abDetonate
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

    // 石質 HUD 面板：深底＋上下金飾線＋角落斜切缺口
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x0a0817, alpha: 0.92 });
    this.bg.rect(0, 0, w, 2).fill({ color: 0x2a2138, alpha: 0.9 });
    // 底部雙金線（粗＋細）
    this.bg.rect(0, h - 3, w, 2).fill({ color: 0xff9d3c, alpha: 0.55 });
    this.bg.rect(0, h - 1, w, 1).fill({ color: 0x5a3208, alpha: 0.9 });
    // 角落金色斜角飾（左右各一組）
    this.bg.moveTo(0, h).lineTo(14, h).lineTo(0, h - 14).fill({ color: 0xff9d3c, alpha: 0.28 });
    this.bg.moveTo(w, h).lineTo(w - 14, h).lineTo(w, h - 14).fill({ color: 0xff9d3c, alpha: 0.28 });

    const vMid = h / 2;

    this.floorText.x = Math.round(w * 0.27);
    this.floorText.y = vMid - this.floorText.height / 2;

    this.scoreText.x = Math.round(w * 0.42);
    this.scoreText.y = vMid - this.scoreText.height / 2;

    // 愛心錨點（render 內排列）
    this.heartAnchorX = Math.round(w * 0.62);
    this.heartAnchorY = Math.round(vMid - 9);

    this.powerText.x = Math.round(w - 150);
    this.powerText.y = vMid - this.powerText.height / 2;

    // ---- Ability indicator layout (bottom-right corner) ----
    const ICON_SIZE = 48;
    const FRAME_PAD = 6;
    const FRAME_SIZE = ICON_SIZE + FRAME_PAD * 2;
    const totalH = this.stageH;

    // Position container at bottom-right, 10px margin
    this.abilityContainer.x = Math.round(w - FRAME_SIZE - 10);
    this.abilityContainer.y = Math.round(totalH - FRAME_SIZE - 10);

    // 金屬技能槽：深底＋外金框＋內暗斜面＋角落點
    this.abilityFrame.clear();
    this.abilityFrame.rect(0, 0, FRAME_SIZE, FRAME_SIZE).fill({ color: 0x0a0817, alpha: 0.92 });
    this.abilityFrame.rect(0, 0, FRAME_SIZE, FRAME_SIZE).stroke({ color: 0xff9d3c, width: 2, alpha: 0.85 });
    this.abilityFrame.rect(2, 2, FRAME_SIZE - 4, FRAME_SIZE - 4).stroke({ color: 0x5a3208, width: 1, alpha: 0.9 });
    // 角落鉚釘點
    for (const [cx, cy] of [[3, 3], [FRAME_SIZE - 4, 3], [3, FRAME_SIZE - 4], [FRAME_SIZE - 4, FRAME_SIZE - 4]]) {
      this.abilityFrame.rect(cx, cy, 2, 2).fill({ color: 0xffce6b, alpha: 0.9 });
    }

    // Icon positioned inside frame
    this.abilityIcon.x = FRAME_PAD;
    this.abilityIcon.y = FRAME_PAD;
    this.abilityIcon.width = ICON_SIZE;
    this.abilityIcon.height = ICON_SIZE;

    // Countdown text — centered over icon
    this.abilityCdText.x = FRAME_PAD + Math.round(ICON_SIZE / 2 - 8);
    this.abilityCdText.y = FRAME_PAD + Math.round(ICON_SIZE / 2 - 8);

    // Key hint — small gold chip below the frame
    this.abilityKeyHint.x = Math.round(FRAME_SIZE / 2 - 6);
    this.abilityKeyHint.y = FRAME_SIZE + 3;
  }

  /** 在 render 後、每次 stage resize 時呼叫。 */
  onResize(w: number, h?: number): void {
    this.setLayout(w, h);
  }
}
