export class RenderSchedule {
  private dirty = true;
  private wasPaused = false;

  invalidate() { this.dirty = true; }

  frame(paused: boolean, visible = true) {
    if (!visible) {
      this.dirty = true;
      return false;
    }
    const draw = !paused || !this.wasPaused || this.dirty;
    this.wasPaused = paused;
    this.dirty = false;
    return draw;
  }
}
