/** Differential QA only: original rigid animation versus a proposed rigid-skin batch. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
const scene=new THREE.Scene();scene.background=new THREE.Color('#222d31');
const camera=new THREE.OrthographicCamera(-4.8,4.8,3.12,-3.12,.1,60);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,650);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.style.margin='0';document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(7,12,-6);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0005;sun.shadow.normalBias=.07;Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:35});sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:'#687367',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;floor.receiveShadow=true;scene.add(floor);
const loader=new GLTFLoader(),models=new Map<string,{model:ModelInstance;clips:THREE.AnimationClip[]}>();
for(const version of ['old','new'])for(const lod of [0,1])for(const team of [0,1]){
  const gltf=await loader.loadAsync(`/rts-siege-${version}-${lod}.glb`),model=new ModelInstance(gltf,{url:'/assets/games/rts/models/siege.glb',status:'published'},team as 0|1);
  model.root.userData.entityId=7;model.root.position.set(1.7,0,-1.2);model.root.rotation.y=.55;model.root.scale.setScalar(1.15);model.root.visible=false;
  model.root.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});
  scene.add(model.root);models.set(`${version}:${lod}:${team}`,{model,clips:gltf.animations});
}
const raycaster=new THREE.Raycaster();
const normalMaterial=new THREE.MeshNormalMaterial();
(window as any).siegeCompare={render:(version:string,lod:number,name:string,fraction:number,edge:boolean,team:number,pass='beauty')=>{
  for(const {model} of models.values())model.root.visible=false;
  const {model,clips}=models.get(`${version}:${lod}:${team}`)!,clip=clips.find(c=>c.name===name)!;if(!clip)throw new Error('Missing clip '+name);
  model.root.visible=true;model.mixer.stopAllAction();const action=model.mixer.clipAction(clip).reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();model.mixer.setTime(clip.duration*fraction);
  const target=new THREE.Vector3(1.7+(edge?3.8:0),.7,-1.2);camera.position.copy(target).add(new THREE.Vector3(7,7,-12));camera.lookAt(target);camera.updateMatrixWorld();
  scene.overrideMaterial=pass==='normal'?normalMaterial:null;floor.visible=pass!=='normal';scene.background=new THREE.Color(pass==='normal'?'#000000':'#222d31');
  if(pass==='background')model.root.visible=false;
  scene.updateMatrixWorld(true);
  if((window as any).siegeRefreshBounds)model.root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.computeBoundingSphere();});
  renderer.render(scene,camera);
  const bounds=new THREE.Box3().setFromObject(model.root,true),hits:Array<number|null>=[],hitEntityIds:number[]=[];
  for(let y=-.8;y<=.8;y+=.1)for(let x=-.9;x<=.9;x+=.1){raycaster.setFromCamera(new THREE.Vector2(x,y),camera);const hit=raycaster.intersectObject(model.root,true)[0];hits.push(hit?hit.distance:null);if(hit){let owner:THREE.Object3D|null=hit.object;while(owner&&owner.userData.entityId===undefined)owner=owner.parent;hitEntityIds.push(owner?.userData.entityId??-1);}}
  let meshes=0,skinned=0;model.root.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;if(o instanceof THREE.SkinnedMesh)skinned++;});
  return {bounds:[...bounds.min.toArray(),...bounds.max.toArray()],hits,hitCount:hitEntityIds.length,hitEntityIds,meshes,skinned,renderCalls:renderer.info.render.calls,lost:renderer.getContext().isContextLost()};
}};
