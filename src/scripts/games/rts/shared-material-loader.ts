import {Texture,TextureLoader} from 'three';
/** Collapse `.`/`..` segments of a scheme-less path so `models/../x` and
 * `models/props/../../x` share one download (as the browser would resolve them). */
export function normalizeMaterialPath(url:string):string {
  if(/^[a-z][a-z0-9+.-]*:/i.test(url)||url.startsWith('//'))return url;
  const out:string[]=[];for(const part of url.split('/')){if(part==='.')continue;if(part==='..'&&out.length>1&&out[out.length-1]!=='..'){out.pop();continue;}out.push(part);}
  return out.join('/');
}
interface MaterialRequest {source:Texture<HTMLImageElement>;ready:Promise<Texture<HTMLImageElement>>;disposed:boolean}

/** One download/decode per original surface URL in this ModelLibrary.
 * GLTFs receive separate Texture wrappers so sampler/color-space adjustments
 * cannot affect another material. Three's shared Source also shares GPU storage
 * when sampler parameters match. No process-wide THREE.Cache state is changed.
 */
export class SharedMaterialLoader extends TextureLoader {
  private requests=new Map<string,MaterialRequest>();
  private release(entry:MaterialRequest):void {if(!entry.disposed){entry.disposed=true;entry.source.dispose();}}
  override load(url:string,onLoad?:(texture:Texture<HTMLImageElement>)=>void,onProgress?:(event:ProgressEvent)=>void,onError?:(error:unknown)=>void):Texture<HTMLImageElement> {
    url=normalizeMaterialPath(url);let entry=this.requests.get(url);
    if(!entry){
      let resolve!:(texture:Texture<HTMLImageElement>)=>void,reject!:(error:unknown)=>void;
      const ready=new Promise<Texture<HTMLImageElement>>((done,fail)=>{resolve=done;reject=fail;});
      entry={source:super.load(url,resolve,onProgress,reject),ready,disposed:false};
      this.requests.set(url,entry);const current=entry;
      // Keep the rejected promise until the library clears the failed batch.
      // A later GLTF in that same batch must not download the broken URL again.
      // An explicit retry uses a fresh batch after ModelLibrary.dispose().
      void ready.catch(()=>this.release(current));
    }
    void entry.ready.then(texture=>{onLoad?.(texture.clone());},error=>{onError?.(error);});
    return entry.source;
  }
  clear():void {
    for(const entry of this.requests.values())this.release(entry);
    this.requests.clear();
  }
}
