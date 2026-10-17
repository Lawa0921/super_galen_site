import type { ConfirmedFrameSample } from './confirmed-frame-samples';
import type { TetrisMatch } from '../../src/scripts/games/tetris/engine/match';

export interface MatchSnapshot {
  a: ReturnType<TetrisMatch['a']['getState']>;
  b: ReturnType<TetrisMatch['b']['getState']>;
  phase: TetrisMatch['phase'];
  winner: TetrisMatch['winner'];
  pendingA: number;
  pendingB: number;
}

// Self-contained so Playwright can serialize this function into each page.
export async function observeTetrisFrames(durationMs: number): Promise<ConfirmedFrameSample[]> {
  const dbg = (window as unknown as { __tetrisDebug: { match: TetrisMatch; lockstep: { confirmedFrame: number } } }).__tetrisDebug;
  const match = dbg.match;
  const originalStep = match.step;
  const originalDescriptor = Object.getOwnPropertyDescriptor(match, 'step');
  const samples: ConfirmedFrameSample[] = [];
  return await new Promise<ConfirmedFrameSample[]>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      if (match.step === recordingStep) {
        if (originalDescriptor) Object.defineProperty(match, 'step', originalDescriptor);
        else Reflect.deleteProperty(match, 'step');
      }
    };
    const record = (frame: number) => {
      if (samples.length === 512) throw new Error('Confirmed-frame capture exceeded its bounded capacity');
      const snapshot: MatchSnapshot = { a: match.a.getState(), b: match.b.getState(),
        phase: match.phase, winner: match.winner, pendingA: match.pendingGarbage('A'), pendingB: match.pendingGarbage('B') };
      samples.push({ frame, state: JSON.stringify(snapshot) });
    };
    function recordingStep(this: TetrisMatch, dt: number): void {
      try {
        originalStep.call(this, dt);
      } catch (error) {
        cleanup();
        reject(error);
        throw error;
      }
      try {
        // Lockstep increments simFrame immediately after match.step returns.
        record(dbg.lockstep.confirmedFrame + 1);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
    match.step = recordingStep;
    timer = window.setTimeout(() => { cleanup(); resolve(samples); }, durationMs);
    try { record(dbg.lockstep.confirmedFrame); }
    catch (error) { cleanup(); reject(error); }
  });
}
