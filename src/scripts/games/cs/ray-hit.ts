export interface RayHit { distance: number; nx: number; ny: number; nz: number }
// Shots need a face normal; the hot AI visibility path keeps its scalar query.
export function rayBoxHit(o: number[], d: number[], min: number[], max: number[]): RayHit | null {
  let near = 0, far = Infinity, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < min[i] || o[i] > max[i]) return null; }
    else {
      let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      if (a > near || (a === near && axis < 0)) { near = a; axis = i; sign = d[i] > 0 ? -1 : 1; }
      far = Math.min(far, b); if (near > far) return null;
    }
  }
  if (far < 0) return null;
  if (axis < 0) { axis = Math.abs(d[0]) >= Math.abs(d[1]) && Math.abs(d[0]) >= Math.abs(d[2]) ? 0 : Math.abs(d[1]) >= Math.abs(d[2]) ? 1 : 2; sign = d[axis] > 0 ? -1 : 1; }
  return { distance: near, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
}
