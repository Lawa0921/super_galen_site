import type { InputAction } from '../engine/types';

/** KeyboardEvent.code -> 遊戲動作。射擊為自動，無需按鍵。 */
export const KEYMAP: Record<string, InputAction> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'focus', ShiftRight: 'focus',
  KeyX: 'bomb', KeyK: 'bomb',
  KeyZ: 'overdrive', KeyJ: 'overdrive', Space: 'overdrive',
};
