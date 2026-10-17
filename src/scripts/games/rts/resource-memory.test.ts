import {describe,it,expect} from 'vitest';
import {ResourceMemory} from './resource-memory';
import {createGame} from './simulation';
import {getTeamView,updateVisibility} from './visibility';
describe('observed resource memory',()=>{
  it('keeps an observed empty mine exhausted after it leaves current vision',()=>{
    const state=createGame('pass'),memory=new ResourceMemory(),mine=state.resources.find(r=>r.id==='pass-gold-west')!;
    mine.remaining=0;memory.observe(getTeamView(state,0).resources);expect(memory.isExhausted(mine.id)).toBe(true);
    state.entities.filter(e=>e.team===0).forEach(e=>{e.x=5;e.z=5;});updateVisibility(state);
    const view=getTeamView(state,0);expect(view.resources.some(r=>r.id===mine.id)).toBe(false);
    memory.observe(view.resources);expect(memory.isExhausted(mine.id)).toBe(true);
  });
  it('does not infer the condition of an unseen enemy-side mine',()=>{
    const state=createGame('pass'),memory=new ResourceMemory(),mine=state.resources.find(r=>r.id==='pass-gold-east')!;
    mine.remaining=0;memory.observe(getTeamView(state,0).resources);expect(memory.isExhausted(mine.id)).toBe(false);
  });
});
