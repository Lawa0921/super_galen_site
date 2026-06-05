import type { InputAction } from '../engine/game';

/** 1P（vs AI）鍵位 → 引擎 action。key 用 KeyboardEvent.code 或 key。 */
export const KEYMAP_1P: Record<string, InputAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  Space: 'hardDrop',
  ShiftLeft: 'hold',
  KeyC: 'hold',
};
