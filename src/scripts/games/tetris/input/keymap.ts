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

/** 本機雙人 — P1（左手 WASD + Q/E 旋轉 + 左 Shift hold） */
export const KEYMAP_2P_A: Record<string, InputAction> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyS: 'softDrop',
  KeyW: 'hardDrop',
  KeyQ: 'rotateCCW',
  KeyE: 'rotateCW',
  ShiftLeft: 'hold',
};

/** 本機雙人 — P2（方向鍵 + ,/. 旋轉 + 右 Shift hold） */
export const KEYMAP_2P_B: Record<string, InputAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'hardDrop',
  Comma: 'rotateCCW',
  Period: 'rotateCW',
  ShiftRight: 'hold',
};
