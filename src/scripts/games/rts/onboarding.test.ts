import {describe,it,expect} from 'vitest';
import {Onboarding,TUTORIAL_KEY,TUTORIAL_STEPS,type TutorialEvent} from './onboarding';

const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},data};};
const panel=()=>{const root=document.createElement('aside');root.hidden=true;root.innerHTML='<span data-tutorial-step></span><strong data-tutorial-title></strong><p data-tutorial-text></p><button data-tutorial-skip type="button">略過</button>';return root;};

describe('first-match onboarding',()=>{
  it('walks select → gather → build → train → attack on real game events, then remembers completion',()=>{
    const store=memory(),tour=new Onboarding(store),root=panel();tour.attach(root);
    expect(TUTORIAL_STEPS.map(s=>s.id)).toEqual(['select','gather','build','train','attack']);
    expect(root.hidden).toBe(false);expect(root.querySelector('[data-tutorial-step]')!.textContent).toBe('1 / 5');
    // Unrelated or out-of-order events do not advance the current tip.
    expect(tour.observe({type:'command',command:{type:'train',buildingId:1,unit:'guard'}})).toBe(false);
    expect(tour.observe({type:'select',kinds:['townhall']})).toBe(false);expect(tour.current?.id).toBe('select');
    expect(tour.observe({type:'select',kinds:['worker']})).toBe(true);expect(tour.current?.id).toBe('gather');
    expect(root.querySelector('[data-tutorial-title]')!.textContent).toBe(TUTORIAL_STEPS[1].title);
    tour.observe({type:'command',command:{type:'gather',unitIds:[2],resourceId:'river-gold-west'}});
    tour.observe({type:'command',command:{type:'build',workerId:2,building:'barracks',position:{x:14,z:35}}});
    tour.observe({type:'command',command:{type:'train',buildingId:1,unit:'worker'}});expect(tour.current?.id).toBe('train');
    tour.observe({type:'command',command:{type:'train',buildingId:9,unit:'guard'}});expect(tour.current?.id).toBe('attack');
    tour.observe({type:'command',command:{type:'move',unitIds:[3],position:{x:50,z:50}}});expect(tour.current?.id).toBe('attack');
    expect(tour.observe({type:'command',command:{type:'move',unitIds:[3],position:{x:50,z:50},attackMove:true}})).toBe(true);
    expect(tour.current).toBeNull();expect(tour.finished).toBe(true);expect(root.hidden).toBe(true);expect(store.data.get(TUTORIAL_KEY)).toBe('done');
    const again=new Onboarding(store),next=panel();again.attach(next);expect(again.current).toBeNull();expect(next.hidden).toBe(true);
  });
  it('can be dismissed from its skip button and stays dismissed',()=>{
    const store=memory(),tour=new Onboarding(store),root=panel();tour.attach(root);
    root.querySelector<HTMLButtonElement>('[data-tutorial-skip]')!.click();
    expect(root.hidden).toBe(true);expect(tour.current).toBeNull();expect(store.data.get(TUTORIAL_KEY)).toBe('done');
    expect(tour.observe({type:'select',kinds:['worker']})).toBe(false);
  });
  it('still runs (and simply is not remembered) when storage throws',()=>{
    const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
    const tour=new Onboarding(broken);expect(tour.current?.id).toBe('select');expect(()=>tour.dismiss()).not.toThrow();expect(tour.current).toBeNull();
  });
  it('accepts a direct attack order as the final step',()=>{
    const tour=new Onboarding(memory());
    for(const event of [{type:'select',kinds:['worker']},{type:'command',command:{type:'gather',unitIds:[2],resourceId:'x'}},{type:'command',command:{type:'build',workerId:2,building:'house',position:{x:1,z:1}}},{type:'command',command:{type:'train',buildingId:1,unit:'crossbow'}}] as TutorialEvent[])tour.observe(event);
    expect(tour.observe({type:'command',command:{type:'attack',unitIds:[3],targetId:40}})).toBe(true);expect(tour.finished).toBe(true);
  });
});
