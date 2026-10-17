import {describe,it,expect} from 'vitest';
import {createMap,roadPaths} from './maps';
import {createUndergrowth,addLandmarks} from './districts';
import {findPath,isWalkable} from './navigation';
import {createGame} from './simulation';

describe('distinct landscape districts',()=>{
  it.each(['river','pass'] as const)('gives %s a visible base landmark and readable camps without blocking routes',id=>{
    const map=createMap(id),state=createGame(id);
    // Outposts at both bases, natural and third expansions plus one ruin per camp (6 + 10); only the home outpost starts explored.
    expect(map.landmarks).toHaveLength(16);
    expect(map.landmarks!.filter(p=>state.visibility[0].explored[Math.floor(p.z)*map.width+Math.floor(p.x)])).toHaveLength(1);
    for(const p of map.landmarks!)for(let z=Math.floor(p.z-p.depth/2);z<Math.ceil(p.z+p.depth/2);z++)for(let x=Math.floor(p.x-p.width/2);x<Math.ceil(p.x+p.width/2);x++){
      expect(map.blocked[z*map.width+x],`${id} solid footprint ${x},${z}`).toBe(1);expect(map.noBuild[z*map.width+x]).toBe(1);
    }
    for(const spawn of map.spawns)for(const target of [...map.resources,...map.camps,map.spawns[1]])expect(findPath(map,spawn,target,[],.78)).not.toBeNull();
    for(const road of roadPaths(map))for(const p of road)expect(isWalkable(map,p,[],.78)).toBe(true);
  });
  it.each(['river','pass'] as const)('places deterministic low vegetation around %s clearings and protects roads/resources',id=>{
    const map=createMap(id),plants=createUndergrowth(map),state=createGame(id);
    expect(plants).toEqual(createUndergrowth(map));// 2.25× the 192 m area: roughly 6,000–6,500 quads at 288 m.
    expect(plants.length).toBeGreaterThan(3200);expect(plants.length).toBeLessThanOrEqual(9000);
    expect(plants.filter(p=>state.visibility[0].explored[Math.floor(p.z)*map.width+Math.floor(p.x)]).length).toBeGreaterThan(45);
    for(const p of plants){expect(p.height).toBeLessThanOrEqual(1.6);expect(p.height).toBeGreaterThan(0);expect(isWalkable(map,p)).toBe(true);for(const r of map.resources)expect(Math.hypot(p.x-r.x,p.z-r.z)).toBeGreaterThan(2.5);}
    expect(new Set(plants.map(p=>p.kind)).size).toBe(id==='river'?4:3);
  });
  it('does not force a landmark through an occupied terrain cell',()=>{
    const map=createMap('river');map.landmarks=[];map.blocked.fill(1);addLandmarks(map);expect(map.landmarks).toHaveLength(0);
  });
});
