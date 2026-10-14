import type { Actor, Shot, WeaponId } from './engine';
import type { ReloadCue } from './feedback';
import type { WorldSurface } from './ballistics';
import { MAP } from './map';
import { elevationRayHit } from './elevation';

export interface ImpactCue { surface: Exclude<WorldSurface, 'none'>; gain: number; pan: number }
export interface ShotCue { distance: number; pan: number; occluded: boolean }
export function worldShotCue(shot: Pick<Shot, 'x' | 'y' | 'z'>, listener: Actor, yaw: number): ShotCue | null {
  const origin = [listener.x, listener.y + 1.58, listener.z];
  const delta = [shot.x - origin[0], shot.y - origin[1], shot.z - origin[2]];
  const distance = Math.hypot(...delta), horizontal = Math.hypot(delta[0], delta[2]);
  if (!Number.isFinite(distance) || !Number.isFinite(yaw)) return null;
  // A bounded, direct-path approximation evaluated once per shot. Positive
  // interior length excludes touching a wall edge or a box beyond the muzzle.
  const terrain = distance > .02 ? elevationRayHit(origin, delta.map(v => v / distance)) : null;
  const occluded = !!terrain && terrain.distance > .02 && terrain.distance < distance - .02 || distance > .02 && MAP.obstacles.some(box => {
    const min = [box.minX, 0, box.minZ], max = [box.maxX, box.height, box.maxZ];
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(delta[axis]) < 1e-8) {
        if (origin[axis] <= min[axis] || origin[axis] >= max[axis]) return false;
      } else {
        const a = (min[axis] - origin[axis]) / delta[axis], b = (max[axis] - origin[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        if (enter >= leave) return false;
      }
    }
    return (leave - enter) * distance > .02;
  });
  return { distance, pan: horizontal > 1e-6 ? (delta[0] * Math.cos(yaw) - delta[2] * Math.sin(yaw)) / horizontal : 0, occluded };
}
const impactSounds = {
  stone: [3600, .22, .06, 1.4], wood: [950, .27, .08, .75],
  metal: [6200, .19, .035, 2.3], ground: [600, .16, .075, .65],
} as const;
export function worldImpactCue(shot: Shot, listener: Actor, yaw: number): ImpactCue | null {
  if (shot.surface === 'actor' || shot.surface === 'none') return null;
  const dx = shot.tx - listener.x, dy = shot.ty - listener.y - 1.58, dz = shot.tz - listener.z;
  const distance = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || !Number.isFinite(yaw) || distance >= 24) return null;
  return {
    surface: shot.surface, gain: (1 - distance / 24) ** 2,
    pan: horizontal > 1e-6 ? (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / horizontal : 0,
  };
}
/** Synthesized gameplay feedback; no external recordings or network requests. */
export class CombatAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private noise?: AudioBuffer;
  private longNoise?: AudioBuffer;
  private voices = 0;
  private ringUntil = 0;
  private ringLength = 0;
  private ringStrength = 0;
  /** Master level, ducked while a flash bang rings in the ears. */
  private level() {
    const c = this.context!, remaining = this.ringUntil - c.currentTime;
    const duck = remaining > 0 ? 1 - .8 * this.ringStrength * Math.min(1, remaining / Math.min(this.ringLength, 2)) : 1;
    return this.volume * .35 * duck;
  }
  private lastImpact = -Infinity;
  volume = .6;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext(); this.gain = this.context.createGain(); this.gain.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * .18, this.context.sampleRate);
      const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / data.length * 7);
      // A slowly decaying 1.6 s noise for blasts and smoke hiss.
      this.longNoise = this.context.createBuffer(1, Math.round(this.context.sampleRate * 1.6), this.context.sampleRate);
      const tail = this.longNoise.getChannelData(0); for (let i = 0; i < tail.length; i++) tail[i] = (Math.random() * 2 - 1) * Math.exp(-i / tail.length * 2.2);
    }
    await this.context.resume();
  }
  private burst(cutoff: number, volume: number, duration: number, pan: number, rate = 1, long = false) {
    const c = this.context; if (!c || !this.gain || !this.noise || c.state !== 'running' || this.volume <= 0 || this.voices >= 32) return false;
    this.gain.gain.value = this.level();
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), level = c.createGain(), stereo = c.createStereoPanner();
    src.buffer = long && this.longNoise ? this.longNoise : this.noise; src.playbackRate.value = rate; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    level.gain.setValueAtTime(volume, c.currentTime); level.gain.exponentialRampToValueAtTime(.0001, c.currentTime + duration);
    stereo.pan.value = Math.max(-1, Math.min(1, pan)); src.connect(filter); filter.connect(level); level.connect(stereo); stereo.connect(this.gain);
    this.voices++; src.onended = () => { this.voices--; src.disconnect(); filter.disconnect(); level.disconnect(); stereo.disconnect(); }; src.start(); src.stop(c.currentTime + duration);
    return true;
  }
  impact(cue: ImpactCue | null) {
    const c = this.context;
    if (!cue || !c || cue.gain <= 0 || c.currentTime - this.lastImpact < .03) return false;
    const [cutoff, level, duration, rate] = impactSounds[cue.surface];
    // One short noise voice, shared with the existing 32-voice ceiling. A
    // clustered volley never adds oscillators or throttles shot/hurt feedback.
    const played = this.burst(cutoff, level * cue.gain, duration, cue.pan, rate);
    if (played) this.lastImpact = c.currentTime;
    return played;
  }
  shot(distance = 0, weapon: WeaponId = 'rifle', pan = 0, occluded = false, local = false) {
    const preset = { pistol: [4400, 150, .085, 1.2], smg: [3600, 125, .07, 1.35], rifle: [2900, 95, .13, .95], sniper: [1800, 65, .18, .75] }[weapon];
    const level = Math.min(1, 5 / Math.max(5, distance)) * (occluded ? .28 : 1) * (local ? 1.45 : 1);
    const played = this.burst(occluded ? 750 : preset[0], level, preset[2], pan, preset[3]);
    if (played) this.tone(preset[1] * 1.4, .11, .34 * level, pan, preset[1] * .45);
    return played;
  }
  hit(head: boolean, killed: boolean) {
    this.burst(head ? 4800 : 1500, .48, .045, 0, 1.8);
    this.tone(killed ? 760 : head ? 1650 : 930, killed ? .13 : .045, killed ? .24 : .13);
    if (killed) this.tone(380, .09, .15);
  }
  hurt(damage: number, pan = 0) {
    this.burst(750, Math.min(.7, damage / 90 + .25), .15, pan, .65); this.tone(64, .12, .3);
  }
  death() {
    this.burst(420, .65, .28, 0, .45); this.tone(95, .24, .2); this.tone(47, .38, .17);
  }
  reload(cue: ReloadCue, weapon: WeaponId) {
    const heavy = weapon === 'rifle' || weapon === 'sniper';
    if (cue === 'release') {
      this.burst(2200, .28, .055, .12, 1.5); this.tone(heavy ? 190 : 310, .035, .08);
    } else if (cue === 'insert') {
      this.burst(1300, .42, .075, -.08, .85); this.tone(heavy ? 125 : 230, .045, .12);
    } else {
      this.burst(4100, .34, .09, .1, 1.8); this.tone(740, .028, .07);
    }
  }
  tone(frequency: number, duration = .1, volume = .12, pan?: number, endFrequency?: number) {
    const c = this.context; if (!c || !this.gain || c.state !== 'running' || this.volume <= 0 || this.voices >= 32) return;
    this.gain.gain.value = this.level();
    const osc = c.createOscillator(), gain = c.createGain(); osc.frequency.value = frequency; osc.type = 'triangle';
    if (endFrequency !== undefined) {
      osc.frequency.setValueAtTime(frequency, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFrequency, c.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, c.currentTime + duration);
    const stereo = pan === undefined ? null : c.createStereoPanner();
    osc.connect(gain);
    if (stereo) { stereo.pan.value = Math.max(-1, Math.min(1, pan!)); gain.connect(stereo); stereo.connect(this.gain); }
    else gain.connect(this.gain);
    this.voices++; osc.start(); osc.stop(c.currentTime + duration);
    osc.onended = () => { this.voices--; osc.disconnect(); gain.disconnect(); stereo?.disconnect(); };
  }
  /** HE: long low rumble + sub drop. Flash: sharp crack. Smoke: long hiss. */
  blast(kind: 'he' | 'flash' | 'smoke', cue: ShotCue | null) {
    if (!cue) return false;
    const near = Math.min(1, 8 / Math.max(8, cue.distance)) * (cue.occluded ? .35 : 1);
    if (kind === 'he') {
      const played = this.burst(cue.occluded ? 520 : 1400, .95 * near, 1.1, cue.pan, .55, true);
      if (played) this.tone(70, .7, .5 * near, cue.pan, 28);
      return played;
    }
    if (kind === 'flash') {
      const played = this.burst(cue.occluded ? 900 : 7000, .85 * near, .22, cue.pan, 1.6);
      if (played) this.tone(1900, .06, .12 * near, cue.pan, 900);
      return played;
    }
    return this.burst(cue.occluded ? 1500 : 5200, .32 * near, 1.5, cue.pan, .9, true);
  }
  /** Metallic tick of a grenade hitting stone or ground. */
  bounce(cue: ShotCue | null) {
    if (!cue || cue.distance > 25) return false;
    const gain = (1 - cue.distance / 25) ** 2 * (cue.occluded ? .4 : 1);
    const played = this.burst(6500, .3 * gain, .05, cue.pan, 2.1);
    if (played) this.tone(2300, .05, .06 * gain, cue.pan, 1700);
    return played;
  }
  /** Pin pull / spoon release on the viewed player's grenade. */
  pin() { this.burst(5200, .22, .03, .15, 2.2); this.tone(1500, .03, .05); }
  /** Ear ringing after a flash: two beating sines plus a ducked mix. */
  flashRing(strength: number, duration: number) {
    const c = this.context; if (!c || !this.gain || c.state !== 'running' || this.volume <= 0 || strength <= 0 || duration <= 0) return;
    this.ringUntil = c.currentTime + duration; this.ringLength = duration; this.ringStrength = Math.min(1, strength);
    for (const frequency of [3150, 3290]) {
      if (this.voices >= 32) return;
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.05 * this.ringStrength * this.volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, c.currentTime + duration);
      osc.connect(gain); gain.connect(c.destination);
      this.voices++; osc.start(); osc.stop(c.currentTime + duration);
      osc.onended = () => { this.voices--; osc.disconnect(); gain.disconnect(); };
    }
  }
  dispose() { void this.context?.close(); }
}
