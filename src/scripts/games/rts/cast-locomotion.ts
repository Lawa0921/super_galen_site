import {AnimationClip,LoopOnce,LoopRepeat,PropertyBinding,type AnimationAction,type AnimationMixer} from 'three';
import {CAST_WINDOW} from './unit-actions';

const LOWER=new Set(['Root','Pelvis','Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R']);
const parts=new WeakMap<AnimationClip,{lower:AnimationClip;upper:AnimationClip}|null>();
const FADE=.15;
function split(clip:AnimationClip){
  if(parts.has(clip))return parts.get(clip);
  const lower=clip.tracks.filter(t=>LOWER.has(PropertyBinding.parseTrackName(t.name).nodeName));
  const upper=clip.tracks.filter(t=>!LOWER.has(PropertyBinding.parseTrackName(t.name).nodeName));
  const result=lower.length&&upper.length?{lower:new AnimationClip(clip.name,clip.duration,lower),upper:new AnimationClip(clip.name,clip.duration,upper)}:null;
  parts.set(clip,result);return result;
}

/** Disjoint bone tracks keep locomotion independent of simulation-timed spells.
 * Entry WalkUpper is frozen at its entry phase, so equal cue ages cannot drift
 * the upper body even while WalkLower advances with the rendered movement.
 */
export class CastLocomotion {
  private exitAge?:number;
  private constructor(readonly clip:AnimationClip,readonly sequence:number,readonly lower:AnimationAction,readonly upper:AnimationAction,private entry:AnimationAction,private blendEntry:boolean){}
  static create(mixer:AnimationMixer,clip:AnimationClip,walk:AnimationClip,sequence:number,phase:number,blendEntry:boolean):CastLocomotion|undefined {
    const spell=split(clip),stride=split(walk);if(!spell||!stride)return;
    mixer.stopAllAction();
    const lower=mixer.clipAction(stride.lower).reset().setLoop(LoopRepeat,Infinity).setEffectiveWeight(1).play();lower.time=phase;
    const entry=mixer.clipAction(stride.upper).reset().setLoop(LoopRepeat,Infinity).play();entry.time=phase;entry.paused=true;
    const upper=mixer.clipAction(spell.upper).reset().setLoop(LoopOnce,1).setEffectiveWeight(1).play();upper.paused=true;upper.clampWhenFinished=true;
    return new CastLocomotion(clip,sequence,lower,upper,entry,blendEntry);
  }
  get exiting(){return this.exitAge!==undefined;}
  update(elapsed:number,timeScale:number){
    const alpha=this.blendEntry?Math.min(1,Math.max(0,elapsed/FADE)):1;
    this.lower.setEffectiveTimeScale(timeScale);
    this.upper.time=Math.min(this.clip.duration,Math.max(0,elapsed*this.clip.duration/CAST_WINDOW));
    this.upper.setEffectiveWeight(alpha);this.entry.setEffectiveWeight(1-alpha);
  }
  fadeToWalk(next:AnimationAction){
    next.reset().setLoop(LoopRepeat,Infinity).setEffectiveWeight(1).play();next.time=this.lower.time;next.fadeIn(FADE);
    this.lower.fadeOut(FADE);this.upper.fadeOut(FADE);this.entry.fadeOut(FADE);this.exitAge=0;
  }
  advanceExit(dt:number,timeScale:number):boolean {
    this.lower.setEffectiveTimeScale(timeScale);
    this.exitAge=(this.exitAge??0)+dt;
    return this.exitAge>=FADE;
  }
  stop(){this.lower.stop();this.upper.stop();this.entry.stop();}
}
