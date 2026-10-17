import {describe,it,expect,vi,afterEach} from 'vitest';
import {Texture,TextureLoader,Cache} from 'three';
import {SharedMaterialLoader} from './shared-material-loader';

afterEach(()=>vi.restoreAllMocks());
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function network(){
  const requests:Array<{texture:Texture<HTMLImageElement>;ok:(texture:Texture<HTMLImageElement>)=>void;fail:(error:unknown)=>void}>=[];
  const spy=vi.spyOn(TextureLoader.prototype,'load').mockImplementation((_url,ok,_progress,fail)=>{
    const texture=new Texture<HTMLImageElement>();requests.push({texture,ok:ok!,fail:fail!});return texture;
  });
  return {requests,spy};
}

describe('library-scoped original material downloads',()=>{
  it('downloads concurrent and later copies once while keeping per-material sampler state independent',async()=>{
    const {requests,spy}=network(),loader=new SharedMaterialLoader(),a=vi.fn(),b=vi.fn(),c=vi.fn();
    loader.load('/stone.png',a);loader.load('/stone.png',b);expect(spy).toHaveBeenCalledTimes(1);
    requests[0].ok(requests[0].texture);await tick();loader.load('/stone.png',c);await tick();
    expect(spy).toHaveBeenCalledTimes(1);expect(a).toHaveBeenCalledOnce();expect(b).toHaveBeenCalledOnce();
    const first=a.mock.calls[0][0] as Texture,second=b.mock.calls[0][0] as Texture;
    expect(first).not.toBe(second);expect(first.source).toBe(second.source);first.flipY=false;expect(second.flipY).toBe(true);
    expect(c.mock.calls[0][0].source).toBe(first.source);expect(Cache.enabled).toBe(false);loader.clear();
  });
  it('treats differently nested relative paths to the same file as one download (rubble props share building surfaces)',async()=>{
    const {requests,spy}=network(),loader=new SharedMaterialLoader(),a=vi.fn(),b=vi.fn();
    loader.load('/assets/games/rts/models/../materials/detail-v1/ashlar-color.jpg',a);
    loader.load('/assets/games/rts/models/props/../../materials/detail-v1/ashlar-color.jpg',b);
    expect(spy).toHaveBeenCalledTimes(1);expect(spy.mock.calls[0][0]).toBe('/assets/games/rts/materials/detail-v1/ashlar-color.jpg');
    requests[0].ok(requests[0].texture);await tick();expect(a).toHaveBeenCalledOnce();expect(b).toHaveBeenCalledOnce();loader.clear();
  });
  it('latches a failed URL for the current batch and permits retry only after clearing that batch',async()=>{
    const {requests,spy}=network(),loader=new SharedMaterialLoader(),a=vi.fn(),b=vi.fn(),late=vi.fn();
    loader.load('/stone.png',undefined,undefined,a);loader.load('/stone.png',undefined,undefined,b);
    const error=new Error('missing original material');requests[0].fail(error);await tick();
    expect(a).toHaveBeenCalledWith(error);expect(b).toHaveBeenCalledWith(error);
    loader.load('/stone.png',undefined,undefined,late);await tick();
    expect(spy).toHaveBeenCalledTimes(1);expect(late).toHaveBeenCalledWith(error);
    loader.clear();const recovered=vi.fn();loader.load('/stone.png',recovered);
    expect(spy).toHaveBeenCalledTimes(2);requests[1].ok(requests[1].texture);await tick();
    expect(recovered).toHaveBeenCalledOnce();loader.clear();
  });
  it('clears its own source textures without disposing material clones or poisoning a newer load with an old failure',async()=>{
    const {requests,spy}=network(),loader=new SharedMaterialLoader();
    loader.load('/stone.png');const sourceDispose=vi.spyOn(requests[0].texture,'dispose');loader.clear();expect(sourceDispose).toHaveBeenCalledOnce();
    const callback=vi.fn();loader.load('/stone.png',callback);requests[1].ok(requests[1].texture);await tick();
    requests[0].fail(new Error('obsolete'));await tick();loader.load('/stone.png');await tick();expect(spy).toHaveBeenCalledTimes(2);expect(sourceDispose).toHaveBeenCalledOnce();
    const cloneDispose=vi.spyOn(callback.mock.calls[0][0] as Texture,'dispose');loader.clear();expect(cloneDispose).not.toHaveBeenCalled();
    loader.load('/stone.png');expect(spy).toHaveBeenCalledTimes(3);loader.clear();
  });
});
