import type {GameState,Entity} from './types';
import {UNITS,BUILDINGS,type TeamId} from './catalog';
import type {Vec2,Footprint} from './maps';
import {revealSightDisk} from './sight-raster';
import {buildingIntegrity,BUILDING_DEATH_SECONDS} from './building-lifecycle';
export function isVisible(s:GameState,t:TeamId,p:Vec2):boolean {
  return isPointVisible(s.visibility[t].visible,s.map.width,s.map.height,p);
}
/** Shared lookup for simulation commands and the detached player-view previews. */
export function isPointVisible(seen:Uint8Array,width:number,height:number,p:Vec2):boolean {
  const cell=(x:number,z:number)=>x>=0&&z>=0&&x<width&&z<height&&seen[z*width+x]===1;
  const x=Math.floor(p.x),z=Math.floor(p.z);if(cell(x,z))return true;
  // A point on a cell boundary (building centres, spawns) belongs to both
  // neighbours; flooring alone made mirrored seats see different things.
  const onX=p.x===x,onZ=p.z===z;
  return onX&&cell(x-1,z)||onZ&&cell(x,z-1)||onX&&onZ&&cell(x-1,z-1);
}
/** Path planning may remember obstacles, but cannot inspect unseen enemy buildings. */
export function planningObstacles(s:GameState,t:TeamId|-1):Footprint[] {
  const result:Footprint[]=[];
  for(const e of s.entities)if(e.alive&&e.category==='building'&&(t===-1||e.team===t||isVisible(s,t,e))){
    const d=BUILDINGS[e.kind];result.push({x:e.x,z:e.z,width:d.width,depth:d.depth});
  }
  if(t!==-1)for(const e of Object.values(s.visibility[t].knownBuildings))if(!isVisible(s,t,e)){
    const d=BUILDINGS[e.kind];result.push({x:e.x,z:e.z,width:d.width,depth:d.depth});
  }
  return result;
}
export function updateVisibility(s:GameState):void {
  for(const t of [0,1] as const){const fog=s.visibility[t];fog.visible.fill(0);
    for(const e of s.entities){if(!e.alive||e.team!==t)continue;const r=e.category==='unit'?UNITS[e.kind].sight:BUILDINGS[e.kind].sight;
      revealSightDisk(fog.visible,fog.explored,s.map.width,s.map.height,e.x,e.z,r);
    }
    for(const e of s.entities){if(e.category!=='building'||e.team===t||!isVisible(s,t,e))continue;
      if(e.alive)fog.knownBuildings[e.id]={id:e.id,kind:e.kind,x:e.x,z:e.z,team:e.team,tier:e.tier,construction:e.construction,integrity:buildingIntegrity(e),lastSeen:s.time};
      else delete fog.knownBuildings[e.id];
    }
    for(const memory of Object.values(fog.knownBuildings))if(isVisible(s,t,memory)&&!s.entities.some(e=>e.id===memory.id&&e.alive))delete fog.knownBuildings[memory.id];
  }
}
/** Renderer, HUD and minimap consume only this per-player boundary. */
export function getTeamView(s:GameState,t:TeamId){
  // Consumers read this detached snapshot. Batch the visible entities so each
  // 20 Hz tick crosses the native serializer once, regardless of army size.
  const entities:Entity[]=structuredClone(s.entities.filter(e=>(e.alive||(e.category!=='building'||e.removalReason!=='cancelled')&&s.time-(e.deathTime??0)<BUILDING_DEATH_SECONDS)&&(e.team===t||isVisible(s,t,e))));
  for(const copy of entities)if(copy.category==='building'){
      if(copy.team!==t){copy.queue=[];delete copy.rally;}
      // Impact direction must not expose an attacker outside this player's fog.
      // Clone each cue before redaction, even if source entities shared it.
      if(copy.damageCues)copy.damageCues=copy.damageCues.map(cue=>{
        const value={...cue};
        if(cue.source){if(isVisible(s,t,cue.source))value.source={...cue.source};else delete value.source;}
        return value;
      });
  }
  return {time:s.time,width:s.map.width,height:s.map.height,status:s.status,winner:s.winner,endReason:s.endReason,rosterPreview:!!s.rosterPreview,team:structuredClone(s.teams[t]),entities,
    resources:s.resources.filter(r=>isVisible(s,t,r)).map(r=>({...r})),
    projectiles:s.projectiles.filter(p=>isVisible(s,t,p)).map(p=>({...p})),
    visible:s.visibility[t].visible.slice(),explored:s.visibility[t].explored.slice(),
    knownBuildings:Object.values(s.visibility[t].knownBuildings).filter(e=>!isVisible(s,t,e)).map(e=>({...e}))};
}
