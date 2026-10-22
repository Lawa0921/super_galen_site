type Mode = 'baseline' | 'probe' | 'adapted' | 'recovery' | 'ineffective' | 'restart';

/** Session-only pixel budget. RAF cadence is not a GPU timer: a lower pixel
 * count must demonstrate a benefit before we retain it. Simulation time and
 * the player's quality preference are deliberately outside this policy. */
export class FrameBudget {
  private current = 1;
  private floor = .8;
  private mode: Mode = 'baseline';
  private settle = 1;
  private readonly samples = new Float64Array(240);
  private count = 0;
  private cursor = 0;
  private elapsed = 0;
  private windows = 0;
  private total = 0;
  private baseline = 0;
  private headroom = 0;
  private cooldown = 0;

  get scale() { return this.current; }

  reset(floor = .8) {
    this.floor = Number.isFinite(floor) ? Math.max(.8, Math.min(1, floor)) : 1;
    this.current = 1; this.mode = 'baseline'; this.settle = 1;
    this.baseline = 0; this.headroom = 0; this.cooldown = 0;
    this.clearWindow(); this.windows = 0; this.total = 0;
  }

  /** Returns true only when the drawing buffers need a different scale.
   * Inactive/discontinuous frames never clear a paused canvas by resizing it. */
  frame(seconds: number, active: boolean): boolean {
    if (!active || !Number.isFinite(seconds) || seconds <= 0 || seconds > .25) {
      this.clearWindow(); this.windows = 0; this.total = 0;
      this.headroom = 0; this.settle = 1;
      if (this.mode === 'probe' || this.mode === 'recovery') this.mode = 'restart';
      return false;
    }
    if (this.mode === 'restart') {
      const changed = this.current !== 1;
      this.reset(this.floor);
      return changed;
    }
    if (this.floor === 1 || this.mode === 'ineffective') return false;
    this.cooldown = Math.max(0, this.cooldown - seconds);
    if (this.settle > 1e-9) { this.settle -= seconds; return false; }
    this.samples[this.cursor] = seconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    this.elapsed += seconds;
    // Time and sample gates both matter: 30 frames on a 240 Hz display are
    // insufficient evidence. Only the window boundary allocates/sorts.
    if (this.elapsed + 1e-9 < 2 || this.count < 30) return false;
    const ordered = this.samples.slice(0, this.count).sort();
    const middle = Math.floor(this.count / 2);
    const median = this.count % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
    const duration = this.elapsed;
    this.clearWindow();

    if (this.mode === 'baseline') {
      if (median <= .022) { this.windows = 0; this.total = 0; return false; }
      this.total += median;
      if (++this.windows < 2) return false;
      this.baseline = this.total / this.windows;
      return this.change(this.floor, 'probe');
    }
    if (this.mode === 'probe') {
      this.total += median;
      if (++this.windows < 2) return false;
      const observed = this.total / this.windows;
      if (observed <= .019 || observed <= this.baseline * .88) {
        this.mode = 'adapted'; this.windows = 0; this.total = 0;
        return false;
      }
      return this.change(1, 'ineffective');
    }
    if (this.mode === 'recovery') {
      if (median <= .019) {
        this.mode = 'baseline'; this.windows = 0; this.total = 0;
        return false;
      }
      this.cooldown = 60;
      return this.change(this.floor, 'adapted');
    }
    if (median <= .0175 && this.cooldown === 0) this.headroom += duration;
    else this.headroom = 0;
    return this.headroom + 1e-9 >= 20 ? this.change(1, 'recovery') : false;
  }

  private clearWindow() { this.count = 0; this.cursor = 0; this.elapsed = 0; }
  private change(scale: number, mode: Mode) {
    const changed = this.current !== scale;
    this.current = scale; this.mode = mode; this.settle = 1;
    this.windows = 0; this.total = 0; this.headroom = 0; this.clearWindow();
    return changed;
  }
}
