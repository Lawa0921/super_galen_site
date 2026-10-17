import {BUILDINGS,UNITS,RESEARCH,SKILLS,TIER_UPGRADES,HERO_KINDS,heroSkills,isHero,unlocked,type BuildingKind,type PlayableUnit,type ResearchId,type SkillId,type Requirements,type HeroKind} from './catalog';
import type {HeroProgress} from './types';
import {commandBlockReasons,commandCardReasons,formatBattleTime} from './ui';
import type {Command,Entity} from './types';
import type {Battlefield,TeamView} from './scene';
import type {InputMode} from './input';
export type CommandMenu='main'|'build';
export type HudAction={type:'command';command:Command}|{type:'mode';mode:InputMode}|{type:'select';ids:number[]};
// Native-endian words built from RGBA bytes, matching the original opaque sRGB
// fill colors on every platform. Markers remain on the normal canvas path.
const MINIMAP_TERRAIN=[[16,28,33],[54,91,105],[120,120,107],[100,118,84],[52,68,58]]
  .map(rgb=>new Uint32Array(Uint8Array.from([...rgb,255]).buffer)[0]);
const researchIcons:Record<ResearchId,string>={timber:'timber',weapons1:'weapons',weapons2:'weapons',weapons3:'weapons',armor1:'armor',armor2:'armor',armor3:'armor'};
/** Fixed unit-order keys; every other command takes the next free key in card order.
 * The pool skips W/A/S/D (camera), H/B (orders) and digits (control groups). */
const FIXED_HOTKEYS:Record<string,string>={'攻擊移動':'a','停止':'s','守備':'h','建造':'b','返回':'escape'};
const HOTKEY_POOL=['q','e','r','t','f','g','z','x','c','v'];
const keyLabel=(key:string)=>key==='escape'?'Esc':key.toUpperCase();
function buildingIcon(kind:BuildingKind|'townhall-tier2'|'townhall-tier3'):string{return `/assets/games/rts/ui/commands/building-${kind}.webp`;}
/** Units with no published runtime model have no render to make an icon from; their buttons stay text-only. */
const UNITS_WITHOUT_ICON:ReadonlySet<PlayableUnit>=new Set<PlayableUnit>(['gryphon','sage','ranger-captain']);
/** Original unit-model render shown on train/revive buttons and selection-list thumbnails. */
export function unitIcon(kind:PlayableUnit):string|undefined{return UNITS_WITHOUT_ICON.has(kind)?undefined:`/assets/games/rts/ui/commands/unit-${kind}.webp`;}
/** Hero ability art shown on cast and learn buttons. */
export function skillIcon(skill:SkillId):string{return `/assets/games/rts/ui/commands/${skill}.png`;}
function commandIcon(action:HudAction):string|undefined{
  let icon:string|undefined;
  if(action.type==='command'&&action.command.type==='train')return unitIcon(action.command.unit);
  if(action.type==='mode'){
    if(action.mode.type==='build')return buildingIcon(action.mode.kind);
    if(action.mode.type==='attack')icon='attack-move';
    if(action.mode.type==='cast')return skillIcon(action.mode.skill);
  }else if(action.type==='command'){
    const command=action.command;
    if(command.type==='stop'||command.type==='hold')icon=command.type;
    if(command.type==='research')icon=researchIcons[command.research];
    if(command.type==='learn')return skillIcon(command.skill);
  }
  return icon?`/assets/games/rts/ui/commands/${icon}.png`:undefined;
}
export class Hud {
  private signature='';
  private menu:CommandMenu='main';
  private menuOwner='';
  private canBuild=false;
  private last:[TeamView,number[],Battlefield]|undefined;
  private queueSignature='';
  private notices:Array<{text:string;until:number;node:HTMLElement}>=[];
  private pings:Array<{x:number;z:number;until:number}>=[];
  private selection:HTMLElement;
  private commands:HTMLElement;
  private queue:HTMLElement;
  private mini:HTMLCanvasElement;
  private ctx:CanvasRenderingContext2D;
  private terrainRaster?:{image:ImageData;pixels:Uint32Array};
  constructor(private root:HTMLElement,private action:(a:HudAction)=>void){
    this.selection=this.el('rts-selection');this.commands=this.el('rts-commands');this.queue=this.el('rts-queue');this.mini=this.el('rts-minimap') as HTMLCanvasElement;this.ctx=this.mini.getContext('2d')!;
    this.commands.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.back()){e.preventDefault();e.stopPropagation();return;}
      const key=e.key.toLowerCase();if(/^[a-z]$/.test(key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&this.hotkey(key,e.repeat)){e.preventDefault();e.stopPropagation();}});
  }
  /** Re-syncs the card to a selection change at once, so a hotkey pressed before the next 100 ms render acts on the current selection. */
  select(ids:number[],view:TeamView){
    if(!this.last)return;const [,lastIds,scene]=this.last;
    if(ids.length===lastIds.length&&ids.every((id,i)=>id===lastIds[i]))return;
    this.render(view,ids,scene);
  }
  /** Opens the worker build card (WC3 style). Returns false when the current selection cannot build. */
  openBuildMenu():boolean{if(!this.canBuild)return false;if(this.menu!=='build')this.setMenu('build');return true;}
  /** Runs the current card's command bound to a letter key. Returns false when no command uses it; a disabled command explains why instead. */
  hotkey(key:string,repeat=false):boolean{
    if(key==='escape'||!/^[a-z]$/.test(key))return false;const b=this.commands.querySelector<HTMLButtonElement>(`button[data-hotkey="${key}"]`);if(!b)return false;
    if(!repeat){if(b.disabled)this.notice(b.title);else b.click();}return true;
  }
  /** Steps back from a command submenu to the main card. Returns false when already on the main card. */
  back():boolean{if(this.menu==='main')return false;this.setMenu('main');return true;}
  private setMenu(menu:CommandMenu){
    const focused=this.commands.contains(document.activeElement);this.menu=menu;
    if(this.last){this.signature='';this.render(...this.last);}
    if(focused)this.commands.querySelector<HTMLButtonElement>('button')?.focus();
  }
  private el(id:string):HTMLElement{return this.root.querySelector('#'+id)!;}
  /** Appends to a short feed (latest four, four seconds each) so several same-tick events stay readable; a repeated message moves to the end. */
  notice(message:string,tone:'info'|'alert'='info'){const now=performance.now();for(const n of this.notices)if(n.text===message)n.until=0;this.pruneNotices(now);
    const node=document.createElement('p');node.textContent=message;node.dataset.tone=tone;this.el('rts-notice').append(node);this.notices.push({text:message,until:now+4000,node});while(this.notices.length>4)this.notices.shift()!.node.remove();}
  private pruneNotices(now:number){this.notices=this.notices.filter(n=>{if(n.until>now)return true;n.node.remove();return false;});}
  /** Marks an alert location on the minimap for three seconds. */
  ping(x:number,z:number){this.pings.push({x,z,until:performance.now()+3000});}
  mode(mode:InputMode){const e=this.el('rts-mode');e.hidden=mode.type==='normal';e.textContent=mode.type==='build'?`放置${BUILDINGS[mode.kind].name} · 左鍵建造 · Esc 取消`:mode.type==='cast'?`${SKILLS[mode.skill].name} · ${SKILLS[mode.skill].target==='self'?'左鍵確認施放':'左鍵選擇目標'} · Esc 取消`:'攻擊移動 · 左鍵選擇目的地 · Esc 取消';}
  render(view:TeamView,ids:number[],scene:Battlefield){
    this.last=[view,ids,scene];
    const own=view.entities.filter(e=>e.team===0&&e.alive),bs=own.filter(e=>e.category==='building'&&e.construction===1),level=Math.max(1,...bs.map(b=>b.category==='building'?b.tier:1));
    const used=own.reduce((n,e)=>n+(e.category==='unit'?UNITS[e.kind].supply:0),0),cap=Math.min(80,bs.reduce((n,e)=>n+(e.category==='building'?BUILDINGS[e.kind].supply:0),0));
    this.el('rts-gold').textContent=Math.floor(view.team.gold).toLocaleString();this.el('rts-wood').textContent=Math.floor(view.team.wood).toLocaleString();this.el('rts-supply').textContent=`${used}${view.team.reservedSupply?` + ${view.team.reservedSupply}`:''} / ${cap}`;
    const battleTime=formatBattleTime(view.time),time=this.el('rts-time');time.textContent=battleTime.text;time.setAttribute('aria-label',battleTime.remaining?`剩餘 ${battleTime.text}`:`已進行 ${battleTime.text}`);time.classList.toggle('rts-time-remaining',battleTime.remaining);
    this.pruneNotices(performance.now());
    const selected=ids.map(id=>view.entities.find(e=>e.id===id&&e.alive)).filter((e):e is Entity=>!!e),first=selected[0];
    const owner=JSON.stringify(selected.map(e=>e.id));if(owner!==this.menuOwner){this.menuOwner=owner;this.menu='main';}
    this.canBuild=first?.team===0&&first.kind==='worker';if(!this.canBuild)this.menu='main';
    const progress=(kind:HeroKind):HeroProgress=>kind==='commander'?view.team.hero:view.team.heroes[kind];
    const alive=(kind:HeroKind)=>own.some(e=>e.kind===kind),preview=view.rosterPreview;
    const signature=JSON.stringify([this.menu,HERO_KINDS.map(alive),selected.map(e=>e.id),first?.category==='building'?[first.construction>=1,first.tier]:null,bs.map(b=>b.kind),level,view.team.research,view.team.hero,view.team.heroes,preview]);
    if(signature!==this.signature){this.signature=signature;this.selection.replaceChildren();this.commands.replaceChildren();
      const title=this.root.querySelector('#rts-command-title');if(title)title.textContent=this.menu==='build'?'建造':'命令';
      this.commands.dataset.menu=this.menu;
      const heading=document.createElement('h2');heading.textContent=first?`${first.category==='unit'?UNITS[first.kind].name:BUILDINGS[first.kind].name}${selected.length>1?` 等 ${selected.length} 名`:''}`:'指揮官，請下令。';this.selection.append(heading);
      if(first){const hp=document.createElement('div');hp.className='rts-hp';hp.dataset.hp='';this.selection.append(hp);const bar=document.createElement('progress');bar.dataset.health='';this.selection.append(bar);
        const meta=document.createElement('p');meta.dataset.meta='';this.selection.append(meta);
        if(isHero(first.kind)&&first.team===0){const p=progress(first.kind),hero=document.createElement('p');hero.textContent=`等級 ${p.level} · 經驗 ${p.xp} · 技能點 ${p.points}`;this.selection.append(hero);}
        if(selected.length>1){const group=document.createElement('div');group.className='rts-group-list';for(const e of selected){const b=document.createElement('button');const art=e.category==='unit'?e.kind==='neutral-raider'?undefined:unitIcon(e.kind):buildingIcon(e.kind);if(art){const img=document.createElement('img');img.src=art;img.alt='';img.setAttribute('aria-hidden','true');img.width=24;img.height=24;img.draggable=false;b.append(img);}b.append(e.category==='unit'?UNITS[e.kind].name:BUILDINGS[e.kind].name);b.addEventListener('click',()=>this.action({type:'select',ids:[e.id]}));group.append(b);}this.selection.append(group);}
      }else {const p=document.createElement('p');p.textContent='選取工人開始採集，或選取領主府訓練工人。';this.selection.append(p);}
      if(first?.team===0){const kinds=bs.map(b=>b.kind) as BuildingKind[];
        if(first.category==='unit'&&this.menu==='build'){
          for(const [kind,d] of Object.entries(BUILDINGS)){if(!unlocked(d,preview))continue;const action:HudAction={type:'mode',mode:{type:'build',kind:kind as BuildingKind,workerId:first.id}};this.button(d.name,`金 ${d.cost.gold} · 木 ${d.cost.wood}`,()=>{this.back();this.action(action);},d.cost,d.requires,undefined,0,undefined,commandIcon(action));}
          this.button('返回','回到命令',()=>this.back());
        }else if(first.category==='unit'){
          const unitIds=selected.filter(e=>e.category==='unit'&&e.team===0).map(e=>e.id);
          this.button('攻擊移動','沿途迎敵',{type:'mode',mode:{type:'attack'}});this.button('停止','中止行動',{type:'command',command:{type:'stop',unitIds}});this.button('守備','原地駐守',{type:'command',command:{type:'hold',unitIds}});
          if(first.kind==='worker')this.button('建造','開啟建造選單',()=>this.openBuildMenu(),undefined,undefined,undefined,0,undefined,buildingIcon('house'));
          if(isHero(first.kind))for(const k of heroSkills(first.kind)){
            const d=SKILLS[k],p=progress(first.kind),rank=p.skills[k];
            if(rank)this.button(d.name,`魔 ${d.mana} · ${rank} 階`,{type:'mode',mode:{type:'cast',skill:k,heroId:first.id}},undefined,undefined,k);
            if(p.points&&rank<2&&p.level>=d.minLevel)this.button(`學習${d.name}`,'消耗 1 技能點',{type:'command',command:{type:'learn',heroId:first.id,skill:k}});
          }
        }else if(first.construction<1)this.button('取消施工','依未完成比例退款',{type:'command',command:{type:'cancel',buildingId:first.id}});
        else {
          for(const [kind,d] of Object.entries(UNITS))if(d.trainedAt===first.kind&&unlocked(d,preview)){const revive=isHero(kind)&&progress(kind).recruited&&!alive(kind),b=this.button(revive?'復活':d.name,`${revive?`${d.name}陣亡 · `:''}金 ${d.cost.gold} · 木 ${d.cost.wood} · 人 ${d.supply}`,{type:'command',command:{type:'train',buildingId:first.id,unit:kind as PlayableUnit}},d.cost,d.requires,undefined,d.supply);if(revive)b.dataset.state='dead';}
          for(const [key,d] of Object.entries(RESEARCH))if(d.at===first.kind&&!view.team.research.includes(key as ResearchId))this.button(d.name,`金 ${d.cost.gold} · 木 ${d.cost.wood}`,{type:'command',command:{type:'research',buildingId:first.id,research:key as ResearchId}},d.cost,d.requires,undefined,0,d.previous);
          if(first.kind==='townhall'&&first.tier<3){const tier=(first.tier+1) as 2|3,d=TIER_UPGRADES[tier];this.button(`升級${d.name}`,`金 ${d.cost.gold} · 木 ${d.cost.wood}`,{type:'command',command:{type:'upgrade',buildingId:first.id}},d.cost,d.requires,undefined,0,undefined,buildingIcon(`townhall-tier${tier}`));}
        }
      }
      let next=0;for(const b of this.commands.querySelectorAll<HTMLButtonElement>('button')){const key=FIXED_HOTKEYS[b.dataset.label!]??HOTKEY_POOL[next++];if(!key)continue;
        b.dataset.hotkey=key;b.setAttribute('aria-keyshortcuts',key==='escape'?'Escape':key.toUpperCase());const kbd=document.createElement('kbd');kbd.className='rts-command-key';kbd.textContent=keyLabel(key);b.append(kbd);}
    }
    const idle=this.root.querySelector<HTMLButtonElement>('#rts-idle');if(idle){const n=own.filter(e=>e.category==='unit'&&e.kind==='worker'&&e.order.type==='idle').length;idle.disabled=n===0;const count=idle.querySelector('#rts-idle-count');if(count)count.textContent=String(n);}
    if(first){this.selection.querySelector('[data-hp]')!.textContent=`生命 ${Math.ceil(first.hp)} / ${first.maxHp}`;const hp=this.selection.querySelector('progress')!;hp.max=first.maxHp;hp.value=first.hp;
      const meta=this.selection.querySelector('[data-meta]')!;meta.textContent=first.category==='building'?first.construction<1?`施工 ${Math.floor(first.construction*100)}%`:first.kind==='townhall'?`主城第 ${first.tier} 階`:'建築已就緒':`傷害 ${UNITS[first.kind].damage} · 護甲 ${UNITS[first.kind].armor}${UNITS[first.kind].mana?` · 魔力 ${Math.floor(first.mana)}`:''}${first.kind==='worker'&&first.cargo.amount?` · 攜帶 ${first.cargo.amount} ${first.cargo.kind==='gold'?'金':'木'}`:''}`;
      if(first.category==='building'&&first.team===0&&first.rally)meta.textContent+=first.rally.resourceId?' · 集結：新工人自動採集':' · 已設集結點';
    }
    for(const b of this.commands.querySelectorAll<HTMLButtonElement>('button')){const skill=b.dataset.skill as SkillId|undefined;const reasons=commandBlockReasons({gold:view.team.gold,wood:view.team.wood,used,reserved:view.team.reservedSupply,cap,tier:level,buildings:bs.map(x=>x.kind as BuildingKind),research:view.team.research},{cost:{gold:Number(b.dataset.gold??0),wood:Number(b.dataset.wood??0)},supply:Number(b.dataset.supply??0),requires:b.dataset.requires?JSON.parse(b.dataset.requires) as Requirements:undefined,previous:b.dataset.previous as ResearchId|undefined,mana:skill?SKILLS[skill].mana:undefined,currentMana:first?.category==='unit'?first.mana:undefined,cooldown:skill&&first?.category==='unit'?first.skillCooldowns[skill]:undefined});b.disabled=reasons.length>0;b.title=reasons.length?reasons.join('；'):`${b.dataset.label}：${b.dataset.detail}`;b.parentElement!.title=b.title;b.setAttribute('aria-description',b.title);const detail=b.querySelector('small');if(detail)detail.textContent=reasons.length?commandCardReasons(reasons):b.dataset.detail!;}
    const queues=first?.category==='building'&&first.team===0?first.queue:[];
    const queueSignature=queues.map(q=>`${q.id}:${Math.ceil(q.duration-q.elapsed)}`).join('|');if(queueSignature!==this.queueSignature){this.queueSignature=queueSignature;this.queue.replaceChildren();for(const q of queues){const b=document.createElement('button');const label=q.type==='train'?UNITS[q.target as PlayableUnit].name:q.type==='research'?RESEARCH[q.target as ResearchId].name:TIER_UPGRADES[q.target as 2|3].name;b.textContent=`${label} ${Math.ceil(q.duration-q.elapsed)}秒 ×`;b.title='取消這個排程';b.addEventListener('click',()=>this.action({type:'command',command:{type:'cancel',buildingId:first!.id,queueId:q.id}}));this.queue.append(b);}}
    this.drawMinimap(view,scene);
  }
  private button(label:string,sub:string,action:HudAction|(()=>void),cost?:{gold:number;wood:number},requires?:Requirements,skill?:SkillId,supply=0,previous?:ResearchId,icon=typeof action==='function'?undefined:commandIcon(action)){
    const b=document.createElement('button');b.type='button';
    if(icon){
      const image=document.createElement('img');image.src=icon;image.alt='';image.setAttribute('aria-hidden','true');image.width=48;image.height=48;image.draggable=false;
      b.className='rts-command-art';b.append(image);
    }
    const text=document.createElement('span');text.className='rts-command-copy';const name=document.createElement('span');name.className='rts-command-label';name.textContent=label;text.append(name);
    const small=document.createElement('small');small.textContent=sub;text.append(small);b.append(text);
    b.dataset.label=label;b.dataset.detail=sub;b.dataset.gold=String(cost?.gold??0);b.dataset.wood=String(cost?.wood??0);b.dataset.supply=String(supply);if(requires)b.dataset.requires=JSON.stringify(requires);if(previous)b.dataset.previous=previous;if(skill)b.dataset.skill=skill;b.title=`${label}：${sub}`;b.addEventListener('click',()=>{if(b.disabled)return;if(typeof action==='function')action();else this.action(action);});const slot=document.createElement('span');slot.className='rts-command-slot';slot.append(b);this.commands.append(slot);return b;
  }
  private drawMinimap(view:TeamView,scene:Battlefield){const c=this.ctx,{width:W,height:H}=scene.map;
    // The canvas keeps its 192 px backing store; cells scale to it (1.5 m per px on the 288 m maps)
    // while markers keep their pixel size, so they read relatively larger on the bigger map. The
    // raster loop is bound by the 192² canvas, not the map, so it did not grow with the 288 m maps.
    const size=c.canvas?.width||192,k=size/W;
    if(!this.terrainRaster||this.terrainRaster.image.width!==size){const image=c.createImageData(size,size);this.terrainRaster={image,pixels:new Uint32Array(image.data.buffer)};}
    const {image,pixels}=this.terrainRaster,blocked=scene.map.id==='river'?1:2;
    for(let y=0;y<size;y++){const z=Math.min(H-1,Math.floor(y/k)),row=z*W;for(let x=0;x<size;x++){
      const i=row+Math.min(W-1,Math.floor(x/k));pixels[y*size+x]=MINIMAP_TERRAIN[!view.explored[i]?0:scene.map.blocked[i]?blocked:view.visible[i]?3:4];
    }}
    c.putImageData(image,0,0);
    for(const r of view.resources){if(r.remaining<=0)continue;c.fillStyle=r.kind==='gold'?'#d5b770':'#9abc67';c.fillRect(r.x*k-2,r.z*k-2,4,4);}
    for(const e of view.knownBuildings){c.fillStyle='#754f41';c.fillRect(e.x*k-3,e.z*k-3,6,6);}
    for(const e of view.entities){if(!e.alive)continue;c.fillStyle=e.team===0?'#76b7e1':e.team===1?'#ed9079':'#d4c3a1';const n=e.category==='building'?6:3;c.fillRect(e.x*k-n/2,e.z*k-n/2,n,n);}
    const now=performance.now();this.pings=this.pings.filter(p=>p.until>now);c.lineWidth=2;c.strokeStyle='#f2a184';
    for(const p of this.pings){c.beginPath();c.arc(p.x*k,p.z*k,4+(1-(p.until-now)/3000)*10,0,Math.PI*2);c.stroke();}
    c.strokeStyle='#e6dbc0';c.lineWidth=1;c.beginPath();scene.viewFootprint.forEach((p,i)=>i?c.lineTo(p.x*k,p.z*k):c.moveTo(p.x*k,p.z*k));c.closePath();c.stroke();
  }
}
