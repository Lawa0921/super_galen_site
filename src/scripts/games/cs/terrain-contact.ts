import type { Vector3 } from 'three';

type Tread = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Minimum Y on the actual triangle surface inside a tread's XZ rectangle.
 * Clipping linearly interpolates the same surface rendered by the GPU, including
 * contacts between authored vertices. Scratch storage is reused across calls. */
export function createTriangleFloorProbe() {
  const first = new Float64Array(24), second = new Float64Array(24);
  return (a: Vector3, b: Vector3, c: Vector3, box: Tread) => {
    let input = first, output = second, count = 3;
    a.toArray(input, 0); b.toArray(input, 3); c.toArray(input, 6);
    for (let plane = 0; plane < 4 && count; plane++) {
      const axis = plane < 2 ? 0 : 2, sign = plane % 2 ? -1 : 1;
      const bound = plane === 0 ? box.minX : plane === 1 ? box.maxX : plane === 2 ? box.minZ : box.maxZ;
      let written = 0, previous = (count - 1) * 3;
      let previousDistance = sign * (input[previous + axis] - bound);
      for (let i = 0; i < count; i++) {
        const current = i * 3, distance = sign * (input[current + axis] - bound);
        if ((previousDistance >= 0) !== (distance >= 0)) {
          const t = previousDistance / (previousDistance - distance);
          for (let component = 0; component < 3; component++) {
            output[written++] = input[previous + component] + t * (input[current + component] - input[previous + component]);
          }
        }
        if (distance >= 0) for (let component = 0; component < 3; component++) output[written++] = input[current + component];
        previous = current; previousDistance = distance;
      }
      count = written / 3;
      const swap = input; input = output; output = swap;
    }
    let minimum = Infinity;
    for (let i = 0; i < count; i++) minimum = Math.min(minimum, input[i * 3 + 1]);
    return minimum;
  };
}
