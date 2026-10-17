import {afterEach,describe,expect,it,vi} from 'vitest';
import {existsSync} from 'node:fs';
import {Hud,skillIcon,unitIcon} from './hud';
import {createGame} from './simulation';
import {getTeamView} from './visibility';
import {addBuilding,addUnit} from './state';
import {BUILDINGS,RESEARCH,SKILLS,TIER_UPGRADES,UNITS,heroSkills,type PlayableUnit,type SkillId} from './catalog';
import type {Battlefield} from './scene';

afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

function setup(){
  const root=document.createElement('main');document.body.append(root);
  for(const id of ['selection','commands','queue','gold','wood','supply','time','notice']){
    const element=document.createElement('div');element.id=`rts-${id}`;root.append(element);
  }
  const canvas=document.createElement('canvas');canvas.id='rts-minimap';root.append(canvas);
  Object.defineProperty(canvas,'getContext',{value:vi.fn(()=>({clearRect:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),stroke:vi.fn(),arc:vi.fn()}))});
  const action=vi.fn(),hud=new Hud(root,action),state=createGame('river');
  const scene={map:state.map,center:{x:14,z:48},viewFootprint:[{x:0,z:30},{x:28,z:30},{x:28,z:66},{x:0,z:66}]} as unknown as Battlefield;
  const render=(ids:number[])=>hud.render(getTeamView(state,0),ids,scene);
  return {root,state,action,render,hud};
}

describe('command artwork',()=>{
  it('gives every build command its original building art and preserves placement and restrictions',()=>{
    const {root,state,action,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;
    state.teams[0].gold=5000;state.teams[0].wood=5000;render([worker.id]);
    for(const [kind,definition] of Object.entries(BUILDINGS)){
      root.querySelector<HTMLButtonElement>('button[data-label="建造"]')?.click();
      const button=root.querySelector<HTMLButtonElement>(`button[data-label="${definition.name}"]`)!,icon=button.querySelector('img');
      expect(icon,kind).not.toBeNull();expect(icon!.getAttribute('src')).toBe(`/assets/games/rts/ui/commands/building-${kind}.webp`);
      expect(icon!.alt).toBe('');expect(icon!.getAttribute('aria-hidden')).toBe('true');
      action.mockClear();icon!.click();
      if(button.disabled)expect(action).not.toHaveBeenCalled();
      else expect(action).toHaveBeenLastCalledWith({type:'mode',mode:{type:'build',kind,workerId:worker.id}});
    }
    state.teams[0].gold=0;state.teams[0].wood=0;render([worker.id]);
    root.querySelector<HTMLButtonElement>('button[data-label="建造"]')?.click();
    for(const definition of Object.values(BUILDINGS)){
      const button=root.querySelector<HTMLButtonElement>(`button[data-label="${definition.name}"]`)!;
      expect(button.disabled).toBe(true);action.mockClear();button.querySelector('img')!.click();expect(action).not.toHaveBeenCalled();
    }
  });

  it('refreshes a selected secondary hall upgrade label and art even when global tier remains three',()=>{
    const {root,state,action,render}=setup(),main=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    if(main.category!=='building')throw new Error('Missing hall');main.tier=3;
    const secondary=addBuilding(state,0,'townhall',{x:25,z:35},true);
    state.teams[0].gold=5000;state.teams[0].wood=5000;
    addBuilding(state,0,'barracks',{x:22,z:30},true);addBuilding(state,0,'forge',{x:32,z:30},true);
    addBuilding(state,0,'stable',{x:40,z:30},true);
    for(const tier of [2,3] as const){
      secondary.tier=(tier-1) as 1|2;render([secondary.id]);
      const button=root.querySelector<HTMLButtonElement>(`button[data-label="升級${TIER_UPGRADES[tier].name}"]`)!;
      expect(button,`upgrade to ${tier}`).not.toBeNull();expect(button.disabled).toBe(false);
      expect(button.querySelector('img')?.getAttribute('src')).toBe(`/assets/games/rts/ui/commands/building-townhall-tier${tier}.webp`);
      button.querySelector('img')!.click();expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'upgrade',buildingId:secondary.id}});
    }
    secondary.tier=3;render([secondary.id]);expect(root.querySelector('button[data-label^="升級"]')).toBeNull();
    expect([...root.querySelectorAll('#rts-commands img')].map(i=>i.getAttribute('src'))).toEqual([unitIcon('worker')]);
  });

  it('keeps research artwork through tiers while disabled upgrades cannot dispatch',()=>{
    const {root,state,action,render}=setup();
    const forge=addBuilding(state,0,'forge',{x:20,z:30},true),mill=addBuilding(state,0,'lumbermill',{x:30,z:30},true);
    const hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    render([forge.id]);
    for(const [id,definition] of Object.entries(RESEARCH).filter(([,d])=>d.at==='forge')){
      const button=root.querySelector<HTMLButtonElement>(`button[data-label="${definition.name}"]`)!;
      expect(button.querySelector('img')?.getAttribute('src')).toBe(`/assets/games/rts/ui/commands/${id.startsWith('weapons')?'weapons':'armor'}.png`);
      if(id.endsWith('1')){button.querySelector('img')!.click();expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'research',buildingId:forge.id,research:id}});}
      else{expect(button.disabled).toBe(true);action.mockClear();button.querySelector('img')!.click();expect(action).not.toHaveBeenCalled();}
    }
    if(hall.category!=='building')throw new Error('Missing hall');hall.tier=2;state.teams[0].research.push('weapons1');render([forge.id]);
    expect(root.querySelector('button[data-label="精鍛兵刃 I"]')).toBeNull();
    const second=root.querySelector<HTMLButtonElement>('button[data-label="精鍛兵刃 II"]')!;expect(second.disabled).toBe(false);second.querySelector('img')!.click();
    expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'research',buildingId:forge.id,research:'weapons2'}});
    render([mill.id]);const timber=root.querySelector<HTMLButtonElement>('button[data-label="精工斧具"]')!;
    expect(timber.querySelector('img')!.getAttribute('src')).toBe('/assets/games/rts/ui/commands/timber.png');timber.querySelector('img')!.click();
    expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'research',buildingId:mill.id,research:'timber'}});
  });

  it('uses skill art for both learning and casting, preserving mana and cooldown restrictions',()=>{
    const {root,state,action,render}=setup(),hero=addUnit(state,0,'commander',{x:20,z:30});
    Object.assign(state.teams[0].hero,{level:3,points:1,skills:{cleave:1,mend:1,banner:1}});render([hero.id]);
    for(const id of heroSkills('commander') as SkillId[]){
      for(const learning of [false,true]){
        const button=root.querySelector<HTMLButtonElement>(`button[data-label="${learning?'學習':''}${SKILLS[id].name}"]`)!;
        const icon=button.querySelector('img')!;expect(icon?.getAttribute('src')).toBe(`/assets/games/rts/ui/commands/${id}.png`);
        expect(button.disabled).toBe(false);icon.click();expect(action).toHaveBeenLastCalledWith(learning?{type:'command',command:{type:'learn',heroId:hero.id,skill:id}}:{type:'mode',mode:{type:'cast',heroId:hero.id,skill:id}});
      }
    }
    hero.mana=0;render([hero.id]);
    for(const id of heroSkills('commander') as SkillId[]){const button=root.querySelector<HTMLButtonElement>(`button[data-label="${SKILLS[id].name}"]`)!;expect(button.disabled).toBe(true);action.mockClear();button.querySelector('img')!.click();expect(action).not.toHaveBeenCalled();}
    hero.mana=200;hero.skillCooldowns.cleave=5;render([hero.id]);expect(root.querySelector<HTMLButtonElement>('button[data-label="破陣斬"]')!.disabled).toBe(true);
    state.teams[0].hero.points=0;render([hero.id]);expect(root.querySelectorAll('button[data-label^="學習"]')).toHaveLength(0);expect(root.querySelectorAll('#rts-commands img')).toHaveLength(6);
  });

  it('shows distinct decorative command icons while preserving labels, hotkeys and image-click actions',()=>{
    const {root,state,action,render}=setup();
    const worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;render([worker.id]);
    const expected=[
      ['攻擊移動','A','沿途迎敵','attack-move',{type:'mode',mode:{type:'attack'}}],
      ['停止','S','中止行動','stop',{type:'command',command:{type:'stop',unitIds:[worker.id]}}],
      ['守備','H','原地駐守','hold',{type:'command',command:{type:'hold',unitIds:[worker.id]}}],
    ] as const;
    for(const [label,hotkey,detail,id,command] of expected){
      const button=root.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`)!;
      const icon=button.querySelector('img');expect(icon,`${label} artwork`).not.toBeNull();
      expect(icon!.getAttribute('src')).toBe(`/assets/games/rts/ui/commands/${id}.png`);
      expect(icon!.alt).toBe('');expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(button.textContent).toBe(label+detail+hotkey);expect(button.querySelector('small')!.textContent).toBe(detail);expect(button.querySelector('kbd')!.textContent).toBe(hotkey);
      icon!.click();expect(action).toHaveBeenLastCalledWith(command);
    }
  });

  it('clears previous command art on building or empty selections, including a return to the same unit',()=>{
    const {root,state,render}=setup();
    const worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!,hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    render([worker.id]);expect(root.querySelectorAll('#rts-commands img')).toHaveLength(4);
    render([hall.id]);expect([...root.querySelectorAll('#rts-commands img')].map(i=>i.getAttribute('src'))).toEqual([unitIcon('worker'),'/assets/games/rts/ui/commands/building-townhall-tier2.webp']);
    expect(root.querySelector('#rts-commands')!.textContent).toContain('工人');
    render([]);expect(root.querySelector('#rts-commands')!.children).toHaveLength(0);
    render([worker.id]);expect(root.querySelectorAll('#rts-commands img')).toHaveLength(4);
    render([worker.id]);expect(root.querySelectorAll('#rts-commands img')).toHaveLength(4);
  });
});

describe('worker build submenu',()=>{
  const labels=(root:HTMLElement)=>[...root.querySelectorAll<HTMLButtonElement>('#rts-commands button')].map(b=>b.dataset.label);
  const main=['攻擊移動','停止','守備','建造'],buildingNames=Object.values(BUILDINGS).map(d=>d.name);
  it('shows a compact main card with a Build entry (hotkey B) instead of every building',()=>{
    const {root,state,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;render([worker.id]);
    expect(labels(root)).toEqual(main);
    const build=root.querySelector<HTMLButtonElement>('button[data-label="建造"]')!;
    expect(build.querySelector('kbd')!.textContent).toBe('B');expect(build.title).toBe('建造：開啟建造選單');
    expect(build.querySelector('img')!.getAttribute('src')).toBe('/assets/games/rts/ui/commands/building-house.webp');
    expect(root.querySelector('#rts-commands')!.children).toHaveLength(4);
  });
  it('opens a submenu with every building, its cost/requirement text and a Back (Esc) slot, and returns to the main card',()=>{
    const {root,state,action,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;
    state.teams[0].gold=0;render([worker.id]);root.querySelector<HTMLButtonElement>('button[data-label="建造"]')!.click();
    expect(action).not.toHaveBeenCalled();
    expect(labels(root)).toEqual([...buildingNames,'返回']);
    expect(root.querySelector('#rts-commands')!.children).toHaveLength(buildingNames.length+1);
    const house=root.querySelector<HTMLButtonElement>('button[data-label="民居"]')!;
    expect(house.disabled).toBe(true);expect(house.title).toContain('金');
    const forge=root.querySelector<HTMLButtonElement>('button[data-label="鍛造所"]')!;expect(forge.title).toContain('需要兵營');
    render([worker.id]);expect(labels(root)).toEqual([...buildingNames,'返回']);
    const back=root.querySelector<HTMLButtonElement>('button[data-label="返回"]')!;
    expect(back.disabled).toBe(false);expect(back.querySelector('kbd')!.textContent).toBe('Esc');
    back.click();expect(labels(root)).toEqual(main);expect(action).not.toHaveBeenCalled();
  });
  it('enters placement and returns to the main card when a building is chosen; disabled buildings stay in the submenu',()=>{
    const {root,state,action,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;
    render([worker.id]);root.querySelector<HTMLButtonElement>('button[data-label="建造"]')!.click();
    root.querySelector<HTMLButtonElement>('button[data-label="鍛造所"]')!.click();
    expect(action).not.toHaveBeenCalled();expect(labels(root)).toContain('返回');
    root.querySelector<HTMLButtonElement>('button[data-label="民居"]')!.click();
    expect(action).toHaveBeenLastCalledWith({type:'mode',mode:{type:'build',kind:'house',workerId:worker.id}});
    expect(labels(root)).toEqual(main);
  });
  it('supports keyboard B/Esc entry points and only opens for a selected own worker',()=>{
    const {root,state,render,hud}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!,hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    expect(hud.back()).toBe(false);
    render([hall.id]);expect(hud.openBuildMenu()).toBe(false);expect(labels(root)).not.toContain('返回');
    const guard=addUnit(state,0,'guard',{x:20,z:30});render([guard.id]);expect(hud.openBuildMenu()).toBe(false);
    render([worker.id]);expect(hud.openBuildMenu()).toBe(true);expect(labels(root)).toContain('返回');
    expect(hud.back()).toBe(true);expect(labels(root)).toEqual(main);expect(hud.back()).toBe(false);
  });
  it('select then immediately B: uses the current selection before the next 100 ms HUD render',()=>{
    const {root,state,action,render,hud}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;
    state.teams[0].gold=5000;state.teams[0].wood=5000;
    const guard=addUnit(state,0,'guard',{x:20,z:30});
    render([guard.id]);hud.select([worker.id],getTeamView(state,0));expect(hud.openBuildMenu()).toBe(true);
    root.querySelector<HTMLButtonElement>('button[data-label="民居"]')!.click();
    expect(action).toHaveBeenLastCalledWith({type:'mode',mode:{type:'build',kind:'house',workerId:worker.id}});
    render([worker.id]);hud.select([guard.id],getTeamView(state,0));expect(hud.openBuildMenu()).toBe(false);
    expect(labels(root)).not.toContain('民居');expect(root.querySelector('#rts-selection h2')!.textContent).toBe('王國衛兵');
  });
  it('handles Esc on a focused submenu button and moves focus to the new card',()=>{
    const {root,state,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;render([worker.id]);
    const build=root.querySelector<HTMLButtonElement>('button[data-label="建造"]')!;build.focus();build.click();
    expect(document.activeElement).toBe(root.querySelector('button[data-label="領主府"]'));
    const event=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});document.activeElement!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);expect(labels(root)).toEqual(main);
    expect(document.activeElement).toBe(root.querySelector('button[data-label="攻擊移動"]'));
  });
  it('resets to the main card when the selection changes',()=>{
    const {root,state,render,hud}=setup(),workers=state.entities.filter(e=>e.team===0&&e.kind==='worker');
    expect(workers.length).toBeGreaterThan(1);
    render([workers[0].id]);hud.openBuildMenu();render([workers[1].id]);expect(labels(root)).toEqual(main);
    hud.openBuildMenu();render([]);render([workers[1].id]);expect(labels(root)).toEqual(main);
  });
});

describe('player feedback',()=>{
  const notices=(root:HTMLElement)=>[...root.querySelectorAll('#rts-notice p')].map(p=>p.textContent);
  it('stacks same-frame notices as a short feed, refreshes repeats and expires each after four seconds',()=>{
    const {root,render,hud}=setup(),now=vi.spyOn(performance,'now').mockReturnValue(1000);
    hud.notice('工人已完成訓練');hud.notice('研究完成：精工斧具');hud.notice('我方基地遭受攻擊！','alert');
    expect(notices(root)).toEqual(['工人已完成訓練','研究完成：精工斧具','我方基地遭受攻擊！']);
    expect(root.querySelector<HTMLElement>('#rts-notice p:last-child')!.dataset.tone).toBe('alert');
    now.mockReturnValue(3000);hud.notice('工人已完成訓練');expect(notices(root)).toEqual(['研究完成：精工斧具','我方基地遭受攻擊！','工人已完成訓練']);
    for(const text of ['a','b','c'])hud.notice(text);expect(notices(root)).toEqual(['工人已完成訓練','a','b','c']);
    now.mockReturnValue(5500);render([]);expect(notices(root)).toEqual(['工人已完成訓練','a','b','c']);
    now.mockReturnValue(7001);render([]);expect(notices(root)).toEqual([]);
  });
  it('turns the altar hero button into a revive command with a dead state once the recruited hero has fallen',()=>{
    const {root,state,action,render}=setup(),altar=addBuilding(state,0,'altar',{x:30,z:30},true);state.teams[0].gold=state.teams[0].wood=5000;addBuilding(state,0,'house',{x:30,z:40},true);
    render([altar.id]);let button=root.querySelector<HTMLButtonElement>('#rts-commands button')!;
    expect(button.dataset.label).toBe('誓衛統領');expect(button.dataset.state).toBeUndefined();
    const hero=addUnit(state,0,'commander',{x:30,z:36});render([altar.id]);
    hero.alive=false;render([altar.id]);button=root.querySelector<HTMLButtonElement>('#rts-commands button')!;
    expect(button.dataset.label).toBe('復活');expect(button.dataset.state).toBe('dead');expect(button.textContent).toContain('誓衛統領陣亡');expect(button.textContent).toContain('金 180');
    button.click();expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'train',buildingId:altar.id,unit:'commander'}});
  });
});

describe('unit training artwork',()=>{
  // Shipped roster only here; roster-preview card wiring lives in hud-roster.test.ts.
  const playable=Object.entries(UNITS).filter(([,d])=>d.trainedAt&&!d.preview).map(([kind])=>kind as PlayableUnit);
  it('gives every trainable unit a published icon file',()=>{
    expect(playable.sort()).toEqual(['commander','crossbow','guard','knight','priest','siege','worker']);
    for(const kind of playable){
      expect(unitIcon(kind)).toBe(`/assets/games/rts/ui/commands/unit-${kind}.webp`);
      expect(existsSync(`public${unitIcon(kind)}`),kind).toBe(true);
    }
  });
  it('resolves preview units to their model renders and leaves units without a runtime model text-only',()=>{
    for(const kind of ['pikeman','ranger','mage'] as const){
      expect(unitIcon(kind)).toBe(`/assets/games/rts/ui/commands/unit-${kind}.webp`);
      expect(existsSync(`public${unitIcon(kind)}`),kind).toBe(true);
    }
    // No published model yet, so no render to make an icon from.
    for(const kind of ['gryphon','sage','ranger-captain'] as const){
      expect(unitIcon(kind),kind).toBeUndefined();
      expect(existsSync(`public/assets/games/rts/ui/commands/unit-${kind}.webp`),kind).toBe(false);
    }
  });
  it('resolves every hero skill to a published icon file',()=>{
    for(const id of Object.keys(SKILLS) as SkillId[]){
      expect(skillIcon(id)).toBe(`/assets/games/rts/ui/commands/${id}.png`);
      expect(existsSync(`public${skillIcon(id)}`),id).toBe(true);
    }
  });
  it('shows the unit icon on each train button and keeps the revive button on the hero art',()=>{
    const {root,state,action,render}=setup();state.teams[0].gold=state.teams[0].wood=9000;
    (['barracks','forge','stable','workshop','altar','chapel','lumbermill','house'] as const).forEach((kind,i)=>addBuilding(state,0,kind,{x:18+(i%4)*7,z:28+Math.floor(i/4)*7},true));
    const hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;if(hall.category==='building')hall.tier=3;
    for(const kind of playable){
      const at=UNITS[kind].trainedAt!,building=state.entities.find(e=>e.team===0&&e.category==='building'&&e.kind===at)!;
      render([building.id]);
      const button=root.querySelector<HTMLButtonElement>(`#rts-commands button[data-label="${UNITS[kind].name}"]`)!;
      expect(button,kind).not.toBeNull();const icon=button.querySelector('img');
      expect(icon?.getAttribute('src'),kind).toBe(unitIcon(kind));expect(icon!.alt).toBe('');expect(icon!.getAttribute('aria-hidden')).toBe('true');
      action.mockClear();icon!.click();
      if(!button.disabled)expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'train',buildingId:building.id,unit:kind}});
    }
    const altar=state.entities.find(e=>e.team===0&&e.kind==='altar')!,hero=addUnit(state,0,'commander',{x:30,z:36});
    render([altar.id]);hero.alive=false;render([altar.id]);
    const revive=root.querySelector<HTMLButtonElement>('#rts-commands button[data-label="復活"]')!;
    expect(revive.querySelector('img')?.getAttribute('src')).toBe(unitIcon('commander'));
  });
  it('adds decorative thumbnails to the multi-select list without changing its labels',()=>{
    const {root,state,action,render}=setup();
    const units=[addUnit(state,0,'guard',{x:20,z:40}),addUnit(state,0,'crossbow',{x:21,z:40})],house=addBuilding(state,0,'house',{x:24,z:40},true);
    render([...units.map(u=>u.id),house.id]);
    const buttons=[...root.querySelectorAll<HTMLButtonElement>('.rts-group-list button')];
    expect(buttons.map(b=>b.textContent)).toEqual(['王國衛兵','弩手',BUILDINGS.house.name]);
    expect(buttons.map(b=>b.querySelector('img')?.getAttribute('src'))).toEqual([unitIcon('guard'),unitIcon('crossbow'),'/assets/games/rts/ui/commands/building-house.webp']);
    for(const b of buttons){const img=b.querySelector('img')!;expect(img.alt).toBe('');expect(img.getAttribute('aria-hidden')).toBe('true');}
    buttons[1].querySelector('img')!.click();expect(action).toHaveBeenLastCalledWith({type:'select',ids:[units[1].id]});
  });
});

describe('command card hotkeys',()=>{
  const keys=(root:HTMLElement)=>[...root.querySelectorAll<HTMLButtonElement>('#rts-commands button')].map(b=>[b.dataset.label,b.dataset.hotkey,b.querySelector('kbd')?.textContent,b.getAttribute('aria-keyshortcuts')]);
  it('labels every command with a unique key that avoids camera, group and order keys',()=>{
    const {root,state,render}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker')!;render([worker.id]);
    expect(keys(root)).toEqual([['攻擊移動','a','A','A'],['停止','s','S','S'],['守備','h','H','H'],['建造','b','B','B']]);
    root.querySelector<HTMLButtonElement>('button[data-label="建造"]')!.click();
    const card=keys(root),letters=card.map(k=>k[1]);
    expect(letters).toEqual(['q','e','r','t','f','g','z','x','c','v','escape']);expect(card.at(-1)).toEqual(['返回','escape','Esc','Escape']);
    expect(new Set(letters).size).toBe(letters.length);for(const reserved of ['w','a','s','d','h','b'])expect(letters).not.toContain(reserved);
  });
  it('triggers training, research and upgrades from the keyboard, reporting why a disabled command cannot run',()=>{
    const {root,state,action,render,hud}=setup(),hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;render([hall.id]);
    expect(keys(root).map(k=>k.slice(0,2))).toEqual([['工人','q'],['升級城堡','e']]);
    expect(hud.hotkey('q')).toBe(true);expect(action).toHaveBeenLastCalledWith({type:'command',command:{type:'train',buildingId:hall.id,unit:'worker'}});
    action.mockClear();expect(hud.hotkey('q',true)).toBe(true);expect(action).not.toHaveBeenCalled();
    expect(hud.hotkey('y')).toBe(false);expect(hud.hotkey('escape')).toBe(false);
    expect(hud.hotkey('e')).toBe(true);expect(action).not.toHaveBeenCalled();expect(root.querySelector('#rts-notice')!.textContent).toContain('需要');
  });
  it('keeps the train card supply reason short and leaves the house hint to the tooltip and notice',()=>{
    const {root,state,render,hud}=setup(),hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;
    state.teams[0].gold=state.teams[0].wood=5000;for(let i=0;i<5;i++)addUnit(state,0,'worker',{x:20+i,z:40});render([hall.id]);
    const button=root.querySelector<HTMLButtonElement>('button[data-label="工人"]')!,small=button.querySelector('small')!.textContent!;
    expect(button.disabled).toBe(true);expect(small).toMatch(/^人口不足 \d+$/);
    expect(button.title).toBe(`${small}，需建造${BUILDINGS.house.name}`);expect(button.getAttribute('aria-description')).toBe(button.title);
    expect(hud.hotkey('q')).toBe(true);expect(root.querySelector('#rts-notice')!.textContent).toContain(`${small}，需建造${BUILDINGS.house.name}`);
  });
  it('accepts a hotkey while a command button has keyboard focus',()=>{
    const {root,state,action,render}=setup(),hall=state.entities.find(e=>e.team===0&&e.kind==='townhall')!;render([hall.id]);
    const button=root.querySelector<HTMLButtonElement>('#rts-commands button')!;button.focus();
    const event=new KeyboardEvent('keydown',{key:'Q',bubbles:true,cancelable:true});button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);expect(action).toHaveBeenCalledWith({type:'command',command:{type:'train',buildingId:hall.id,unit:'worker'}});
  });
  it('shows the idle-worker count on its button and disables it when everyone is busy',()=>{
    const {root,state,render}=setup(),button=document.createElement('button'),count=document.createElement('span');
    button.id='rts-idle';count.id='rts-idle-count';button.append(count);root.append(button);
    render([]);expect(count.textContent).toBe('5');expect(button.disabled).toBe(false);
    for(const e of state.entities)if(e.category==='unit'&&e.kind==='worker')e.order={type:'gather',resourceId:state.resources[0].id};
    render([]);expect(count.textContent).toBe('0');expect(button.disabled).toBe(true);
  });
});
