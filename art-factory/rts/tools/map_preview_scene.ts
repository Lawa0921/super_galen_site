/** Reproducible screenshots of the actual published environment and game map. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance,type ModelLibrary} from '../../../src/scripts/games/rts/models';
import {Battlefield} from '../../../src/scripts/games/rts/scene';
import {createGame} from '../../../src/scripts/games/rts/simulation';
import {getTeamView} from '../../../src/scripts/games/rts/visibility';
import {roadPaths} from '../../../src/scripts/games/rts/terrain';
const ids=['townhall','gold-mine','timber-pile','oak','rock','stone-bridge'];
const loader=new GLTFLoader(),assets=new Map(await Promise.all(ids.map(async id=>[id,await loader.loadAsync('/assets/games/rts/models/'+id+'.glb')] as const)));
const candidate=new URLSearchParams(location.search).has('terrain-candidate');
const terrainUrls={meadow:'/assets/games/rts/terrain/meadow.webp',road:candidate?'/art-factory/rts/runs/terrain-detail/2026-10-05-v1/candidate/dirt-road-side-alpha.png':'/assets/games/rts/terrain/dirt-road.webp',water:candidate?'/art-factory/rts/runs/terrain-detail/2026-10-05-v1/candidate/river-water.webp':'/assets/games/rts/terrain/river-water.webp','lush-grass':'/assets/games/rts/terrain/lush-grass.webp','forest-floor':'/assets/games/rts/terrain/forest-floor.webp','river-shingle':'/assets/games/rts/terrain/river-shingle.webp','highland-scree':'/assets/games/rts/terrain/highland-scree.webp'};
const textures=new Map(await Promise.all(Object.entries(terrainUrls).map(async([id,url])=>[id,await new THREE.TextureLoader().loadAsync(url)] as const)));
const library={terrain:(id='meadow')=>textures.get(id),instantiate:(id:string,team:0|1|-1)=>new ModelInstance(assets.get(id)!,{url:'/assets/games/rts/models/'+id+'.glb',status:'published'},team)} as unknown as ModelLibrary;
const canvas=document.createElement('canvas'),overlay=document.createElement('canvas');canvas.width=overlay.width=1000;canvas.height=overlay.height=600;canvas.style.width='1000px';canvas.style.height='600px';overlay.style.display='none';document.body.style.margin='0';document.body.append(canvas,overlay);
let battlefield:Battlefield|undefined;
(window as any).mapPreview={render:(map:'river'|'pass',fogCheck=false)=>{
  battlefield?.dispose();const state=createGame(map,20261004),view=getTeamView(state,0);
  view.entities=fogCheck?[]:state.entities.filter(e=>e.category==='building');view.visible.fill(fogCheck?0:1);view.explored.fill(fogCheck?0:1);view.resources=fogCheck?[]:state.resources;
  battlefield=new Battlefield(canvas,overlay,state.map,library);battlefield.focus({x:fogCheck?44:48,z:48});battlefield.zoom(28);
  battlefield.render(view,0);const gl=battlefield.renderer.getContext(),pixel=new Uint8Array(4),point=battlefield.screen({x:58,z:32});
  gl.readPixels(Math.floor(point.x),canvas.height-1-Math.floor(point.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  const fogPixels=roadPaths(state.map).flatMap(path=>path).map(p=>{const at=battlefield!.screen(p),rgba=new Uint8Array(4);gl.readPixels(Math.floor(at.x),canvas.height-1-Math.floor(at.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return {point:p,color:[...rgba]};});
  return {map,canvas:[canvas.width,canvas.height],draws:battlefield.renderer.info.render.calls,triangles:battlefield.renderer.info.render.triangles,roadUnderFogPixel:[...pixel],fogPixels};
}};
