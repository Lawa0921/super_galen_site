import type {ResourceNode} from './types';
/** Knowledge persists only after the resource has actually been observed. */
export class ResourceMemory {
  private exhausted=new Set<string>();
  observe(resources:Pick<ResourceNode,'id'|'remaining'>[]):void {for(const resource of resources)if(resource.remaining<=0)this.exhausted.add(resource.id);}
  isExhausted(id:string):boolean {return this.exhausted.has(id);}
}
