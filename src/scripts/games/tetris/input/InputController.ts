import type { InputAction } from '../engine/game';

export interface DasArr { das: number; arr: number; }
type Emit = (action: InputAction) => void;

const REPEATABLE: InputAction[] = ['left', 'right'];

/** 管理左右長按的 DAS/ARR；其餘 action 單次觸發。以 update(dt) 推進。 */
export class InputController {
  private held: Partial<Record<InputAction, { sinceMs: number; charged: boolean }>> = {};
  constructor(private emit: Emit, private cfg: DasArr) {}

  press(action: InputAction): void {
    this.emit(action); // 立即一次
    if (REPEATABLE.includes(action)) {
      // 同向覆蓋（最後按下優先）
      if (action === 'left') delete this.held['right'];
      if (action === 'right') delete this.held['left'];
      this.held[action] = { sinceMs: 0, charged: false };
    }
  }

  release(action: InputAction): void {
    delete this.held[action];
  }

  update(dtMs: number): void {
    for (const action of REPEATABLE) {
      const st = this.held[action];
      if (!st) continue;
      st.sinceMs += dtMs;
      if (!st.charged) {
        if (st.sinceMs >= this.cfg.das) {
          st.charged = true;
          st.sinceMs -= this.cfg.das;
          this.emit(action);
        }
      }
      if (st.charged) {
        while (st.sinceMs >= this.cfg.arr) {
          st.sinceMs -= this.cfg.arr;
          this.emit(action);
        }
      }
    }
  }
}
