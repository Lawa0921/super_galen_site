// Train-icon viewer for roster-expansion units published for style review (not in REQUIRED_MODELS).
// Same renderer, lights, Idle pose and orthographic bust framing as unit_train_icon_viewer.ts; the
// model comes from its model-registry.json entry through the runtime ModelInstance (team tint and
// team mask). framing.json supplies y/span/yaw because PORTRAIT_FRAMING has no entry until the unit ships.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';
const SIZE=1024;
const canvas=document.createElement('canvas');canvas.width=SIZE;canvas.height=SIZE;document.body.append(canvas);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(SIZE,SIZE,false);renderer.setClearColor(0x000000,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight('#dce7ee','#5f6354',2.1));
const key=new THREE.DirectionalLight('#ffe2bb',3.1);key.position.set(-3,4,5);scene.add(key);
const rim=new THREE.DirectionalLight('#a6c9e1',1.3);rim.position.set(3,2,-3);scene.add(rim);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
const ready=fetch('/assets/games/rts/model-registry.json').then(r=>r.json());
interface Framing {y:number;span:number;yaw:number;spanScale:number;yOffset:number}
async function render(kind:string,spanScale:number,yOffset:number,framing:Framing):Promise<string>{
  const registry=await ready,entry=registry.assets[kind];if(!entry)throw new Error('No registry entry '+kind);
  const loader=new GLTFLoader(),high=await loader.loadAsync(entry.url),low=entry.lod1?await loader.loadAsync(entry.lod1):undefined;
  await prepareTeamMasks(high);if(low)await prepareTeamMasks(low);
  const instance=new ModelInstance(high,entry,0,false,low);
  instance.root.rotation.y=instance.yaw+framing.yaw;
  instance.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
  scene.add(instance.root);instance.animate('idle',0);instance.root.updateMatrixWorld(true);
  const span=framing.span*spanScale,y=framing.y+yOffset;
  camera.left=-span/2;camera.right=span/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  camera.position.set(0,y+.03,4);camera.lookAt(0,y,0);
  renderer.render(scene,camera);const url=canvas.toDataURL('image/png');
  scene.remove(instance.root);instance.dispose();return url;
}
(window as any).__unitIcons={ready:ready.then(()=>true),render};
