/** Cosmetic reaction budgets; never change combat orders or attack contact time. */
export const HURT_INTERVAL=.6;
export const HURT_WINDOW=.35;
export const HURT_FADE=.1;
export interface AnimationCue {sequence:number;elapsed:number}

export function hurtPlayback(base:string,cue:AnimationCue|undefined,duration:number):AnimationCue|undefined {
  if(!['idle','walk','work','mine','chop','build'].includes(base))return undefined;
  if(!cue||!Number.isFinite(cue.elapsed)||cue.elapsed<0||cue.elapsed>=Math.min(duration,HURT_WINDOW))return undefined;
  return cue;
}
