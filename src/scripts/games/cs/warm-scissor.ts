/** Logical scissor size that still covers one physical pixel. Three multiplies
 * the default framebuffer scissor by the pixel ratio and floors it, so a 1px
 * logical rectangle vanishes once the frame budget scales the ratio below 1. */
export function warmScissorSize(pixelRatio: number) {
  return Math.max(1, Math.ceil(1 / pixelRatio));
}
