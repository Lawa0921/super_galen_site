import * as THREE from 'three';
import {UNITS,type UnitKind} from './catalog';
import type {ModelLibrary,ModelInstance} from './models';
import type {TeamView} from './scene';
// Published Y-up model coordinates, framed independently of world LOD/facing.
// Roster-preview units get their framing when their models are published.
export const PORTRAIT_FRAMING:Partial<Record<UnitKind,{y:number;span:number;yaw:number}>>={
  worker:{y:1.43,span:.82,yaw:Math.PI+.12},guard:{y:1.51,span:.88,yaw:Math.PI+.12},
  crossbow:{y:1.46,span:.87,yaw:Math.PI+.12},priest:{y:1.49,span:.9,yaw:Math.PI+.12},
  knight:{y:2.02,span:.93,yaw:Math.PI+.12},siege:{y:.95,span:3.5,yaw:Math.PI+.6},
  commander:{y:1.58,span:.94,yaw:Math.PI+.12},'neutral-raider':{y:1.45,span:.87,yaw:Math.PI+.12},
};
export class SelectionPortrait {
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
  private instance:ModelInstance|null=null;
  private key='';
  private span=1;
  private viewport:HTMLElement;
  private motion:MediaQueryList|null;
  constructor(private library:ModelLibrary,private frame:HTMLElement){
    this.viewport=frame.querySelector<HTMLElement>('#rts-portrait-view')!;
    this.motion=window.matchMedia?.('(prefers-reduced-motion: reduce)')??null;
    this.scene.userData.rtsPortrait=true;this.scene.background=new THREE.Color('#16262b');
    this.scene.add(new THREE.HemisphereLight('#dce7ee','#5f6354',2.1));
    const key=new THREE.DirectionalLight('#ffe2bb',3.1);key.position.set(-3,4,5);this.scene.add(key);
    const rim=new THREE.DirectionalLight('#a6c9e1',1.3);rim.position.set(3,2,-3);this.scene.add(rim);
    this.clear();
  }
  private clear(){
    this.instance?.dispose();this.instance=null;this.key='';this.frame.hidden=true;
    this.frame.parentElement?.classList.remove('rts-has-portrait');
    for(const name of ['kind','team','entityId'])delete this.viewport.dataset[name];
    this.viewport.removeAttribute('aria-label');
  }
  update(view:Pick<TeamView,'entities'>,ids:readonly number[],dt:number){
    const first=ids.map(id=>view.entities.find(e=>e.id===id&&e.alive)).find(Boolean);
    if(first?.category!=='unit'||!PORTRAIT_FRAMING[first.kind]){if(this.instance)this.clear();return;}
    const key=`${first.kind}:${first.team}`;
    if(key!==this.key){
      this.clear();this.instance=this.library.instantiate(first.kind,first.team);this.key=key;
      const framing=PORTRAIT_FRAMING[first.kind]!;this.span=framing.span;
      this.instance.root.rotation.y=this.instance.yaw+framing.yaw;
      this.instance.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=false;}});
      this.scene.add(this.instance.root);this.camera.position.set(0,framing.y+.03,4);this.camera.lookAt(0,framing.y,0);
      this.frame.hidden=false;this.frame.parentElement?.classList.add('rts-has-portrait');
      this.viewport.dataset.kind=first.kind;this.viewport.dataset.team=String(first.team);
      this.viewport.setAttribute('aria-label',`${UNITS[first.kind].name}，3D 動態肖像`);
    }
    if(this.viewport.dataset.entityId!==String(first.id))this.viewport.dataset.entityId=String(first.id);
    this.instance!.animate('idle',this.motion?.matches?0:dt);
  }
  render(renderer:THREE.WebGLRenderer,canvas:DOMRect):{x:number;y:number;width:number;height:number}|null{
    if(!this.instance)return null;
    const rect=this.viewport.getBoundingClientRect(),x=rect.left-canvas.left,y=rect.top-canvas.top;
    const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(canvas.width,x+rect.width),bottom=Math.min(canvas.height,y+rect.height);
    if(rect.width<=0||rect.height<=0||right<=left||bottom<=top)return null;
    const aspect=rect.width/rect.height;
    this.camera.left=-this.span*aspect/2;this.camera.right=this.span*aspect/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;this.camera.updateProjectionMatrix();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    try{
      // Three multiplies these logical pixels by its pixel ratio internally.
      renderer.setViewport(new THREE.Vector4(x,canvas.height-y-rect.height,rect.width,rect.height));
      renderer.setScissor(new THREE.Vector4(left,canvas.height-bottom,right-left,bottom-top));renderer.setScissorTest(true);
      renderer.autoClear=false;renderer.setClearColor(this.scene.background as THREE.Color,1);renderer.clear(true,true,true);
      renderer.render(this.scene,this.camera);
    }finally{
      renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(color,alpha);renderer.autoClear=autoClear;
    }
    return {x:left,y:top,width:right-left,height:bottom-top};
  }
  dispose(){this.clear();this.scene.clear();}
}
