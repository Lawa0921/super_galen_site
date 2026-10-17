import type {GameState,Unit} from './types';
import type {Vec2} from './maps';
/** Uniform bucket grid of living units, rebuilt lazily once per tick (O(n)). */
const CELL=2;
interface UnitGrid {tick:number;count:number;cells:Map<number,Unit[]>;home:Map<Unit,number>}
const grids=new WeakMap<GameState,UnitGrid>();
const key=(x:number,z:number)=>Math.floor(z/CELL)*4096+Math.floor(x/CELL);
function grid(s:GameState):UnitGrid {
  let g=grids.get(s);
  if(g&&g.tick===s.tick&&g.count===s.entities.length)return g;
  g={tick:s.tick,count:s.entities.length,cells:new Map(),home:new Map()};
  for(const e of s.entities){if(!e.alive||e.category!=='unit')continue;
    const k=key(e.x,e.z);let bucket=g.cells.get(k);if(!bucket)g.cells.set(k,bucket=[]);bucket.push(e);g.home.set(e,k);}
  grids.set(s,g);return g;
}
/** Keep bucket membership current after a unit moves inside the same tick. */
export function gridMoved(s:GameState,u:Unit):void {
  const g=grids.get(s);if(!g||g.tick!==s.tick||g.count!==s.entities.length)return;
  const before=g.home.get(u),after=key(u.x,u.z);if(before===after)return;
  if(before!==undefined){const bucket=g.cells.get(before);if(bucket){const i=bucket.indexOf(u);if(i>=0)bucket.splice(i,1);}}
  let bucket=g.cells.get(after);if(!bucket)g.cells.set(after,bucket=[]);bucket.push(u);g.home.set(u,after);
}
/** Living units whose centres lie within `radius` of p, in deterministic id order. */
export function unitsNear(s:GameState,p:Vec2,radius:number):Unit[] {
  const g=grid(s),out:Unit[]=[];
  const x0=Math.floor((p.x-radius)/CELL),x1=Math.floor((p.x+radius)/CELL),z0=Math.floor((p.z-radius)/CELL),z1=Math.floor((p.z+radius)/CELL);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const bucket=g.cells.get(z*4096+x);if(!bucket)continue;
    for(const u of bucket)if(u.alive&&Math.hypot(u.x-p.x,u.z-p.z)<=radius)out.push(u);}
  return out.length>1?out.sort((a,b)=>a.id-b.id):out;
}
