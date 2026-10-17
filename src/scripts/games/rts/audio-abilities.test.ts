import {afterEach,describe,expect,it,vi} from 'vitest';
import {ABILITY_CUES,ABILITY_VOICE_LIMIT,CUE_INTERVAL,cuePriority,soundLayers,type AudioCue} from './audio-score';
import {RtsAudio} from './audio';
import {VisibleAudioCues} from './ui';
import {createGame} from './simulation';
import {addUnit} from './state';
import {getTeamView,updateVisibility} from './visibility';
import {issueCommand} from './commands';
import {stepCombat} from './combat';
import {heroProgress} from './state';
import type {SkillId} from './catalog';

const NEW_SKILLS=['sunburst','radiance','daybreak','volley','sprint','mark'] as const;
const ABILITIES=[...NEW_SKILLS,'blast'] as const;

describe('hero and mage ability sound design',()=>{
  it('gives every preview ability its own original synthesized cue',()=>{
    const signatures=new Set<string>();
    for(const ability of ABILITIES){
      const cue=ABILITY_CUES[ability];expect(cue,ability).toBeDefined();
      const layers=soundLayers(cue!);expect(layers.length,ability).toBeGreaterThanOrEqual(3);expect(layers.length,ability).toBeLessThanOrEqual(12);
      for(const l of layers){
        expect(['sine','triangle','noise']).toContain(l.wave);
        for(const v of [l.frequency,l.endFrequency??l.frequency,l.offset,l.duration,l.attack,l.gain])expect(Number.isFinite(v),ability).toBe(true);
        expect(l.gain,ability).toBeGreaterThan(0);expect(l.gain,ability).toBeLessThanOrEqual(.05);expect(l.offset+l.duration,ability).toBeLessThanOrEqual(1.2);
      }
      signatures.add(JSON.stringify(layers));
    }
    // Distinct from each other and from the generic spell / heal / attack cues.
    for(const generic of ['spell','heal','attack','banner'] as const)signatures.add(JSON.stringify(soundLayers(generic)));
    expect(signatures.size).toBe(ABILITIES.length+4);
  });
  it('keeps the shipped commander skills on their existing cues',()=>{
    expect(ABILITY_CUES.cleave).toBeUndefined();expect(ABILITY_CUES.mend).toBeUndefined();expect(ABILITY_CUES.banner).toBeUndefined();
  });
  it('rate-limits every ability cue so a mass cast cannot machine-gun one sound',()=>{
    for(const ability of ABILITIES){const cue=ABILITY_CUES[ability]!;expect(CUE_INTERVAL[cue],ability).toBeGreaterThanOrEqual(.25);expect(cuePriority(cue)).toBe(1);}
  });
});

const parameter=()=>({setValueAtTime:()=>{},linearRampToValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}});
class CountingDevice {
  static sources=0;
  state='running';currentTime=1;sampleRate=48000;destination={};
  createGain(){return {gain:parameter(),connect:()=>{},disconnect:()=>{}};}
  createDynamicsCompressor(){return {threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),connect:()=>{},disconnect:()=>{}};}
  createBuffer(_c:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
  createBiquadFilter(){return {type:'bandpass',frequency:parameter(),Q:parameter(),connect:()=>{},disconnect:()=>{}};}
  createOscillator(){CountingDevice.sources++;return {type:'sine',frequency:parameter(),connect:()=>{},start:()=>{},stop:()=>{},disconnect:()=>{},onended:null};}
  createBufferSource(){CountingDevice.sources++;return {buffer:null,connect:()=>{},start:()=>{},stop:()=>{},disconnect:()=>{},onended:null};}
  resume(){return Promise.resolve();}close(){return Promise.resolve();}
}
describe('ability cue mixing',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  const started=()=>{CountingDevice.sources=0;vi.stubGlobal('AudioContext',CountingDevice);const audio=new RtsAudio();audio.start();return audio;};
  it('plays an ability cue and respects mute',()=>{
    const audio=started();audio.play('sunburst');expect(CountingDevice.sources).toBeGreaterThan(0);audio.dispose();
    const muted=started();muted.setVolume(0);muted.play('sunburst');expect(CountingDevice.sources).toBe(0);muted.dispose();
  });
  it('caps simultaneous ability voices so many heroes casting at once stay under a fixed budget',()=>{
    const audio=started();let voices=0;
    for(const ability of ABILITIES){const before=CountingDevice.sources;audio.play(ABILITY_CUES[ability]!);if(CountingDevice.sources>before)voices++;}
    expect(voices).toBe(ABILITY_VOICE_LIMIT);
    // Warnings and orders are never starved by ability sounds.
    const before=CountingDevice.sources;audio.play('warning');expect(CountingDevice.sources).toBeGreaterThan(before);audio.dispose();
  });
  it('throttles a repeated ability cue within its interval',()=>{
    const audio=started();audio.play('volley');const once=CountingDevice.sources;audio.play('volley');expect(CountingDevice.sources).toBe(once);audio.dispose();
  });
});

describe('visible ability cue dispatch',()=>{
  function setup(){const state=createGame('river',17,'normal',{rosterPreview:true});state.aiEnabled=[false,false];const cues=new VisibleAudioCues();return {state,read:()=>cues.observe(getTeamView(state,0))};}
  const learn=(state:ReturnType<typeof createGame>,kind:'sage'|'ranger-captain',skill:SkillId)=>{const h=heroProgress(state.teams[0],kind);h.level=3;h.skills[skill]=1;};
  it.each(NEW_SKILLS)('sounds %s through the real hero cast',skill=>{
    const {state,read}=setup(),kind=['sunburst','radiance','daybreak'].includes(skill)?'sage':'ranger-captain';learn(state,kind,skill);
    const hero=addUnit(state,0,kind,state.map.spawns[0]),ally=addUnit(state,0,'guard',{x:hero.x+1,z:hero.z});ally.hp-=80;
    const foe=addUnit(state,1,'guard',{x:hero.x+4,z:hero.z});updateVisibility(state);read();
    expect(issueCommand(state,0,{type:'cast',heroId:hero.id,skill,targetId:foe.id,position:{x:foe.x,z:foe.z}})).toEqual({ok:true});
    hero.animation='idle';const cues=read();expect(cues).toContain(ABILITY_CUES[skill]);expect(read()).toEqual([]);
  });
  it('sounds the mage autocast blast once per cast',()=>{
    const {state,read}=setup(),mage=addUnit(state,0,'mage',state.map.spawns[0]);
    for(let i=0;i<3;i++)addUnit(state,1,'guard',{x:mage.x+4,z:mage.z+i*.5});mage.order={type:'hold'};updateVisibility(state);read();
    stepCombat(state,.05);expect(mage.castCue?.kind).toBe('blast');const cues=read();expect(cues).toContain('blast');expect(cues).not.toContain('attack');expect(read()).not.toContain('blast');
  });
  it('does not replay an enemy cast that happened in fog',()=>{
    const {state,read}=setup(),enemy=addUnit(state,1,'sage',{x:120,z:120});updateVisibility(state);read();
    enemy.castCue={kind:'sunburst',sequence:3,startedAt:state.time};expect(read()).toEqual([]);
    enemy.x=state.map.spawns[0].x+3;enemy.z=state.map.spawns[0].z;updateVisibility(state);expect(read()).not.toContain('sunburst');
  });
  it('treats ranger arrows as projectiles and caster attacks as spells, not sword swings',()=>{
    const {state,read}=setup(),ranger=addUnit(state,0,'ranger',state.map.spawns[0]),sage=addUnit(state,0,'sage',{x:state.map.spawns[0].x+1,z:state.map.spawns[0].z});updateVisibility(state);read();
    ranger.animation='attack';ranger.attackCue={sequence:1,startedAt:state.time,targetId:99};
    sage.animation='attack';sage.attackCue={sequence:1,startedAt:state.time,targetId:99};
    const cues=read() as AudioCue[];expect(cues).not.toContain('attack');expect(cues).toContain('spell');
  });
});
