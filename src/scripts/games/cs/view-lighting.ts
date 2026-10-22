import { rayBox } from './map';
interface Block { minX: number; maxX: number; minZ: number; maxZ: number; height: number }
export const WORLD_SUN = [-22, 22, 16] as const;
/** Coarse direct-light occlusion from the static map; no raycasts or GPU readback. */
export class ViewLighting {
  exposure = 1;
  private initialized = false;
  private readonly origin = [0, 0, 0];
  private readonly direction: number[];
  private readonly boxes: { min: number[]; max: number[] }[];
  constructor(blocks: readonly Block[], sun: readonly [number, number, number] = WORLD_SUN) {
    this.direction = [...sun];
    this.boxes = blocks.map(block => ({ min: [block.minX, 0, block.minZ], max: [block.maxX, block.height, block.maxZ] }));
  }
  sample(x: number, y: number, z: number) {
    this.origin[0] = x; this.origin[1] = y; this.origin[2] = z;
    for (const box of this.boxes) if (Number.isFinite(rayBox(this.origin, this.direction, box.min, box.max))) return 0;
    return 1;
  }
  update(x: number, y: number, z: number, dt: number) {
    if (dt <= 0) return;
    const target = this.sample(x, y, z);
    this.exposure = this.initialized ? this.exposure + (target - this.exposure) * (1 - Math.exp(-dt * 8)) : target;
    this.initialized = true;
  }
  reset() { this.initialized = false; this.exposure = 1; }
}
