import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import type { WitchState } from '../engine/types';
import { GRAZE_R, PLAYER_HIT_R } from '../engine/constants';
import type { WitchTextures } from './assets';

const PLAYER_RENDER_SCALE = 1.35; // 自機放大，提升小尺寸下的辨識度
const IDLE_FRAME_MS = 140;        // idle 影格輪播 ≈ 7fps

export class EntityView {
  private player: Sprite;
  private playerFrames: Texture[];
  private frameIdx = 0;
  private frameTimerMs = 0;
  private idleMs = 0;              // 視覺呼吸/光暈脈動累計
  private glow: Graphics;          // 腳下流派色光暈
  private hitDot: Graphics;        // 低速模式顯示判定點
  private boss: Sprite | null = null;
  private enemySprites = new Map<number, Sprite>();
  private coinSprites: Sprite[] = [];
  private dropSprites: Sprite[] = [];

  constructor(private layer: Container, private fx: Container, private tex: WitchTextures) {
    this.playerFrames = tex.playerFrames.length > 0 ? tex.playerFrames : [Texture.EMPTY];
    this.glow = new Graphics().ellipse(0, 0, 15, 6).fill(tex.accent);
    this.glow.alpha = 0.2;
    layer.addChild(this.glow);     // 光暈在自機之下
    this.player = new Sprite(this.playerFrames[0]);
    // 垂直錨點對到角色身體核心（非畫布幾何中心），使 3px 被彈判定點落在看得見的身體上
    this.player.anchor.set(0.5, tex.playerAnchorY);
    this.player.scale.set(PLAYER_RENDER_SCALE);
    layer.addChild(this.player);
    this.hitDot = new Graphics()
      .circle(0, 0, GRAZE_R).stroke({ width: 1, color: 0xff5a4d, alpha: 0.35 })
      .circle(0, 0, PLAYER_HIT_R + 1).fill(0xffffff);
    this.hitDot.visible = false;
    layer.addChild(this.hitDot);
  }

  render(s: WitchState, dtMs: number): void {
    this.idleMs += dtMs;
    // idle 影格輪播（多影格才動）
    if (this.playerFrames.length > 1) {
      this.frameTimerMs += dtMs;
      if (this.frameTimerMs >= IDLE_FRAME_MS) {
        this.frameTimerMs -= IDLE_FRAME_MS;
        this.frameIdx = (this.frameIdx + 1) % this.playerFrames.length;
        this.player.texture = this.playerFrames[this.frameIdx];
      }
    }
    // 自機（呼吸浮動 + 無敵中閃爍）
    const bob = Math.sin(this.idleMs / 360) * 1.5;
    this.player.x = s.player.x; this.player.y = s.player.y + bob;
    this.player.alpha = s.player.invulnMs > 0 ? (Math.floor(s.player.invulnMs / 100) % 2 ? 0.3 : 0.9) : 1;
    // 腳下流派色光暈（脈動；無敵時壓暗）
    this.glow.visible = s.player.alive;
    this.glow.x = s.player.x; this.glow.y = s.player.y + 9;
    this.glow.alpha = s.player.invulnMs > 0 ? 0.1 : 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(this.idleMs / 240));
    this.hitDot.visible = s.player.focus;
    this.hitDot.x = s.player.x; this.hitDot.y = s.player.y;

    // 道中敵：以 id 同步 Map
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = new Sprite(this.tex.enemies[e.kind]);
        sp.anchor.set(0.5);
        this.layer.addChild(sp);
        this.enemySprites.set(e.id, sp);
      }
      sp.x = e.x; sp.y = e.y;
      sp.scale.set(e.elite ? 1.6 : 1);
      sp.tint = e.elite ? 0xffd0d0 : 0xffffff;
    }
    for (const [id, sp] of this.enemySprites) {
      if (!seen.has(id)) { sp.destroy(); this.enemySprites.delete(id); }
    }

    // Boss
    if (s.boss && !this.boss) {
      this.boss = new Sprite(this.tex.bosses[s.boss.id]);
      this.boss.anchor.set(0.5);
      this.layer.addChild(this.boss);
    } else if (!s.boss && this.boss) {
      this.boss.destroy(); this.boss = null;
    }
    if (s.boss && this.boss) { this.boss.x = s.boss.x; this.boss.y = s.boss.y; }

    // 金幣（簡單池）
    while (this.coinSprites.length < s.coins.length) {
      const c = new Sprite(this.tex.coin);
      c.anchor.set(0.5);
      this.layer.addChild(c);
      this.coinSprites.push(c);
    }
    for (let i = 0; i < this.coinSprites.length; i++) {
      const sp = this.coinSprites[i], c = s.coins[i];
      sp.visible = !!c?.active;
      if (c?.active) { sp.x = c.x; sp.y = c.y; }
    }

    // 道具 drops（簡單池，仿金幣）
    while (this.dropSprites.length < s.drops.length) {
      const d = new Sprite(this.tex.dropPower); // 初始佔位紋理，render 時再換
      d.anchor.set(0.5);
      this.layer.addChild(d);
      this.dropSprites.push(d);
    }
    for (let i = 0; i < this.dropSprites.length; i++) {
      const sp = this.dropSprites[i], d = s.drops[i];
      sp.visible = !!d?.active;
      if (d?.active) {
        sp.texture = d.kind === 'bomb' ? this.tex.dropBomb : this.tex.dropPower;
        sp.x = d.x; sp.y = d.y;
      }
    }
  }
}
