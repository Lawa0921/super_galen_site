// Renders published original unit GLBs through the runtime ModelLibrary (team tint, Idle pose,
// selection-portrait lights/framing) into transparent square frames. Creates no new geometry or pixels.
import * as THREE from 'three';
import {ModelLibrary} from '../../../src/scripts/games/rts/models';
import {PORTRAIT_FRAMING} from '../../../src/scripts/games/rts/portrait';
import type {UnitKind} from '../../../src/scripts/games/rts/catalog';
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
const library=new ModelLibrary();
const ready=library.load(()=>{});
/** spanScale widens the in-game portrait span so the bust keeps shoulders; yOffset recentres. */
async function render(kind:UnitKind,spanScale:number,yOffset:number):Promise<string>{
  await ready;
  const f=PORTRAIT_FRAMING[kind],instance=library.instantiate(kind,0);
  instance.root.rotation.y=instance.yaw+f.yaw;
  instance.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
  scene.add(instance.root);instance.animate('idle',0);instance.root.updateMatrixWorld(true);
  const span=f.span*spanScale,y=f.y+yOffset;
  camera.left=-span/2;camera.right=span/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  camera.position.set(0,y+.03,4);camera.lookAt(0,y,0);
  renderer.render(scene,camera);const url=canvas.toDataURL('image/png');
  scene.remove(instance.root);instance.dispose();return url;
}
(window as any).__unitIcons={ready:ready.then(()=>true),render};
