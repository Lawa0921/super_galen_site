import * as THREE from 'three';
import type {Undergrowth} from './districts';
import type {Footprint} from './maps';

/** Original atlas cutouts face the game's fixed camera; at most four draw calls. */
export class UndergrowthLayer {
  readonly root=new THREE.Group();
  private batches:Array<{mesh:THREE.InstancedMesh;plants:Undergrowth[]}>=[];
  private material:THREE.MeshStandardMaterial|null;
  private matrix=new THREE.Matrix4();
  private position=new THREE.Vector3();
  private scale=new THREE.Vector3();
  private exploredSnapshot?:Uint8Array;
  private footprints:Footprint[]=[];
  private rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(52,Math.hypot(24,35)),Math.atan2(24,35),0,'YXZ'));
  constructor(plants:Undergrowth[],texture:THREE.Texture,private width:number){
    this.material=new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.48,roughness:1});
    this.material.alphaToCoverage=true;
    for(const kind of [0,1,2,3] as const){
      const selected=plants.filter(p=>p.kind===kind);if(!selected.length)continue;
      const geometry=new THREE.BufferGeometry(),y0=-24/512,y1=1-24/512;
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,y0,0,.5,y0,0,.5,y1,0,-.5,y1,0],3));
      const u=(kind%2)*.5,v=kind<2?.5:0,uv=[u,v,u+.5,v,u+.5,v+.5,u,v+.5];
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
      const mesh=new THREE.InstancedMesh(geometry,this.material,selected.length);mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.raycast=()=>{};mesh.userData.undergrowthKind=kind;
      this.root.add(mesh);this.batches.push({mesh,plants:selected});
    }
  }
  update(explored:Uint8Array,buildings:Footprint[]):void {
    // TeamView creates fresh arrays each frame. Compare their content and keep
    // owned snapshots so in-place fog/footprint mutations also invalidate us.
    let unchanged=this.exploredSnapshot?.length===explored.length&&this.footprints.length===buildings.length;
    if(unchanged)for(let i=0;i<explored.length;i++)if(this.exploredSnapshot![i]!==explored[i]){unchanged=false;break;}
    if(unchanged)for(let i=0;i<buildings.length;i++){const a=this.footprints[i],b=buildings[i];
      if(a.x!==b.x||a.z!==b.z||a.width!==b.width||a.depth!==b.depth){unchanged=false;break;}
    }
    if(unchanged)return;
    this.exploredSnapshot=explored.slice();this.footprints=buildings.map(({x,z,width,depth})=>({x,z,width,depth}));
    for(const {mesh,plants} of this.batches){let count=0;
      for(const p of plants){
        if(explored[Math.floor(p.z)*this.width+Math.floor(p.x)]!==1||buildings.some(b=>Math.abs(b.x-p.x)<b.width/2+p.width/2&&Math.abs(b.z-p.z)<b.depth/2+p.width/2))continue;
        this.position.set(p.x,0,p.z);this.scale.set(p.width,p.height,1);this.matrix.compose(this.position,this.rotation,this.scale);mesh.setMatrixAt(count++,this.matrix);
      }
      mesh.count=count;if(count)mesh.instanceMatrix.needsUpdate=true;
    }
  }
  dispose():void {for(const {mesh} of this.batches){mesh.geometry.dispose();mesh.dispose();mesh.removeFromParent();}this.batches=[];this.exploredSnapshot=undefined;this.footprints=[];this.material?.dispose();this.material=null;}
}
