export interface ConfirmedFrameSample {
  frame: number;
  state: string;
}

export function compareConfirmedFrameSamples(
  host: readonly ConfirmedFrameSample[],
  guest: readonly ConfirmedFrameSample[],
): { frames: number[]; latestFrame: number } {
  const index = (samples: readonly ConfirmedFrameSample[]) => {
    const states = new Map<number, string>();
    for (const sample of samples) {
      if (!Number.isSafeInteger(sample.frame) || sample.frame < 0 || typeof sample.state !== 'string' || !sample.state) {
        throw new Error('Invalid confirmed-frame sample');
      }
      if (states.has(sample.frame) && states.get(sample.frame) !== sample.state) {
        throw new Error(`Conflicting samples at confirmed frame ${sample.frame}`);
      }
      states.set(sample.frame, sample.state);
    }
    return states;
  };
  const hostStates = index(host);
  const guestStates = index(guest);
  const frames = [...hostStates.keys()].filter(frame => guestStates.has(frame)).sort((a, b) => a - b);
  if (frames.length < 2) throw new Error('Need at least two shared confirmed frames to verify continued synchronization');
  for (const frame of frames) {
    if (hostStates.get(frame) !== guestStates.get(frame)) throw new Error(`State differs at confirmed frame ${frame}`);
  }
  return { frames, latestFrame: frames[frames.length - 1] };
}
