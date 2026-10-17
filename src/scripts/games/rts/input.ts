import type {Battlefield,TeamView} from './scene';
import {BUILDINGS,HERO_KINDS,type BuildingKind,type SkillId} from './catalog';
import type {Command,Entity} from './types';
import {canPlace} from './navigation';
import type {Hud} from './hud';
import {spellPreview} from './targeting';
import {isPointVisible} from './visibility';
export type InputMode={type:'normal'}|{type:'attack'}|{type:'build';kind:BuildingKind;workerId:number}|{type:'cast';skill:SkillId;heroId:number};
function isUiTarget(target:EventTarget|null){return target instanceof Element&&!!target.closest('button,a[href],summary,input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="button"],[role="link"],[role="slider"]');}
export class BattlefieldInput {
  selection:number[]=[];
  mode:InputMode={type:'normal'};
  private abort=new AbortController();
  private keys=new Set<string>();
  private groups=new Map<string,number[]>();
  private drag:{x:number;y:number;button:number;lastX:number;lastY:number}|null=null;
  private pointer={x:NaN,y:NaN};
  private view:TeamView;
  private tap={key:'',time:-Infinity};
  private idleCursor=-1;
  private camera={edgeScroll:true,cameraSpeed:1};
  constructor(private scene:Battlefield,view:TeamView,private send:(command:Command)=>boolean,private hud:Hud,private menu:()=>void){
    this.view=view;const {signal}=this.abort,canvas=scene.canvas;
    canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus();this.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId);},{signal});
    canvas.addEventListener('pointermove',e=>this.move(e),{signal});
    canvas.addEventListener('pointerup',e=>this.up(e),{signal});
    canvas.addEventListener('pointercancel',()=>{this.drag=null;scene.box=null;},{signal});
    canvas.addEventListener('pointerleave',()=>{this.pointer={x:NaN,y:NaN};},{signal});
    canvas.addEventListener('wheel',e=>{e.preventDefault();scene.zoom(Math.sign(e.deltaY)*4);},{signal,passive:false});
    window.addEventListener('keydown',e=>this.key(e),{signal});window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()),{signal});window.addEventListener('blur',()=>this.keys.clear(),{signal});
    window.addEventListener('focusin',e=>{if(isUiTarget(e.target))this.keys.clear();},{signal});
    const minimap=document.getElementById('rts-minimap') as HTMLCanvasElement;
    minimap.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    minimap.addEventListener('pointerdown',e=>{
      e.preventDefault();if(e.button!==0&&e.button!==2)return;
      const r=minimap.getBoundingClientRect(),p={x:(e.clientX-r.left)/r.width*this.view.width,z:(e.clientY-r.top)/r.height*this.view.height};
      if(e.button===0&&this.mode.type!=='attack'){scene.focus(p);return;}
      canvas.focus();
      if(this.mode.type==='build'||this.mode.type==='cast'){this.setMode({type:'normal'});return;}
      const first=this.selected()[0];
      if(first?.category==='building'&&first.team===0){if(this.send({type:'rally',buildingId:first.id,position:p}))this.setMode({type:'normal'});return;}
      const ids=this.unitIds();if(!ids.length)return;
      if(this.send({type:'move',unitIds:ids,position:p,attackMove:this.mode.type==='attack'}))this.setMode({type:'normal'});
    },{signal});
  }
  /** Persisted camera settings: edge scrolling on/off and a pan speed multiplier. */
  configure(settings:{edgeScroll:boolean;cameraSpeed:number}){this.camera={edgeScroll:settings.edgeScroll,cameraSpeed:settings.cameraSpeed};}
  /** A second press of the same selection key within 350 ms centres the camera (WC3 / SC2 style). */
  private doubleTap(key:string){const now=performance.now(),again=this.tap.key===key&&now-this.tap.time<350;this.tap=again?{key:'',time:-Infinity}:{key,time:now};return again;}
  private centre(ids:number[]){const es=ids.map(id=>this.view.entities.find(e=>e.id===id&&e.alive)).filter((e):e is Entity=>!!e);if(es.length)this.scene.focus({x:es.reduce((n,e)=>n+e.x,0)/es.length,z:es.reduce((n,e)=>n+e.z,0)/es.length});}
  private idle(){return this.view.entities.filter(e=>e.alive&&e.team===0&&e.category==='unit'&&e.kind==='worker'&&e.order.type==='idle').sort((a,b)=>a.id-b.id);}
  idleWorkers():number{return this.idle().length;}
  /** Cycles idle workers in id order and centres the camera on the chosen one. */
  selectIdleWorker():boolean{const idle=this.idle();if(!idle.length){this.hud.notice('目前沒有閒置的工人');return false;}
    const next=idle.find(e=>e.id>this.idleCursor)??idle[0];this.idleCursor=next.id;this.select([next.id]);this.scene.focus(next);return true;}
  selectHero(tap='f1'):boolean{const hero=HERO_KINDS.map(kind=>this.view.entities.find(e=>e.alive&&e.team===0&&e.kind===kind)).find(Boolean);if(!hero){this.hud.notice('誓衛統領尚未招募或已陣亡');return false;}
    this.select([hero.id]);if(this.doubleTap(tap))this.scene.focus(hero);return true;}
  selectArmy(tap='f2'):boolean{const ids=this.view.entities.filter(e=>e.alive&&e.team===0&&e.category==='unit'&&e.kind!=='worker').map(e=>e.id);if(!ids.length){this.hud.notice('沒有可選取的部隊');return false;}
    this.select(ids);if(this.doubleTap(tap))this.centre(ids);return true;}
  setView(view:TeamView){this.view=view;this.select(this.selection.filter(id=>view.entities.some(e=>e.id===id&&e.alive)));this.updateSpellPreview();}
  select(ids:number[]){
    const candidates=[...new Set(ids)].map(id=>this.view.entities.find(e=>e.id===id&&e.alive)).filter((e):e is Entity=>!!e);
    const troops=candidates.filter(e=>e.team===0&&e.category==='unit');
    const single=candidates.find(e=>e.team===0)??candidates[0];
    this.selection=troops.length?troops.map(e=>e.id):single?[single.id]:[];this.scene.selection=this.selection;this.hud.select(this.selection,this.view);
  }
  setMode(mode:InputMode){this.mode=mode;this.scene.placement=null;this.scene.box=null;this.scene.spell=null;this.hud.mode(mode);this.updateSpellPreview();
    if(mode.type!=='normal')this.scene.canvas.focus();
  }
  private updateSpellPreview(){
    if(this.mode.type!=='cast')return;const m=this.mode,hasPointer=Number.isFinite(this.pointer.x)&&Number.isFinite(this.pointer.y);
    const point=hasPointer?this.scene.world(this.pointer.x,this.pointer.y):null,hit=hasPointer?this.scene.pick(this.pointer.x,this.pointer.y):null;
    this.scene.spell=spellPreview(this.view,m.heroId,m.skill,point??undefined,hit?.entityId);
  }
  private unitIds(){return this.selection.filter(id=>this.view.entities.some(e=>e.id===id&&e.alive&&e.team===0&&e.category==='unit'));}
  private selected(){return this.selection.map(id=>this.view.entities.find(e=>e.id===id)).filter((e):e is Entity=>!!e);}
  private move(e:PointerEvent){
    this.pointer={x:e.clientX,y:e.clientY};
    if(this.mode.type==='cast'){this.updateSpellPreview();return;}
    if(this.drag?.button===1){const dx=e.clientX-this.drag.lastX,dy=e.clientY-this.drag.lastY;this.scene.pan(-dx*.035-dy*.02,-dy*.04+dx*.024);this.drag.lastX=e.clientX;this.drag.lastY=e.clientY;return;}
    if(this.mode.type==='build'){const p=this.scene.world(e.clientX,e.clientY);if(p){const position={x:Math.round(p.x*2)/2,z:Math.round(p.z*2)/2},d=BUILDINGS[this.mode.kind];const obstacles=this.view.entities.filter(e=>e.category==='building'&&e.alive).map(e=>({x:e.x,z:e.z,width:BUILDINGS[e.kind as BuildingKind].width,depth:BUILDINGS[e.kind as BuildingKind].depth}));this.scene.placement={position,kind:this.mode.kind,valid:isPointVisible(this.view.visible,this.scene.map.width,this.scene.map.height,position)&&canPlace(this.scene.map,{...position,width:d.width,depth:d.depth},obstacles)};}return;}
    if(this.drag?.button===0&&this.mode.type==='normal'&&Math.hypot(e.clientX-this.drag.x,e.clientY-this.drag.y)>5)this.scene.box={x1:this.drag.x,y1:this.drag.y,x2:e.clientX,y2:e.clientY};
  }
  private up(e:PointerEvent){const drag=this.drag;this.drag=null;if(!drag)return;if(this.scene.canvas.hasPointerCapture(e.pointerId))this.scene.canvas.releasePointerCapture(e.pointerId);if(drag.button===1)return;
    const p=this.scene.world(e.clientX,e.clientY),hit=this.scene.pick(e.clientX,e.clientY),target=hit?.entityId===undefined?undefined:this.view.entities.find(v=>v.id===hit.entityId&&v.alive);
    if(drag.button===2){this.setMode({type:'normal'});if(!p)return;const selected=this.selected();if(selected[0]?.category==='building'&&selected[0].team===0){this.send({type:'rally',buildingId:selected[0].id,position:p,...selected[0].kind==='townhall'&&hit?.resourceId?{resourceId:hit.resourceId}:{}});return;}
      const ids=this.unitIds();if(!ids.length)return;
      if(target&&target.team!==0)this.send({type:'attack',unitIds:ids,targetId:target.id});
      else if(hit?.resourceId){const workers=selected.filter(e=>e.team===0&&e.kind==='worker').map(e=>e.id);if(workers.length)this.send({type:'gather',unitIds:workers,resourceId:hit.resourceId});}
      else if(target?.category==='building'&&target.team===0&&(target.construction<1||target.hp<target.maxHp)){const workers=selected.filter(e=>e.kind==='worker'&&e.team===0).map(e=>e.id);if(workers.length)this.send({type:target.construction<1?'resume':'repair',unitIds:workers,targetId:target.id});}
      else this.send({type:'move',unitIds:ids,position:p});return;
    }
    if(drag.button!==0)return;
    if(this.mode.type==='build'){if(!p||!this.scene.placement?.valid){this.hud.notice('此處無法建造：請選擇可見平地並保留通道');return;}const mode=this.mode,position=this.scene.placement.position;if(this.send({type:'build',workerId:mode.workerId,building:mode.kind,position}))this.setMode({type:'normal'});return;}
    if(this.mode.type==='cast'){if(p){const m=this.mode,preview=spellPreview(this.view,m.heroId,m.skill,p,target?.id);if(!preview?.valid){this.hud.notice(m.skill==='mend'?'請選擇範圍內受傷的友軍':'目標超出範圍或技能尚未就緒');return;}if(this.send({type:'cast',heroId:m.heroId,skill:m.skill,targetId:target?.id,position:p}))this.setMode({type:'normal'});}return;}
    if(this.mode.type==='attack'){if(p){const ids=this.unitIds();const ok=target&&target.team!==0?this.send({type:'attack',unitIds:ids,targetId:target.id}):this.send({type:'move',unitIds:ids,position:p,attackMove:true});if(ok)this.setMode({type:'normal'});}return;}
    if(this.scene.box){const b=this.scene.box;this.scene.box=null;const inside=this.view.entities.filter(v=>{if(!v.alive||v.team!==0||v.category!=='unit')return false;const p=this.scene.screen(v);return p.x>=Math.min(b.x1,b.x2)&&p.x<=Math.max(b.x1,b.x2)&&p.y>=Math.min(b.y1,b.y2)&&p.y<=Math.max(b.y1,b.y2);}).map(v=>v.id);this.select(e.shiftKey?[...this.selection,...inside]:inside);return;}
    if(target){const next=e.shiftKey?this.selection.includes(target.id)?this.selection.filter(id=>id!==target.id):[...this.selection,target.id]:[target.id];this.select(next);}else if(!e.shiftKey)this.select([]);
  }
  private key(e:KeyboardEvent){if(isUiTarget(e.target)||document.querySelector('#rts-menu[open]'))return;const key=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' ','home'].includes(key))e.preventDefault();
    if(key==='escape'){e.preventDefault();
      // WC3: cancelling a placement returns to the build card, not the main card.
      if(this.mode.type!=='normal'){const placing=this.mode.type==='build';this.setMode({type:'normal'});if(placing)this.hud.openBuildMenu();}
      else if(!this.hud.back())this.menu();return;}
    if(key==='b'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&this.unitIds().length&&this.hud.openBuildMenu()){e.preventDefault();return;}
    if(/^[1-5]$/.test(key)){e.preventDefault();if(e.ctrlKey){this.groups.set(key,[...this.unitIds()]);this.tap={key:'',time:-Infinity};}
      else {const ids=(this.groups.get(key)??[]).filter(id=>this.view.entities.some(e=>e.id===id&&e.alive));this.select(ids);if(this.doubleTap(key))this.centre(ids);}return;}
    if(key==='f1'||key==='f2'||key==='f3'){e.preventDefault();if(!e.repeat){if(key==='f1')this.selectHero();else if(key==='f2')this.selectArmy();else this.selectIdleWorker();}return;}
    if(key==='home'){this.scene.focus(this.view.entities.find(e=>e.team===0&&e.kind==='townhall')??this.scene.map.spawns[0]);return;}
    const ids=this.unitIds();if(ids.length){if(key==='a'){if(!e.repeat)this.setMode({type:'attack'});return;}if(key==='s'){if(!e.repeat)this.send({type:'stop',unitIds:ids});return;}if(key==='h'){if(!e.repeat)this.send({type:'hold',unitIds:ids});return;}}
    // Command-card hotkeys never use W/A/S/D/H/B or digits, so camera and group keys keep working.
    if(/^[a-z]$/.test(key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&this.hud.hotkey?.(key,e.repeat)){e.preventDefault();return;}
    this.keys.add(key);
  }
  update(dt:number){let x=0,z=0;const k=this.keys;if(k.has('arrowleft')||k.has('a'))x--;if(k.has('arrowright')||k.has('d'))x++;if(k.has('arrowup')||k.has('w'))z--;if(k.has('arrowdown')||k.has('s'))z++;
    if(this.camera.edgeScroll){const r=this.scene.canvas.getBoundingClientRect();if(this.pointer.x<r.left+12)x--;if(this.pointer.x>r.right-12)x++;if(this.pointer.y<r.top+8)z--;if(this.pointer.y>r.bottom-8)z++;}
    // Pan in proportion to the visible span (34 m/s at the 48 m opening view, ~42 m/s fully zoomed out).
    const speed=dt*34*this.camera.cameraSpeed*Math.max(.6,(this.scene.viewSpan??48)/48);if(x||z)this.scene.pan((x*.83+z*.56)*speed,(z*.83-x*.56)*speed);
  }
  dispose(){this.abort.abort();this.keys.clear();this.groups.clear();this.drag=null;this.scene.box=null;this.scene.placement=null;this.scene.spell=null;}
}
