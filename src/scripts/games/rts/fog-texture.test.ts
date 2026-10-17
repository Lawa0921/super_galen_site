import {describe,it,expect} from 'vitest';
import {updateFogAlpha,FogTextureSync} from './fog-texture';

/** The original 96 m grid keeps its 192² texel frame (48 m margin), so these pixel indices are unchanged. */
const SIZE={width:96,height:96};

describe('fog texture upload invalidation',()=>{
  it('preserves all pixels and skips upload for unchanged visibility snapshots',()=>{
    const data=new Uint8Array(192*192*4).fill(73),visible=new Uint8Array(96*96),explored=new Uint8Array(96*96);
    visible[0]=1;explored[95*96+95]=1;
    expect(updateFogAlpha(data,visible,explored,SIZE)).toBe(true);
    expect(data[(143*192+48)*4+3]).toBe(0);expect(data[(48*192+143)*4+3]).toBe(150);
    expect(data[(143*192+49)*4+3]).toBe(248);expect(data[0]).toBe(73);expect(data[3]).toBe(73);
    const before=data.slice();expect(updateFogAlpha(data,visible.slice(),explored.slice(),SIZE)).toBe(false);expect(data).toEqual(before);
  });
  it('uploads when sight is lost or exploration changes, including edge cells',()=>{
    const data=new Uint8Array(192*192*4),visible=new Uint8Array(96*96),explored=new Uint8Array(96*96);
    visible[0]=1;explored[0]=1;updateFogAlpha(data,visible,explored,SIZE);
    visible[0]=0;expect(updateFogAlpha(data,visible,explored,SIZE)).toBe(true);expect(data[(143*192+48)*4+3]).toBe(150);
    explored[95]=1;expect(updateFogAlpha(data,visible,explored,SIZE)).toBe(true);expect(data[(143*192+143)*4+3]).toBe(150);
    visible[95*96+95]=1;expect(updateFogAlpha(data,visible,explored,SIZE)).toBe(true);expect(data[(48*192+143)*4+3]).toBe(0);
  });
  it('scales the texel frame with the map: a 192 m grid writes a 384² texture with a 96 m margin',()=>{
    const data=new Uint8Array(384*384*4),visible=new Uint8Array(192*192),explored=new Uint8Array(192*192),size={width:192,height:192};
    visible[0]=1;explored[191*192+191]=1;explored[191]=1;
    expect(updateFogAlpha(data,visible,explored,size)).toBe(true);
    expect(data[(287*384+96)*4+3]).toBe(0);expect(data[(96*384+287)*4+3]).toBe(150);expect(data[(287*384+287)*4+3]).toBe(150);
    expect(data[(287*384+97)*4+3]).toBe(248);expect(data[(95*384+96)*4+3]).toBe(0);
  });
});

describe('fog texture sync per view snapshot',()=>{
  it('scans a new snapshot, and skips the full-map scan when the same snapshot renders again',()=>{
    const data=new Uint8Array(192*192*4),sync=new FogTextureSync(data,SIZE),visible=new Uint8Array(96*96),explored=new Uint8Array(96*96);
    visible[0]=1;explored[0]=1;
    expect(sync.update(visible,explored)).toBe(true);expect(data[(143*192+48)*4+3]).toBe(0);
    // TeamView arrays are immutable per-tick snapshots: a repeated pair cannot have changed.
    visible[0]=0;expect(sync.update(visible,explored)).toBe(false);expect(data[(143*192+48)*4+3]).toBe(0);
  });
  it('applies the next snapshot, including when only one of the two arrays is replaced',()=>{
    const data=new Uint8Array(192*192*4),sync=new FogTextureSync(data,SIZE),visible=new Uint8Array(96*96),explored=new Uint8Array(96*96);
    visible[0]=1;explored[0]=1;sync.update(visible,explored);
    const lost=new Uint8Array(96*96);expect(sync.update(lost,explored)).toBe(true);expect(data[(143*192+48)*4+3]).toBe(150);
    const wider=explored.slice();wider[95]=1;expect(sync.update(lost,wider)).toBe(true);expect(data[(143*192+143)*4+3]).toBe(150);
    expect(sync.update(lost.slice(),wider.slice())).toBe(false);
  });
});
