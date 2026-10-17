import type {RtsMap,SceneryPlacement} from './maps';

export const CHANNEL_WATER_Y=-.8;
/** 雙河谷地 river geometry on the 288 m map: two stone bridges and a shallow centre ford (causeway rows FORD−3..FORD+2). */
export const RIVER={length:288,centerX:144,bridges:[84,204] as const,ford:144,bridgeHalf:4,fordHalf:3};
export const onBridge=(x:number,z:number,margin=3.5)=>Math.abs(x-RIVER.centerX)<=RIVER.bridgeHalf&&RIVER.bridges.some(v=>Math.abs(z-v)<=margin);
/** 0 in open water, 1 on the ford's dry causeway, with a 1.5 m shelving edge. */
export const fordLift=(z:number)=>Math.max(0,Math.min(1,(RIVER.fordHalf+1.5-Math.abs(z-RIVER.ford))/1.5));
/**
 * Meanders converge at the two stone bridges (z 84 and 204, centred on x 144).
 * The channel is a 180° twin of itself about the map centre: a winding course
 * that swings 9 m east and west between the crossings (zero at 24/84/144/204/264),
 * and the bank ripples are mirrored (right(z) = L − left(L − z)) so both
 * bases face the same river.
 */
export function channelBanks(z:number):{left:number;right:number}{
  const {length:L,centerX:C,bridges}=RIVER;
  const sample=(v:number)=>{const distance=Math.min(...bridges.map(c=>Math.abs(v-c))),wide=1-Math.exp(-distance*distance/120),half=1.5+3.1*wide,center=C+9*Math.sin((v-L/2)*Math.PI/60);
    return {left:center-half+wide*.3*Math.sin(v*.67),right:center+half-wide*.3*Math.sin((L-v)*.67)};};
  const a=Math.floor(z*2)/2,t=(z-a)*2,first=sample(a),next=sample(a+.5);
  return {left:first.left+(next.left-first.left)*t,right:first.right+(next.right-first.right)*t};
}
/** The channel continues below the bridges (their source deck is assembled at y=0); the ford rises to a dry causeway. */
export function channelHeight(x:number,z:number):number{
  if(z<0||z>RIVER.length)return 0;
  const {left,right}=channelBanks(z);if(x<=left-1||x>=right+1)return 0;
  const profile=[[left-1,0],[left,CHANNEL_WATER_Y],[left+.4,-1.25],[right-.4,-1.25],[right,CHANNEL_WATER_Y],[right+1,0]],lift=fordLift(z);
  for(let i=1;i<profile.length;i++)if(x<=profile[i][0]){
    const [ax,ay]=profile[i-1],[bx,by]=profile[i];return (ay+(by-ay)*(x-ax)/(bx-ax))*(1-lift);
  }
  return 0;
}
/** Carve the channel into the navigation grids: water blocks and forbids building; bridge decks and the ford stay walkable. */
export function applyChannel(map:RtsMap):void{
  const W=map.width,{centerX:C,bridges,ford,bridgeHalf,fordHalf}=RIVER;
  for(let z=0;z<map.height;z++){
    const samples=[channelBanks(z),channelBanks(z+.5),channelBanks(z+1)],left=Math.floor(Math.min(...samples.map(b=>b.left))-1),right=Math.ceil(Math.max(...samples.map(b=>b.right))+1);
    for(let x=left;x<right;x++){map.blocked[z*W+x]=1;map.noBuild[z*W+x]=1;}
    if(bridges.some(c=>z>=c-3&&z<c+3))for(let x=C-bridgeHalf;x<C+bridgeHalf;x++)map.blocked[z*W+x]=0;
    if(z>=ford-fordHalf&&z<ford+fordHalf)for(let x=left;x<right;x++)map.blocked[z*W+x]=0;
  }
}
/** Varied, separated shoreline rock clusters for the north half; the south half gets their 180° twins. */
export function addChannelRocks(map:RtsMap & {scenery:SceneryPlacement[]}):void{
  const W=map.width;
  for(const [center,side] of [[21,-1],[54,1],[105,-1],[126,1]] as const)for(const offset of [-1.7,.2,1.4]){
    const z=center+offset,bank=channelBanks(z),x=(side<0?bank.left:bank.right)+side*1.05;
    for(const [px,pz,turn] of [[x,z,0],[W-x,map.height-z,Math.PI]]){
      map.scenery.push({kind:'rock',x:px,z:pz,radius:.48,scale:.34+.07*Math.sin(z*1.7)**2,rotation:z*2.4+turn,onOriginalObstacle:true});
      for(let row=Math.floor(pz-.48);row<=Math.floor(pz+.48);row++)for(let col=Math.floor(px-.48);col<=Math.floor(px+.48);col++){map.blocked[row*W+col]=1;map.noBuild[row*W+col]=1;}
    }
  }
}
/** Apply the reviewed channel to a copy, retaining resource amounts, trees, camps and spawns. */
export function createChannelMap(original:RtsMap & {scenery:SceneryPlacement[]}):RtsMap & {scenery:SceneryPlacement[]}{
  if(original.id!=='river')return original;
  const map={...original,terrainProfile:'meandering-river' as const,blocked:original.blocked.slice(),noBuild:original.noBuild.slice(),scenery:original.scenery?.filter(p=>p.kind!=='rock')??[],resources:original.resources.map(r=>({...r}))};
  applyChannel(map);addChannelRocks(map);return map;
}
