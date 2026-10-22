import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

/** Composer sizes are physical pixels. Allocate AO directly at half size,
 * avoiding a full-size allocation followed by a second half-size allocation. */
export class HalfResolutionSSAOPass extends SSAOPass {
  override setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }
}
