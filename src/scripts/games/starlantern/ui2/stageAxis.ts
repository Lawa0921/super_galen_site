/**
 * Screen rects to stage px (legibility Task 2a). The stage is drawn scaled by --slx-s, a fraction at 125% or 150%, and on a
 * touch phone held upright it is also turned a quarter clockwise, so its top runs down the screen's right edge. Code that
 * moves a scroll position (in layout px, which are stage px) by a measured distance must measure in stage px.
 */

/**
 * `r`'s top and bottom edges in stage px (0..360 down the stage). `screen` is the stage's own rect: null or of no size
 * hands `r` back as it is. A screen wider than tall is upright (s = width / 640); else it is turned (s = width / 360).
 */
/**
 * `r`'s length along the stage's rows in stage px, unrounded (re-review of bond plan Tasks 12-14): its width on an upright
 * screen, its height on a turned one. `screen` as for stageSpan; none (or of no size) hands back `r.width`.
 */
export function stageWidth(r: DOMRectReadOnly, screen: DOMRectReadOnly | null): number {
  if (!screen || !screen.width || !screen.height) return r.width;
  return screen.width >= screen.height ? r.width / (screen.width / 640) : r.height / (screen.width / 360);
}

export function stageSpan(r: DOMRectReadOnly, screen: DOMRectReadOnly | null): { top: number; bottom: number } {
  if (!screen || !screen.width || !screen.height) return { top: r.top, bottom: r.bottom };
  if (screen.width >= screen.height) {
    const s = screen.width / 640;
    return { top: (r.top - screen.top) / s, bottom: (r.bottom - screen.top) / s };
  }
  const s = screen.width / 360;
  return { top: (screen.right - r.right) / s, bottom: (screen.right - r.left) / s };
}
