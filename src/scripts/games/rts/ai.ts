import {BUILDINGS,UNITS,RESEARCH,SKILLS,requirementsMet,unlocked,isHero,type BuildingKind,type TeamId,type PlayableUnit,type ResearchId,type SkillId,type UnitKind} from './catalog';
import type {GameState,Unit,ResourceNode,Entity} from './types';
import {buildings,units,tier,population,completedKinds,distance,random,heroProgress} from './state';
import {issueCommand} from './commands';
import {canAttack} from './combat';
import {isVisible,planningObstacles} from './visibility';
import {findPath} from './navigation';
import {roadPaths,type Vec2} from './maps';
/** Gatherers one node keeps busy before extra workers are sent to the next one. */
const SATURATION={gold:8,wood:5} as const;
const SITE_ATTEMPTS=4,SITE_RANGE=34,GAP=2,SPACING=3;
export type Difficulty='easy'|'normal'|'hard';
/**
 * Difficulty changes behaviour only, never resources or vision: reaction time
 * (seconds between thinks), first wave, wave cadence and size, soldier caps per
 * tier, worker targets (tier I / cap later / beyond what the served nodes
 * saturate), the bank above which it keeps
 * recruiting while saving for tech, and whether the AI scouts and expands
 * to new gold, clears neutral camps and pulls a beaten army back to regroup.
 */
export interface AIProfile {think:number;firstAttack:number;cadence:number;wave:number;armyCap:Record<number,number>;workers:[number,number];extraWorkers:number;
  spendAbove:number;scoutAt:number;expand:boolean;creep:boolean;retreat:boolean;retreatRatio:number;regroup:number;
  /**
   * Preview-roster air play (ignored while the roster gate is off): gryphons
   * kept in the field from tier III, their mix weight, whether they raid enemy
   * workers, and how hard the seat answers enemy flyers with anti-air.
   */
  air:AirProfile}
export interface AirProfile {min:number;weight:number;harass:boolean;antiAir:number}
export const AI_PROFILES:Readonly<Record<Difficulty,AIProfile>>={
  easy:{think:2,firstAttack:300,cadence:100,wave:6,armyCap:{1:2,2:3,3:8},workers:[7,14],extraWorkers:-4,spendAbove:600,scoutAt:Infinity,expand:false,creep:false,retreat:false,retreatRatio:0,regroup:0,air:{min:0,weight:.5,harass:false,antiAir:.5}},
  // The old cap of 3 / 4 soldiers (plus the hero) before tier III keeps the
  // first wave on a human at that stage; from tier III production is uncapped.
  normal:{think:1,firstAttack:180,cadence:70,wave:6,armyCap:{1:3,2:4},workers:[9,24],extraWorkers:0,spendAbove:450,scoutAt:75,expand:true,creep:true,retreat:true,retreatRatio:.55,regroup:30,air:{min:1,weight:1,harass:true,antiAir:1}},
  hard:{think:.5,firstAttack:150,cadence:55,wave:6,armyCap:{1:3,2:5},workers:[12,30],extraWorkers:6,spendAbove:250,scoutAt:45,expand:true,creep:true,retreat:true,retreatRatio:.7,regroup:20,air:{min:2,weight:1.4,harass:true,antiAir:1.5}},
};
const profileOf=(s:GameState,t:TeamId)=>AI_PROFILES[s.ai[t].difficulty??'normal'];
function construct(s:GameState,t:TeamId,kind:BuildingKind,front=false,near?:Vec2):boolean {
  const d=BUILDINGS[kind];if(!requirementsMet(d.requires,tier(s,t),completedKinds(s,t))||s.teams[t].gold<d.cost.gold||s.teams[t].wood<d.cost.wood)return false;
  const workers=units(s,t).filter(u=>u.kind==='worker'&&u.order.type!=='build'&&u.order.type!=='repair'&&u.id!==s.ai[t].prospectorId);if(!workers.length)return false;
  // Directions come from the map geography, never from the team index.
  const base=s.map.spawns[t],direction=base.x<s.map.width/2?1:-1;
  // The authored opening slots keep the familiar early layout and timing;
  // once they are used up, search the explored base area for legal sites.
  // East slots are the 180° twins of the west ones.
  const slots=front||near?[]:[{x:0,z:-13},{x:13,z:-13},{x:20,z:0},{x:13,z:15},{x:0,z:17},{x:26,z:-15},{x:26,z:17},{x:0,z:-26},{x:13,z:-26},{x:26,z:-28},{x:0,z:30},{x:13,z:30}]
    .map(slot=>({x:base.x+direction*slot.x,z:base.z+direction*slot.z}));
  // Remember sites the build command refused (until the navigation layout
  // changes) so later thinks move on to the next candidates instead of
  // retrying the same refused spots every second.
  const ai=s.ai[t];if(ai.siteRevision!==s.navigationRevision){ai.siteRevision=s.navigationRevision;ai.siteRejected=[];}
  const rejected=ai.siteRejected??=[];
  const key=(p:Vec2)=>kind+'@'+p.x+','+p.z;
  const place=(position:Vec2)=>{if(rejected.includes(key(position)))return false;
    const worker=[...workers].sort((a,b)=>distance(a,position)-distance(b,position)||direction*(a.z-b.z)||direction*(a.x-b.x))[0];
    const r=issueCommand(s,t,{type:'build',workerId:worker.id,building:kind,position});
    if(!r.ok&&r.reason.startsWith('此處無法建造'))rejected.push(key(position));return r.ok;};
  // Skip slots that are plainly taken or out of sight instead of issuing doomed commands.
  const reserved=unclaimedGold(s,t),open=(p:Vec2)=>isVisible(s,t,p)&&!reserved.some(r=>distance(p,r)<RESERVE)&&!buildings(s).some(b=>Math.abs(b.x-p.x)<(d.width+BUILDINGS[b.kind].width)/2&&Math.abs(b.z-p.z)<(d.depth+BUILDINGS[b.kind].depth)/2);
  for(const position of slots)if(open(position)&&place(position))return true;
  for(const position of siteCandidates(s,t,kind,front,near).filter(p=>!rejected.includes(key(p))).slice(0,SITE_ATTEMPTS))if(place(position))return true;
  return false;
}
/**
 * Remembered gold no hall serves yet. Base buildings keep RESERVE clear of it:
 * the houses and workshops of a growing base otherwise fill the expansion site.
 */
const RESERVE=17;
const unclaimedGold=(s:GameState,t:TeamId)=>Object.values(s.ai[t].knownResources??{}).filter(r=>r.kind==='gold'&&!buildings(s,t).some(b=>b.kind==='townhall'&&distance(b,r)<14));
/** Shortest distance from a point to an axis-aligned rectangle. */
const rectDistance=(p:Vec2,c:Vec2,w:number,d:number)=>Math.hypot(Math.max(0,Math.abs(p.x-c.x)-w/2),Math.max(0,Math.abs(p.z-c.z)-d/2));
function segmentClear(a:Vec2,b:Vec2,c:Vec2,w:number,d:number,clearance:number):boolean {
  // Cheap reject: the whole segment is farther than its length plus clearance.
  if(rectDistance(a,c,w,d)>distance(a,b)+clearance)return true;
  const n=Math.max(1,Math.ceil(distance(a,b)/.5));
  for(let i=0;i<=n;i++)if(rectDistance({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},c,w,d)<clearance)return false;
  return true;
}
/**
 * Explored, currently visible sites near the base, best first. Footprints keep
 * a walking gap to other buildings and stay off roads, resource nodes and the
 * drop-off-to-resource lanes; the build command's canPlace still guarantees
 * that every spawn, resource and camp stays reachable (no sealed chokepoint).
 */
function siteCandidates(s:GameState,t:TeamId,kind:BuildingKind,front:boolean,near?:Vec2):Vec2[] {
  const {map}=s,d=BUILDINGS[kind],fog=s.visibility[t],own=buildings(s,t);
  // An expansion searches a small area around its gold instead of the base.
  const hall=near??own.find(b=>b.kind==='townhall')??{x:map.spawns[t].x,z:map.spawns[t].z},reach=near?14:SITE_RANGE;
  const reserved=near?[]:unclaimedGold(s,t);
  const enemy=map.spawns[t===0?1:0],span=Math.max(1e-6,distance(enemy,hall)),toward={x:(enemy.x-hall.x)/span,z:(enemy.z-hall.z)/span};
  const drops=own.filter(b=>BUILDINGS[b.kind].accepts);
  const lanes=s.resources.filter(r=>r.remaining>0).flatMap(r=>drops.filter(b=>distance(b,r)<25).map(b=>[{x:b.x,z:b.z},r] as [Vec2,Vec2]));
  const roads=roadPaths(map).flatMap(route=>route.slice(1).map((b,i)=>[route[i],b] as [Vec2,Vec2]));
  const blockers=buildings(s),occupants=units(s);
  const ox=d.width%2?.5:0,oz=d.depth%2?.5:0,result:Array<{p:Vec2;score:number}>=[];
  for(let z=Math.floor(hall.z-reach);z<=hall.z+reach;z++)for(let x=Math.floor(hall.x-reach);x<=hall.x+reach;x++){
    const p={x:x+ox,z:z+oz},left=p.x-d.width/2,top=p.z-d.depth/2;
    if(left<SPACING||top<SPACING||p.x+d.width/2>map.width-SPACING||p.z+d.depth/2>map.height-SPACING||!isVisible(s,t,p))continue;
    // The footprint plus a GAP-wide apron must be explored, buildable open
    // ground and buildings stay SPACING apart: grid paths run through cell
    // centres, so a siege engine (r 0.78) needs a 3 m gap between integer
    // edges. No unit can then be sealed into a pocket.
    let ok=true;
    for(let cz=Math.floor(top-GAP);cz<Math.ceil(p.z+d.depth/2+GAP)&&ok;cz++)for(let cx=Math.floor(left-GAP);cx<Math.ceil(p.x+d.width/2+GAP);cx++){
      const i=cz*map.width+cx,inside=cx>=left&&cx<p.x+d.width/2&&cz>=top&&cz<p.z+d.depth/2;
      if(!fog.explored[i]||map.blocked[i]||inside&&map.noBuild[i]){ok=false;break;}}
    if(!ok||reserved.some(r=>distance(p,r)<RESERVE))continue;
    if(blockers.some(b=>Math.abs(b.x-p.x)<(d.width+BUILDINGS[b.kind].width)/2+SPACING&&Math.abs(b.z-p.z)<(d.depth+BUILDINGS[b.kind].depth)/2+SPACING))continue;
    if(s.resources.some(r=>r.remaining>0&&rectDistance(r,p,d.width,d.depth)<3))continue;
    if(lanes.some(([a,b])=>!segmentClear(a,b,p,d.width,d.depth,1.5)))continue;
    if(roads.some(([a,b])=>!segmentClear(a,b,p,d.width,d.depth,1.5)))continue;
    if(occupants.some(u=>rectDistance(u,p,d.width,d.depth)<UNITS[u.kind].radius+.1))continue;
    const ahead=(p.x-hall.x)*toward.x+(p.z-hall.z)*toward.z,range=distance(p,hall);
    // Economy buildings hug the hall away from the enemy; towers watch the front.
    result.push({p,score:near?range:front?Math.abs(range-11)-ahead*.6:range+Math.max(0,ahead)*.5});
  }
  // Tie-break away from the enemy (mirrored per side), never by raw x.
  const turn=hall.x<map.width/2?1:-1;
  return result.sort((a,b)=>a.score-b.score||turn*(a.p.z-b.p.z)||turn*(a.p.x-b.p.x)).map(c=>c.p);
}
function train(s:GameState,t:TeamId,kind:PlayableUnit):boolean {
  const b=buildings(s,t).find(b=>b.kind===UNITS[kind].trainedAt&&b.construction>=1&&b.queue.length===0);
  return !!b&&issueCommand(s,t,{type:'train',buildingId:b.id,unit:kind}).ok;
}
/** Desired army mix; under-represented kinds are favoured and the match seed breaks ties. */
const MIX:Partial<Record<PlayableUnit,number>>={guard:.34,crossbow:.26,knight:.2,priest:.1,siege:.1};
/** Mix with the preview roster enabled (only used when the match unlocks it). */
const ROSTER_MIX:Partial<Record<PlayableUnit,number>>={guard:.18,pikeman:.14,crossbow:.16,ranger:.12,knight:.14,priest:.06,mage:.08,siege:.06,gryphon:.06};
const ANTI_AIR=(k:UnitKind)=>!!UNITS[k].targetsAir;
/** Enemy kinds this seat has seen (own sight only), split into fighters and the anti-air among them. */
function enemyAir(s:GameState,t:TeamId){
  const seen=s.ai[t].enemySeen??{};let army=0,antiAir=0;
  for(const [k,n] of Object.entries(seen) as Array<[UnitKind,number]>){if(k==='worker')continue;army+=n;if(ANTI_AIR(k))antiAir+=n;}
  // Remembered towers shoot flyers too.
  antiAir+=Object.values(s.visibility[t].knownBuildings).filter(b=>b.team!==t&&b.kind==='tower').length*2;
  return {army,antiAir,flyers:seen.gryphon??0};
}
/** Anti-air soldiers this seat wants in the field after seeing enemy flyers (0 with the gate off). */
export function antiAirNeed(s:GameState,t:TeamId):number {
  if(!s.rosterPreview)return 0;const {flyers}=enemyAir(s,t);
  return flyers?Math.ceil(flyers*1.5*profileOf(s,t).air.antiAir):0;
}
/**
 * Desired mix for this seat. With the roster gate off this is exactly the
 * shipped MIX. With it on, the mix reacts to the enemy kinds this seat has
 * seen with its own sight (ai.enemySeen, never read through fog): pikemen
 * against cavalry, anti-air against flyers, mages against massed light troops.
 */
export function unitWeights(s:GameState,t:TeamId):Partial<Record<PlayableUnit,number>> {
  if(!s.rosterPreview)return {...MIX};
  const seen=s.ai[t].enemySeen??{},count=(...kinds:UnitKind[])=>kinds.reduce((n,k)=>n+(seen[k]??0),0);
  const cavalry=count('knight'),air=count('gryphon'),light=count('crossbow','ranger','priest','mage','worker');
  const pf=profileOf(s,t).air,foe=enemyAir(s,t),cover=foe.army?foe.antiAir/foe.army:0;
  const w:Partial<Record<PlayableUnit,number>>={};
  for(const [k,v] of Object.entries(ROSTER_MIX) as Array<[PlayableUnit,number]>){
    let x=v;
    if(k==='pikeman')x*=Math.min(4,1+cavalry*.5);
    if(air>0)x*=ANTI_AIR(k)?Math.min(4,1+air*.6*pf.antiAir):.6;
    if(k==='mage'&&light>=4)x*=1.5;
    // Gryphons: the profile's appetite, much more against a seen army with
    // little anti-air, much less against one built around it.
    if(k==='gryphon')x*=pf.weight*(foe.army>=3&&cover<.2?3:cover>.5?.4:1);
    w[k]=x;
  }
  return w;
}
/** Remember the largest number of each enemy unit kind this seat has seen at once. */
function rememberEnemies(s:GameState,t:TeamId):void {
  const counts:Partial<Record<UnitKind,number>>={};
  for(const u of units(s))if(u.team!==t&&u.team!==-1&&isVisible(s,t,u))counts[u.kind]=(counts[u.kind]??0)+1;
  const seen=s.ai[t].enemySeen??={};
  for(const [k,n] of Object.entries(counts) as Array<[UnitKind,number]>)seen[k]=Math.max(seen[k]??0,n);
}
/**
 * The old fixed rotation (guard, crossbow, guard, knight, priest, siege)
 * stalled at three soldiers in tier I and in practice launched its first
 * six-unit wave only after tier III. The profile caps soldiers per tier.
 */
function chooseUnit(s:GameState,t:TeamId,army:Unit[]):PlayableUnit|undefined {
  const lv=tier(s,t),done=completedKinds(s,t),p=population(s,t),team=s.teams[t],bs=buildings(s,t);
  const soldiers=army.filter(u=>!isHero(u.kind)),mix=unitWeights(s,t);
  if(soldiers.length>=(profileOf(s,t).armyCap[lv]??Infinity))return undefined;
  const options=(Object.keys(mix) as PlayableUnit[]).filter(k=>{const d=UNITS[k];
    return unlocked(d,s.rosterPreview)&&requirementsMet(d.requires,lv,done)&&team.gold>=d.cost.gold&&team.wood>=d.cost.wood&&p.used+p.reserved+d.supply<=p.cap
      &&bs.some(b=>b.kind===d.trainedAt&&b.construction>=1&&b.queue.length===0);});
  if(s.rosterPreview){
    // The profile keeps a few gryphons in the field once tier III and the stable
    // allow them; with a few soldiers already out it saves the bank for one
    // instead of spending every coin on cheaper barracks troops.
    const g=UNITS.gryphon,stable=bs.find(b=>b.kind===g.trainedAt&&b.construction>=1&&b.queue.length===0);
    if(stable&&requirementsMet(g.requires,lv,done)&&p.used+p.reserved+g.supply<=p.cap&&soldiers.filter(u=>u.kind==='gryphon').length+queuedOf(s,t,k=>k==='gryphon')<profileOf(s,t).air.min){
      if(team.gold>=g.cost.gold&&team.wood>=g.cost.wood)return 'gryphon';
      if(soldiers.length>=3)return undefined;
    }
  }
  if(!options.length)return undefined;
  if(s.rosterPreview){
    // Short of anti-air against seen flyers: only anti-air soldiers, the best-weighted first.
    const antiAir=options.filter(k=>ANTI_AIR(k)),own=soldiers.filter(u=>ANTI_AIR(u.kind)).length+queuedOf(s,t,ANTI_AIR);
    if(own<antiAirNeed(s,t)){
      if(antiAir.length)return antiAir.sort((a,b)=>mix[b]!-mix[a]!)[0];
      // An anti-air building is only busy or gold is still coming in: wait for
      // it rather than spend elsewhere, but never for one the wood or supply cannot cover.
      if((Object.keys(mix) as PlayableUnit[]).some(k=>{const d=UNITS[k];return ANTI_AIR(k)&&unlocked(d,true)&&requirementsMet(d.requires,lv,done)&&team.wood>=d.cost.wood
        &&p.used+p.reserved+d.supply<=p.cap&&bs.some(b=>b.kind===d.trainedAt&&b.construction>=1);}))return undefined;
    }
  }
  const weights=options.map(k=>mix[k]!/((soldiers.filter(u=>u.kind===k).length+1)/(soldiers.length+1)));
  let roll=random(s)*weights.reduce((n,w)=>n+w,0);
  for(let i=0;i<options.length;i++){roll-=weights[i];if(roll<=0)return options[i];}
  return options[options.length-1];
}
const queuedOf=(s:GameState,t:TeamId,match:(k:PlayableUnit)=>boolean)=>buildings(s,t).reduce((n,b)=>n+b.queue.filter(q=>q.type==='train'&&match(q.target as PlayableUnit)).length,0);
/**
 * Gryphon raids (preview roster, profiles with air.harass): a gryphon hunts
 * enemy workers it can see, flies at the enemy halls (expansions first) while
 * the anti-air this seat has seen is thin, and turns home when badly hurt or
 * when enemy anti-air or a tower guards the spot. Returns the raiders, which
 * the main army's creep, wave and sweep orders leave alone.
 */
function gryphonRaids(s:GameState,t:TeamId,army:Unit[],home:Vec2):Set<number> {
  const raiders=new Set<number>(),pf=profileOf(s,t).air;if(!s.rosterPreview||!pf.harass)return raiders;
  const gryphons=army.filter(u=>u.kind==='gryphon');if(!gryphons.length)return raiders;
  const foe=enemyAir(s,t),thin=foe.army<3||foe.antiAir/foe.army<.35;
  const enemySpawn=s.map.spawns[t===0?1:0];
  const known=Object.values(s.visibility[t].knownBuildings).filter(b=>b.team!==t);
  // A hall a remembered tower covers is not a raid target (no flying at the tower's edge and back).
  const halls=known.filter(b=>b.kind==='townhall'&&!known.some(o=>o.kind==='tower'&&distance(o,b)<14)).sort((a,b)=>distance(b,enemySpawn)-distance(a,enemySpawn)||a.id-b.id);
  const side=home.x<s.map.width/2?1:-1,retreat=(u:Unit)=>{if(!(u.order.type==='move'&&!u.order.attackMove&&distance(u.order.position,home)<12))
    for(const d of [8,5,11])if(issueCommand(s,t,{type:'move',unitIds:[u.id],position:{x:home.x+side*d,z:home.z},attackMove:false}).ok)break;};
  for(const g of gryphons){
    const near=(r:number)=>s.entities.filter(e=>e.alive&&e.hp>0&&e.team!==t&&e.team!==-1&&isVisible(s,t,e)&&distance(g,e)<=r);
    const guards=near(10).filter(e=>e.category==='unit'?ANTI_AIR(e.kind)&&e.kind!=='worker':e.kind==='tower'&&e.construction>=1);
    // A hurt gryphon flies home; once there it rejoins the army (and its priests) instead of idling apart.
    if(g.hp<g.maxHp*.45){if(distance(g,home)>14){retreat(g);raiders.add(g.id);}continue;}
    if(guards.some(e=>e.category==='building')||guards.length>=2){retreat(g);raiders.add(g.id);continue;}
    const prey=near(16).filter((e):e is Unit=>e.category==='unit'&&e.kind==='worker').sort((a,b)=>distance(g,a)-distance(g,b)||a.id-b.id)[0];
    if(prey){if(!(g.order.type==='attack'&&g.order.targetId===prey.id))issueCommand(s,t,{type:'attack',unitIds:[g.id],targetId:prey.id});raiders.add(g.id);continue;}
    const hall=thin?halls[0]:undefined;
    if(hall){if(!(g.order.type==='move'&&distance(g.order.position,hall)<1))issueCommand(s,t,{type:'move',unitIds:[g.id],position:{x:hall.x,z:hall.z},attackMove:true});raiders.add(g.id);}
  }
  return raiders;
}
/** The forge alternates weapon and armour levels the tier allows; the axe upgrade follows wood gathering. */
function research(s:GameState,t:TeamId,woodcutters:number,saving:boolean):void {
  const team=s.teams[t],lv=tier(s,t),bs=buildings(s,t);
  const forge=bs.find(b=>b.kind==='forge'&&b.construction>=1&&b.queue.length===0);
  if(forge&&team.gold>220)for(let level=1;level<=lv;level++){
    // While saving for the next tier, keep the original weapons-only habit so
    // armour does not starve the upgrade of wood.
    const options=((saving?['weapons'+level]:['weapons'+level,'armor'+level]) as ResearchId[]).filter(r=>!team.research.includes(r));
    if(!options.length)continue;
    // Weapons first within a level; armour next. A level is finished before the next starts.
    for(const r of options)if(RESEARCH[r].cost.gold<=team.gold&&issueCommand(s,t,{type:'research',buildingId:forge.id,research:r}).ok)break;
    break;
  }
  const mill=bs.find(b=>b.kind==='lumbermill'&&b.construction>=1&&b.queue.length===0);
  if(mill&&!saving&&woodcutters>=2&&team.gold>200&&!team.research.includes('timber'))issueCommand(s,t,{type:'research',buildingId:mill.id,research:'timber'});
}
const gatherKind=(s:GameState,u:Unit)=>u.order.type==='gather'?s.resources.find(r=>r.id===(u.order as {resourceId:string}).resourceId)?.kind:undefined;
// Rows and columns are 180° twins about the map centre (cell c ↔ width-1-c) so both seats
// sweep equivalent frontiers; ties prefer the scout's own half.
function frontierGrid({map}:GameState):Vec2[] {
  const points:Vec2[]=[],columns:number[]=[],rows:number[]=[];for(let x=6.5;x<map.width/2;x+=12)columns.push(x,map.width-x);
  for(let z=6.5;z<map.height/2;z+=12)rows.push(z,map.height-z);
  for(const z of rows)for(const x of columns)points.push({x,z});
  return points;
}
const cellOf=(s:GameState,p:Vec2)=>Math.floor(p.z)*s.map.width+Math.floor(p.x);
/** Returns false once nothing is left to explore. */
function scoutFrontier(s:GameState,t:TeamId,scout:Unit):boolean {
  const ai=s.ai[t],{map}=s,explored=s.visibility[t].explored;
  const cell=(p:{x:number;z:number})=>Math.floor(p.z)*map.width+Math.floor(p.x);
  if(ai.scoutId!==scout.id||ai.scoutRevision!==s.navigationRevision){
    ai.scoutRejected=[];ai.scoutRevision=s.navigationRevision;ai.scoutId=scout.id;
  }
  if(ai.scoutTarget&&!explored[cell(ai.scoutTarget)]){
    // A scout held up for a minute (e.g. skirmishing a camp on the way) gives that target up.
    if(scout.order.type==='move'&&distance(scout.order.position,ai.scoutTarget)<.1){if(s.time-ai.lastScout<60)return true;(ai.scoutRejected??=[]).push(cell(ai.scoutTarget));}
    // One that settled short of it (wedged in its own army against a grove) must not be re-sent there forever.
    else if(scout.order.type==='idle')(ai.scoutRejected??=[]).push(cell(ai.scoutTarget));
  }
  const opponent=map.spawns[t===0?1:0],turn=Math.sign(map.spawns[t].x-opponent.x)||1,opening={x:opponent.x+turn*9,z:opponent.z-turn*7};
  const points=frontierGrid(s);
  const home=map.spawns[t].x;
  points.sort((a,b)=>distance(scout,a)-distance(scout,b)||Math.abs(a.x-home)-Math.abs(b.x-home)||turn*(b.z-a.z));
  // Until the enemy start has been seen, it stays the first target: a scout
  // killed on the way (by a camp) must not leave its successor sweeping the
  // home half nearest-first, which on the 288 m maps took the rest of the match.
  if(!explored[cell(opening)])points.unshift(opening);
  ai.scoutTarget=undefined;
  for(const position of points){const index=cell(position);
    if(explored[index]||map.blocked[index]||ai.scoutRejected?.includes(index))continue;
    if(issueCommand(s,t,{type:'move',unitIds:[scout.id],position,attackMove:true}).ok){ai.scoutTarget=position;ai.lastScout=s.time;return true;}
    (ai.scoutRejected??=[]).push(index);
  }
  return false;
}
/**
 * A due wave with no enemy building known (its scouts died on the way, or the
 * base fell and a remnant hides elsewhere) marches on what any player knows of
 * a 1v1 map: the enemy start first, then every gold site not currently in
 * sight (the enemy's side first), attack-moving so whatever it meets becomes
 * known. With nothing left to check it falls back to the stale-fog sweep.
 */
function hunt(s:GameState,t:TeamId,army:Unit[]):void {
  if(!army.length)return;
  const ai=s.ai[t],{map}=s,lead=army[0],explored=s.visibility[t].explored;
  if(lead.order.type==='move'&&lead.order.attackMove&&!isVisible(s,t,lead.order.position))return;
  const enemy=map.spawns[t===0?1:0],turn=Math.sign(map.spawns[t].x-enemy.x)||1,opening={x:enemy.x+turn*9,z:enemy.z-turn*7};
  const checked=ai.hunted??=[],side=enemy.x<map.width/2?-1:1;
  const goals=[...(explored[cellOf(s,opening)]?[]:[opening]),...map.resources.filter(r=>r.kind==='gold')
    .sort((a,b)=>distance(a,enemy)-distance(b,enemy)||side*(b.x-a.x)||side*(b.z-a.z))]
    .filter(p=>!isVisible(s,t,p)&&!checked.includes(cellOf(s,p)));
  const ids=army.map(u=>u.id);
  for(const goal of goals){checked.push(cellOf(s,goal));
    // Gold nodes block their own cell: approach from the four sides.
    for(const [dx,dz] of [[0,0],[-side*7,0],[0,7],[0,-7],[side*7,0]])if(issueCommand(s,t,{type:'move',unitIds:ids,position:{x:goal.x+dx,z:goal.z+dz},attackMove:true}).ok)return;
  }
  if(goals.length===0&&checked.length){ai.hunted=[];}
  sweep(s,t,army);
}
/**
 * Fully explored but no enemy building known: a hidden last structure would
 * stall the match, so the army sweeps the grid points it cannot currently see,
 * nearest first, until one comes into view (it then becomes a known target).
 */
function sweep(s:GameState,t:TeamId,army:Unit[]):void {
  const ai=s.ai[t],lead=army[0];if(lead.order.type==='move'&&lead.order.attackMove&&!isVisible(s,t,lead.order.position))return;
  const swept=ai.swept??=[],turn=s.map.spawns[t].x<s.map.width/2?1:-1;
  const points=frontierGrid(s).filter(p=>!s.map.blocked[cellOf(s,p)]&&!isVisible(s,t,p)&&!swept.includes(cellOf(s,p)))
    .sort((a,b)=>distance(lead,a)-distance(lead,b)||turn*(a.z-b.z)||turn*(a.x-b.x));
  if(!points.length){ai.swept=[];return;}
  for(const position of points){swept.push(cellOf(s,position));if(issueCommand(s,t,{type:'move',unitIds:army.map(u=>u.id),position,attackMove:true}).ok)return;}
}
/** Remember what this seat's own sight shows: resources with their last-seen stock, and neutral camps. */
function remember(s:GameState,t:TeamId):void {
  const ai=s.ai[t],resources=ai.knownResources??={},camps=ai.knownCamps??={};
  for(const r of s.resources)if(isVisible(s,t,r)){
    if(r.remaining<=0)delete resources[r.id];
    else resources[r.id]={kind:r.kind,x:r.x,z:r.z,remaining:r.remaining,initial:Math.max(resources[r.id]?.initial??0,r.remaining)};
  }
  const raiders=units(s,-1).filter(u=>isVisible(s,t,u));
  for(const u of raiders)if(u.campId!==undefined&&u.home)camps[u.campId]??={x:u.home.x,z:u.home.z};
  for(const id of Object.keys(camps).map(Number))if(isVisible(s,t,camps[id])&&!raiders.some(u=>u.campId===id))delete camps[id];
}
/**
 * Early prospecting: one worker walks the unexplored grid points of the home
 * half (nearest first) so expansion gold is discovered by sight, then returns
 * to work. A badly hurt prospector is released and the next try waits a minute.
 */
function prospect(s:GameState,t:TeamId,workers:Unit[]):void {
  const ai=s.ai[t],{map}=s,explored=s.visibility[t].explored,home=map.spawns[t],enemy=map.spawns[t===0?1:0],turn=Math.sign(home.x-enemy.x)||1;
  let scout=workers.find(u=>u.id===ai.prospectorId);
  if(ai.prospectorId!==undefined&&!scout){ai.prospectorId=undefined;ai.prospectAt=s.time+60;return;}
  if(scout&&scout.hp<scout.maxHp*.6){ai.prospectorId=undefined;ai.prospectAt=s.time+60;issueCommand(s,t,{type:'stop',unitIds:[scout.id]});return;}
  if(scout&&scout.order.type==='move'&&!explored[cellOf(s,scout.order.position)])return;
  // Expansion sites lie within PROSPECT_RANGE of home. A walking scout takes the
  // next point nearest to itself (biased toward home) instead of spiralling back
  // to the hall between points, which on the 192 m maps cost minutes. Points
  // beside the map's gold sites (static map layout, like a player who knows the
  // map; the stock itself is only learned by sight) are visited first: on the
  // 288 m maps the home half otherwise hid the natural behind minutes of meadow.
  const sites=map.resources.filter(r=>r.kind==='gold'&&distance(r,home)<PROSPECT_RANGE&&distance(r,home)<distance(r,enemy)&&!explored[cellOf(s,r)]);
  const from=scout??home,cost=(p:Vec2)=>distance(from,p)+distance(home,p)*.5-(sites.some(r=>distance(r,p)<10)?120:0);
  const points=frontierGrid(s).filter(p=>distance(p,home)<distance(p,enemy)&&distance(p,home)<PROSPECT_RANGE&&!explored[cellOf(s,p)]&&!map.blocked[cellOf(s,p)])
    .sort((a,b)=>cost(a)-cost(b)||turn*(b.z-a.z)||turn*(b.x-a.x));
  scout??=[...workers].filter(u=>u.order.type==='gather'||u.order.type==='idle').sort((a,b)=>a.cargo.amount-b.cargo.amount||distance(a,points[0]??home)-distance(b,points[0]??home)||a.id-b.id)[0];
  if(!scout)return;
  for(const position of points)if(issueCommand(s,t,{type:'move',unitIds:[scout.id],position,attackMove:false}).ok){ai.prospectorId=scout.id;return;}
  // Nothing reachable is left to explore at home.
  ai.prospected=true;if(ai.prospectorId!==undefined)issueCommand(s,t,{type:'stop',unitIds:[scout.id]});ai.prospectorId=undefined;
}
/** Seconds after the first wave is due that a seat with no enemy building in sight still waits on its scout before hunting. */
const HUNT_GRACE=90;
/** How far from home the early worker scout prospects for expansion gold. */
const PROSPECT_RANGE=80;
const power=(e:Entity)=>e.category==='unit'?e.hp*UNITS[e.kind].damage/UNITS[e.kind].interval:e.hp*26/1.2;
/** Visible armed enemies (soldiers and finished towers) within range of a point. */
const enemyForce=(s:GameState,t:TeamId,p:Vec2,range:number)=>s.entities.filter(e=>e.alive&&e.team!==t&&e.team!==-1&&isVisible(s,t,e)&&distance(e,p)<range
  &&(e.category==='unit'?e.kind!=='worker':e.kind==='tower'&&e.construction>=1));
export function stepAI(s:GameState,t:TeamId):void {
  const ai=s.ai[t],pf=profileOf(s,t);if(s.time+1e-8<ai.nextThink)return;ai.nextThink=s.time+pf.think;
  const bs=buildings(s,t),us=units(s,t),workers=us.filter(u=>u.kind==='worker'),army=us.filter(u=>u.kind!=='worker');
  const hall=bs.find(b=>b.kind==='townhall'&&b.construction===1);
  remember(s,t);rememberEnemies(s,t);
  if(pf.expand&&!ai.prospected&&s.time>=pf.scoutAt&&s.time>=(ai.prospectAt??0)&&workers.length>=6)prospect(s,t,workers);
  const visibleResources=s.resources.filter(r=>r.remaining>0&&isVisible(s,t,r));
  // Nodes a drop-off building can serve; extra workers spill over to the next
  // node once one is saturated instead of all crowding the closest.
  const drops=bs.filter(b=>b.construction>=1&&BUILDINGS[b.kind].accepts);
  const serves=(r:ResourceNode)=>drops.some(b=>BUILDINGS[b.kind].accepts!.includes(r.kind)&&distance(b,r)<30);
  const served=visibleResources.filter(serves);
  // Lean on wood when its stock trails gold (crossbows, priests and tier
  // upgrades are wood-hungry), and move one gatherer per think when a stock runs dry.
  const team=s.teams[t],woodShare=team.wood*3<team.gold?.5:team.wood>team.gold+300?.25:.35;
  const woodNow=workers.filter(u=>gatherKind(s,u)==='wood').length;
  const shift=(from:'gold'|'wood',to:'gold'|'wood')=>{
    const w=workers.find(u=>gatherKind(s,u)===from&&u.cargo.amount===0)??workers.find(u=>gatherKind(s,u)===from);
    const r=w&&visibleResources.filter(r=>r.kind===to).sort((a,b)=>Number(serves(b))-Number(serves(a))||distance(w,a)-distance(w,b))[0];
    if(w&&r)issueCommand(s,t,{type:'gather',unitIds:[w.id],resourceId:r.id});};
  if(team.wood<150&&team.gold>400&&woodNow<workers.length*.5)shift('gold','wood');
  else if(team.gold<200&&team.wood>team.gold+300&&woodNow>2)shift('wood','gold');
  // Once an expansion serves gold again, pull the woodcutters the dry home
  // mine had sent to the groves back to gold, one per think.
  else if(served.some(r=>r.kind==='gold')&&workers.length-woodNow<Math.floor(workers.length*(1-woodShare))-2&&woodNow>2)shift('wood','gold');
  const assigned=new Map<string,number>();
  for(const w of workers)if(w.order.type==='gather'){const id=w.order.resourceId;assigned.set(id,(assigned.get(id)??0)+1);}
  for(const w of workers){if(w.id===ai.prospectorId)continue;
    if(w.order.type==='idle'||w.order.type==='gather'&&!s.resources.some(r=>r.id===(w.order as {resourceId:string}).resourceId&&r.remaining>0)){
      const gatheringWood=workers.filter(u=>gatherKind(s,u)==='wood').length;
      const desired=gatheringWood<Math.max(2,Math.floor(workers.length*woodShare))?'wood':'gold';
      const load=(r:ResourceNode)=>Math.max(0,(assigned.get(r.id)??0)-SATURATION[r.kind]+1);
      const target=[...visibleResources].sort((a,b)=>Number(b.kind===desired)-Number(a.kind===desired)||Number(serves(b))-Number(serves(a))||load(a)-load(b)||distance(w,a)-distance(w,b))[0];
      if(target&&issueCommand(s,t,{type:'gather',unitIds:[w.id],resourceId:target.id}).ok)assigned.set(target.id,(assigned.get(target.id)??0)+1);
    }
  }
  // Nine workers (normal) was a fixed cap. Keep the profile's tier-I count
  // (opening pace for a human opponent), then scale with the nodes the base can serve.
  const [early,late]=pf.workers,workerTarget=tier(s,t)<2?early:Math.max(early,Math.min(late,served.reduce((n,r)=>n+SATURATION[r.kind],0)+pf.extraWorkers));
  // Recover construction when its original worker is killed or interrupted.
  const unfinished=bs.find(b=>b.construction<1&&!workers.some(w=>w.order.type==='build'&&w.order.targetId===b.id));
  if(unfinished){const w=workers.find(w=>w.order.type==='idle'||w.order.type==='gather');if(w)issueCommand(s,t,{type:'resume',unitIds:[w.id],targetId:unfinished.id});}
  const damaged=bs.find(b=>b.construction===1&&b.hp<b.maxHp*.85&&!workers.some(w=>w.order.type==='repair'&&w.order.targetId===b.id));
  if(damaged&&s.teams[t].gold>80){const w=workers.find(w=>w.order.type==='idle'||w.order.type==='gather');if(w)issueCommand(s,t,{type:'repair',unitIds:[w.id],targetId:damaged.id});}
  const p=population(s,t);
  if(p.cap-p.used-p.reserved<5&&p.cap<80&&!bs.some(b=>b.kind==='house'&&b.construction<1))construct(s,t,'house');
  if(workers.length+bs.flatMap(b=>b.queue).filter(q=>q.target==='worker').length<workerTarget&&hall&&hall.queue.length<1)train(s,t,'worker');
  // The hero comes before the tier upgrade. Otherwise whichever seat reached
  // 280 gold a moment earlier upgraded first, stayed in "saving" for the rest
  // of the tech chain and never recruited its commander (gold never > 450).
  if(!us.some(u=>u.kind==='commander')&&bs.some(b=>b.kind==='altar'&&b.construction>=1))train(s,t,'commander');
  const order:BuildingKind[]=['barracks','lumbermill','forge','altar'];
  const missing=order.find(k=>!bs.some(b=>b.kind===k));
  // Expansion: when the mines the halls serve fall below 30 % of what they held
  // when first seen, settle the nearest remembered free gold away from known
  // enemy buildings. A neutral camp guarding it is cleared first.
  const known=Object.values(s.visibility[t].knownBuildings).sort((a,b)=>a.id-b.id);
  const halls=bs.filter(b=>b.kind==='townhall'),gold=Object.entries(ai.knownResources??{}).filter(([,r])=>r.kind==='gold');
  const homeGold=gold.filter(([,r])=>halls.some(h=>h.construction>=1&&distance(h,r)<14));
  const low=homeGold.reduce((n,[,r])=>n+r.remaining,0)<.3*homeGold.reduce((n,[,r])=>n+r.initial,0)||!homeGold.length;
  const origin=hall??s.map.spawns[t];
  const site=pf.expand&&low&&halls.length<3&&!halls.some(b=>b.construction<1)?gold.filter(([,r])=>r.remaining>=600&&!halls.some(h=>distance(h,r)<14)&&!known.some(e=>distance(e,r)<22))
    .sort(([,a],[,b])=>distance(origin,a)-distance(origin,b))[0]?.[1]:undefined;
  const camps=Object.values(ai.knownCamps??{}),guard=site&&camps.find(c=>distance(c,site)<16);
  let saving=false;
  if(missing){construct(s,t,missing);saving=true;}
  else if(site&&!guard){saving=true;
    if(isVisible(s,t,site))construct(s,t,'townhall',false,site);
    else if(team.gold>=BUILDINGS.townhall.cost.gold*.6&&!workers.some(w=>w.order.type==='move'&&distance(w.order.position,site)<5&&w.id!==ai.prospectorId)){
      // Walk a builder over so the site is in sight before paying for the hall.
      const builder=workers.filter(w=>w.id!==ai.prospectorId&&(w.order.type==='gather'||w.order.type==='idle')).sort((a,b)=>distance(a,site)-distance(b,site)||a.id-b.id)[0];
      if(builder)for(const [dx,dz] of [[0,4],[0,-4],[4,0],[-4,0]]){const position={x:site.x+dx,z:site.z+dz};if(issueCommand(s,t,{type:'move',unitIds:[builder.id],position,attackMove:false}).ok)break;}
    }
  }
  // Without three soldiers to clear the camp guarding it, muster them before more tech.
  else if(site&&guard&&army.filter(u=>!isHero(u.kind)).length<3){/* Train soldiers. */}
  else if(hall&&hall.tier===1){if(!hall.queue.some(q=>q.type==='upgrade'))issueCommand(s,t,{type:'upgrade',buildingId:hall.id});saving=true;}
  else if(tier(s,t)>=2&&!bs.some(b=>b.kind==='chapel')){construct(s,t,'chapel');saving=true;}
  else if(tier(s,t)>=2&&!bs.some(b=>b.kind==='stable')){construct(s,t,'stable');saving=true;}
  else if(hall&&hall.tier===2){if(!hall.queue.some(q=>q.type==='upgrade'))issueCommand(s,t,{type:'upgrade',buildingId:hall.id});saving=true;}
  else if(tier(s,t)>=3&&!bs.some(b=>b.kind==='workshop')){construct(s,t,'workshop');saving=true;}
  if(!saving||s.teams[t].gold>pf.spendAbove){
    if(!us.some(u=>u.kind==='commander'))train(s,t,'commander');
    // Preview roster: a second and third hero as the hall tier opens hero slots.
    if(s.rosterPreview)for(const k of ['sage','ranger-captain'] as const)if(!us.some(u=>u.kind===k)&&train(s,t,k))break;
    const kind=chooseUnit(s,t,army);if(kind)train(s,t,kind);
    research(s,t,workers.filter(u=>gatherKind(s,u)==='wood').length,saving);
    // Up to two watch towers on the approach once the core base stands.
    const towers=bs.filter(b=>b.kind==='tower').length;
    // A third tower once enemy flyers have been seen (towers hit air).
    const towerCap=(s.ai[t].enemySeen?.gryphon??0)>0?3:2;
    if(!saving&&tier(s,t)>=2&&towers<towerCap&&!bs.some(b=>b.kind==='tower'&&b.construction<1)&&s.teams[t].gold>300&&s.teams[t].wood>150)construct(s,t,'tower',true);
  }
  // Press the attack: once the wave's target is gone and the army stands deep
  // in the field, the next known building is attacked now instead of walking
  // home to creep until the cadence; on the 288 m maps that round trip was minutes.
  if(ai.waveTarget!==undefined&&!known.some(k=>k.id===ai.waveTarget)){ai.waveTarget=undefined;
    if(known.length&&army.length&&distance(army[0],origin)>60)ai.nextAttack=Math.min(ai.nextAttack,s.time);}
  const threats=s.entities.filter(e=>e.alive&&e.team!==t&&e.team!==-1&&isVisible(s,t,e)&&bs.some(b=>distance(b,e)<17));
  // Scout with a common soldier only: the hero (now recruited first) got
  // killed alone in the enemy base, and switching scouts mid-sweep left the
  // enemy start "explored" from afar but never actually seen.
  const raiders=threats.length?new Set<number>():gryphonRaids(s,t,army,origin),field=raiders.size?army.filter(u=>!raiders.has(u.id)):army;
  const scout=s.time>60&&known.length===0&&!threats.length?field.find(u=>!isHero(u.kind)):undefined;
  // Retreat: an army caught away from home by a clearly stronger visible force
  // falls back to the base, regroups and waits for the next wave.
  if(pf.retreat&&!threats.length&&(ai.retreatUntil??0)<=s.time){
    const away=field.filter(u=>distance(u,origin)>24);
    if(away.length){const c={x:away.reduce((n,u)=>n+u.x,0)/away.length,z:away.reduce((n,u)=>n+u.z,0)/away.length};
      const ours=away.filter(u=>distance(u,c)<16).reduce((n,u)=>n+power(u),0),theirs=enemyForce(s,t,c,18).reduce((n,e)=>n+power(e),0);
      if(theirs>0&&ours<pf.retreatRatio*theirs){const side=origin.x<s.map.width/2?1:-1;
        for(const d of [10,7,13])if(issueCommand(s,t,{type:'move',unitIds:away.map(u=>u.id),position:{x:origin.x+side*d,z:origin.z},attackMove:false}).ok){
          ai.retreatUntil=s.time+pf.regroup;ai.nextAttack=Math.max(ai.nextAttack,ai.retreatUntil);break;}
      }
    }
  }
  const retreating=(ai.retreatUntil??0)>s.time;
  // Creeping: an idle army between waves clears the nearest remembered camp on
  // its own half (or the one guarding the next expansion) for gold and hero XP;
  // also while a wave is due but no enemy building is known yet.
  const enemySpawn=s.map.spawns[t===0?1:0],camp=guard||camps.filter(c=>distance(c,s.map.spawns[t])<distance(c,enemySpawn)).sort((a,b)=>distance(origin,a)-distance(origin,b))[0];
  // Units busy elsewhere (a straggler still walking an old order) are left out.
  const creeping=(u:Unit)=>!!camp&&u.order.type==='move'&&distance(u.order.position,camp)<6;
  const creepers=field.filter(u=>u!==scout&&(u.order.type==='idle'||u.order.type==='hold'||creeping(u)));
  // Each defender takes the first threat it can hit (melee troops cannot reach flyers).
  if(threats.length){for(const u of army){const threat=threats.find(e=>canAttack(u.kind,e));if(threat)issueCommand(s,t,{type:'attack',unitIds:[u.id],targetId:threat.id});}}
  else if(retreating){/* Regrouping at home. */}
  else if(pf.creep&&camp&&(s.time<ai.nextAttack-15||!known.length)&&creepers.length>=3){
    if(!creepers.every(creeping))issueCommand(s,t,{type:'move',unitIds:creepers.map(u=>u.id),position:camp,attackMove:true});
  }
  // A single scout gets a head start (HUNT_GRACE) before the whole army commits blind.
  // Gryphons out raiding (field excludes them) neither hunt nor join the wave.
  else if(s.time>=ai.nextAttack&&field.length>=pf.wave&&!known.length&&s.time>=pf.firstAttack+HUNT_GRACE){ai.nextAttack=s.time+5;hunt(s,t,field.filter(u=>u!==scout));}
  else if(s.time>=ai.nextAttack&&field.length>=pf.wave&&known.length){
    const army=field;
    // The remembered building nearest the army (ties by id), so a wave in the field rolls on.
    const target=[...known].sort((a,b)=>distance(army[0],a)-distance(army[0],b)||a.id-b.id)[0];ai.waveTarget=target.id;
    const d=BUILDINGS[target.kind],radius=Math.max(...army.map(u=>UNITS[u.kind].radius));
    // Sample near the remembered footprint as well as the preferred staging
    // point. Fixed distant offsets can all miss narrow but reachable approaches.
    const perimeter=[];
    for(const clearance of [radius+.25,1.5])for(let i=0;i<16;i++){
      const turn=s.map.spawns[t].x<s.map.width/2?1:-1,c=turn*Math.cos(i*Math.PI/8),sn=turn*Math.sin(i*Math.PI/8);
      const edge=Math.min(d.width/2/(Math.abs(c)||1e-9),d.depth/2/(Math.abs(sn)||1e-9));
      perimeter.push({x:target.x+c*(edge+clearance),z:target.z+sn*(edge+clearance)});
    }
    perimeter.sort((a,b)=>distance(army[0],a)-distance(army[0],b));
    // Bound failed retries while retaining the normal successful attack cadence.
    ai.nextAttack=s.time+5;
    // A unit wedged where it cannot path (e.g. a spawn hemmed in by scenery)
    // must not veto the whole wave: after the first refusal, send only units
    // that can reach the staging point.
    let wave=army;
    // Stage on the attacker's side of the target (geography, not team index).
    const front=Math.sign(s.map.spawns[t].x-target.x)||1;
    for(const [i,position] of [{x:target.x+front*6,z:target.z-front*6},...perimeter].entries()){
      if(issueCommand(s,t,{type:'move',unitIds:wave.map(u=>u.id),position,attackMove:true}).ok){ai.nextAttack=s.time+pf.cadence;break;}
      if(i===0){const known=planningObstacles(s,t);wave=army.filter(u=>findPath(s.map,u,position,known,UNITS[u.kind].radius)!==null);
        if(wave.length<pf.wave)wave=army;else if(issueCommand(s,t,{type:'move',unitIds:wave.map(u=>u.id),position,attackMove:true}).ok){ai.nextAttack=s.time+pf.cadence;break;}}
    }
  }
  if(scout&&!retreating&&!scoutFrontier(s,t,scout)&&field.length>=pf.wave)sweep(s,t,field);
  for(const caster of army)if(caster.kind==='sage'||caster.kind==='ranger-captain')heroSpells(s,t,caster,army);
  const hero=army.find(u=>u.kind==='commander');if(hero){
    const h=s.teams[t].hero;const learn=h.level>=3&&h.skills.banner<1?'banner':h.skills.cleave<2?'cleave':h.skills.mend<2?'mend':'banner';
    if(h.points)issueCommand(s,t,{type:'learn',heroId:hero.id,skill:learn});
    const close=s.entities.filter(e=>e.alive&&e.team!==t&&isVisible(s,t,e)&&distance(hero,e)<4);
    if(close.length)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'cleave',targetId:close[0].id});
    if(close.length>=2)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'banner'});
    const wounded=army.find(u=>u.hp<u.maxHp*.6&&distance(u,hero)<10);if(wounded)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'mend',targetId:wounded.id});
  }
}
/** Learning order and fog-fair casting for the preview heroes (曦光賢者, 遊俠隊長). */
function heroSpells(s:GameState,t:TeamId,hero:Unit,army:Unit[]):void {
  if(hero.kind!=='sage'&&hero.kind!=='ranger-captain')return;
  const h=heroProgress(s.teams[t],hero.kind);
  const [blast,support,ultimate]:SkillId[]=hero.kind==='sage'?['sunburst','radiance','daybreak']:['volley','sprint','mark'];
  if(h.points){const learn=h.level>=3&&h.skills[ultimate]<1?ultimate:h.skills[blast]<2?blast:h.skills[support]<2?support:ultimate;issueCommand(s,t,{type:'learn',heroId:hero.id,skill:learn});}
  const foes=units(s).filter(e=>e.team!==t&&e.team!==-1&&e.hp>0&&isVisible(s,t,e)&&distance(hero,e)<12);if(!foes.length)return;
  const cluster=(skill:SkillId,min:number)=>{const d=SKILLS[skill];
    return foes.filter(e=>distance(hero,e)<=d.range).map(e=>({e,n:foes.filter(o=>distance(o,e)<=(d.radius??3)).length})).filter(c=>c.n>=min).sort((a,b)=>b.n-a.n||a.e.id-b.e.id)[0]?.e;};
  const strong=cluster(ultimate,3);
  if(hero.kind==='sage'&&strong)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'daybreak',position:{x:strong.x,z:strong.z}});
  const hit=cluster(blast,2)??foes.find(e=>isHero(e.kind)&&distance(hero,e)<=SKILLS[blast].range);
  if(hit)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:blast,position:{x:hit.x,z:hit.z}});
  if(hero.kind==='ranger-captain'){
    const prey=foes.filter(e=>distance(hero,e)<=SKILLS.mark.range&&!((e.markedUntil??0)>s.time)).sort((a,b)=>power(b)-power(a)||a.id-b.id)[0];
    if(prey)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'mark',targetId:prey.id});
    if(army.filter(u=>distance(u,hero)<=SKILLS.sprint.range).length>=3)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'sprint'});
  }else if(army.filter(u=>distance(u,hero)<=SKILLS.radiance.range&&u.hp<u.maxHp*.7).length>=2)issueCommand(s,t,{type:'cast',heroId:hero.id,skill:'radiance'});
}
