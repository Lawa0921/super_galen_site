import {afterEach,describe,expect,it,vi} from 'vitest';
import {RtsAudio} from './audio';

const parameter=()=>({setValueAtTime:(_value:number)=>{},linearRampToValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}});
class AudioDevice {
  state='running';currentTime=1;sampleRate=48000;destination={};
  createGain(){return {gain:parameter(),connect:()=>{},disconnect:()=>{}};}
  createDynamicsCompressor(){return {threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),connect:()=>{},disconnect:()=>{}};}
  createBuffer(_channels:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
  createOscillator(){return {type:'sine',frequency:parameter(),connect:()=>{},start:()=>{},stop:()=>{},disconnect:()=>{},onended:null};}
  resume(){return Promise.resolve();}close(){return Promise.resolve();}
}

describe('battle audio lifecycle',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('keeps game audio optional when no browser AudioContext exists',()=>{
    vi.stubGlobal('AudioContext',undefined);vi.stubGlobal('webkitAudioContext',undefined);
    const audio=new RtsAudio();expect(()=>audio.start()).not.toThrow();
    expect(()=>audio.play('warning')).not.toThrow();expect(()=>audio.setVolume(0)).not.toThrow();expect(()=>audio.dispose()).not.toThrow();
  });
  it('recovers after an AudioContext constructor failure',()=>{
    vi.stubGlobal('AudioContext',class {constructor(){throw Error('device unavailable');}});
    const audio=new RtsAudio();expect(()=>audio.start()).not.toThrow();expect(()=>audio.start()).not.toThrow();
    expect(()=>audio.play('victory')).not.toThrow();audio.dispose();
  });
  it('contains a rejected resume without an unhandled rejection',async()=>{
    const unhandled:unknown[]=[];const onUnhandled=(reason:unknown)=>unhandled.push(reason);process.on('unhandledRejection',onUnhandled);
    vi.stubGlobal('AudioContext',class extends AudioDevice {
      resume(){return Promise.reject(Error('autoplay denied'));}close(){return Promise.resolve();}
    });
    try{const audio=new RtsAudio();expect(()=>audio.start()).not.toThrow();await new Promise(resolve=>setTimeout(resolve,10));expect(unhandled).toEqual([]);audio.dispose();}
    finally{process.off('unhandledRejection',onUnhandled);}
  });
  it('uses a master gain, mutes at zero, and releases the old context before restart',()=>{
    const contexts:Array<{gain:{value:number};closed:boolean}>=[];
    vi.stubGlobal('AudioContext',class extends AudioDevice {
      state='running';currentTime=1;destination={};gain={value:1};closed=false;
      constructor(){super();contexts.push(this);}
      createGain(){return {gain:{...parameter(),setValueAtTime:(v:number)=>{this.gain.value=v;}},connect:()=>{},disconnect:()=>{}};}
      resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}
    });
    const audio=new RtsAudio();audio.start();audio.setVolume(0);expect(contexts[0]?.gain.value).toBe(0);
    audio.dispose();expect(contexts[0]?.closed).toBe(true);
    audio.start();expect(contexts).toHaveLength(2);expect(contexts[1]?.gain.value).toBe(0);
  });
  it('does not lose victory, draw or defeat cues when an order just played',()=>{
    let played=0;
    vi.stubGlobal('AudioContext',class extends AudioDevice {
      state='running';currentTime=1;destination={};
      createGain(){return {gain:parameter(),connect:()=>{},disconnect:()=>{}};}
      createOscillator(){played++;return super.createOscillator();}
      resume(){return Promise.resolve();}close(){return Promise.resolve();}
    });
    for(const result of ['victory','draw','defeat'] as const){
      const audio=new RtsAudio();audio.start();audio.play('order');const before=played;audio.play(result);expect(played).toBeGreaterThan(before);audio.dispose();
    }
  });
});
