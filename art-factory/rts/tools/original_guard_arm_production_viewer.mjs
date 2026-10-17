import {clipTimeForFrame} from './original_guard_arm_clip_time.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
const base='/art-factory/rts/runs/original-guard-arm-production/2026-10-05/candidate/';
const loader=new GLTFLoader();
const [arm,source]=await Promise.all([
  loader.loadAsync(base+'original-guard-arm-production-localanimated.glb'),
  loader.loadAsync(base+'original-guard-arm-production-source-context.glb')
]);
const schedule={idle:0,bend60:20,bend75:25,bend90:30,combined:40};
const instances=[];
function sceneFor(canvas,portrait){
  const scene=new THREE.Scene();scene.background=new THREE.Color(portrait?'#16262b':'#121e22');
  scene.add(new THREE.HemisphereLight('#dce7ee','#5f6354',2.1));
  const key=new THREE.DirectionalLight('#ffe2bb',3.1);key.position.set(-3,4,5);scene.add(key);
  const rim=new THREE.DirectionalLight('#a6c9e1',1.3);rim.position.set(3,2,-3);scene.add(rim);
  const context=clone(source.scene),unit=clone(arm.scene);
  if(portrait){context.rotation.y=Math.PI+.12;unit.rotation.y=Math.PI+.12}
  scene.add(context,unit);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,250);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  const mixer=new THREE.AnimationMixer(unit),action=mixer.clipAction(arm.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const item={canvas,scene,camera,renderer,unit,context,mixer,action,portrait};instances.push(item);return item;
}
const world=sceneFor(document.querySelector('#world-canvas'),false);
sceneFor(document.querySelector('#rts-portrait-view'),true);
function render(){
  for(const item of instances){
    const {canvas,camera,renderer,scene,portrait}=item;
    const bounds=canvas.getBoundingClientRect(),width=Math.round(bounds.width),height=Math.round(bounds.height);
    renderer.setSize(width,height,false);
    const span=portrait?.88:24,aspect=width/height;
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
    if(portrait){camera.position.set(0,1.54,4);camera.lookAt(0,1.51,0)}
    else{camera.position.set(24,52,35);camera.lookAt(0,.93,0)}
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.render(scene,camera);
  }
}
function setPose(name){
  const frame=schedule[name];if(frame===undefined)throw Error('Unknown pose '+name);
  const seconds=clipTimeForFrame(frame,0,40,arm.animations[0].duration);
  for(const item of instances){item.action.reset().play();item.mixer.setTime(seconds);item.unit.updateMatrixWorld(true)}
  for(const button of document.querySelectorAll('[data-pose]'))button.setAttribute('aria-pressed',String(button.dataset.pose===name));
  render();document.body.dataset.pose=name;
}
for(const button of document.querySelectorAll('[data-pose]'))button.addEventListener('click',()=>setPose(button.dataset.pose));
addEventListener('resize',render);
function positions(){
  const result={};world.unit.updateMatrixWorld(true);
  world.unit.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    const array=[],point=new THREE.Vector3();
    for(let i=0;i<node.geometry.attributes.position.count;i++){
      node.getVertexPosition(i,point);point.applyMatrix4(node.matrixWorld);array.push([point.x,point.y,point.z]);
    }
    result[node.name]=array;
  });
  return result;
}
window.armReview={ready:true,setPose,positions,rect:()=>document.querySelector('#rts-portrait-view').getBoundingClientRect().toJSON(),
  timing:()=>({sourceFrameRange:[0,40],clipDurationSeconds:arm.animations[0].duration,secondsPerFrame:arm.animations[0].duration/40}),
  sourceContextLoaded:()=>instances.every(item=>item.context.children.length>0),
  camera:()=>({span:24,portraitSpan:.88})};
setPose('idle');
