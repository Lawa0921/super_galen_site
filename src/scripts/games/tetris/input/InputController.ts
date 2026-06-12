import type { InputAction } from '../engine/game';

export interface DasArr { das: number; arr: number; sdf?: number; }
type Emit = (action: InputAction) => void;

const REPEATABLE: InputAction[] = ['left', 'right'];
const SDF_DEFAULT_MS = 30;
const SDF_MAX_PER_UPDATE = 20; // sdf<=0（瞬降）的單幀觸發上限，防爆

/** 管理左右長按的 DAS/ARR 與 softDrop 長按的 SDF；其餘 action 單次觸發。以 update(dt) 推進。 */
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
    if (action === 'softDrop') {
      this.held['softDrop'] = { sinceMs: 0, charged: true }; // 無 DAS 充能，直接進重複期
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
    this.updateSoftDrop(dtMs);
  }

  private updateSoftDrop(dtMs: number): void {
    const st = this.held['softDrop'];
    if (!st) return;
    const sdf = this.cfg.sdf ?? SDF_DEFAULT_MS;
    if (sdf <= 0) {
      // 0ms＝瞬降：每次 update 觸發多次，但設單幀上限防爆
      for (let i = 0; i < SDF_MAX_PER_UPDATE; i++) this.emit('softDrop');
      st.sinceMs = 0;
      return;
    }
    st.sinceMs += dtMs;
    while (st.sinceMs >= sdf) {
      st.sinceMs -= sdf;
      this.emit('softDrop');
    }
  }
}
