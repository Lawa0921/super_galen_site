/**
 * 道具技能薄封裝（Phase 4）。
 * 全部走引擎 default-inactive 新接口（setGravityScale / clearBottomRows /
 * rerollQueue / addShield）——不啟用時引擎行為與原版逐位相同。
 * 線上路徑（netMain / ffaNetMain / lockstep）完全不接此模組。
 */
import type { TetrisGame } from './game';
import type { TetrisMatch, Side } from './match';

export type SkillId = 'bomb' | 'slow' | 'reroll' | 'shield';

export interface SkillContext {
  game: TetrisGame;
  match?: TetrisMatch;
  side?: Side;
}

/** 地城炸彈預設清除行數（perk 可加成，經 opts.bombRows 參數化） */
export const DEFAULT_BOMB_ROWS = 2;
/** 符文護盾預設抵擋行數 */
export const DEFAULT_SHIELD_ROWS = 8;
/** 時之沙重力倍率 */
export const SLOW_SCALE = 0.3;
/** 時之沙持續時間（計時由呼叫端管理；引擎只負責 set/reset） */
export const SLOW_DURATION_MS = 10000;

/**
 * 發動技能。slow 的時長計時由呼叫端（渲染層）管理，到時呼叫 resetSlow。
 * shield 需要 ctx.match + ctx.side（vs-AI 限定），缺少時 throw 以避免接線錯誤被靜默吞掉。
 */
export function applySkill(
  ctx: SkillContext,
  skill: SkillId,
  opts?: { bombRows?: number; shieldRows?: number },
): void {
  switch (skill) {
    case 'bomb':
      ctx.game.clearBottomRows(opts?.bombRows ?? DEFAULT_BOMB_ROWS);
      break;
    case 'slow':
      ctx.game.setGravityScale(SLOW_SCALE);
      break;
    case 'reroll':
      ctx.game.rerollQueue();
      break;
    case 'shield':
      if (!ctx.match || !ctx.side) {
        throw new Error('shield skill requires match context (match + side)');
      }
      ctx.match.addShield(ctx.side, opts?.shieldRows ?? DEFAULT_SHIELD_ROWS);
      break;
  }
}

/** 時之沙結束：重力倍率還原 1（原行為）。 */
export function resetSlow(game: TetrisGame): void {
  game.setGravityScale(1);
}
