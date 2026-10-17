import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clipTimeForFrame} from './original_guard_arm_clip_time.mjs';

const base='/art-factory/rts/runs/original-guard-clean-arm/2026-10-05/';
const gltf=await new GLTFLoader().loadAsync(base+'candidate/original-guard-clean-arm.glb');
const scene=new THREE.Scene();scene.background=new THREE.Color('#19252a');
scene.add(new THREE.HemisphereLight('#f0f4ff','#585b57',2.3));
const key=new THREE.DirectionalLight('#fff0cd',3);key.position.set(-2,4,-3);scene.add(key);
const rim=new THREE.DirectionalLight('#9bbcd4',1.5);rim.position.set(2,2,3);scene.add(rim);
scene.add(gltf.scene);
const canvas=document.querySelector('#view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
const target=new THREE.Vector3(.355,1.22,-.02);
const mixer=new THREE.AnimationMixer(gltf.scene);
const action=mixer.clipAction(gltf.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
const poses={neutral:0,bend75:25,bend90:30,bend120:36,roll45:40};
const views={front:[0,.12,-2],side:[2,.12,0],back:[0,.12,2]};
let currentView='front';
function render(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),span=.62;
  renderer.setSize(w,h,false);camera.left=-span*w/h/2;camera.right=span*w/h/2;
  camera.top=span/2;camera.bottom=-span/2;camera.position.copy(target).add(new THREE.Vector3(...views[currentView]));
  camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.render(scene,camera)}
function setPose(name){if(!(name in poses))throw Error('Unknown pose');
  action.reset().play();mixer.setTime(clipTimeForFrame(poses[name],0,40,gltf.animations[0].duration));
  gltf.scene.updateMatrixWorld(true);document.body.dataset.pose=name;
  document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===name)));render()}
function setView(name){if(!(name in views))throw Error('Unknown view');currentView=name;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));render()}
function positions(){const result={},point=new THREE.Vector3();gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(node=>{if(!node.isSkinnedMesh)return;const coords=[];
    for(let i=0;i<node.geometry.attributes.position.count;i++){
      node.getVertexPosition(i,point);point.applyMatrix4(node.matrixWorld);coords.push([point.x,point.y,point.z])}
    result[node.name]=coords});return result}
document.querySelectorAll('[data-pose]').forEach(b=>b.addEventListener('click',()=>setPose(b.dataset.pose)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
addEventListener('resize',render);
window.cleanArmReview={ready:true,setPose,setView,positions,timing:()=>({duration:gltf.animations[0].duration,sourceFrames:[0,40]})};
setView('front');setPose('neutral');
