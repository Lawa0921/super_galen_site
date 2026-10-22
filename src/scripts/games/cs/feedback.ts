import { currentSpread, WEAPONS, type Actor, type Match, type Shot, type WeaponId } from './engine';
export function crosshairSpread(p: Actor) { return Math.min(5, Math.max(0, Math.ceil(currentSpread(p) / .009) - 1)); }
export type HurtDirection = 'front' | 'right' | 'back' | 'left';
export function hurtDirection(bearing: number, yaw: number): HurtDirection {
  const delta = Math.atan2(Math.sin(bearing - yaw), Math.cos(bearing - yaw));
  return Math.abs(delta) < Math.PI / 4 ? 'front' : Math.abs(delta) > Math.PI * .75 ? 'back' : delta < 0 ? 'right' : 'left';
}
export class CombatFeedback {
  hitUntil = 0; hurtUntil = 0; kind: 'hit' | 'head' | 'kill' = 'hit';
  damage = 0; target: number | null = null; hurtBearing = 0; strength = 0;
  private match: Match | null = null;
  private round = 0;
  private serial = 0;
  consume(m: Match, now: number): Shot[] {
    if (this.match !== m || this.round !== m.round) { this.clear(); this.match = m; this.round = m.round; }
    const fresh = m.shots.filter(shot => shot.id > this.serial).sort((a, b) => a.id - b.id);
    for (const shot of fresh) {
      this.serial = Math.max(this.serial, shot.id);
      if (shot.actor === m.actors[0].id && shot.damage > 0) {
        this.kind = shot.killed ? 'kill' : shot.head ? 'head' : 'hit';
        this.hitUntil = now + (shot.killed ? 850 : 350); this.damage = shot.damage; this.target = shot.target;
      }
      if (shot.target === m.actors[0].id && shot.damage > 0) {
        this.hurtUntil = now + 600; this.hurtBearing = Math.atan2(shot.tx - shot.x, shot.tz - shot.z);
        this.strength = Math.min(1, shot.damage / 70 + .2);
      }
    }
    return fresh;
  }
  clear(m: Match | null = null) {
    this.match = m; this.round = m?.round ?? 0; this.serial = m?.serial ?? 0;
    this.hitUntil = this.hurtUntil = this.damage = this.strength = this.hurtBearing = 0;
    this.kind = 'hit'; this.target = null;
  }
}
export type ReloadCue = 'release' | 'insert' | 'chamber';
const reloadCues: ReadonlyArray<readonly [number, ReloadCue]> = [[.18, 'release'], [.76, 'insert'], [.85, 'chamber']];
export class ReloadFeedback {
  private match: Match | null = null;
  private round = 0;
  private weapon?: WeaponId;
  private actorId?: number;
  private progress = 0;
  private active = false;
  private readonly cues: ReloadCue[] = [];
  consume(match: Match, p: Actor = match.actors[0]): readonly ReloadCue[] {
    this.cues.length = 0;
    if (match !== this.match || match.round !== this.round || p.weapon !== this.weapon || p.id !== this.actorId) { this.clear(match, p); return this.cues; }
    if (match.phase !== 'live' || p.hp <= 0) { this.clear(match, p); this.active = false; return this.cues; }
    const active = p.reload > 0, progress = active ? Math.max(0, 1 - p.reload / WEAPONS[p.weapon].reload) : 1;
    if (active && (!this.active || progress < this.progress)) { this.progress = 0; this.active = true; }
    if (this.active) for (const [at, cue] of reloadCues) if (this.progress < at && progress >= at) this.cues.push(cue);
    this.progress = progress; this.active = active;
    return this.cues;
  }
  clear(match: Match | null = null, p = match?.actors[0]) {
    this.match = match; this.round = match?.round ?? 0; this.weapon = p?.weapon; this.actorId = p?.id;
    this.active = !!p && p.reload > 0 && p.hp > 0 && match?.phase === 'live';
    this.progress = this.active ? Math.max(0, 1 - p!.reload / WEAPONS[p!.weapon].reload) : 0;
    this.cues.length = 0;
  }
}
