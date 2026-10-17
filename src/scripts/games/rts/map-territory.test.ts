import {describe,it,expect} from 'vitest';
import {createMap,roadPaths,type Vec2} from './maps';
import {findPath} from './navigation';

const d=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);

// 2026-10-16: the 192 m maps still felt small; both maps grow to 288×288 with
// real territory per seat (home, natural, third and a forward gold), contested
// centre mines, about ten camps and longer spawn-to-spawn travel.
describe.each(['river','pass'] as const)('%s 288 m territory',id=>{
  const map=createMap(id),[west,east]=map.spawns;
  it('puts the spawns far apart on the centre line',()=>{
    expect(west.z).toBe(144);expect(east.z).toBe(144);
    expect(d(west,east)).toBeGreaterThanOrEqual(220);
    // Walking distance, not just straight line: well beyond the 192 m maps' ~150 m.
    const path=findPath(map,west,east,[],.78)!;expect(path).not.toBeNull();
    const length=path.slice(1).reduce((n,p,i)=>n+d(p,path[i]),d(west,path[0]));
    expect(length).toBeGreaterThan(235);
  });
  it('gives every seat a home, natural, third and forward gold plus contested centre mines',()=>{
    const gold=map.resources.filter(r=>r.kind==='gold');
    for(const tag of ['west','west-natural','west-third','south','west-centre'])expect(gold.some(r=>r.id===`${id}-gold-${tag}`),tag).toBe(true);
    const own=gold.filter(r=>d(r,west)<d(r,east));
    expect(own.length).toBeGreaterThanOrEqual(5);
    // Expansion sites are spread out: no two golds share a base site.
    for(const a of gold)for(const b of gold)if(a!==b)expect(d(a,b),`${a.id}/${b.id}`).toBeGreaterThan(30);
    // The natural and third are within the AI's 80 m prospecting range; the centre mines are far from both homes.
    for(const tag of ['natural','third']){const r=gold.find(r=>r.id===`${id}-gold-west-${tag}`)!;expect(d(r,west)).toBeLessThan(80);expect(d(r,west)).toBeGreaterThan(40);}
    const centre=gold.find(r=>r.id===`${id}-gold-west-centre`)!;expect(d(centre,west)).toBeGreaterThan(90);expect(Math.abs(centre.x-map.width/2)).toBeLessThan(30);
    // Each gold has wood within reach of a hall built beside it.
    for(const g of gold)expect(map.resources.some(r=>r.kind==='wood'&&d(r,g)<26),`${g.id} wood`).toBe(true);
  });
  it('guards the expansions with about ten neutral camps',()=>{
    expect(map.camps.length).toBeGreaterThanOrEqual(10);expect(map.camps.length).toBeLessThanOrEqual(12);
    for(const tag of ['west-natural','west-third','south','west-centre']){const g=map.resources.find(r=>r.id===`${id}-gold-${tag}`)!;expect(map.camps.some(c=>d(c,g)<16),`${tag} guard`).toBe(true);}
    for(const c of map.camps)for(const s of map.spawns)expect(d(c,s)).toBeGreaterThan(40);
  });
  it('fills the land: trees across every map quadrant and a landmark beside each camp',()=>{
    const tree=id==='pass'?'pine':'oak',trees=map.scenery.filter(p=>p.kind===tree);
    expect(trees.length).toBeGreaterThan(520);expect(trees.length).toBeLessThanOrEqual(820);
    // No 48 m square of open land (a 6×6 grid of them) is left without any tree.
    for(let z=0;z<6;z++)for(let x=0;x<6;x++)expect(trees.some(t=>t.x>=x*48&&t.x<x*48+48&&t.z>=z*48&&t.z<z*48+48),`empty ${x},${z}`).toBe(true);
    expect((map.landmarks??[]).filter(l=>l.district==='camp').length).toBeGreaterThanOrEqual(8);
  });
  it('lays out roads to every expansion and across the middle',()=>{
    const routes=roadPaths(map);
    expect(routes.length).toBeGreaterThanOrEqual(id==='river'?5:5);
    for(const g of map.resources.filter(r=>r.kind==='gold'&&!r.id.endsWith('-west')&&!r.id.endsWith('-east')))
      expect(routes.some(route=>route.some(p=>d(p,g)<24)),`${g.id} road`).toBe(true);
  });
});
