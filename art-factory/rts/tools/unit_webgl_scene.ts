/** Isolated art QA scene; never imported by the shipped game. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';

const scene=new THREE.Scene();scene.background=new THREE.Color('#222d31');
const camera=new THREE.OrthographicCamera(-5.8,5.8,3.3,-3.3,.1,80);
camera.position.set(8,9,-14);camera.lookAt(0,.6,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1500,850);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.style.margin='0';document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const loader=new GLTFLoader();
const [high,low]=await Promise.all([loader.loadAsync('/rts-qa-high.glb'),loader.loadAsync('/rts-qa-low.glb')]);
await Promise.all([prepareTeamMasks(high),prepareTeamMasks(low)]);
const models:ModelInstance[]=[];
for(let row=0;row<2;row++)for(let team=0;team<2;team++){
  const model=new ModelInstance(high,{url:'/assets/games/rts/models/guard.glb',status:'published'},team as 0|1,false,low);
  model.root.position.set(team*4-2,0,row*3.5-1.75);model.setDetailPixels(row?32:80);
  scene.add(model.root);models.push(model);
}
const render=(name:string,time:number)=>{for(const model of models)model.animate(name,time);scene.updateMatrixWorld(true);renderer.render(scene,camera);};
render('idle',.1);
(window as any).artAudit={
  render,
  details:()=>models.map(model=>({motion:model.motion,visible:model.root.children.map(child=>child.visible),teams:(()=>{const out:string[]=[];model.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/TeamCloth/i.test(m.name))out.push((m as THREE.MeshStandardMaterial).color.getHexString());});return [...new Set(out)];})()})),
  transforms:()=>models.map(model=>{const out:number[]=[];model.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Bone)out.push(...o.matrixWorld.elements);});return out;}),
  clips:high.animations.map(clip=>clip.name),
  lowClips:low.animations.map(clip=>clip.name),
  renderer:()=>({lost:renderer.getContext().isContextLost(),draws:renderer.info.render.calls,triangles:renderer.info.render.triangles}),
};
