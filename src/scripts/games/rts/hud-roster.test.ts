import {afterEach,describe,expect,it,vi} from 'vitest';
import {Hud,skillIcon,unitIcon} from './hud';
import {createGame} from './simulation';
import {getTeamView,updateVisibility} from './visibility';
import {addBuilding,addUnit,heroProgress} from './state';
import {spellPreview} from './targeting';
import type {Battlefield} from './scene';
import {SKILLS,type BuildingKind} from './catalog';

afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

function setup(rosterPreview:boolean){
  const root=document.createElement('main');document.body.append(root);
  for(const id of ['selection','commands','queue','gold','wood','supply','time','notice']){const element=document.createElement('div');element.id=`rts-${id}`;root.append(element);}
  const canvas=document.createElement('canvas');canvas.id='rts-minimap';root.append(canvas);
  Object.defineProperty(canvas,'getContext',{value:vi.fn(()=>({clearRect:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),stroke:vi.fn(),arc:vi.fn()}))});
  const action=vi.fn(),hud=new Hud(root,action),state=createGame('river',1,'normal',{rosterPreview});
  state.teams[0].gold=state.teams[0].wood=9000;
  const placed:Partial<Record<BuildingKind,number>>={};
  (['barracks','forge','stable','workshop','altar','chapel','lumbermill','house'] as const).forEach((kind,i)=>{placed[kind]=addBuilding(state,0,kind,{x:18+(i%4)*7,z:28+Math.floor(i/4)*7},true).id;});
  const hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;if(hall.category==='building')hall.tier=3;placed.townhall=hall.id;
  const scene={map:state.map,center:{x:14,z:48},viewFootprint:[{x:0,z:30},{x:28,z:30},{x:28,z:66},{x:0,z:66}]} as unknown as Battlefield;
  const render=(ids:number[])=>hud.render(getTeamView(state,0),ids,scene);
  const card=(ids:number[])=>{render(ids);return [...root.querySelectorAll<HTMLButtonElement>('#rts-commands button')].map(b=>`${b.dataset.label}:${b.dataset.hotkey}`);};
  return {root,state,action,render,card,placed};
}

/** The shipped command card, recorded before the roster expansion. */
const SHIPPED_CARDS:Record<string,string[]>={
  townhall:['工人:q'],
  barracks:['王國衛兵:q','弩手:e'],
  altar:['誓衛統領:q'],
  chapel:['牧師:q'],
  stable:['騎士:q'],
  workshop:['攻城車:q'],
};

describe('command card roster gate',()=>{
  it('is identical to the shipped card and tech tree with the gate off',()=>{
    const {card,placed,state}=setup(false);
    for(const [kind,expected] of Object.entries(SHIPPED_CARDS)){
      const labels=card([placed[kind as BuildingKind]!]).filter(l=>!l.startsWith('升級')&&!l.startsWith('精工')&&!l.startsWith('精鍛')&&!l.startsWith('層疊'));
      expect(labels,kind).toEqual(expected);
    }
    const worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;card([worker.id]);
    expect(card([worker.id])).toContain('建造:b');
  });
  it('shows the preview roster with text and hotkeys when the gate is on',()=>{
    const {card,placed}=setup(true);
    expect(card([placed.barracks!])).toEqual(['王國衛兵:q','弩手:e','長槍兵:r','遊俠:t']);
    expect(card([placed.altar!])).toEqual(['誓衛統領:q','曦光賢者:e','遊俠隊長:r']);
    expect(card([placed.chapel!])).toEqual(['牧師:q','曦光法師:e']);
    expect(card([placed.stable!])).toEqual(['騎士:q','獅鷲騎士:e']);
  });
  it('trains a preview unit from its button, showing its model render icon',()=>{
    const {root,render,action,placed}=setup(true);render([placed.barracks!]);
    const button=root.querySelector<HTMLButtonElement>('button[data-label="長槍兵"]')!,icon=button.querySelector('img')!;
    expect(icon.getAttribute('src')).toBe(unitIcon('pikeman'));expect(icon.alt).toBe('');expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(button.textContent).toContain('金 80');
    icon.click();expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'train',buildingId:placed.barracks,unit:'pikeman'}});
  });
  it('gives every preview train button its icon, or text only when the unit has no runtime model',()=>{
    const {root,render,placed}=setup(true);
    const src=(at:BuildingKind,label:string)=>{render([placed[at]!]);const b=root.querySelector<HTMLButtonElement>(`#rts-commands button[data-label="${label}"]`)!;expect(b,label).not.toBeNull();return b.querySelector('img')?.getAttribute('src');};
    expect(src('barracks','長槍兵')).toBe('/assets/games/rts/ui/commands/unit-pikeman.webp');
    expect(src('barracks','遊俠')).toBe('/assets/games/rts/ui/commands/unit-ranger.webp');
    expect(src('chapel','曦光法師')).toBe('/assets/games/rts/ui/commands/unit-mage.webp');
    expect(src('stable','獅鷲騎士')).toBeUndefined();
    expect(src('altar','曦光賢者')).toBeUndefined();expect(src('altar','遊俠隊長')).toBeUndefined();
    expect(src('altar','誓衛統領')).toBe(unitIcon('commander'));
  });
  it('keeps a hero revive button without a model text-only',()=>{
    const {root,render,state,placed}=setup(true);const sage=addUnit(state,0,'sage',{x:40,z:40});render([placed.altar!]);
    sage.alive=false;render([placed.altar!]);
    const revive=root.querySelector<HTMLButtonElement>('button[data-label="復活"]')!;expect(revive.textContent).toContain('曦光賢者陣亡');expect(revive.querySelector('img')).toBeNull();
  });
  it('shows the new hero skill icons on cast and learn buttons',()=>{
    const {root,card,state}=setup(true);
    const sage=addUnit(state,0,'sage',{x:40,z:40}),cap=addUnit(state,0,'ranger-captain',{x:44,z:40});
    for(const [hero,skills] of [[sage,['sunburst','radiance','daybreak']],[cap,['volley','sprint','mark']]] as const){
      const p=heroProgress(state.teams[0],hero.kind as 'sage'|'ranger-captain');p.level=3;p.points=3;
      for(const id of skills)p.skills[id]=1;card([hero.id]);
      for(const id of skills)for(const label of [SKILLS[id].name,`學習${SKILLS[id].name}`]){
        const img=root.querySelector<HTMLButtonElement>(`#rts-commands button[data-label="${label}"]`)?.querySelector('img');
        expect(img?.getAttribute('src'),label).toBe(skillIcon(id));expect(img!.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });
  it('adds thumbnails for preview units in the multi-select list only where art exists',()=>{
    const {root,render,state}=setup(true);
    const units=[addUnit(state,0,'pikeman',{x:20,z:40}),addUnit(state,0,'mage',{x:21,z:40}),addUnit(state,0,'gryphon',{x:22,z:40})];
    render(units.map(u=>u.id));
    const buttons=[...root.querySelectorAll<HTMLButtonElement>('.rts-group-list button')];
    expect(buttons.map(b=>b.textContent)).toEqual(['長槍兵','曦光法師','獅鷲騎士']);
    expect(buttons.map(b=>b.querySelector('img')?.getAttribute('src'))).toEqual([unitIcon('pikeman'),unitIcon('mage'),undefined]);
  });
  it('gives each hero its own skills, level line and revive button',()=>{
    const {root,render,card,state,placed}=setup(true);
    const sage=addUnit(state,0,'sage',{x:40,z:40}),p=heroProgress(state.teams[0],'sage');p.level=3;p.points=1;p.skills.sunburst=1;
    expect(card([sage.id])).toEqual(['攻擊移動:a','停止:s','守備:h','曦光爆裂:q','學習曦光爆裂:e','學習晨輝療癒:r','學習破曉:t']);
    expect(root.querySelector('#rts-selection')!.textContent).toContain('等級 3');
    sage.alive=false;render([placed.altar!]);
    const revive=root.querySelector<HTMLButtonElement>('button[data-label="復活"]')!;expect(revive.textContent).toContain('曦光賢者陣亡');
  });
  it('previews hero area spells for any hero',()=>{
    // Far from the map origin: the aim must be checked against the real map size, not a fixed 96 m.
    const {state}=setup(true);const cap=addUnit(state,0,'ranger-captain',{x:150,z:150});heroProgress(state.teams[0],'ranger-captain').skills.volley=1;
    updateVisibility(state);const view=getTeamView(state,0);
    expect(spellPreview(view,cap.id,'volley',{x:154,z:150})).toMatchObject({valid:true,range:10});
    expect(spellPreview(view,cap.id,'volley',{x:170,z:150})?.valid).toBe(false);
    expect(spellPreview(view,cap.id,'cleave',{x:154,z:150})?.valid).toBe(false);
  });
});
