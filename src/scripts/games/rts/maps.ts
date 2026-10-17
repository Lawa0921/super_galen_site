import {applyChannel,addChannelRocks,RIVER} from './river-layout';
import {addLandmarks,type Landmark} from './districts';
export type Vec2 = { x: number; z: number };
/** A building footprint is centered at x,z; width and depth extend equally around it. */
export type Footprint = Vec2 & { width: number; depth: number };
export type SceneryPlacement = Vec2 & { kind: 'oak' | 'pine' | 'rock'; radius: number; scale: number; rotation: number; onOriginalObstacle: boolean; /** Exact axis-aligned visual/obstacle bounds for narrow authored outcrops. */ size?:{width:number;height:number;depth:number} };

export interface RtsMap {
  id: 'river' | 'pass';
  /** Authored terrain assembly; absent on the original flat comparison fixture. */
  terrainProfile?: 'meandering-river';
  name: string;
  /** Grid size in 1 m cells; every renderer, fog and navigation buffer derives from it. */
  width: number;
  height: number;
  blocked: Uint8Array;
  noBuild: Uint8Array;
  spawns: [Vec2, Vec2];
  resources: Array<Vec2 & { id: string; kind: 'gold' | 'wood'; amount: number }>;
  camps: Vec2[];
  scenery?: SceneryPlacement[];
  landmarks?: Landmark[];
}
type Size={width:number;height:number};
type AuthoredMap=RtsMap & {scenery:SceneryPlacement[]};

/** 180° rotation about the map centre; both maps are rotationally symmetric 1v1 layouts. */
export const rotateHalfTurn=(p:Vec2,size:Size):Vec2=>({x:size.width-p.x,z:size.height-p.z});
/** The lit ground, fog and terrain mask extend a margin past the grid so zoomed-out edges never show void. */
// Half the map, capped at 96 m: the <=60 m camera never looks further past the edge on the 288 m maps.
export const groundFrame=(size:Size)=>{const margin=Math.min(96,Math.max(size.width,size.height)/2);return {margin,width:size.width+2*margin,height:size.height+2*margin};};
export const cellAt=(size:Size,p:Vec2)=>Math.floor(p.z)*size.width+Math.floor(p.x);

function fillRect(map:Size&{blocked:Uint8Array}, grid: Uint8Array, x: number, z: number, width: number, depth: number, value: 0 | 1): void {
  for (let row = z; row < z + depth; row += 1) for (let column = x; column < x + width; column += 1) grid[row*map.width+column] = value;
}
/** Block a rectangle of cells and its 180° twin (cell c ↔ size−1−c). */
function ridge(map:AuthoredMap,x:number,z:number,width:number,depth:number){
  for(const grid of [map.blocked,map.noBuild]){fillRect(map,grid,x,z,width,depth,1);fillRect(map,grid,map.width-x-width,map.height-z-depth,width,depth,1);}
}
const twinName=(id:string)=>id.replace(/west|south/g,m=>m==='west'?'east':'north');

/**
 * 288×288 m layouts (2.25× the 192 m area). Each seat has a home gold and two
 * home groves, a natural expansion north of the base and a third expansion to
 * the south (each gold + grove, guarded by a camp), a forward gold beside the
 * southern crossing and a rich contested centre mine near the middle crossing.
 * Only the west half is authored; every node, camp and road gets its 180° twin.
 */
const MAP_SIZE=288;
/** Forward gold + grove + guard beside the southern crossing (river bridge z 204 / pass detour z 218). */
const FORWARD={river:{gold:[104.5,210.5],wood:[90.5,224.5],camp:[114.5,216.5]},pass:{gold:[100.5,226.5],wood:[86.5,238.5],camp:[110.5,232.5]}} as const;
/** The guard at the northern crossing approach (river bridge z 84 / pass detour z 70). */
const CROSSING_CAMP={river:[112.5,104.5],pass:[100.5,92.5]} as const;
function makeMap(id: RtsMap['id'], name: string, size=MAP_SIZE): AuthoredMap {
  const map:AuthoredMap={id,name,width:size,height:size,blocked:new Uint8Array(size*size),noBuild:new Uint8Array(size*size),spawns:[{x:24,z:size/2},{x:size-24,z:size/2}],resources:[],camps:[],scenery:[]};
  const forward=FORWARD[id];
  const west:RtsMap['resources']=[
    {id:`${id}-gold-west`,kind:'gold',amount:5000,x:34.5,z:144.5},
    {id:`${id}-wood-west`,kind:'wood',amount:2500,x:32.5,z:154.5},
    // A second home grove behind each base: the full tech tree costs ~1,900 wood.
    {id:`${id}-wood-west-grove`,kind:'wood',amount:3000,x:15.5,z:129.5},
    {id:`${id}-gold-west-natural`,kind:'gold',amount:4000,x:32.5,z:91.5},
    {id:`${id}-wood-west-natural`,kind:'wood',amount:3000,x:19.5,z:79.5},
    {id:`${id}-gold-west-third`,kind:'gold',amount:4000,x:30.5,z:214.5},
    {id:`${id}-wood-west-third`,kind:'wood',amount:2500,x:16.5,z:226.5},
    {id:`${id}-gold-south`,kind:'gold',amount:3500,x:forward.gold[0],z:forward.gold[1]},
    {id:`${id}-wood-south`,kind:'wood',amount:2000,x:forward.wood[0],z:forward.wood[1]},
    // The richest node sits by the middle crossing and is contested by both seats.
    {id:`${id}-gold-west-centre`,kind:'gold',amount:4500,x:118.5,z:160.5},
    {id:`${id}-wood-west-centre`,kind:'wood',amount:2000,x:106.5,z:172.5},
  ];
  map.resources=[...west,...west.map(r=>({...r,id:twinName(r.id),...rotateHalfTurn(r,map)}))];
  // Natural, third, forward and centre guards plus the northern-crossing guard (ten camps).
  const camps=[{x:42.5,z:99.5},{x:40.5,z:206.5},{x:forward.camp[0],z:forward.camp[1]},{x:128.5,z:158.5},{x:CROSSING_CAMP[id][0],z:CROSSING_CAMP[id][1]}];
  map.camps=[...camps,...camps.map(c=>rotateHalfTurn(c,map))];
  return map;
}

function createRiverMap(): AuthoredMap {
  const map = makeMap('river', '雙河谷地');map.terrainProfile='meandering-river';
  // The winding river is impassable except at two stone bridges and the shallow centre ford.
  for(const z of RIVER.bridges)fillRect(map,map.noBuild,RIVER.centerX-4,z-6,8,12,1);
  fillRect(map,map.noBuild,RIVER.centerX-10,RIVER.ford-6,20,12,1);
  applyChannel(map);
  return map;
}

/** Outcrop strips (x, row, length) west of centre; their twins are added by ridge(). */
export const PASS_OUTCROPS:Array<[number,number,number]>=[[98,238,18],[156,202,18],[96,104,16],[100,58,14]];
export const PASS_RIDGE={x:140,width:8};
/** Ridge openings (first row, rows): centre pass, north/south detours and the narrow flank trails. */
export const PASS_GAPS:Array<[number,number]>=[[141,6],[66,8],[214,8],[24,4],[260,4]];
/** Funnel spurs (x, row, length, thickness) and the wall between the natural and the north detour; ridge() adds the twins. */
export const PASS_SPURS:Array<[number,number,number,number]>=[[120,166,20,4],[124,118,16,4],[46,76,14,4]];

function createPassMap(): AuthoredMap {
  const map = makeMap('pass', '灰脊隘口');
  // A continuous rock ridge leaves one narrow middle pass, two wider detours and
  // two goat trails at the map edges. Every opening is a 180° twin of another.
  fillRect(map,map.blocked,PASS_RIDGE.x,0,PASS_RIDGE.width,map.height,1);fillRect(map,map.noBuild,PASS_RIDGE.x,0,PASS_RIDGE.width,map.height,1);
  for(const [z,rows] of PASS_GAPS){fillRect(map,map.blocked,PASS_RIDGE.x,z,PASS_RIDGE.width,rows,0);fillRect(map,map.noBuild,PASS_RIDGE.x-3,z-3,PASS_RIDGE.width+6,rows+6,1);}
  // Short outcrops make the detour approaches bend; spurs funnel the centre pass.
  for(const [x,z,length] of PASS_OUTCROPS)ridge(map,x,z,length,1);
  // Spurs close the centre chamber north and south of the pass and wall the natural off from the north detour.
  for(const [x,z,length,depth] of PASS_SPURS)ridge(map,x,z,length,depth);
  return map;
}

export function createMap(id: RtsMap['id']): AuthoredMap {
  const map=id==='river'?createRiverMap():id==='pass'?createPassMap():null;
  if(!map)throw new Error(`Unknown RTS map: ${String(id)}`);
  populateScenery(map);if(id==='river')addChannelRocks(map);
  addLandmarks(map);return map;
}

/** Shared pure layout data: the simulation must not import the Three.js renderer. */
export function roadPaths(map:RtsMap):Vec2[][]{
  const natural=[[24,144],[18,124],[20,108],[25,102]],third=[[24,144],[16,166],[18,192],[24,206]];
  // The middle road is its own 180° twin; the northern route's twin is the southern one.
  const middle=[[24,144],[44,136],[72,140],[100,144],[130,144],[158,144],[188,144],[216,148],[244,152],[264,144]];
  const west=map.id==='river'
    ? [[[24,144],[52,128],[80,110],[104,94],[126,84],[162,84],[184,94],[208,110],[236,128],[264,144]],middle,natural,third]
    : [[[24,144],[50,120],[78,96],[112,76],[130,70],[158,70],[176,76],[210,96],[238,120],[264,144]],middle,natural,third];
  const routes=west.map(route=>route.map(([x,z])=>({x,z})));
  // 180° twins (reversed so each road still runs west to east or base to expansion).
  return [...routes,...routes.map(route=>route.map(p=>rotateHalfTurn(p,map)).reverse())].filter((route,i,all)=>i<routes.length||!all.slice(0,i).some(o=>o.length===route.length&&o.every((p,j)=>Math.hypot(p.x-route[j].x,p.z-route[j].z)<1e-9)));
}

/** Original flat-water comparison profile (96 m fixture); production uses channelBanks. */
export function riverBanks(z:number):{left:number;right:number}{
  const sample=(v:number)=>({left:46.12+.28*(1+Math.sin(v*.27))+.1*Math.sin(v*.63),right:49.86-.25*(1+Math.sin(v*.23+1))-.09*Math.sin(v*.71)});
  const a=Math.floor(z/2)*2,t=(z-a)/2,first=sample(a),next=sample(a+2);
  return {left:first.left+(next.left-first.left)*t,right:first.right+(next.right-first.right)*t};
}

/** The landscape is authored from fixed seeds and never consumes simulation RNG. */
function populateScenery(map: AuthoredMap): AuthoredMap {
  const original=map.blocked.slice(),originalNoBuild=map.noBuild.slice(),W=map.width,H=map.height;
  const routes=roadPaths(map),turnOf=(p:Vec2)=>rotateHalfTurn(p,map);
  const hash=(x:number,z:number,salt:number)=>{let n=Math.imul(x+salt,374761393)+Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  // Leave the known base approaches broad enough for real buildings, including later AI slots,
  // and a clearing for the expansion hall beside every gold. East sites are the 180° twins.
  const constructionSites=[...map.spawns.flatMap((spawn,team)=>{
    const turn=team===0?1:-1;
    return [[0,-13],[-9,-13],[13,-13],[20,0],[13,15],[0,17],[0,-26],[13,-26],[0,30],[13,30],[26,-15],[26,17]].map(([dx,dz])=>({point:{x:spawn.x+turn*dx,z:spawn.z+turn*dz},radius:5}));
  }),...map.resources.filter(r=>r.kind==='gold').map(point=>({point,radius:10}))];
  const nearRoute=(p:Vec2,radius:number,clearance:number)=>routes.some(route=>route.slice(1).some((b,i)=>{
    const a=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<clearance+radius;
  }));
  const cells=(p:Vec2,radius:number)=>{
    const result:number[]=[];
    for(let z=Math.max(0,Math.floor(p.z-radius));z<=Math.min(H-1,Math.floor(p.z+radius));z++)for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(W-1,Math.floor(p.x+radius));x++){
      const dx=p.x-Math.max(x,Math.min(p.x,x+1)),dz=p.z-Math.max(z,Math.min(p.z,z+1));
      if(Math.hypot(dx,dz)<radius)result.push(z*W+x);
    }
    return result;
  };
  const fits=(p:Vec2,radius:number,onOriginalObstacle:boolean)=>{
    if(p.x-radius<1||p.x+radius>W-1||p.z-radius<1||p.z+radius>H-1)return false;
    // Existing blocked cells need a visible rock face up to the pass mouth;
    // only NEW obstacles reserve the wider road/building clearings.
    if([...map.spawns.map(point=>({point,radius:12})),...map.resources.map(point=>({point,radius:onOriginalObstacle?2.5:6})),...map.camps.map(point=>({point,radius:onOriginalObstacle?2.5:5})),...(onOriginalObstacle?[]:constructionSites)].some(item=>Math.hypot(p.x-item.point.x,p.z-item.point.z)<radius+item.radius))return false;
    if(nearRoute(p,radius,onOriginalObstacle?.5:5)||map.scenery.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<(onOriginalObstacle&&other.onOriginalObstacle?(radius+other.radius)*.6:radius+other.radius+1)))return false;
    const footprint=cells(p,radius);
    return footprint.length>0&&footprint.every(cell=>original[cell]===Number(onOriginalObstacle));
  };
  const commit=(kind:SceneryPlacement['kind'],p:Vec2,radius:number,scale:number,rotation:number,onOriginalObstacle:boolean)=>{
    map.scenery.push({...p,kind,radius,scale,rotation,onOriginalObstacle});
    for(const cell of cells(p,radius)){map.blocked[cell]=1;map.noBuild[cell]=1;}
  };
  /** Place a prop and its 180° twin together, or neither, so blocking stays symmetric. */
  const place=(kind:SceneryPlacement['kind'],p:Vec2,radius:number,scale:number,rotation:number,onOriginalObstacle:boolean)=>{
    const twin=turnOf(p);
    if(!fits(p,radius,onOriginalObstacle))return false;
    commit(kind,p,radius,scale,rotation,onOriginalObstacle);
    if(fits(twin,radius,onOriginalObstacle)){commit(kind,twin,radius,scale,rotation+Math.PI,onOriginalObstacle);return true;}
    // Undo: the twin site is unavailable.
    const placed=map.scenery.pop()!;for(const cell of cells(placed,radius)){map.blocked[cell]=original[cell];map.noBuild[cell]=originalNoBuild[cell];}
    return false;
  };
  // Loose woodland patches: behind and beside each base, around the expansions and
  // along the outer flanks. Groves are authored for the west half; the east half
  // receives their 180° twins, and every tree is placed with its twin.
  const westGroves=map.id==='river'
    ?[[10,168],[6,144],[8,132],[12,120],[38,182],[14,104],[12,62],[40,58],[62,80],[66,38],[28,22],[60,12],[96,28],[132,30],[120,60],[100,52],[84,128],[112,122],[62,152],[72,172],[94,160],[8,200],[60,198],[70,236],[14,262],[44,264],[88,268],[124,244],[130,278],[50,112]]
    :[[10,168],[6,144],[8,132],[12,120],[38,182],[14,104],[12,62],[40,58],[62,82],[68,38],[28,22],[60,12],[96,30],[128,34],[120,56],[100,46],[86,126],[110,130],[62,152],[74,172],[94,160],[8,200],[60,198],[66,240],[14,262],[44,264],[90,268],[126,250],[128,278],[50,112],[124,232],[94,112],[106,184]];
  const groves=[...westGroves,...westGroves.map(([x,z])=>[W-x,H-z])];
  const tree=map.id==='pass'?'pine':'oak',TREE_CAP=860;
  for(let z=3;z<H-2&&map.scenery.filter(p=>p.kind===tree).length<TREE_CAP;z+=2)for(let x=3;x<W/2-1;x+=2){
    const p={x:x+.35+hash(x,z,7)*1.3,z:z+.35+hash(x,z,13)*1.3};
    const density=Math.max(...groves.map(([gx,gz])=>Math.exp(-(((p.x-gx)/11)**2+((p.z-gz)/10)**2))));
    if(density>.25&&hash(x,z,31)<density*(map.id==='pass'?.41:.47))place(tree,p,1.15,.48+hash(x,z,43)*.16,hash(x,z,53)*Math.PI*2,false);
  }
  if(map.id==='pass'){
    // Three staggered rock columns read as one 8 m wall: each outer rock's twin fills
    // the other outer column; the centre column (x 144, z on the 2.4 m grid) is its own twin.
    for(const [x,start] of [[PASS_RIDGE.x+2,3.6],[PASS_RIDGE.x+4,2.4]])for(let z=start;z<H-2;z+=2.4){const p={x:x+(hash(47+x,Math.floor(z),5)-.5)*.12,z};place('rock',p,1.9,1.32+hash(47+x,Math.floor(z),17)*.14,hash(47+x,Math.floor(z),23)*6.28,true);}
    // The funnel spurs (4 m thick) carry one row of the same ridge rocks.
    for(const [start,row,length,depth] of PASS_SPURS)for(let x=start+2,z=row+depth/2;x<start+length;x+=2.4)place('rock',{x,z},1.9,1.1+hash(Math.floor(x),z,17)*.12,hash(Math.floor(x),z,23)*6.28,true);
    for(const [start,z,length] of PASS_OUTCROPS)for(const [x0,row] of [[start,z],[W-start-length,H-1-z]]){
      // These 1 m strips already block navigation. Fit overlapping source rocks
      // to the full strip, rather than marking a walkable-looking pebble row.
      const count=Math.ceil(length/2.25),width=Math.min(3,length/count+.6);
      for(let i=0;i<count;i++){
        const x=x0+.01+width/2+(length-.02-width)*i/Math.max(1,count-1),size={width,height:1.35+hash(Math.floor(x*10),row,29)*.5,depth:.96};
        map.scenery.push({kind:'rock',x,z:row+.5,radius:.48,scale:1,rotation:hash(Math.floor(x*10),row,37)>.5?Math.PI:0,onOriginalObstacle:true,size});
      }
    }
  }
  return map;
}
