import {afterEach,describe,expect,it,vi} from 'vitest';
import {BattlefieldInput} from './input';
import type {Battlefield} from './scene';
import type {Hud} from './hud';
import {createGame} from './simulation';
import {getTeamView} from './visibility';
import {addUnit} from './state';

let input:BattlefieldInput|undefined;
afterEach(()=>{input?.dispose();input=undefined;document.body.replaceChildren();});
function setup(){
  document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas><button id="control">Command</button>';
  const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
  canvas.setPointerCapture=vi.fn();canvas.hasPointerCapture=()=>false;
  const state=createGame('river'),view=getTeamView(state,0);
  const scene={canvas,map:state.map,selection:[],placement:null,box:null,spell:null,pan:vi.fn(),zoom:vi.fn(),focus:vi.fn()} as unknown as Battlefield;
  const send=vi.fn(()=>true),hud={mode:vi.fn(),select:vi.fn()} as unknown as Hud;
  input=new BattlefieldInput(scene,view,send,hud,vi.fn());
  const workers=view.entities.filter(e=>e.team===0&&e.kind==='worker').map(e=>e.id);
  const key=(value:string,ctrlKey=false,target:Element=canvas)=>{
    const event=new KeyboardEvent('keydown',{key:value,ctrlKey,bubbles:true,cancelable:true});target.dispatchEvent(event);return event;
  };
  return {input,scene,send,view,canvas,workers,key};
}

describe('battlefield control groups',()=>{
  it.each(['1','2','3','4','5'])('saves an independent selection snapshot and recalls group %s',group=>{
    const {input,workers,key,send}=setup();input.select(workers.slice(0,2));
    expect(key(group,true).defaultPrevented).toBe(true);
    input.select([workers[2]]);expect(key(group).defaultPrevented).toBe(true);
    expect(input.selection).toEqual(workers.slice(0,2));expect(send).not.toHaveBeenCalled();
  });
  it('keeps different numbered groups separate',()=>{
    const {input,workers,key}=setup();input.select(workers.slice(0,2));key('1',true);
    input.select(workers.slice(2,4));key('2',true);input.select([]);
    key('1');expect(input.selection).toEqual(workers.slice(0,2));
    key('2');expect(input.selection).toEqual(workers.slice(2,4));
  });
  it('recalls only surviving owned members and ignores shortcuts from focused controls',()=>{
    const {input,workers,key,view}=setup();input.select(workers.slice(0,3));key('1',true);
    const control=document.querySelector('#control')!;input.select([workers[3]]);control.dispatchEvent(new Event('focusin',{bubbles:true}));
    key('1',true,control);key('1',false,control);expect(input.selection).toEqual([workers[3]]);
    view.entities=view.entities.filter(e=>e.id!==workers[0]);view.entities.find(e=>e.id===workers[1])!.alive=false;
    input.setView(view);key('1');expect(input.selection).toEqual([workers[2]]);
  });
});

describe('battlefield camera controls',()=>{
  it('pans with a held movement key and stops on release',()=>{
    const {input,scene,canvas,key}=setup();key('ArrowRight');input.update(.05);
    expect(scene.pan).toHaveBeenCalledOnce();const vector=vi.mocked(scene.pan).mock.calls[0];
    expect(vector.every(Number.isFinite)).toBe(true);expect(Math.hypot(...vector)).toBeGreaterThan(0);
    canvas.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));input.update(.05);
    expect(scene.pan).toHaveBeenCalledOnce();
  });
  it('zooms in opposite wheel directions without scrolling the page',()=>{
    const {scene,canvas}=setup();
    for(const deltaY of [120,-120]){const event=new WheelEvent('wheel',{deltaY,cancelable:true});canvas.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);}
    expect(scene.zoom).toHaveBeenCalledTimes(2);const calls=vi.mocked(scene.zoom).mock.calls;
    expect(calls[0][0]).toBeGreaterThan(0);expect(calls[1][0]).toBeLessThan(0);
  });
  it('drags with the middle button, then stops panning on release without issuing an order',()=>{
    const {scene,canvas,send}=setup();
    canvas.dispatchEvent(new MouseEvent('pointerdown',{button:1,clientX:100,clientY:100}));
    canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:140,clientY:120}));
    expect(scene.pan).toHaveBeenCalledOnce();expect(Math.hypot(...vi.mocked(scene.pan).mock.calls[0])).toBeGreaterThan(0);
    canvas.dispatchEvent(new MouseEvent('pointerup',{button:1,clientX:140,clientY:120}));
    canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:170,clientY:150}));
    expect(scene.pan).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
  });
  it('returns Home to the owned townhall, or its starting position after the hall disappears',()=>{
    const {input,view,key,scene}=setup(),hall=view.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    expect(key('Home').defaultPrevented).toBe(true);expect(scene.focus).toHaveBeenLastCalledWith(hall);
    view.entities=view.entities.filter(e=>e.id!==hall.id);input.setView(view);key('Home');
    expect(scene.focus).toHaveBeenLastCalledWith(scene.map.spawns[0]);
  });
});

function setupWith(prepare:(state:ReturnType<typeof createGame>)=>void,hudExtra:Record<string,unknown>={}){
  document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas>';
  const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
  canvas.setPointerCapture=vi.fn();canvas.hasPointerCapture=()=>false;canvas.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:600,width:800,height:600,x:0,y:0,toJSON:()=>({})});
  const state=createGame('river');prepare(state);const view=getTeamView(state,0);
  const scene={canvas,map:state.map,selection:[],placement:null,box:null,spell:null,pan:vi.fn(),zoom:vi.fn(),focus:vi.fn()} as unknown as Battlefield;
  const send=vi.fn(()=>true),hud={mode:vi.fn(),select:vi.fn(),notice:vi.fn(),hotkey:vi.fn(()=>false),...hudExtra} as unknown as Hud;
  input=new BattlefieldInput(scene,view,send,hud,vi.fn());
  const key=(value:string,init:KeyboardEventInit={})=>{const event=new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...init});canvas.dispatchEvent(event);return event;};
  return {input,scene,send,view,canvas,hud,key};
}
const clock=(times:number[])=>{const spy=vi.spyOn(performance,'now');for(const t of times)spy.mockReturnValueOnce(t);return spy;};

describe('command card hotkeys',()=>{
  it('routes unmodified letter keys to the HUD command card instead of the camera',()=>{
    const hotkey=vi.fn((k:string)=>k==='q'),{input,key,scene,hud}=setupWith(()=>{},{hotkey});
    expect(key('q').defaultPrevented).toBe(true);expect(hotkey).toHaveBeenCalledWith('q',false);
    expect(key('q',{ctrlKey:true}).defaultPrevented).toBe(false);expect(hotkey).toHaveBeenCalledTimes(1);
    key('d');input.update(.05);expect(scene.pan).toHaveBeenCalledOnce();expect(hud.notice).not.toHaveBeenCalled();
  });
  it('keeps A / S / H unit orders ahead of the command card',()=>{
    const hotkey=vi.fn(()=>true),{input,key,send}=setupWith(()=>{},{hotkey});
    const worker=input['view'].entities.find(e=>e.team===0&&e.kind==='worker')!;input.select([worker.id]);
    key('s');expect(send).toHaveBeenCalledWith({type:'stop',unitIds:[worker.id]});expect(hotkey).not.toHaveBeenCalled();
  });
});

describe('selection shortcuts',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('F1 selects the hero and a quick second press centres the camera on it',()=>{
    let hero=0;const {input,key,scene}=setupWith(s=>{hero=addUnit(s,0,'commander',{x:20,z:40}).id;});
    clock([1000,1200,5000]);
    expect(key('F1').defaultPrevented).toBe(true);expect(input.selection).toEqual([hero]);expect(scene.focus).not.toHaveBeenCalled();
    key('F1');expect(scene.focus).toHaveBeenCalledWith(expect.objectContaining({x:20,z:40}));
    key('F1');expect(scene.focus).toHaveBeenCalledOnce();
  });
  it('F1 explains when there is no living hero',()=>{
    const {input,key,hud}=setupWith(()=>{});input.select([]);key('F1');expect(input.selection).toEqual([]);expect(hud.notice).toHaveBeenCalledWith('誓衛統領尚未招募或已陣亡');
  });
  it('F2 selects every owned soldier and the hero, never workers or buildings',()=>{
    const ids:number[]=[];const {input,key}=setupWith(s=>{ids.push(addUnit(s,0,'guard',{x:20,z:40}).id,addUnit(s,0,'commander',{x:21,z:40}).id);addUnit(s,1,'guard',{x:22,z:40});});
    expect(key('F2').defaultPrevented).toBe(true);expect(input.selection.sort()).toEqual(ids.sort());
  });
  it('F3 cycles through idle workers only and centres the camera on each one',()=>{
    let busy=0;const {input,key,scene,view}=setupWith(s=>{const w=s.entities.find(e=>e.team===0&&e.kind==='worker')!;busy=w.id;if(w.category==='unit')w.order={type:'gather',resourceId:s.resources[0].id};});
    const idle=view.entities.filter(e=>e.team===0&&e.kind==='worker'&&e.id!==busy).map(e=>e.id).sort((a,b)=>a-b);
    const picked:number[]=[];for(let i=0;i<idle.length+1;i++){expect(key('F3').defaultPrevented).toBe(true);picked.push(input.selection[0]);}
    expect(picked).toEqual([...idle,idle[0]]);expect(picked).not.toContain(busy);expect(scene.focus).toHaveBeenCalledTimes(idle.length+1);
    expect(input.idleWorkers()).toBe(idle.length);
  });
  it('F3 reports when no worker is idle',()=>{
    const {input,key,hud}=setupWith(s=>{for(const e of s.entities)if(e.category==='unit'&&e.kind==='worker')e.order={type:'gather',resourceId:s.resources[0].id};});
    expect(input.selectIdleWorker()).toBe(false);key('F3');expect(hud.notice).toHaveBeenCalledWith('目前沒有閒置的工人');
  });
  it('double-tapping a control group centres the camera; a slow second tap only reselects',()=>{
    const {input,key,scene,view}=setupWith(()=>{}),workers=view.entities.filter(e=>e.team===0&&e.kind==='worker').slice(0,2);
    input.select(workers.map(e=>e.id));key('1',{ctrlKey:true});
    clock([1000,1300,4000]);
    key('1');expect(scene.focus).not.toHaveBeenCalled();key('1');expect(scene.focus).toHaveBeenCalledOnce();
    const centre=vi.mocked(scene.focus).mock.calls[0][0];expect(centre.x).toBeCloseTo((workers[0].x+workers[1].x)/2,6);expect(centre.z).toBeCloseTo((workers[0].z+workers[1].z)/2,6);
    key('1');expect(scene.focus).toHaveBeenCalledOnce();
  });
});

describe('camera settings',()=>{
  it('scales keyboard panning by camera speed',()=>{
    const {input,key,scene}=setupWith(()=>{});key('ArrowRight');input.update(.05);const base=Math.hypot(...vi.mocked(scene.pan).mock.calls[0]);
    input.configure({edgeScroll:true,cameraSpeed:2});input.update(.05);expect(Math.hypot(...vi.mocked(scene.pan).mock.calls[1])).toBeCloseTo(base*2,6);
  });
  it('edge scrolling can be switched off',()=>{
    const {input,canvas,scene}=setupWith(()=>{});canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:2,clientY:300}));
    input.update(.05);expect(scene.pan).toHaveBeenCalledOnce();
    input.configure({edgeScroll:false,cameraSpeed:1});input.update(.05);expect(scene.pan).toHaveBeenCalledOnce();
  });
});
