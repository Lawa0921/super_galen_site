import {afterEach,describe,expect,it,vi} from 'vitest';
import {createGame} from './simulation';
import {mountRts} from './main';
const spies=vi.hoisted(()=>({notice:vi.fn(),ping:vi.fn(),inView:vi.fn(()=>false)}));
vi.mock('./models',()=>({ModelLibrary:class {async load(){}dispose(){}}}));
vi.mock('./scene',()=>({Battlefield:class {render(){}dispose(){}focus(){}setQuality(){}inView=spies.inView;}}));
vi.mock('./input',()=>({BattlefieldInput:class {selection:number[]=[];setMode(){}setView(){}update(){}dispose(){}configure(){}}}));
vi.mock('./hud',()=>({Hud:class {render(){}notice=spies.notice;ping=spies.ping;}}));
vi.mock('./clock',()=>({SimulationClock:class {setPaused(){}frame(){}dispose(){}interpolation=1;}}));
vi.mock('./audio',()=>({RtsAudio:class {start(){}dispose(){}play(){}setVolume(){}}}));
let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
async function setup(){
  const root=document.createElement('main');document.body.append(root);
  root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle" hidden></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
  for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
  for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
  let frame:FrameRequestCallback|undefined;vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{frame=callback;return 1;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const states:ReturnType<typeof createGame>[]=[],makeGame=vi.fn(()=>{const s=createGame('river',1);s.aiEnabled=[false,false];states.push(s);return s;});
  dispose=mountRts(root,makeGame);const $=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>('#rts-'+id)!;
  $('start').click();await vi.waitFor(()=>expect(frame).toBeDefined());
  let now=100;const tick=()=>{const state=states.at(-1)!;state.tick++;now+=200;frame!(now);};
  return {root,$,states,makeGame,tick,state:()=>states.at(-1)!};
}
describe('in-match feedback',()=>{
  it('shows every own event text pushed during one frame, not only the last one',async()=>{
    const {state,tick}=await setup(),s=state();
    s.events.push({time:1,type:'train-complete',team:0,text:'工人已完成訓練'},{time:1,type:'research-complete',team:0,text:'研究完成：精工斧具'},{time:1,type:'train-complete',team:1,text:'敵方訊息'});
    tick();expect(spies.notice.mock.calls.map(c=>c[0])).toEqual(['工人已完成訓練','研究完成：精工斧具']);
  });
  it('warns and pings the minimap when an own building takes damage, throttled per area',async()=>{
    const {state,tick}=await setup(),s=state(),hall=s.entities.find(e=>e.team===0&&e.kind==='townhall')!;tick();
    hall.hp-=40;s.time=1;tick();expect(spies.notice).toHaveBeenCalledWith('我方基地遭受攻擊！','alert');expect(spies.ping).toHaveBeenCalledExactlyOnceWith(hall.x,hall.z);
    hall.hp-=40;s.time=3;tick();expect(spies.ping).toHaveBeenCalledOnce();
  });
});
describe('confirmation dialogs and results',()=>{
  it('asks before restarting, surrendering or leaving a live match, and cancelling keeps the match',async()=>{
    const {root,$,makeGame,state}=await setup(),confirm=$<HTMLDialogElement>('confirm');
    $('pause').click();$('restart').click();
    expect(confirm.open).toBe(true);expect($('confirm-title').textContent).toBe('重新開局？');expect(makeGame).toHaveBeenCalledOnce();
    $('confirm-no').click();expect(confirm.open).toBe(false);expect($<HTMLDialogElement>('menu').open).toBe(true);expect(makeGame).toHaveBeenCalledOnce();
    $('back').click();expect($('confirm-title').textContent).toBe('返回戰場選擇？');$('confirm-no').click();expect($('battle').hidden).toBe(false);
    $('surrender').click();expect($('confirm-title').textContent).toBe('確定投降？');expect(state().status).toBe('playing');
    $('confirm-no').click();$('restart').click();$('confirm-yes').click();await vi.waitFor(()=>expect(makeGame).toHaveBeenCalledTimes(2));expect(confirm.open).toBe(false);
    $('pause').click();$('back').click();$('confirm-yes').click();expect(root.querySelector<HTMLElement>('#rts-lobby')!.hidden).toBe(false);expect($('battle').hidden).toBe(true);
  });
  it('surrenders after confirmation and shows a side-by-side results table; finished matches leave without asking',async()=>{
    const {$,state,makeGame,tick}=await setup(),s=state();s.time=754;s.teams[0].stats.kills=4;s.teams[1].stats.unitsLost=4;s.teams[1].stats.buildingsBuilt=3;
    $('pause').click();$('surrender').click();$('confirm-yes').click();
    expect(s.status).not.toBe('playing');tick();
    const table=$<HTMLTableElement>('menu-stats');expect(table.hidden).toBe(false);
    expect(table.querySelector('caption')!.textContent).toBe('戰役時長 12:34');
    expect([...table.querySelectorAll('thead th')].map(th=>th.textContent)).toEqual(['','我方','敵方']);
    const rows=[...table.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
    expect(rows).toContainEqual(['擊殺','4','0']);expect(rows).toContainEqual(['陣亡部隊','0','4']);expect(rows).toContainEqual(['建成建築','0','3']);expect(rows).toContainEqual(['失去建築','0','0']);
    $('restart').click();expect($<HTMLDialogElement>('confirm').open).toBe(false);await vi.waitFor(()=>expect(makeGame).toHaveBeenCalledTimes(2));
    $('pause').click();expect($('menu-stats').hidden).toBe(true);
  });
});
