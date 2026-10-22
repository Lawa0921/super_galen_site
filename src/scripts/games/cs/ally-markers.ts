import * as THREE from 'three';
import type { Actor, Match } from './engine';
import { worldImpact } from './ballistics';
import { smokeBlocks } from './grenades';

/** A bounded DOM pool; only visible, living teammates receive identification.
 * Projection follows the rendered camera each frame, including spectator ADS.
 * These labels never reveal an enemy or a teammate through solid map geometry or smoke. */
export class AllyMarkers {
  private readonly labels = new Map<number, HTMLElement>();
  private readonly eye = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  constructor(private readonly container: HTMLElement) {}
  update(match: Match | null, view: Actor | null, camera: THREE.PerspectiveCamera) {
    const shown = new Set<number>();
    if (match?.phase === 'live' && view && view.hp > 0) {
      camera.updateMatrixWorld(); camera.getWorldPosition(this.eye);
      for (const actor of match.actors) {
        if (actor.id === view.id || actor.hp <= 0 || actor.team !== view.team) continue;
        this.point.set(actor.x, actor.y + 1.91, actor.z).project(camera);
        if (this.point.z < -1 || this.point.z > 1 || Math.abs(this.point.x) > .94 || Math.abs(this.point.y) > .92) continue;
        this.direction.set(actor.x, actor.y + 1.64, actor.z).sub(this.eye);
        const distance = this.direction.length();
        if (distance < .2 || distance > 60) continue;
        this.direction.divideScalar(distance);
        const eye = this.eye.toArray(), dir = this.direction.toArray();
        if (worldImpact(eye, dir).distance < distance - .03 || smokeBlocks(eye, dir, distance, match.smokes)) continue;
        let label = this.labels.get(actor.id);
        if (!label) {
          label = document.createElement('span'); label.className = 'cs-ally-marker'; label.dataset.actor = String(actor.id);
          this.labels.set(actor.id, label); this.container.append(label);
        }
        const text = `隊友 · ${actor.name}`;
        if (label.textContent !== text) label.textContent = text;
        // The game root fills the viewport; transforms avoid per-frame layout
        // reads and move only these two small compositor layers.
        const x = (this.point.x + 1) * .5 * innerWidth, y = (1 - this.point.y) * .5 * innerHeight;
        label.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
        label.hidden = false; shown.add(actor.id);
      }
    }
    for (const [id, label] of this.labels) if (!shown.has(id)) label.hidden = true;
  }
}
