import { Assets, Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import type { StageId } from '../engine/types';

const BG_SCROLL_SPEED = 36; // px/s，向下捲 = 往塔頂爬升

/** 直式捲動背景：每關一張 480×960 圖，TilingSprite 垂直平鋪捲動，關卡切換交叉淡入。 */
export class BackgroundView {
  private tiling: TilingSprite;
  private fade: Graphics;          // 換關時短暫壓暗做轉場
  private fadeMs = 0;
  private currentStage: StageId | null = null;
  private textures = new Map<StageId, Texture>();

  constructor(private layer: Container, private fieldW: number, private fieldH: number) {
    const base = new Graphics().rect(0, 0, fieldW, fieldH).fill(0x0a0716);
    layer.addChild(base);
    this.tiling = new TilingSprite({ texture: Texture.EMPTY, width: fieldW, height: fieldH });
    layer.addChild(this.tiling);
    this.fade = new Graphics().rect(0, 0, fieldW, fieldH).fill(0x0a0716);
    this.fade.alpha = 0;
    layer.addChild(this.fade);
  }

  /** 預載 4 關背景。 */
  async load(): Promise<void> {
    for (const s of [1, 2, 3, 4] as StageId[]) {
      const tex = await Assets.load<Texture>(`/assets/games/witchrun/bg-stage${s}.webp`);
      tex.source.addressMode = 'mirror-repeat'; // 上下鏡像平鋪：素材不需嚴格無縫也不會出現硬接縫
      this.textures.set(s, tex);
    }
  }

  update(dtMs: number, stage: StageId): void {
    if (stage !== this.currentStage) {
      this.currentStage = stage;
      const tex = this.textures.get(stage);
      if (tex) {
        this.tiling.texture = tex;
        this.fadeMs = 900; // 換關轉場
      }
    }
    this.tiling.tilePosition.y += BG_SCROLL_SPEED * (dtMs / 1000);
    if (this.fadeMs > 0) {
      this.fadeMs = Math.max(0, this.fadeMs - dtMs);
      this.fade.alpha = Math.min(0.85, this.fadeMs / 900);
    } else if (this.fade.alpha !== 0) {
      this.fade.alpha = 0;
    }
  }
}
