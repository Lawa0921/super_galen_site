import {describe,it,expect} from 'vitest';
import {createMap} from './maps';
import {roadPaths,roadGeometry,riverGeometry} from './terrain';

describe('authored terrain routes',()=>{
  it('keeps irregular water banks inside the blocked river with upward faces',()=>{
    const geometry=riverGeometry(),p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    const left=[] as number[];
    for(let i=0;i<p.count;i++){
      expect(p.getX(i)).toBeGreaterThanOrEqual(46);expect(p.getX(i)).toBeLessThanOrEqual(50);
      expect(normal.getY(i)).toBeCloseTo(1);if(i%2===0)left.push(p.getX(i));
    }
    expect(Math.max(...left)-Math.min(...left)).toBeGreaterThan(.4);geometry.dispose();
  });
  it.each(['river','pass'] as const)('keeps %s road crossings inside traversable gaps',id=>{
    const map=createMap(id),paths=roadPaths(map);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    for(const path of paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*4);
      for(let j=0;j<=steps;j++){
        const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
        expect(map.blocked[Math.floor(z)*map.width+Math.floor(x)],`${x},${z}`).toBe(0);
      }
    }
  });
  it('builds upward-facing strips with continuous distance UVs and finite miters',()=>{
    const geometry=roadGeometry([{x:10,z:10},{x:10,z:20},{x:20,z:20}],3);
    const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),normal=geometry.getAttribute('normal');
    expect(p.count).toBe(6);expect(geometry.index!.count).toBe(12);
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    expect([uv.getY(0),uv.getY(2),uv.getY(4)]).toEqual([0,2.5,5]);
    for(let i=0;i<normal.count;i++)expect(normal.getY(i)).toBeCloseTo(1);
    geometry.dispose();
  });
  it('rejects degenerate input instead of emitting NaN geometry',()=>{
    expect(()=>roadGeometry([{x:0,z:0}],3)).toThrow();
    expect(()=>roadGeometry([{x:1,z:1},{x:1,z:1}],3)).toThrow();
  });
});
