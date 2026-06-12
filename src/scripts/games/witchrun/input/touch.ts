import type { WitchGame } from '../engine/game';
import { FIELD_W } from '../engine/constants';

/**
 * 單指拖曳=相對移動（1.6 倍增益，拇指不擋機體）；第二指按住=低速模式。
 * 畫面 DOM 按鈕（#witch-btn-bomb / #witch-btn-od）由本模組綁定。
 * 回傳解除函數。
 */
export function attachTouch(canvas: HTMLCanvasElement, game: WitchGame, onGesture: () => void): () => void {
  let lastX = 0, lastY = 0, primaryId: number | null = null;
  const GAIN = 1.6;

  const scale = (): number => {
    const rect = canvas.getBoundingClientRect();
    return FIELD_W / Math.min(rect.width, rect.height * (480 / 640));
  };

  const onStart = (e: TouchEvent): void => {
    e.preventDefault();
    onGesture();
    if (primaryId === null) {
      const t = e.changedTouches[0];
      primaryId = t.identifier; lastX = t.clientX; lastY = t.clientY;
    }
    if (e.touches.length >= 2) game.setFocus(true);
  };
  const onMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== primaryId) continue;
      const k = scale() * GAIN;
      game.nudge((t.clientX - lastX) * k, (t.clientY - lastY) * k);
      lastX = t.clientX; lastY = t.clientY;
    }
  };
  const onEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === primaryId) primaryId = null;
    }
    if (e.touches.length < 2) game.setFocus(false);
  };

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);
  canvas.addEventListener('touchcancel', onEnd);

  const bombBtn = document.getElementById('witch-btn-bomb');
  const odBtn = document.getElementById('witch-btn-od');
  const onBomb = (): void => { onGesture(); game.input('bomb'); };
  const onOd = (): void => { onGesture(); game.input('overdrive'); };
  bombBtn?.addEventListener('click', onBomb);
  odBtn?.addEventListener('click', onOd);

  return () => {
    canvas.removeEventListener('touchstart', onStart);
    canvas.removeEventListener('touchmove', onMove);
    canvas.removeEventListener('touchend', onEnd);
    canvas.removeEventListener('touchcancel', onEnd);
    bombBtn?.removeEventListener('click', onBomb);
    odBtn?.removeEventListener('click', onOd);
  };
}
