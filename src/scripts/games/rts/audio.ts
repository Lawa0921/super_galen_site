import {ABILITY_CUE_SET,ABILITY_VOICE_LIMIT,CUE_INTERVAL,RESULT_CUES,cuePriority,soundLayers,type AudioCue,type SoundLayer} from './audio-score';

interface Voice {priority:number;ability?:boolean;endsAt:number;sources:AudioScheduledSourceNode[];nodes:AudioNode[];release():void}

/** Shared original noise exciter; filtering gives wood, metal and stone their own attack. */
function noiseBuffer(context:BaseAudioContext):AudioBuffer {
  const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.6),context.sampleRate),data=buffer.getChannelData(0);
  let seed=0x526b12;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/0x80000000-1;}
  return buffer;
}

/** Also used with OfflineAudioContext for repeatable waveform QA. */
export function scheduleSound(context:BaseAudioContext,destination:AudioNode,layers:SoundLayer[],start=context.currentTime,noise?:AudioBuffer):Voice {
  const voice:Voice={priority:0,endsAt:start,sources:[],nodes:[],release(){
    for(const source of voice.sources){source.onended=null;try{source.stop();}catch{/* Already ended. */}}
    for(const node of voice.nodes)try{node.disconnect();}catch{/* Device was removed. */}
    voice.sources.length=0;voice.nodes.length=0;
  }};
  let remaining=layers.length;
  try{
    for(const layer of layers){
      const source=layer.wave==='noise'?context.createBufferSource():context.createOscillator();voice.sources.push(source);voice.nodes.push(source);
      const gain=context.createGain();voice.nodes.push(gain);let outlet:AudioNode=source;
      const begin=start+layer.offset,end=begin+layer.duration;voice.endsAt=Math.max(voice.endsAt,end+.015);
      if(layer.wave==='noise'){
        (source as AudioBufferSourceNode).buffer=noise??noiseBuffer(context);
        const filter=context.createBiquadFilter();voice.nodes.push(filter);filter.type=layer.filter??'bandpass';filter.frequency.setValueAtTime(layer.frequency,begin);filter.Q.setValueAtTime(layer.q??.7,begin);source.connect(filter);outlet=filter;
      }else{
        const oscillator=source as OscillatorNode;oscillator.type=layer.wave;oscillator.frequency.setValueAtTime(layer.frequency,begin);oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequency??layer.frequency,end);
      }
      outlet.connect(gain);gain.connect(destination);
      gain.gain.setValueAtTime(.00001,begin);gain.gain.linearRampToValueAtTime(layer.gain,begin+layer.attack);gain.gain.exponentialRampToValueAtTime(.00001,end);gain.gain.linearRampToValueAtTime(0,end+.01);
      source.onended=()=>{if(--remaining===0)voice.release();};source.start(begin);source.stop(end+.015);
    }
    return voice;
  }catch(error){voice.release();throw error;}
}

/** User-gesture-started sound mix, with per-cue throttling and a fixed voice budget. */
export class RtsAudio {
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private volume=.7;
  private last=new Map<AudioCue,number>();
  private variations=new Map<AudioCue,number>();
  private voices:Voice[]=[];
  private noise:AudioBuffer|null=null;
  private compressor:DynamicsCompressorNode|null=null;
  private close(context:AudioContext){try{void Promise.resolve(context.close()).catch(()=>{});}catch{/* Audio cleanup must not block the game. */}}
  start(){
    if(!this.ctx){
      const ctor=globalThis.AudioContext??(globalThis as typeof globalThis & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(!ctor)return;
      let context:AudioContext|null=null;
      try{
        context=new ctor();const master=context.createGain(),compressor=context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-10,context.currentTime);compressor.knee.setValueAtTime(12,context.currentTime);compressor.ratio.setValueAtTime(5,context.currentTime);compressor.attack.setValueAtTime(.003,context.currentTime);compressor.release.setValueAtTime(.12,context.currentTime);
        master.connect(compressor);compressor.connect(context.destination);master.gain.setValueAtTime(this.volume,context.currentTime);
        const noise=noiseBuffer(context);this.ctx=context;this.master=master;this.compressor=compressor;this.noise=noise;this.last.clear();
      }
      catch{if(context)this.close(context);return;}
    }
    try{void Promise.resolve(this.ctx.resume()).catch(()=>{});}catch{/* Audio is optional. */}
  }
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));if(this.ctx&&this.master)try{this.master.gain.setValueAtTime(this.volume,this.ctx.currentTime);}catch{this.dispose();}}
  play(kind:AudioCue){
    const c=this.ctx;if(!c||c.state!=='running'||this.volume===0)return;const now=c.currentTime;
    if(now-(this.last.get(kind)??-Infinity)<CUE_INTERVAL[kind])return;
    this.voices=this.voices.filter(voice=>{if(voice.endsAt<=now){voice.release();return false;}return voice.sources.length>0;});
    const variation=this.variations.get(kind)??0,layers=soundLayers(kind,variation),priority=cuePriority(kind);
    // Result fanfares clear ordinary battlefield sounds. A large army cannot
    // consume unbounded nodes or suppress warnings, orders and match results.
    // Ability voices share a small budget: a mass cast is heard, never stacked loud.
    if(ABILITY_CUE_SET.has(kind)&&this.voices.filter(voice=>voice.ability).length>=ABILITY_VOICE_LIMIT)return;
    if(RESULT_CUES.has(kind)){for(const voice of this.voices)voice.release();this.voices=[];}
    while(this.voices.length>=12||this.voices.reduce((n,v)=>n+v.sources.length,0)+layers.length>64){
      const index=this.voices.findIndex(voice=>voice.priority<=priority);if(index<0)return;
      this.voices[index].release();this.voices.splice(index,1);
    }
    try{const voice=scheduleSound(c,this.master!,layers,now,this.noise!);voice.priority=priority;voice.ability=ABILITY_CUE_SET.has(kind);this.voices.push(voice);this.last.set(kind,now);this.variations.set(kind,variation+1);}
    catch{/* Loss of the audio device must never interrupt simulation or input. */}
  }
  dispose(){for(const voice of this.voices)voice.release();this.voices=[];this.master?.disconnect();this.compressor?.disconnect();if(this.ctx)this.close(this.ctx);this.ctx=null;this.master=null;this.compressor=null;this.noise=null;this.last.clear();this.variations.clear();}
}
