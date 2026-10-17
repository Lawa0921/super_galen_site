import type {Vec2} from './maps';
type Snapshot=Vec2 & {facing:number};
/** Render-only history. Never feeds interpolated coordinates into simulation. */
export class UnitPresentation {
  private previous:Snapshot|null=null;
  private current:Snapshot|null=null;
  private time=0;
  private fraction=0;
  private speed=0;
  private rendered:Snapshot & {speed:number}={x:0,z:0,facing:0,speed:0};
  sample(point:Snapshot,time:number,fraction:number,nominalSpeed:number){
    if(!this.current){this.previous={...point};this.current={...point};this.time=time;}
    else if(time!==this.time){
      const elapsed=time-this.time,distance=Math.hypot(point.x-this.current.x,point.z-this.current.z);
      // Missing fixed ticks, newly visible entities and teleports have no safe
      // previous pose. Snap rather than showing a long, invented path.
      const contiguous=elapsed>0&&elapsed<=.075&&distance<=nominalSpeed*elapsed*2+.05;
      this.previous=contiguous?this.current:{...point};this.current={...point};
      this.speed=contiguous?Math.min(nominalSpeed,distance/elapsed):0;this.time=time;this.fraction=0;
    }
    // The clock clears its remainder on pause; a repeated snapshot must not
    // rewind an already displayed pose when play resumes.
    this.fraction=Math.max(this.fraction,Math.max(0,Math.min(1,Number.isFinite(fraction)?fraction:1)));
    const a=this.previous!,b=this.current!,t=this.fraction;
    this.rendered.x=a.x+(b.x-a.x)*t;this.rendered.z=a.z+(b.z-a.z)*t;
    this.rendered.facing=a.facing+Math.atan2(Math.sin(b.facing-a.facing),Math.cos(b.facing-a.facing))*t;
    this.rendered.speed=this.speed;return this.rendered;
  }
}
