import {afterEach,describe,it,expect,vi} from 'vitest';
import {mountRts} from './main';
import {SETTINGS_KEY,DIFFICULTY_KEY} from './settings';
import {createGame} from './simulation';
import {TUTORIAL_KEY} from './onboarding';
const spies=vi.hoisted(()=>({quality:vi.fn(),configure:vi.fn(),volume:vi.fn(),idle:vi.fn(),bindSend:vi.fn(),input:vi.fn(),frames:[] as FrameRequestCallback[]}));
vi.mock('./models',()=>({ModelLibrary:class {async load(){}dispose(){}}}));
vi.mock('./scene',()=>({Battlefield:class {render(){}dispose(){}focus(){}setQuality=spies.quality;}}));
vi.mock('./input',()=>({BattlefieldInput:class {constructor(_scene:unknown,_view:unknown,send:unknown){spies.bindSend(send);spies.input(this);}selection:number[]=[];setMode(){}setView(){}update(){}dispose(){}configure=spies.configure;selectIdleWorker=spies.idle;}}));
vi.mock('./hud',()=>({Hud:class {render(){}notice(){}}}));
vi.mock('./clock',()=>({SimulationClock:class {setPaused(){}frame(){}dispose(){}}}));
vi.mock('./audio',()=>({RtsAudio:class {start(){}dispose(){}play(){}setVolume=spies.volume;}}));
let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();vi.clearAllMocks();});

function mount(makeGame?:Parameters<typeof mountRts>[1]){
  const root=document.createElement('main');document.body.append(root);
  root.innerHTML=`<section id="rts-lobby"></section><section id="rts-battle" hidden></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details>
    <input id="rts-volume" type="range" min="0" max="100" value="70"/><output id="rts-volume-value"></output>
    <select id="rts-quality"><option value="high">高</option><option value="low">低</option></select><input id="rts-edge-scroll" type="checkbox" checked/>
    <input id="rts-camera-speed" type="range" min="50" max="200" step="10" value="100"/><output id="rts-camera-speed-value"></output>
    <button id="rts-idle"><span id="rts-idle-count"></span></button>
    <aside id="rts-tutorial" hidden><span data-tutorial-step></span><strong data-tutorial-title></strong><p data-tutorial-text></p><button data-tutorial-skip></button></aside>
    <fieldset><input type="radio" name="rts-difficulty" value="easy"/><input type="radio" name="rts-difficulty" value="normal" checked/><input type="radio" name="rts-difficulty" value="hard"/></fieldset>
    <canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>`;
  for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
  for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
  spies.frames.length=0;vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{spies.frames.push(cb);return 1;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  dispose=mountRts(root,makeGame);const $=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  const start=async()=>{$('rts-start').click();await vi.waitFor(()=>expect(spies.bindSend).toHaveBeenCalled());};
  return {root,$,start};
}
const change=(el:HTMLInputElement|HTMLSelectElement,value:string|boolean,type='input')=>{if(typeof value==='boolean')(el as HTMLInputElement).checked=value;else el.value=value;el.dispatchEvent(new Event(type,{bubbles:true}));};

describe('pause menu settings',()=>{
  it('restores saved volume, quality, edge scroll and camera speed and applies them to a new battle',async()=>{
    localStorage.setItem(SETTINGS_KEY,JSON.stringify({volume:25,quality:'low',edgeScroll:false,cameraSpeed:1.5}));
    const {$,start}=mount();
    expect($<HTMLInputElement>('rts-volume').value).toBe('25');expect($('rts-volume-value').textContent).toBe('25%');expect(spies.volume).toHaveBeenLastCalledWith(.25);
    expect($<HTMLSelectElement>('rts-quality').value).toBe('low');expect($<HTMLInputElement>('rts-edge-scroll').checked).toBe(false);
    expect($<HTMLInputElement>('rts-camera-speed').value).toBe('150');expect($('rts-camera-speed-value').textContent).toBe('1.5×');
    await start();expect(spies.quality).toHaveBeenLastCalledWith('low');expect(spies.configure).toHaveBeenLastCalledWith(expect.objectContaining({edgeScroll:false,cameraSpeed:1.5}));
  });
  it('persists every change and applies it to the running battle at once',async()=>{
    const {$,start}=mount();await start();
    change($<HTMLInputElement>('rts-volume'),'0');expect($('rts-volume-value').textContent).toBe('靜音');
    change($<HTMLSelectElement>('rts-quality'),'low','change');expect(spies.quality).toHaveBeenLastCalledWith('low');
    change($<HTMLInputElement>('rts-edge-scroll'),false,'change');change($<HTMLInputElement>('rts-camera-speed'),'200');
    expect(spies.configure).toHaveBeenLastCalledWith({volume:0,quality:'low',edgeScroll:false,cameraSpeed:2});
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({volume:0,quality:'low',edgeScroll:false,cameraSpeed:2});
  });
  it('keeps working when storage is unavailable',async()=>{
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
    const {$,start}=mount();expect($<HTMLInputElement>('rts-volume').value).toBe('70');await start();
    expect(()=>change($<HTMLSelectElement>('rts-quality'),'low','change')).not.toThrow();expect(spies.quality).toHaveBeenLastCalledWith('low');
    vi.restoreAllMocks();
  });
});

describe('lobby difficulty',()=>{
  const picked=(root:HTMLElement)=>root.querySelector<HTMLInputElement>('input[name="rts-difficulty"]:checked')?.value;
  it('restores the saved difficulty and starts the match with it',async()=>{
    localStorage.setItem(DIFFICULTY_KEY,'hard');const makeGame=vi.fn<typeof createGame>((map,seed,difficulty)=>createGame(map,seed,difficulty));
    const {root,start}=mount(makeGame);expect(picked(root)).toBe('hard');await start();
    expect(makeGame).toHaveBeenCalledWith('river',expect.any(Number),'hard');expect(spies.bindSend).toHaveBeenCalled();
  });
  it('persists a new choice and falls back to normal for unknown values',async()=>{
    localStorage.setItem(DIFFICULTY_KEY,'nightmare');const makeGame=vi.fn<typeof createGame>((map,seed,difficulty)=>createGame(map,seed,difficulty));
    const {root,start}=mount(makeGame);expect(picked(root)).toBe('normal');
    const easy=root.querySelector<HTMLInputElement>('input[name="rts-difficulty"][value="easy"]')!;easy.checked=true;easy.dispatchEvent(new Event('change',{bubbles:true}));
    expect(localStorage.getItem(DIFFICULTY_KEY)).toBe('easy');await start();expect(makeGame).toHaveBeenLastCalledWith('river',expect.any(Number),'easy');
  });
});

describe('battle onboarding and idle workers',()=>{
  it('shows the first-match tips once and hides them for good after skipping',async()=>{
    const first=mount();await first.start();const panel=first.$('rts-tutorial');
    expect(panel.hidden).toBe(false);expect(panel.querySelector('[data-tutorial-step]')!.textContent).toBe('1 / 5');
    panel.querySelector<HTMLButtonElement>('[data-tutorial-skip]')!.click();expect(panel.hidden).toBe(true);expect(localStorage.getItem(TUTORIAL_KEY)).toBe('done');
    dispose!();dispose=undefined;document.body.replaceChildren();spies.bindSend.mockClear();
    const second=mount();await second.start();expect(second.$('rts-tutorial').hidden).toBe(true);
  });
  it('advances the tips when the player issues the step\'s order',async()=>{
    const {$,start}=mount();await start();const send=spies.bindSend.mock.calls[0][0] as (c:unknown)=>boolean,step=()=>$('rts-tutorial').querySelector('[data-tutorial-step]')!.textContent;
    expect(step()).toBe('1 / 5');send({type:'stop',unitIds:[2]});expect(step()).toBe('1 / 5');
    // Selecting a worker is observed from the input selection on the next frame; orders advance at once.
    const input=spies.input.mock.calls[0][0] as {selection:number[]};input.selection=[2];spies.frames.at(-1)!(performance.now()+500);expect(step()).toBe('2 / 5');
    expect(send({type:'gather',unitIds:[2],resourceId:'river-gold-west'})).toBe(true);expect(step()).toBe('3 / 5');
    expect(send({type:'gather',unitIds:[2],resourceId:'missing'})).toBe(false);expect(step()).toBe('3 / 5');
  });
  it('routes the idle-worker button to the battlefield input',async()=>{
    const {$,start}=mount();await start();$('rts-idle').click();expect(spies.idle).toHaveBeenCalledOnce();
  });
});
