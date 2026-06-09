// keymap.ts
import type { InputAction } from '../engine/types';

/** KeyboardEvent.code -> 遊戲動作。 */
export const KEYMAP: Record<string, InputAction> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'bomb', KeyJ: 'bomb', KeyK: 'bomb',
  ShiftLeft: 'ability', ShiftRight: 'ability', KeyE: 'ability',
};
