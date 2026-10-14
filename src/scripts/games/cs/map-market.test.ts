import { describe, expect, it } from 'vitest';
import { MAP, canStand, clearRoute, findPath, visible, wallDistance } from './map';

describe('covered market routes', () => {
  it('blocks the old direct middle sightline and keeps four flanks with cross connections', () => {
    expect(visible({x:0,z:23},{x:0,z:6})).toBe(false);
    expect(canStand(0,12)).toBe(false);
    for (const sign of [-1,1]) {
      const paths = [ [[3,17],[3,7],[7,7],[7,-7]], sign < 0 ? [[17,17],[17,9],[7,7],[7,-7]] : [[19,23],[19,0],[11,0],[11,3],[7,3],[7,-7]] ];
      for (const path of paths) for (let i=1;i<path.length;i++) {
        const [x,z]=path[i-1], [tx,tz]=path[i];
        expect(clearRoute({x:x*sign,z},{x:tx*sign,z:tz})).toBe(true);
      }
    }
    expect(clearRoute({x:-9,z:17},{x:9,z:17})).toBe(true);
    expect(clearRoute({x:-9,z:7},{x:9,z:7})).toBe(true);
  });
  it('keeps both teams connected to both plant sites and patrol anchors', () => {
    for(const z of [-23,23]) for(const x of [-3,0,3]) {
      for(const target of [...MAP.sites, {x:-15,z:-8},{x:15,z:-8},{x:-8,z:15},{x:8,z:15}]) {
        expect(canStand(target.x,target.z)).toBe(true);
        const path=findPath(x,z,target.x,target.z);
        expect(path.length).toBeGreaterThan(0);
        let previous={x,z};
        for(const point of path){expect(clearRoute(previous,point)).toBe(true);previous=point;}
      }
    }
  });
  it('provides tangible northern cover at both sites while shots can pass over it', () => {
    for(const x of [-11.5,11.5]) {
      expect(canStand(x,-20)).toBe(false);
      for(const height of [1.45,1.58]) expect(wallDistance([x,height,-23],[0,0,1])).toBeCloseTo(2);
      expect(wallDistance([x,1.75,-23],[0,0,1])).toBeGreaterThan(2);
    }
  });
});
