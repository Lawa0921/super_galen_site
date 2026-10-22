// pose.ts — PlayerPose（co-op M-C2 D1）：畫一個玩家需要的全部（精簡，不用 getState）。
// 本地 / 遠端玩家都由它畫；房主由 DelveGame.poseOf 產生，經 ws 送給客人（net/protocol.ts WirePose）。
// 純資料與純函式：不碰 RNG、不讀時間。
import { ITEMS, type ItemId, type WeaponKind } from './items';
import type { Stack } from './inventory';

export interface PlayerPose {
  /** 身體左上角（px）、速度（px/s） */
  x: number; y: number; vx: number; vy: number; onGround: boolean; gfxOffY: number;
  facing: 1 | -1; dead: boolean; iframes: number; boating: boolean; climbing: boolean;
  /** 攀上邊緣：p = 進度 0..1、dir、牆角（px）；null = 沒在攀 */
  mantle: { p: number; dir: 1 | -1; edgeX: number; edgeY: number } | null;
  liquidFrac: number;
  /** 快捷欄選中格的物品（船上照帶，畫的人自己收起來） */
  held: ItemId | null;
  /** at = 開始揮的世界時間（秒）：進度 = (time − at) / dur（60 fps 下平滑） */
  attack: { item: ItemId; kind: WeaponKind; angle: number; dir: 1 | -1; at: number; dur: number } | null;
  /** 挖掘的 tile、進度 0..1、手上顯示的鎬（背包裡最好的） */
  mining: { x: number; y: number; progress: number; pick: ItemId | null } | null;
  fishing: { state: 'flying' | 'floating' | 'bite'; x: number; y: number; liquid: boolean } | null;
  /**
   * 受到一擊的計數（0..255 循環）：引擎發「hurt 且沒有 cause」（本地 renderer 當成挨打的那種）時 +1。
   * 別人 / 客人自己的受傷姿勢看它有沒有變（突進 / 重生 / 不死的無敵時間不算挨打）
   */
  hurt: number;
}

export const WEAPON_KINDS: readonly WeaponKind[] = ['sword', 'broadsword', 'spear', 'bow', 'throw', 'boomerang', 'staff'];
export const FISH_STATES: readonly NonNullable<PlayerPose['fishing']>['state'][] = ['flying', 'floating', 'bite'];

/** 背包裡最好的鎬（speed 最高，同速取前面那格；挖掘時手上顯示它）；沒有 → null */
export function bestPick(slots: readonly (Stack | null)[]): ItemId | null {
  let best: ItemId | null = null, tier = -1;
  for (const s of slots) {
    const p = s ? ITEMS[s.item].pick : undefined;
    if (s && p && p.speed > tier) { tier = p.speed; best = s.item; }
  }
  return best;
}

/**
 * 兩筆 pose 之間（k = 0..1）：x / y 線性內插；同一格的挖掘進度也內插（換格 / 進度變小 = 重新開始 → 取 b）；
 * 其他欄位取較新的 b。
 */
export function lerpPose(a: PlayerPose, b: PlayerPose, k: number): PlayerPose {
  const ma = a.mining, mb = b.mining;
  const mining = ma && mb && ma.x === mb.x && ma.y === mb.y && mb.progress >= ma.progress
    ? { ...mb, progress: ma.progress + (mb.progress - ma.progress) * k }
    : mb;
  return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, mining };
}
