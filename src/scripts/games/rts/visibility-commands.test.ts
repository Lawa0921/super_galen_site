import {afterEach,describe,expect,it,vi} from 'vitest';
import {createState,addBuilding,addUnit} from './state';
import {getTeamView,isVisible,updateVisibility} from './visibility';
import {issueCommand} from './commands';
import {BattlefieldInput} from './input';
import {spellPreview} from './targeting';
import type {RtsMap} from './maps';
import type {Battlefield} from './scene';
import type {Hud} from './hud';

function setup(){
  const map:RtsMap={id:'river',name:'Fog boundary',width:96,height:96,
    blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),
    spawns:[{x:14,z:48},{x:82,z:48}],resources:[],camps:[]};
  return createState(map);
}
afterEach(()=>document.body.replaceChildren());

describe('visible boundary points agree across view, commands and previews',()=>{
  it.each([{x:48,z:30.5},{x:35.5,z:43},{x:48,z:31}])('can attack a displayed enemy at $x,$z',position=>{
    const s=setup(),scout=addUnit(s,0,'worker',{x:35.5,z:30.5});
    const enemy=addBuilding(s,1,'house',position,true);updateVisibility(s);
    expect(s.visibility[0].visible[Math.floor(enemy.z)*96+Math.floor(enemy.x)]).toBe(0);
    expect(getTeamView(s,0).entities.some(e=>e.id===enemy.id)).toBe(true);
    expect(issueCommand(s,0,{type:'attack',unitIds:[scout.id],targetId:enemy.id})).toEqual({ok:true});
    expect(scout.order).toEqual({type:'attack',targetId:enemy.id});
  });
  it('does not reveal or attack the enemy just beyond the shared boundary',()=>{
    const s=setup(),scout=addUnit(s,0,'worker',{x:35.5,z:30.5});
    const enemy=addBuilding(s,1,'house',{x:48.01,z:30.5},true);updateVisibility(s);
    expect(isVisible(s,0,enemy)).toBe(false);
    expect(getTeamView(s,0).entities.some(e=>e.id===enemy.id)).toBe(false);
    expect(issueCommand(s,0,{type:'attack',unitIds:[scout.id],targetId:enemy.id}).ok).toBe(false);
    expect(scout.order).toEqual({type:'idle'});
  });
  it.each([48,48.5])('construction preview and actual placement agree at x=%s',x=>{
    const s=setup();addUnit(s,0,'worker',{x:35.5,z:30.5});updateVisibility(s);
    const worker=s.entities.find(e=>e.team===0&&e.kind==='worker')!;
    const position={x,z:30.5};
    document.body.innerHTML='<canvas id="rts-minimap"></canvas><canvas id="battle" tabindex="0"></canvas>';
    const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
    canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
    const scene={canvas,map:s.map,selection:[],placement:null,box:null,world:()=>position,pick:()=>null} as unknown as Battlefield;
    const hud={mode:vi.fn(),notice:vi.fn(),select:vi.fn(),openBuildMenu:vi.fn(()=>false)} as unknown as Hud;
    const send=vi.fn(command=>issueCommand(s,0,command).ok);
    const input=new BattlefieldInput(scene,getTeamView(s,0),send,hud,()=>{});
    try{
      input.setMode({type:'build',kind:'house',workerId:worker.id});
      canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:100,clientY:100}));
      expect(scene.placement?.valid).toBe(x===48);
      canvas.dispatchEvent(new MouseEvent('pointerdown',{button:0}));
      canvas.dispatchEvent(new MouseEvent('pointerup',{button:0}));
      if(x===48){expect(send).toHaveReturnedWith(true);expect(s.entities.some(e=>e.team===0&&e.kind==='house'&&e.x===x)).toBe(true);}
      else {expect(send).not.toHaveBeenCalled();expect(issueCommand(s,0,{type:'build',workerId:worker.id,building:'house',position}).ok).toBe(false);}
    }finally{input.dispose();}
  });
  it.each([34,34.01])('cleave preview and command use the same fog cells at x=%s',x=>{
    const s=setup(),hero=addUnit(s,0,'commander',{x:30,z:40.5});
    s.teams[0].hero.skills.cleave=1;
    // Isolate the point lookup from sight radius; the UI consumes this same fog snapshot.
    s.visibility[0].visible.fill(0);s.visibility[0].visible[40*96+33]=1;
    const position={x,z:40.5},expected=x===34;
    expect(spellPreview(getTeamView(s,0),hero.id,'cleave',position)?.valid).toBe(expected);
    expect(issueCommand(s,0,{type:'cast',heroId:hero.id,skill:'cleave',position}).ok).toBe(expected);
  });
});
