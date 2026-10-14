export type InputAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';

const KEYS: Record<string, InputAction> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  Enter: 'confirm', ' ': 'confirm', z: 'confirm', Z: 'confirm', Escape: 'cancel', x: 'cancel', X: 'cancel',
};

export function mapKey(key: string): InputAction | null {
  return KEYS[key] ?? null;
}

export function bindKeys(target: Window, handler: (a: InputAction) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
    const a = mapKey(e.key);
    if (!a) return;
    // Enter/Space on a focused button must keep pressing that button.
    if ((a === 'confirm' || a === 'cancel') && (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    handler(a);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
