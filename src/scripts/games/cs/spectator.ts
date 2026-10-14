import type { Actor, Match, Shot, WeaponId } from './engine';

export interface DeathSummary { killerId: number; killerName: string; weapon: WeaponId; head: boolean; grenade?: 'he' }
function lethalShot(m: Match, actorId: number): Readonly<Shot> | undefined {
  const valid = (s: Readonly<Shot>) => s.round === m.round && s.target === actorId && s.killed && s.damage > 0;
  return m.deaths.findLast(d => d.actor.id === actorId && valid(d.shot))?.shot ?? m.shots.findLast(valid);
}
function deathSummary(m: Match, shot: Readonly<Shot> | undefined): DeathSummary | null {
  return shot ? { killerId: shot.actor, killerName: m.actors.find(p => p.id === shot.actor)?.name ?? '未知攻擊者', weapon: shot.weapon, head: shot.head, ...(shot.grenade ? { grenade: shot.grenade } : {}) } : null;
}
export function selectViewActor(m: Match, requested?: number | null): Actor {
  const self = m.actors[0];
  if (self.hp > 0 || requested === self.id) return self;
  return m.actors.find(p => p.id === requested && p.team === self.team && p.hp > 0)
    ?? m.actors.find(p => p.team === self.team && p.hp > 0) ?? self;
}
export class SpectatorState {
  viewId: number | null = null;
  death: DeathSummary | null = null;
  private match: Match | null = null;
  private round = 0;
  private dead = false;
  private holdUntil = 0;
  update(m: Match | null): 'none' | 'died' | 'revived' {
    if (!m) { this.match = null; this.round = 0; this.dead = false; this.holdUntil = 0; this.viewId = null; this.death = null; return 'none'; }
    const self = m.actors[0], dead = self.hp <= 0;
    if (m !== this.match || m.round !== this.round) {
      this.match = m; this.round = m.round; this.dead = dead; this.death = dead ? deathSummary(m, lethalShot(m, self.id)) : null; this.holdUntil = 0;
      this.viewId = selectViewActor(m).id; return 'none';
    }
    let transition: 'none' | 'died' | 'revived' = 'none';
    if (dead && !this.dead) {
      const shot = lethalShot(m, self.id);
      transition = 'died'; this.holdUntil = (shot?.at ?? m.time) + .65; this.viewId = self.id;
      this.death = deathSummary(m, shot);
    } else if (!dead && this.dead) {
      transition = 'revived'; this.death = null; this.holdUntil = 0;
    }
    this.dead = dead;
    if (!dead) this.viewId = self.id;
    else if (m.time >= this.holdUntil) this.viewId = selectViewActor(m, this.viewId === self.id ? undefined : this.viewId).id;
    return transition;
  }
  cycle(m: Match, direction: -1 | 1) {
    this.update(m);
    const self = m.actors[0];
    if (self.hp > 0 || m.phase !== 'live') return false;
    const allies = m.actors.filter(p => p.team === self.team && p.hp > 0);
    if (!allies.length) return false;
    const index = allies.findIndex(p => p.id === this.viewId);
    const next = allies[index < 0 ? direction > 0 ? 0 : allies.length - 1 : (index + direction + allies.length) % allies.length];
    this.holdUntil = 0;
    const changed = next.id !== this.viewId; this.viewId = next.id; return changed;
  }
  available(m: Match) { return m.actors.filter(p => p.team === m.actors[0].team && p.hp > 0).length; }
}
