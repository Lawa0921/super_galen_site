export type Vec2 = { x: number; z: number };
/** A building footprint is centered at x,z; width and depth extend equally around it. */
export type Footprint = Vec2 & { width: number; depth: number };
export type SceneryPlacement = Vec2 & { kind: 'oak' | 'pine' | 'rock'; radius: number; scale: number; rotation: number; onOriginalObstacle: boolean; /** Exact axis-aligned visual/obstacle bounds for narrow authored outcrops. */ size?:{width:number;height:number;depth:number} };

export interface RtsMap {
  id: 'river' | 'pass';
  name: string;
  width: number;
  height: number;
  blocked: Uint8Array;
  noBuild: Uint8Array;
  spawns: [Vec2, Vec2];
  resources: Array<Vec2 & { id: string; kind: 'gold' | 'wood'; amount: number }>;
  camps: Vec2[];
  scenery?: SceneryPlacement[];
}

const MAP_SIZE = 96;

function index(x: number, z: number): number {
  return z * MAP_SIZE + x;
}

function fillRect(grid: Uint8Array, x: number, z: number, width: number, depth: number, value: 0 | 1): void {
  for (let row = z; row < z + depth; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      grid[index(column, row)] = value;
    }
  }
}

function makeMap(id: RtsMap['id'], name: string): RtsMap & {scenery:SceneryPlacement[]} {
  return {
    id,
    name,
    width: MAP_SIZE,
    height: MAP_SIZE,
    blocked: new Uint8Array(MAP_SIZE * MAP_SIZE),
    noBuild: new Uint8Array(MAP_SIZE * MAP_SIZE),
    spawns: [
      { x: 14, z: 48 },
      { x: 82, z: 48 },
    ],
    resources: [
      { id: `${id}-gold-west`, kind: 'gold', amount: 5000, x: 24.5, z: 48.5 },
      { id: `${id}-wood-west`, kind: 'wood', amount: 2500, x: 22.5, z: 58.5 },
      { id: `${id}-gold-east`, kind: 'gold', amount: 5000, x: 71.5, z: 48.5 },
      { id: `${id}-wood-east`, kind: 'wood', amount: 2500, x: 73.5, z: 58.5 },
    ],
    camps: [],
    scenery: [],
  };
}

function createRiverMap(): RtsMap & {scenery:SceneryPlacement[]} {
  const map = makeMap('river', '雙河谷地');

  // The north-south river is impassable except at its two stone bridges.
  fillRect(map.blocked, 46, 0, 4, MAP_SIZE, 1);
  fillRect(map.blocked, 46, 25, 4, 6, 0);
  fillRect(map.blocked, 46, 65, 4, 6, 0);
  fillRect(map.noBuild, 44, 22, 8, 12, 1);
  fillRect(map.noBuild, 44, 62, 8, 12, 1);

  map.resources.push(
    { id: 'river-gold-north', kind: 'gold', amount: 3500, x: 43.5, z: 28.5 },
    { id: 'river-gold-south', kind: 'gold', amount: 3500, x: 52.5, z: 68.5 },
  );
  map.camps = [
    { x: 36.5, z: 28.5 },
    { x: 59.5, z: 68.5 },
  ];

  return map;
}

function createPassMap(): RtsMap & {scenery:SceneryPlacement[]} {
  const map = makeMap('pass', '灰脊隘口');

  // A continuous rock ridge leaves one narrow middle pass and two wider detours.
  fillRect(map.blocked, 46, 0, 4, MAP_SIZE, 1);
  fillRect(map.blocked, 46, 21, 4, 7, 0);
  fillRect(map.blocked, 46, 46, 4, 5, 0);
  fillRect(map.blocked, 46, 69, 4, 7, 0);
  fillRect(map.noBuild, 44, 18, 8, 13, 1);
  fillRect(map.noBuild, 44, 43, 8, 11, 1);
  fillRect(map.noBuild, 44, 66, 8, 13, 1);

  // Short outcrops make the north and south approaches bend around the ridge.
  fillRect(map.blocked, 34, 17, 9, 1, 1);
  fillRect(map.blocked, 53, 27, 9, 1, 1);
  fillRect(map.blocked, 34, 69, 9, 1, 1);
  fillRect(map.blocked, 53, 77, 9, 1, 1);

  map.resources.push(
    { id: 'pass-gold-north', kind: 'gold', amount: 3500, x: 43.5, z: 24.5 },
    { id: 'pass-gold-south', kind: 'gold', amount: 3500, x: 52.5, z: 72.5 },
  );
  map.camps = [
    { x: 36.5, z: 24.5 },
    { x: 59.5, z: 72.5 },
  ];

  return map;
}

export function createMap(id: RtsMap['id']): RtsMap & {scenery:SceneryPlacement[]} {
  if (id === 'river') return populateScenery(createRiverMap());
  if (id === 'pass') return populateScenery(createPassMap());
  throw new Error(`Unknown RTS map: ${String(id)}`);
}

/** Shared pure layout data: the simulation must not import the Three.js renderer. */
export function roadPaths(map:RtsMap):Vec2[][]{
  const routes=map.id==='river'
    ? [[[14,48],[29,40],[38,32],[42,28],[54,28],[58,32],[67,40],[82,48]],
       [[14,48],[29,56],[38,64],[42,68],[54,68],[58,64],[67,56],[82,48]]]
    : [[[14,48],[82,48]],
       [[14,48],[29,37],[36,24],[64,24],[69,37],[82,48]],
       [[14,48],[29,60],[32,73],[64,73],[67,60],[82,48]]];
  return routes.map(route=>route.map(([x,z])=>({x,z})));
}

/** Shared by water vertices and bank dressing; interpolation matches the 2m mesh segments. */
export function riverBanks(z:number):{left:number;right:number}{
  const sample=(v:number)=>({left:46.12+.28*(1+Math.sin(v*.27))+.1*Math.sin(v*.63),right:49.86-.25*(1+Math.sin(v*.23+1))-.09*Math.sin(v*.71)});
  const a=Math.floor(z/2)*2,t=(z-a)/2,first=sample(a),next=sample(a+2);
  return {left:first.left+(next.left-first.left)*t,right:first.right+(next.right-first.right)*t};
}

/** The landscape is authored from fixed seeds and never consumes simulation RNG. */
function populateScenery(map: RtsMap & {scenery:SceneryPlacement[]}): RtsMap & {scenery:SceneryPlacement[]} {
  const original=map.blocked.slice();
  const routes=roadPaths(map);
  const hash=(x:number,z:number,salt:number)=>{let n=Math.imul(x+salt,374761393)+Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  // Leave the known base approaches broad enough for real buildings, including later AI slots.
  const constructionSites=map.spawns.flatMap((spawn,team)=>{
    const inward=team===0?1:-1;
    return [[0,-13],[-inward*9,-13],[inward*13,-13],[inward*20,0],[inward*13,15],[0,17],[0,-26],[inward*13,-26],[0,30],[inward*13,30]].map(([dx,dz])=>({point:{x:spawn.x+dx,z:spawn.z+dz},radius:5}));
  });
  const nearRoute=(p:Vec2,radius:number,clearance:number)=>routes.some(route=>route.slice(1).some((b,i)=>{
    const a=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<clearance+radius;
  }));
  const cells=(p:Vec2,radius:number)=>{
    const result:number[]=[];
    for(let z=Math.max(0,Math.floor(p.z-radius));z<=Math.min(95,Math.floor(p.z+radius));z++)for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(95,Math.floor(p.x+radius));x++){
      const dx=p.x-Math.max(x,Math.min(p.x,x+1)),dz=p.z-Math.max(z,Math.min(p.z,z+1));
      if(Math.hypot(dx,dz)<radius)result.push(index(x,z));
    }
    return result;
  };
  const place=(kind:SceneryPlacement['kind'],p:Vec2,radius:number,scale:number,rotation:number,onOriginalObstacle:boolean)=>{
    if(p.x-radius<1||p.x+radius>95||p.z-radius<1||p.z+radius>95)return false;
    // Existing blocked cells need a visible rock face up to the pass mouth;
    // only NEW obstacles reserve the wider road/building clearings.
    if([...map.spawns.map(point=>({point,radius:12})),...map.resources.map(point=>({point,radius:onOriginalObstacle?2.5:6})),...map.camps.map(point=>({point,radius:onOriginalObstacle?2.5:5})),...constructionSites].some(item=>Math.hypot(p.x-item.point.x,p.z-item.point.z)<radius+item.radius))return false;
    if(nearRoute(p,radius,onOriginalObstacle?.5:5)||map.scenery.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<(onOriginalObstacle&&other.onOriginalObstacle?(radius+other.radius)*.6:radius+other.radius+1)))return false;
    const footprint=cells(p,radius);
    if(!footprint.length||footprint.some(cell=>original[cell]!==Number(onOriginalObstacle)))return false;
    map.scenery.push({...p,kind,radius,scale,rotation,onOriginalObstacle});
    for(const cell of footprint){map.blocked[cell]=1;map.noBuild[cell]=1;}
    return true;
  };
  // Loose woodland patches near the outer approaches, including the initial sightline.
  const groves=map.id==='river'?[[10,31],[29,13],[7,62],[9,80],[30,83],[68,13],[88,31],[89,62],[68,83],[88,80]]:[[9,31],[27,9],[7,62],[9,80],[28,86],[69,9],[87,31],[89,62],[69,86],[87,80]];
  const tree=map.id==='pass'?'pine':'oak';
  for(let z=3;z<94&&map.scenery.filter(p=>p.kind===tree).length<98;z+=2)for(let x=3;x<94;x+=2){
    const p={x:x+.35+hash(x,z,7)*1.3,z:z+.35+hash(x,z,13)*1.3};
    const density=Math.max(...groves.map(([gx,gz])=>Math.exp(-(((p.x-gx)/11)**2+((p.z-gz)/10)**2))));
    if(density>.25&&hash(x,z,31)<density*.53)place(tree,p,1.15,.48+hash(x,z,43)*.16,hash(x,z,53)*Math.PI*2,false);
  }
  if(map.id==='river'){
    for(const [center,side] of [[8,-1],[19,1],[39,-1],[54,1],[80,-1],[91,1]])for(const offset of [-1.7,-.3,.8,2.1]){
      const z=center+offset,bank=riverBanks(z),radius=.53,edge=side<0?bank.left:bank.right;
      const x=Math.max(46+radius,Math.min(50-radius,edge-side*.16));
      place('rock',{x,z},radius,.29+hash(center,Math.floor(z),17)*.055,hash(center,Math.floor(z),23)*6.28,true);
    }
  }else{
    for(let z=3;z<94;z+=2.4){const p={x:48+(hash(47,Math.floor(z),5)-.5)*.12,z};place('rock',p,1.9,1.16+hash(47,Math.floor(z),17)*.12,hash(47,Math.floor(z),23)*6.28,true);}
    for(const [start,z] of [[34,17],[53,27],[34,69],[53,77]]){
      // These four 9x1m strips already block navigation. Fit overlapping source
      // rocks to the full strip, rather than marking a walkable-looking pebble row.
      for(const [offset,width] of [[1.5,2.9],[3.5,2.8],[5.6,3.0],[7.55,2.8]]){
        const size={width,height:1.35+hash(start+offset,z,29)*.5,depth:.96};
        map.scenery.push({kind:'rock',x:start+offset,z:z+.5,radius:.48,scale:1,rotation:hash(start+offset,z,37)>.5?Math.PI:0,onOriginalObstacle:true,size});
      }
      fillRect(map.noBuild,start,z,9,1,1);
    }
  }
  return map;
}
