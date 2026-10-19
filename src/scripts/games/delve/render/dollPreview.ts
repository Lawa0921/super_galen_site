// dollPreview.ts — 紙娃娃預覽（純 Bmp）：把一格動畫依遊戲裡的順序合成成一張圖
//   後手臂 → 第一張（背飾 / 後髮 / 身體 / 腿 / 胸）→ 前手臂 → 第二張（臉 / 前髮 / 頭飾 / 前飾品）。
//   客製化畫面、背包的紙娃娃、說明框的小預覽、圖庫用；遊戲中由 renderer 用快取的 canvas 做同樣的事。
import { Bmp, rotPrep, rotate } from './pixel';
import type { DollLook } from '../engine/doll';
import { ARMS_PAD, ARM_PIV, AV_FH, AV_FW, ROPE_X, avatarArm, avatarFrame, mantleArms, shoulderOf, type SheetAnim } from './avatarArt';
import { hex } from './pixel';

/** 預覽裡攀上邊緣的手抓的位置（沒有真的牆角：懸掛 → 撐起 → 膝蓋上台；最後一格用一般手臂） */
export const MANTLE_HANDS: readonly ([number, number] | null)[] = [[32, 27], [32, 34], [31, 40], null];
import { armAngles } from './anim';

const ARM_CANVAS = 64;
/** 預覽影格的手臂角度（度；0 = 下垂、正 = 往前抬） */
export function previewArms(anim: SheetAnim, f: number): { front: number; back: number } {
  switch (anim) {
    case 'walk': return armAngles('walk', f, null);
    case 'jump': return armAngles('jump', 0, null);
    case 'fall': return armAngles('fall', 0, null);
    case 'swim': { const s = Math.sin((f / 6) * Math.PI * 2); return { front: 95 + s * 55, back: 95 - s * 55 }; }
    case 'hurt': return { front: 130, back: -50 };
    case 'mantle': return { front: 30, back: 20 };
    default: return armAngles('idle', f % 4, null);
  }
}

const prepCache = new Map<string, Bmp>();
function armAt(l: DollLook, key: string, back: boolean, deg: number): Bmp {
  const k = `${key}:${back ? 1 : 0}`;
  let p = prepCache.get(k);
  if (!p) { p = rotPrep(avatarArm(l, back)); prepCache.set(k, p); if (prepCache.size > 64) prepCache.delete(prepCache.keys().next().value as string); }
  return rotate(p, ARM_PIV.x, ARM_PIV.y, -(deg * Math.PI) / 180, ARM_CANVAS);
}

/** 一格完整的紙娃娃（面向右）；key = dollKey（手臂預處理的快取用） */
export function dollPreview(l: DollLook, key: string, anim: SheetAnim, f: number): Bmp {
  const fr = avatarFrame(l, anim, f);
  const out = new Bmp(AV_FW, AV_FH);
  if (!fr.meta.arms) {
    // 爬繩預覽：後面畫一條繩子（遊戲裡繩子是地圖上的方塊）
    if (anim === 'climb' || anim === 'climbdown' || anim === 'hang') {
      const a = hex('#c99660'), b = hex('#7c4c2e');
      for (let y = 0; y < AV_FH; y++) { out.set(ROPE_X - 1, y, (y >> 1) & 1 ? b : a); out.set(ROPE_X, y, (y >> 1) & 1 ? a : b); }
    }
    out.blit(fr.body, 0, 0);
    return out;
  }
  const a = previewArms(anim, f), { dx, dy } = fr.meta;
  const put = (b: Bmp, s: { x: number; y: number }): void => out.blit(b, s.x + dx - ARM_CANVAS / 2, s.y + dy - ARM_CANVAS / 2);
  const grip = anim === 'mantle' ? MANTLE_HANDS[f] ?? null : null;
  const ma = grip ? mantleArms(l, fr.meta, grip[0], grip[1]) : null;
  if (!grip) put(armAt(l, key, true, a.back), shoulderOf(l.app.body, true));
  out.blit(fr.body, 0, 0);
  if (!grip) put(armAt(l, key, false, a.front), shoulderOf(l.app.body, false));
  // 攀上邊緣：手臂在頭後面、手掌蓋在頭上面抓著牆角
  if (ma) out.blit(ma.arms, -ARMS_PAD, -ARMS_PAD);
  out.blit(fr.head, 0, 0);
  if (ma) out.blit(ma.hands, -ARMS_PAD, -ARMS_PAD);
  return out;
}
