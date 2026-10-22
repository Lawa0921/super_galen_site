import { GRENADE_ORDER, nextGrenade, type GrenadeId, type Holder } from './grenades';
/** Held-key gameplay input. Left Ctrl is hold-to-crouch (CS default). */
export function keyboardInput(keys: ReadonlySet<string>) {
  return {
    forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    right: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    jump: keys.has('Space'),
    slow: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    interact: keys.has('KeyE'),
    crouch: keys.has('ControlLeft'),
  };
}

const captured = new Set(['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft']);
/** Keys whose browser default must be cancelled while playing. Holding Ctrl to
 * crouch turns WASD/E/R into Ctrl+key shortcuts (Ctrl+S, Ctrl+D, …), so every
 * Ctrl combination is cancelled. Browser-reserved ones (Ctrl+W/T/N) cannot be. */
export function capturesKey(e: { code: string; ctrlKey: boolean }) {
  return e.ctrlKey || captured.has(e.code);
}

type Slot = 'gun' | GrenadeId;
/** CS slots: 1/2 primary/secondary (one gun here), 4 cycles grenades. */
export function slotForKey(code: string, actor: Holder): Slot | null {
  if (code === 'Digit1' || code === 'Digit2') return 'gun';
  if (code === 'Digit4') return nextGrenade(actor);
  return null;
}
/** Mouse wheel walks gun → each carried grenade type → gun. */
export function wheelSlot(actor: Holder, direction: 1 | -1): Slot {
  const slots: Slot[] = ['gun', ...GRENADE_ORDER.filter(id => actor.grenades[id] > 0)];
  const index = Math.max(0, slots.indexOf(actor.held));
  return slots[(index + direction + slots.length) % slots.length];
}
