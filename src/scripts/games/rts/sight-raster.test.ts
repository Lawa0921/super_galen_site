import {describe,it,expect} from 'vitest';
import {revealSightDisk} from './sight-raster';

function reference(width:number,height:number,x:number,z:number,r:number){
 const data=new Uint8Array(width*height);
 for(let row=Math.max(0,Math.floor(z-r));row<=Math.min(height-1,Math.ceil(z+r));row++)for(let col=Math.max(0,Math.floor(x-r));col<=Math.min(width-1,Math.ceil(x+r));col++)if((col+.5-x)**2+(row+.5-z)**2<=r*r)data[row*width+col]=1;
 return data;
}
describe('exact cell-centre sight raster',()=>{
 it('matches the existing scalar disk at fractional positions, tangents and every map edge',()=>{
  for(const radius of [0,.5,1,6,8,10,12])for(const x of [-2,0,.5,7,7.5,15.1,31.999,34])for(const z of [0,.5,9.123,23.5,24]){
   const visible=new Uint8Array(32*24),explored=new Uint8Array(32*24);
   revealSightDisk(visible,explored,32,24,x,z,radius);
   expect(visible).toEqual(reference(32,24,x,z,radius));expect(explored).toEqual(visible);
  }
 });
 it('unions overlapping scouts and never clears previous exploration',()=>{
  const visible=new Uint8Array(32*24),explored=new Uint8Array(32*24);explored[0]=1;
  revealSightDisk(visible,explored,32,24,8.3,7.4,6);revealSightDisk(visible,explored,32,24,21.7,15.2,8);
  const a=reference(32,24,8.3,7.4,6),b=reference(32,24,21.7,15.2,8);
  expect(visible).toEqual(a.map((n,i)=>n||b[i]));expect(explored[0]).toBe(1);
 });
});
