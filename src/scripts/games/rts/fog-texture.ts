import {groundFrame} from './maps';
/** Returns whether any of the game's fog alpha values changed. The texture spans the ground frame at one texel per cell. */
export function updateFogAlpha(data:Uint8Array,visible:Uint8Array,explored:Uint8Array,size:{width:number;height:number}):boolean {
  let changed=false;const {margin,width:stride,height}=groundFrame(size),W=size.width;
  for(let z=0;z<size.height;z++)for(let x=0;x<W;x++){const source=z*W+x,dest=((height-margin-1-z)*stride+margin+x)*4;
    const alpha=visible[source]?0:explored[source]?150:248;
    if(data[dest+3]!==alpha){data[dest+3]=alpha;changed=true;}
  }
  return changed;
}
/** Rendering runs every display frame but TeamView snapshots change only on simulation
 * ticks. Their arrays are fresh, immutable copies per tick, so a repeated pair is skipped
 * instead of rescanning every map cell; returns whether the texture needs an upload. */
export class FogTextureSync {
  private visible?:Uint8Array;
  private explored?:Uint8Array;
  constructor(private data:Uint8Array,private size:{width:number;height:number}){}
  update(visible:Uint8Array,explored:Uint8Array):boolean {
    if(visible===this.visible&&explored===this.explored)return false;
    this.visible=visible;this.explored=explored;return updateFogAlpha(this.data,visible,explored,this.size);
  }
}
