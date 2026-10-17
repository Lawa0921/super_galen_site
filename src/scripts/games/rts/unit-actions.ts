import type {Unit} from './types';
import type {TeamView} from './scene';
import type {AnimationCue} from './unit-reaction';

export const CAST_WINDOW=.6;
export interface CastAnimationCue extends AnimationCue {kind:NonNullable<Unit['castCue']>['kind']}
export function castPlayback(base:string,cue:CastAnimationCue|undefined):CastAnimationCue|undefined {
  return base!=='death'&&cue&&Number.isFinite(cue.elapsed)&&cue.elapsed>=0&&cue.elapsed<CAST_WINDOW?cue:undefined;
}
export function isWorkAnimation(name:string):boolean {return name==='work'||name==='mine'||name==='chop'||name==='build';}

export function workAnimation(unit:Unit,view:Pick<TeamView,'entities'|'resources'|'knownBuildings'>):string {
  if(unit.animation!=='work'||unit.kind!=='worker')return unit.animation;
  if(unit.order.type==='gather'){
    const id=unit.order.resourceId,resource=view.resources.find(r=>r.id===id);
    if(resource)return resource.kind==='gold'?'mine':'chop';
  }else if(unit.order.type==='build'||unit.order.type==='repair'){
    const id=unit.order.targetId;
    if(view.entities.some(e=>e.id===id&&e.category==='building'))return 'build';
  }
  return unit.animation;
}
