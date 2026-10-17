/** Staged timing verification using the real simulation, renderer and published art. */
import {mountRts} from '../../src/scripts/games/rts/main';
import {Battlefield} from '../../src/scripts/games/rts/scene';
import {createGame,stepGame} from '../../src/scripts/games/rts/simulation';
import {addUnit} from '../../src/scripts/games/rts/state';
import {getTeamView,updateVisibility} from '../../src/scripts/games/rts/visibility';
import {issueCommand} from '../../src/scripts/games/rts/commands';
import type {GameState,Unit} from '../../src/scripts/games/rts/types';

const audit:any={state:null,field:null,attacker:null,target:null};(window as any).attackCueAudit=audit;
const render=Battlefield.prototype.render;
Battlefield.prototype.render=function(view,dt,alpha){audit.field=this;return render.call(this,view,dt,alpha);};
const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
audit.dispose=mountRts(root,(map,seed)=>{
  const state=createGame(map,seed);state.aiEnabled=[false,false];state.entities=state.entities.filter(e=>e.category==='building');
  const attacker=addUnit(state,0,'guard',{x:25,z:42}),target=addUnit(state,1,'guard',{x:25,z:43.3});
  attacker.hp=attacker.maxHp=target.hp=target.maxHp=100000;attacker.order={type:'attack',targetId:target.id};target.order={type:'hold'};
  state.paused=true;updateVisibility(state);Object.assign(audit,{state,attacker,target});return state;
});
audit.sample=()=>{
  const s=audit.state as GameState,u=audit.attacker as Unit,field=audit.field as any;
  const visual=field.models.get(u.id),portrait=field.portrait;
  const pose=(root:any)=>{let hash=2166136261;root.traverse((node:any)=>{if(node.isBone)for(const value of [...node.position.toArray(),...node.quaternion.toArray()])hash=Math.imul(hash^Math.round(value*1e5),16777619);});return hash>>>0;};
  return {tick:s.tick,time:s.time,cue:u.attackCue??null,animation:u.animation,targetHp:audit.target.hp,
    clips:visual.instance.variants.map((v:any)=>({name:v.action?.getClip().name,time:v.action?.time,loop:v.action?.loop,paused:v.action?.paused,weight:v.action?.getEffectiveWeight(),pose:pose(v.root),visible:v.root.visible})),
    portrait:portrait?.instance?.variants.map((v:any)=>({name:v.action?.getClip().name,time:v.action?.time}))??[]};
};
audit.advance=()=>{
  audit.state.paused=false;stepGame(audit.state);audit.state.paused=true;
  render.call(audit.field,getTeamView(audit.state,0),.05);return audit.sample();
};
audit.move=()=>{
  audit.state.paused=false;
  const result=issueCommand(audit.state,0,{type:'move',unitIds:[audit.attacker.id],position:{x:22,z:42}});
  audit.state.paused=true;render.call(audit.field,getTeamView(audit.state,0),0);return {result,sample:audit.sample()};
};
audit.recreateVisual=()=>{
  const id=audit.attacker.id,visual=audit.field.models.get(id);visual.instance.dispose();audit.field.models.delete(id);
  render.call(audit.field,getTeamView(audit.state,0),0);return audit.sample();
};
