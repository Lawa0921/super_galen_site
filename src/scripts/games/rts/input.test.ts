import {afterEach,describe,it,expect,vi} from 'vitest';
import {BattlefieldInput,type InputMode} from './input';
import type {Battlefield} from './scene';
import type {Hud} from './hud';
import {createGame} from './simulation';
import {getTeamView} from './visibility';

afterEach(()=>document.body.replaceChildren());
describe('construction placement input',()=>{
  it.each<InputMode>([{type:'attack'},{type:'build',kind:'house',workerId:2},{type:'cast',skill:'banner',heroId:2}])('returns keyboard focus to the battlefield when starting $type targeting from a command button',mode=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas><button id="control">Command</button>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,control=document.querySelector<HTMLButtonElement>('#control')!,menu=vi.fn(),hud={mode:vi.fn(),select:vi.fn(),openBuildMenu:vi.fn(()=>false)} as unknown as Hud;
    const scene={canvas,selection:[],placement:null,box:null,spell:null} as unknown as Battlefield;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),()=>true,hud,menu);
    try{
      control.focus();input.setMode(mode);expect(document.activeElement).toBe(canvas);
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      expect(input.mode).toEqual({type:'normal'});expect(menu).not.toHaveBeenCalled();
      control.focus();input.setMode({type:'normal'});expect(document.activeElement).toBe(control);
    }finally{input.dispose();}
  });
  it.each(['button','a href="#"','summary','div contenteditable="true"'])('does not issue commands from focused UI: %s',tag=>{
    document.body.innerHTML=`<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas><${tag} id="control"><span>UI</span></${tag.split(' ')[0]}>`;
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,send=vi.fn(()=>true),scene={canvas,selection:[],placement:null,box:null,pan:vi.fn()} as unknown as Battlefield;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),send,{mode:()=>{},select:()=>{}} as unknown as Hud,()=>{});input.select([2]);
    const control=document.querySelector<HTMLElement>('#control')!;control.focus();control.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'s',bubbles:true}));
    control.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));input.update(.1);
    expect(send).not.toHaveBeenCalled();expect(scene.pan).not.toHaveBeenCalled();
    canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'s',bubbles:true}));expect(send).toHaveBeenCalledWith({type:'stop',unitIds:[2]});input.dispose();
  });
  it('clears held camera keys when focus enters a command button',()=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas><button id="control">UI</button>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,scene={canvas,selection:[],placement:null,box:null,pan:vi.fn()} as unknown as Battlefield;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),()=>true,{mode:()=>{},select:()=>{}} as unknown as Hud,()=>{});
    canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));document.querySelector<HTMLButtonElement>('#control')!.focus();input.update(.1);expect(scene.pan).not.toHaveBeenCalled();input.dispose();
  });
  it.each([[1,2],[2,1],[7,2]])('keeps owned troops separate from buildings or enemies: %s,%s',(first,second)=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle"></canvas>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
    const scene={canvas,selection:[],placement:null,box:null} as unknown as Battlefield;
    const state=createGame('river');const view=getTeamView(state,0);
    view.entities.push({...state.entities[6]});
    const input=new BattlefieldInput(scene,view,()=>true,{mode:()=>{},select:()=>{}} as unknown as Hud,()=>{});
    input.select([first,second]);expect(input.selection).toEqual([2]);input.dispose();
  });
  it.each([false,true])('submits placement only when its visible preview is valid (%s)',valid=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle"></canvas>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
    canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
    const position={x:14,z:35},scene={canvas,selection:[],placement:null,box:null,world:()=>position,pick:()=>null} as unknown as Battlefield;
    const send=vi.fn(()=>true),hud={mode:vi.fn(),notice:vi.fn(),select:vi.fn(),openBuildMenu:vi.fn(()=>false)} as unknown as Hud;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),send,hud,()=>{});
    input.setMode({type:'build',kind:'house',workerId:2});scene.placement={position,kind:'house',valid};
    canvas.dispatchEvent(new MouseEvent('pointerdown',{button:0,bubbles:true}));
    canvas.dispatchEvent(new MouseEvent('pointerup',{button:0,bubbles:true}));
    if(valid)expect(send).toHaveBeenCalledWith({type:'build',workerId:2,building:'house',position});
    else expect(send).not.toHaveBeenCalled();
    input.dispose();
  });
});

describe('rally and minimap commands',()=>{
  function setup(accepted=true){
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,mini=document.querySelector<HTMLCanvasElement>('#rts-minimap')!;
    canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
    mini.getBoundingClientRect=()=>({left:0,top:0,width:288,height:288}) as DOMRect;
    const scene={canvas,selection:[],placement:null,box:null,focus:vi.fn(),world:()=>({x:25,z:49}),pick:()=>({resourceId:'gold'})} as unknown as Battlefield;
    const send=vi.fn(()=>accepted),hud={mode:vi.fn(),notice:vi.fn(),select:vi.fn(),openBuildMenu:vi.fn(()=>false)} as unknown as Hud;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),send,hud,()=>{});
    const click=(button:number)=>mini.dispatchEvent(new MouseEvent('pointerdown',{button,clientX:80,clientY:60,bubbles:true}));
    return {input,send,scene,canvas,click};
  }
  it('passes a resource hit to the selected townhall rally',()=>{
    const {input,send,canvas}=setup();input.select([1]);
    canvas.dispatchEvent(new MouseEvent('pointerdown',{button:2}));canvas.dispatchEvent(new MouseEvent('pointerup',{button:2}));
    expect(send).toHaveBeenCalledWith({type:'rally',buildingId:1,position:{x:25,z:49},resourceId:'gold'});input.dispose();
  });
  it('sets a building rally from minimap right click and keeps normal left click for camera focus',()=>{
    const {input,send,scene,click}=setup();input.select([1]);click(2);
    expect(send).toHaveBeenCalledWith({type:'rally',buildingId:1,position:{x:80,z:60}});
    send.mockClear();click(0);expect(send).not.toHaveBeenCalled();expect(scene.focus).toHaveBeenCalledWith({x:80,z:60});input.dispose();
  });
  it.each([0,2])('issues attack move and leaves targeting after a successful minimap button %s',button=>{
    const {input,send,scene,click}=setup();input.select([2]);input.setMode({type:'attack'});click(button);
    expect(send).toHaveBeenCalledWith({type:'move',unitIds:[2],position:{x:80,z:60},attackMove:true});
    expect(input.mode.type).toBe('normal');expect(scene.focus).not.toHaveBeenCalled();input.dispose();
  });
  it('retains attack targeting after a rejected minimap order',()=>{
    const {input,send,click}=setup(false);input.select([2]);input.setMode({type:'attack'});click(0);
    expect(send).toHaveBeenCalledOnce();expect(input.mode.type).toBe('attack');input.dispose();
  });
  it('uses ordinary minimap movement without a selection or targeting side effect',()=>{
    const {input,send,click}=setup();click(2);expect(send).not.toHaveBeenCalled();
    input.select([2]);click(2);expect(send).toHaveBeenCalledWith({type:'move',unitIds:[2],position:{x:80,z:60},attackMove:false});input.dispose();
  });
  it('keeps build targeting while moving the camera, and cancels it on right click without moving the worker',()=>{
    const {input,send,scene,click}=setup();input.select([2]);input.setMode({type:'build',kind:'house',workerId:2});click(0);
    expect(scene.focus).toHaveBeenCalledOnce();expect(input.mode.type).toBe('build');click(2);
    expect(input.mode.type).toBe('normal');expect(send).not.toHaveBeenCalled();input.dispose();
  });
  it('opens the build card with B and steps back with Esc before opening the game menu',()=>{
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas><button id="control">UI</button>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,scene={canvas,selection:[],placement:null,box:null,pan:vi.fn()} as unknown as Battlefield;
    let open=false;const menu=vi.fn(),hud={mode:vi.fn(),select:vi.fn(),openBuildMenu:vi.fn(()=>open=true),back:vi.fn(()=>{const was=open;open=false;return was;})} as unknown as Hud;
    const input=new BattlefieldInput(scene,getTeamView(createGame('river'),0),()=>true,hud,menu);input.select([2]);
    const press=(target:Element,key:string)=>target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    try{
      press(document.querySelector('#control')!,'b');expect(hud.openBuildMenu).not.toHaveBeenCalled();
      canvas.focus();press(canvas,'B');expect(hud.openBuildMenu).toHaveBeenCalledTimes(1);expect(open).toBe(true);
      press(canvas,'Escape');expect(open).toBe(false);expect(menu).not.toHaveBeenCalled();
      press(canvas,'Escape');expect(menu).toHaveBeenCalledTimes(1);
      input.setMode({type:'build',kind:'house',workerId:2});press(canvas,'Escape');expect(input.mode).toEqual({type:'normal'});expect(open).toBe(true);expect(menu).toHaveBeenCalledTimes(1);
    }finally{input.dispose();}
  });
});
describe('HUD selection sync (real Hud)',()=>{
  async function setup(){
    const {Hud}=await import('./hud'),{addUnit}=await import('./state');
    document.body.innerHTML='<canvas id="battle" tabindex="0"></canvas>';
    const root=document.createElement('main');document.body.append(root);
    for(const id of ['selection','commands','queue','gold','wood','supply','time','notice','mode']){const element=document.createElement('div');element.id=`rts-${id}`;root.append(element);}
    const mini=document.createElement('canvas');mini.id='rts-minimap';root.append(mini);
    Object.defineProperty(mini,'getContext',{value:vi.fn(()=>({clearRect:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),stroke:vi.fn(),arc:vi.fn()}))});
    const state=createGame('river');state.teams[0].gold=5000;state.teams[0].wood=5000;
    const guard=addUnit(state,0,'guard',{x:20,z:30}),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!,scene={canvas,map:state.map,center:{x:14,z:48},viewFootprint:[],selection:[],placement:null,box:null,spell:null} as unknown as Battlefield;
    const modes:InputMode[]=[];let input!:BattlefieldInput;
    const hud=new Hud(root,a=>{if(a.type==='mode'){modes.push(a.mode);input.setMode(a.mode);}});
    input=new BattlefieldInput(scene,getTeamView(state,0),()=>true,hud,vi.fn());
    const labels=()=>[...root.querySelectorAll<HTMLButtonElement>('#rts-commands button')].map(b=>b.dataset.label);
    const press=(key:string)=>canvas.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    return {root,state,hud,input,canvas,guard,worker,modes,labels,press,view:()=>getTeamView(state,0)};
  }
  it('select then immediately B opens the build card for the newly selected worker, not a stale selection',async()=>{
    const {root,hud,input,canvas,guard,worker,modes,labels,press,view}=await setup();
    try{
      hud.render(view(),[guard.id],input['scene'] as Battlefield);canvas.focus();
      input.select([worker.id]);press('b');expect(labels()).toContain('民居');
      root.querySelector<HTMLButtonElement>('button[data-label="民居"]')!.click();
      expect(modes.at(-1)).toEqual({type:'build',kind:'house',workerId:worker.id});
      input.setMode({type:'normal'});input.select([guard.id]);press('b');expect(labels()).not.toContain('民居');
    }finally{input.dispose();}
  });
  it('Esc during building placement returns to the build submenu (WC3), a second Esc to the main card',async()=>{
    const {root,hud,input,canvas,worker,labels,press,view}=await setup();
    try{
      hud.render(view(),[worker.id],input['scene'] as Battlefield);input.select([worker.id]);canvas.focus();
      press('b');root.querySelector<HTMLButtonElement>('button[data-label="民居"]')!.click();expect(input.mode.type).toBe('build');
      press('Escape');expect(input.mode).toEqual({type:'normal'});expect(labels()).toContain('民居');expect(labels()).toContain('返回');
      press('Escape');expect(labels()).toContain('建造');expect(labels()).not.toContain('民居');
    }finally{input.dispose();}
  });
});
