import {afterEach,describe,expect,it,vi} from 'vitest';
import {RtsAudio} from './audio';
import type {AudioCue} from './audio-score';

class Param {
  value=1;
  setValueAtTime(value:number){this.value=value;}
  exponentialRampToValueAtTime(){}
  linearRampToValueAtTime(){}
  cancelScheduledValues(){}
}
class Node {
  gain=new Param();frequency=new Param();Q=new Param();
  threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();
  disconnected=false;
  connect(){}
  disconnect(){this.disconnected=true;}
}
class Source extends Node {
  type='sine';onended:(()=>void)|null=null;started=false;stopped=false;
  start(){this.started=true;}
  stop(){this.stopped=true;}
  end(){this.onended?.();}
}
class Context {
  state='running';currentTime=1;sampleRate=48000;destination=new Node();closed=false;
  sources:Source[]=[];nodes:Node[]=[];
  createGain(){const node=new Node();this.nodes.push(node);return node;}
  createBiquadFilter(){return this.createGain();}
  createDynamicsCompressor(){return this.createGain();}
  createBuffer(_channels:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
  createOscillator(){const source=new Source();this.sources.push(source);return source;}
  createBufferSource(){return this.createOscillator();}
  resume(){return Promise.resolve();}
  close(){this.closed=true;return Promise.resolve();}
}
function browser(){
  const contexts:Context[]=[];
  vi.stubGlobal('AudioContext',class extends Context {constructor(){super();contexts.push(this);}});
  const audio=new RtsAudio();audio.start();return {audio,contexts,context:contexts[0]};
}

describe('authored battlefield sound mix',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('does not allocate muted or suspended voices, and preserves mute on restart',()=>{
    const {audio,context,contexts}=browser();audio.setVolume(0);audio.play('attack');expect(context.sources).toHaveLength(0);
    audio.dispose();expect(context.closed).toBe(true);audio.start();audio.play('victory');expect(contexts[1].sources).toHaveLength(0);
    audio.setVolume(.6);contexts[1].state='suspended';audio.play('warning');expect(contexts[1].sources).toHaveLength(0);audio.dispose();
  });
  it('lets a battle hit sound alongside an order but coalesces repeated identical events',()=>{
    const {audio,context}=browser();audio.play('order');const before=context.sources.length;audio.play('attack');
    expect(context.sources.length).toBeGreaterThan(before);const after=context.sources.length;
    audio.play('attack');expect(context.sources).toHaveLength(after);audio.dispose();
  });
  it('does not lose victory, draw or defeat cues when an order just played',()=>{
    for(const result of ['victory','draw','defeat'] as const){
      const {audio,context}=browser();audio.play('order');const before=context.sources.length;audio.play(result);
      expect(context.sources.length).toBeGreaterThan(before);audio.dispose();
    }
  });
  it('bounds simultaneous sources even in a sustained battle and releases every voice on dispose',()=>{
    const {audio,context}=browser();
    const cues:AudioCue[]=['order','gather','build','repair','attack','bolt','shell','impact','heal','complete','death','warning'];
    for(let i=0;i<300;i++){
      context.currentTime+=.005;audio.play(cues[i%cues.length]);
      expect(context.sources.filter(s=>!s.disconnected).length).toBeLessThanOrEqual(64);
    }
    expect(context.sources.length).toBeGreaterThan(64);
    const live=context.sources.filter(s=>!s.disconnected);expect(live.length).toBeGreaterThan(0);
    audio.dispose();expect(context.sources.every(s=>s.stopped&&s.disconnected)).toBe(true);
  });
  it('disconnects an ended layered voice and recovers from a device failure while scheduling',()=>{
    const {audio,context}=browser();audio.play('build');for(const source of context.sources)source.end();
    expect(context.sources.every(s=>s.disconnected)).toBe(true);
    context.currentTime+=1;vi.spyOn(context,'createOscillator').mockImplementation(()=>{throw Error('lost device');});
    expect(()=>audio.play('victory')).not.toThrow();expect(()=>audio.dispose()).not.toThrow();
  });
});
