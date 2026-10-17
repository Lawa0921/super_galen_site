import {describe,it,expect} from 'vitest';
import {Texture,DataTexture} from 'three';
import {layeredGroundMaterial} from './terrain';
import {groundFrame} from './maps';

const FRAME=groundFrame({width:192,height:192});

describe('layered ground surface',()=>{
  it('uses the existing color source for relief without loading a second terrain atlas',()=>{
    const meadow=new Texture(),layers=[new Texture(),new Texture(),new Texture(),new Texture()] as [Texture,Texture,Texture,Texture];
    const material=layeredGroundMaterial(meadow,layers,new DataTexture(),FRAME);
    expect(material.bumpMap).toBe(meadow);
    expect(material.bumpScale).toBeGreaterThan(0);
    expect(material.normalMap).toBeNull();
    material.dispose();
  });
  it('can compare the flat surface without accidentally sharing the detailed shader program',()=>{
    const meadow=new Texture(),layers=[meadow,meadow,meadow,meadow] as [Texture,Texture,Texture,Texture],mask=new DataTexture();
    const detailed=layeredGroundMaterial(meadow,layers,mask,FRAME,true);
    const flat=layeredGroundMaterial(meadow,layers,mask,FRAME,true,false);
    expect(flat.bumpMap).toBeNull();
    expect(flat.customProgramCacheKey()).not.toBe(detailed.customProgramCacheKey());
    detailed.dispose();flat.dispose();
  });
});
