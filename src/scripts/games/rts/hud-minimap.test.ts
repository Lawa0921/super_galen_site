import {describe,it,expect,vi} from 'vitest';
import {Hud} from './hud';
import {createGame} from './simulation';
import {getTeamView} from './visibility';
import type {Battlefield,TeamView} from './scene';

function setup(id:'river'|'pass',canvasSize?:number){
 const state=createGame(id,1),view=getTeamView(state,0),events:string[]=[];
 view.entities=[];view.resources=[];view.knownBuildings=[];
 const context={...(canvasSize?{canvas:{width:canvasSize,height:canvasSize}}:{}),fillStyle:'',strokeStyle:'',lineWidth:0,clearRect:vi.fn(),
  createImageData:vi.fn((width:number,height:number)=>({width,height,colorSpace:'srgb',data:new Uint8ClampedArray(width*height*4)})),
  putImageData:vi.fn(()=>events.push('terrain')),fillRect:vi.fn(()=>events.push('marker')),strokeRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),arc:vi.fn(),stroke:vi.fn(()=>events.push('stroke'))};
 const hud=Object.assign(Object.create(Hud.prototype),{ctx:context,pings:[]}) as {drawMinimap(v:TeamView,s:Battlefield):void;ping(x:number,z:number):void};
 const scene={map:state.map,center:{x:96,z:96},viewFootprint:[{x:30,z:35},{x:70,z:38},{x:66,z:62},{x:26,z:59}]} as unknown as Battlefield;
 return {view,context,events,scene,hud,draw:()=>hud.drawMinimap(view,scene)};
}

describe('minimap terrain raster',()=>{
 it.each([['river',192],['pass',192],['river',384]] as const)('paints exact opaque cells with one upload for %s on a %i px canvas, including fog precedence and row edges',(id,size)=>{
  // The 288 m maps sample 1.5 cells per pixel on the 192 px minimap (0.75 on a 384 px backing store).
  const f=setup(id,size),W=f.scene.map.width,colors=[[16,28,33],id==='river'?[54,91,105]:[120,120,107],[100,118,84],[52,68,58],[16,28,33]],k=size/W;
  for(let i=0;i<W*W;i++){const kind=i%5;f.view.explored[i]=+([1,2,3].includes(kind));f.view.visible[i]=+([0,1,2].includes(kind));f.scene.map.blocked[i]=+([0,1].includes(kind));}
  f.draw();expect(f.context.putImageData).toHaveBeenCalledTimes(1);expect(f.context.fillRect).not.toHaveBeenCalled();
  const image=f.context.createImageData.mock.results[0].value;let wrong=0,first=-1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const c=colors[(Math.min(W-1,Math.floor(y/k))*W+Math.min(W-1,Math.floor(x/k)))%5],at=(y*size+x)*4;
    if(image.data[at]!==c[0]||image.data[at+1]!==c[1]||image.data[at+2]!==c[2]||image.data[at+3]!==255){wrong++;if(first<0)first=y*size+x;}}
  // Count mismatches instead of diffing ~150k-element arrays (a failing toEqual diff took half an hour).
  expect({wrong,first}).toEqual({wrong:0,first:-1});expect(f.events).toEqual(['terrain','stroke']);
 });
 it('reuses the backing image, refreshes changed fog and paints fractional markers after terrain',()=>{
  const f=setup('river');f.view.explored.fill(0);f.draw();
  f.view.explored.fill(1);f.view.visible.fill(1);f.scene.map.blocked.fill(0);
  f.view.resources=[{id:'gold',kind:'gold',x:10.25,z:10.75,remaining:10},{id:'empty',kind:'wood',x:1,z:1,remaining:0}];
  f.view.knownBuildings=[{id:9,kind:'house',x:20,z:20,team:1,tier:1,construction:1,integrity:1,lastSeen:0}];
  const unit=createGame('river',1).entities.find(e=>e.category==='unit')!;f.view.entities=[{...unit,x:40.25,z:40.75}];
  f.events.length=0;f.draw();expect(f.context.createImageData).toHaveBeenCalledTimes(1);expect(f.context.putImageData).toHaveBeenCalledTimes(2);
  const image=f.context.createImageData.mock.results[0].value;
  expect([...image.data.slice(0,4)]).toEqual([100,118,84,255]);expect([...image.data.slice(-4)]).toEqual([100,118,84,255]);
  const k=192/f.scene.map.width;
  expect(f.events).toEqual(['terrain','marker','marker','marker','stroke']);expect(f.context.fillRect).toHaveBeenCalledWith(10.25*k-2,10.75*k-2,4,4);
 });
 it('outlines the real camera footprint instead of a fixed rectangle',()=>{
  const f=setup('river'),k=192/f.scene.map.width;f.draw();expect(f.context.strokeRect).not.toHaveBeenCalled();
  expect(f.context.moveTo).toHaveBeenCalledWith(30*k,35*k);expect(f.context.lineTo.mock.calls).toEqual([[70*k,38*k],[66*k,62*k],[26*k,59*k]]);expect(f.context.closePath).toHaveBeenCalled();
 });
 it('pings attacked locations on the minimap until the ping fades',()=>{
  const f=setup('river'),k=192/f.scene.map.width,now=vi.spyOn(performance,'now').mockReturnValue(1000);f.hud.ping(10,20);f.draw();
  expect(f.context.arc).toHaveBeenCalledWith(10*k,20*k,expect.any(Number),0,Math.PI*2);expect(f.events.filter(e=>e==='stroke')).toHaveLength(2);
  f.context.arc.mockClear();now.mockReturnValue(4100);f.draw();expect(f.context.arc).not.toHaveBeenCalled();now.mockRestore();
 });
});
