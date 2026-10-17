import {describe,it,expect} from 'vitest';
import {spellPreview} from './targeting';
import {createGame} from './simulation';
import {addUnit} from './state';
import {getTeamView,updateVisibility} from './visibility';
function setup(){const s=createGame('river'),hero=addUnit(s,0,'commander',{x:30,z:40}),ally=addUnit(s,0,'guard',{x:33,z:40});ally.hp=100;Object.assign(s.teams[0].hero.skills,{cleave:1,mend:1,banner:1});s.teams[0].hero.level=3;updateVisibility(s);return {s,hero,ally};}
describe('hero target previews',()=>{
  it('previews cleave range and rejects a cursor beyond it without spending mana',()=>{
    const {s,hero}=setup(),view=getTeamView(s,0);
    expect(spellPreview(view,hero.id,'cleave',{x:34,z:40})).toMatchObject({valid:true,range:5,origin:{x:30,z:40}});
    expect(spellPreview(view,hero.id,'cleave',{x:38,z:40})?.valid).toBe(false);expect(hero.mana).toBe(200);
  });
  it('highlights only wounded allied units inside healing range',()=>{
    const {s,hero,ally}=setup();expect(spellPreview(getTeamView(s,0),hero.id,'mend',ally,ally.id)).toMatchObject({valid:true,targetId:ally.id});
    ally.hp=ally.maxHp;expect(spellPreview(getTeamView(s,0),hero.id,'mend',ally,ally.id)?.valid).toBe(false);
    ally.hp=50;ally.x=50;expect(spellPreview(getTeamView(s,0),hero.id,'mend',ally,ally.id)?.valid).toBe(false);
  });
  it('previews the self-centered banner and marks unavailable skills invalid',()=>{
    const {s,hero}=setup();expect(spellPreview(getTeamView(s,0),hero.id,'banner')).toMatchObject({valid:true,range:8});
    hero.mana=0;expect(spellPreview(getTeamView(s,0),hero.id,'banner')?.valid).toBe(false);
    expect(spellPreview(getTeamView(s,0),999,'banner')).toBeNull();
  });
});
