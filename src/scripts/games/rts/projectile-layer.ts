import {Group} from 'three';
import type {ModelInstance,ModelLibrary} from './models';
import type {Entity,Projectile} from './types';
export class ProjectileLayer {
  readonly root=new Group();
  private shots=new Map<number,{model:ModelInstance;x:number;z:number}>();
  constructor(private library:Pick<ModelLibrary,'instantiate'>){}
  update(projectiles:ReadonlyArray<Projectile>,entities:ReadonlyArray<Pick<Entity,'id'|'x'|'z'|'facing'>>):void {
    const current=new Set(projectiles.map(p=>p.id));
    for(const [id,shot] of this.shots)if(!current.has(id)){shot.model.dispose();this.shots.delete(id);}
    for(const projectile of projectiles){
      let shot=this.shots.get(projectile.id);
      if(!shot){
        const model=this.library.instantiate(projectile.kind==='shell'?'heavy-bolt':'bolt',projectile.team);
        const target=entities.find(e=>e.id===projectile.targetId),source=entities.find(e=>e.id===projectile.sourceId);
        model.root.rotation.y=(target?Math.atan2(target.x-projectile.x,target.z-projectile.z):source?.facing??0)+Math.PI+model.yaw;
        shot={model,x:projectile.x,z:projectile.z};this.shots.set(projectile.id,shot);this.root.add(model.root);
      }
      const dx=projectile.x-shot.x,dz=projectile.z-shot.z;
      if(dx*dx+dz*dz>1e-8)shot.model.root.rotation.y=Math.atan2(dx,dz)+Math.PI+shot.model.yaw;
      shot.model.root.position.set(projectile.x,projectile.kind==='shell'?2.2:1.2,projectile.z);
      shot.x=projectile.x;shot.z=projectile.z;
    }
  }
  dispose():void {for(const shot of this.shots.values())shot.model.dispose();this.shots.clear();this.root.removeFromParent();}
}
