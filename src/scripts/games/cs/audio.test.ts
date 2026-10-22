import { afterEach, describe, expect, it, vi } from 'vitest';
import { CombatAudio, worldImpactCue, worldShotCue } from './audio';
import { createMatch, type Shot } from './engine';

const shot = (extra: Partial<Shot> = {}): Shot => ({ id: 1, round: 1, actor: 3, weapon: 'rifle', at: 0, x: -20, y: 1.58, z: 0, tx: 3, ty: 1.58, tz: 0, nx: -1, ny: 0, nz: 0, surface: 'stone', target: null, damage: 0, armorDamage: 0, killed: false, hit: false, head: false, ...extra });
const listener = () => ({ ...createMatch('attack').actors[0], x: 0, y: 0, z: 0, yaw: 0 });

describe('world shot acoustics', () => {
  it('muffles a source across a building, but not a clear street or a wall beyond the source', () => {
    const p = { ...listener(), x: -8 };
    expect(worldShotCue(shot({ x: 8 }), p, 0)).toMatchObject({ distance: 16, pan: 1, occluded: true });
    expect(worldShotCue(shot({ x: 8, z: 8 }), { ...p, z: 8 }, 0)?.occluded).toBe(false);
    expect(worldShotCue(shot({ x: -7 }), p, 0)?.occluded).toBe(false);
  });
  it('uses height and positive interior intersection rather than treating every wall as infinitely tall', () => {
    const p = { ...listener(), x: -8, y: 8 };
    expect(worldShotCue(shot({ x: 8, y: 9.58 }), p, 0)).toMatchObject({ distance: 16, occluded: false });
    expect(worldShotCue(shot({ x: 8, z: 4 }), { ...p, y: 0, z: 4 }, 0)?.occluded).toBe(false);
    expect(worldShotCue(shot({ x: 8, z: 3.9 }), { ...p, y: 0, z: 3.9 }, 0)?.occluded).toBe(true);
  });
  it('follows the current spectator position and orientation, including directly overhead sources', () => {
    const s = shot({ x: 8, z: 8 }), p = { ...listener(), x: 0, z: 8 };
    expect(worldShotCue(s, p, 0)?.pan).toBe(1);
    expect(worldShotCue(s, p, Math.PI)?.pan).toBeCloseTo(-1);
    expect(worldShotCue(s, { ...p, id: 1, x: 12 }, 0)?.pan).toBe(-1);
    expect(worldShotCue(shot({ x: 0, y: 11.58, z: 8 }), p, 0)).toMatchObject({ distance: 10, pan: 0, occluded: false });
    expect(worldShotCue(shot({ x: 0, z: 8 }), p, 0)).toMatchObject({ distance: 0, pan: 0, occluded: false });
    expect(worldShotCue(shot({ x: NaN }), p, 0)).toBeNull();
    expect(worldShotCue(s, p, Infinity)).toBeNull();
  });
});

describe('world impact listening position', () => {
  it('uses the impact endpoint, not the distant muzzle, and pans with the listener orientation', () => {
    const p = listener();
    expect(worldImpactCue(shot(), p, 0)).toMatchObject({ surface: 'stone', pan: 1 });
    expect(worldImpactCue(shot({ tx: -3 }), p, 0)?.pan).toBe(-1);
    expect(worldImpactCue(shot(), p, Math.PI)?.pan).toBeCloseTo(-1);
    expect(worldImpactCue(shot({ tx: 0, tz: -3 }), p, 0)?.pan).toBeCloseTo(0);
  });
  it('attenuates all four materials with full eye-height distance and rejects the 24m boundary', () => {
    const p = listener();
    for (const surface of ['stone', 'wood', 'metal', 'ground'] as const) {
      const close = worldImpactCue(shot({ surface, tx: 1 }), p, 0)!;
      const far = worldImpactCue(shot({ surface, tx: 18 }), p, 0)!;
      expect(close.surface).toBe(surface); expect(close.gain).toBeGreaterThan(far.gain); expect(far.gain).toBeGreaterThan(0);
    }
    expect(worldImpactCue(shot({ tx: 24 }), p, 0)).toBeNull();
    expect(worldImpactCue(shot({ tx: 0, ty: 25.58 }), p, 0)).toBeNull();
    expect(worldImpactCue(shot({ tx: 0, ty: 25.57 }), p, 0)).not.toBeNull();
  });
  it('follows a changed spectator eye position and rejects actor, misses and nonfinite coordinates', () => {
    const p = listener(), teammate = { ...p, id: 1, x: 6 };
    expect(worldImpactCue(shot(), p, 0)?.pan).toBe(1);
    expect(worldImpactCue(shot(), teammate, 0)?.pan).toBe(-1);
    for (const extra of [{ surface: 'actor' as const }, { surface: 'none' as const }, { tx: NaN }]) expect(worldImpactCue(shot(extra), p, 0)).toBeNull();
    expect(worldImpactCue(shot({ tx: 0 }), p, 0)?.pan).toBe(0);
  });
});

function audioFixture() {
  const nodes: any[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = (kind: string) => {
    const n = { kind, gain: param(), frequency: param(), pan: param(), playbackRate: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
    nodes.push(n); return n;
  };
  const context = {
    state: 'running', currentTime: 1, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => { context.state = 'closed'; }),
    createGain: () => node('gain'), createStereoPanner: () => node('pan'), createBufferSource: () => node('buffer'),
    createBiquadFilter: () => node('filter'), createOscillator: () => node('oscillator'),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  return { audio: new CombatAudio(), context, nodes, buffers: () => nodes.filter(n => n.kind === 'buffer') };
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded material impact audio', () => {
  it('gives four materials different short noise responses, with one panned voice and no oscillator each', async () => {
    const f = audioFixture(); await f.audio.unlock(); const sounds: string[] = [];
    for (const surface of ['stone', 'wood', 'metal', 'ground'] as const) {
      const count = f.buffers().length;
      expect(f.audio.impact({ surface, gain: .5, pan: -.7 })).toBe(true);
      expect(f.buffers()).toHaveLength(count + 1);
      const source = f.buffers().at(-1), filter = f.nodes.filter(n => n.kind === 'filter').at(-1), pan = f.nodes.filter(n => n.kind === 'pan').at(-1);
      expect(pan.pan.value).toBe(-.7);
      expect(source.stop.mock.calls[0][0] - f.context.currentTime).toBeLessThanOrEqual(.09);
      sounds.push(`${filter.frequency.value}/${source.playbackRate.value}/${source.stop.mock.calls[0][0] - f.context.currentTime}`);
      f.context.currentTime += .1;
    }
    expect(new Set(sounds).size).toBe(4); expect(f.nodes.filter(n => n.kind === 'oscillator')).toHaveLength(0);
  });
  it('throttles only valid impacts, while shot and hurt feedback remain immediate', async () => {
    const f = audioFixture(); await f.audio.unlock(); const cue = { surface: 'stone' as const, gain: 1, pan: 0 };
    expect(f.audio.impact(null)).toBe(false); expect(f.audio.impact(cue)).toBe(true);
    f.context.currentTime += .02; expect(f.audio.impact(cue)).toBe(false);
    f.audio.shot(); f.audio.hurt(20); expect(f.buffers()).toHaveLength(3);
    f.context.currentTime += .02; expect(f.audio.impact(cue)).toBe(true); expect(f.buffers()).toHaveLength(4);
  });
  it('does not allocate audio nodes before unlock, while muted, suspended, or disposed', async () => {
    const f = audioFixture(), cue = { surface: 'wood' as const, gain: 1, pan: 0 };
    expect(f.audio.impact(cue)).toBe(false); expect(f.nodes).toHaveLength(0);
    await f.audio.unlock(); f.audio.volume = 0; expect(f.audio.impact(cue)).toBe(false);
    f.audio.volume = .6; f.context.state = 'suspended'; expect(f.audio.impact(cue)).toBe(false);
    f.context.state = 'running'; expect(f.audio.impact(cue)).toBe(true);
    f.audio.dispose(); f.context.currentTime += .1; expect(f.audio.impact(cue)).toBe(false);
    expect(f.buffers()).toHaveLength(1);
  });
  it('respects the shared 32-voice ceiling and recovers when ended nodes are released', async () => {
    const f = audioFixture(); await f.audio.unlock();
    for (let i = 0; i < 32; i++) f.audio.shot();
    const cue = { surface: 'metal' as const, gain: 1, pan: 0 };
    expect(f.audio.impact(cue)).toBe(false);
    expect(f.nodes.filter(n => ['buffer', 'oscillator'].includes(n.kind))).toHaveLength(32);
    const count = f.buffers().length;
    f.buffers()[0].onended(); expect(f.buffers()[0].disconnect).toHaveBeenCalledOnce();
    expect(f.audio.impact(cue)).toBe(true); expect(f.buffers()).toHaveLength(count + 1);
  });
});

describe('spatial gunshot synthesis', () => {
  it('emphasizes the viewed weapon transient and uses a falling bass pitch with a fixed voice ceiling', async () => {
    const f = audioFixture(); await f.audio.unlock();
    f.audio.shot(0, 'rifle', 0, false, true);
    const local=f.nodes.filter(n=>n.kind==='gain').at(-2).gain.setValueAtTime.mock.calls[0][0];
    const bass=f.nodes.find(n=>n.kind==='oscillator');
    expect(bass.frequency.setValueAtTime).toHaveBeenCalledWith(95*1.4,1);
    expect(bass.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(95*.45,1.11);
    f.audio.shot(0, 'rifle', 0, false, false);
    const remote=f.nodes.filter(n=>n.kind==='gain').at(-2).gain.setValueAtTime.mock.calls[0][0];
    expect(local).toBeGreaterThan(remote);expect(local).toBeLessThanOrEqual(1.5);
  });
  it('pans both the muzzle crack and bass, and reduces their energy behind cover', async () => {
    const f = audioFixture(); await f.audio.unlock();
    f.audio.shot(16, 'rifle', -.8, false);
    const directNodes = f.nodes.slice(1);
    f.audio.shot(16, 'rifle', -.8, true);
    const coveredNodes = f.nodes.slice(directNodes.length + 1);
    for (const nodes of [directNodes, coveredNodes]) {
      expect(nodes.filter(n => n.kind === 'pan').map(n => n.pan.value)).toEqual([-.8, -.8]);
      expect(nodes.filter(n => n.kind === 'buffer')).toHaveLength(1);
      expect(nodes.filter(n => n.kind === 'oscillator')).toHaveLength(1);
    }
    expect(coveredNodes.find(n => n.kind === 'filter').frequency.value).toBeLessThan(1000);
    const gains = (nodes: any[]) => nodes.filter(n => n.kind === 'gain').map(n => n.gain.setValueAtTime.mock.calls[0][0]);
    gains(coveredNodes).forEach((gain, i) => expect(gain).toBeLessThan(gains(directNodes)[i] * .5));
    coveredNodes.filter(n => ['buffer','oscillator'].includes(n.kind)).forEach(n => n.onended());
    for (const node of coveredNodes) expect(node.disconnect).toHaveBeenCalledOnce();
  });
  it('does not create orphan bass voices after the gunshot voice budget is exhausted', async () => {
    const f = audioFixture(); await f.audio.unlock();
    for (let i = 0; i < 80; i++) f.audio.shot(5, 'smg', 1, true);
    expect(f.nodes.filter(n => ['buffer','oscillator'].includes(n.kind))).toHaveLength(32);
    const count = f.nodes.length; f.audio.tone(100); expect(f.nodes).toHaveLength(count);
    f.nodes.filter(n => ['buffer','oscillator'].includes(n.kind)).forEach(n => n.onended());
    f.audio.shot(0, 'pistol', 0, false);
    expect(f.nodes.filter(n => ['buffer','oscillator'].includes(n.kind))).toHaveLength(34);
  });
});

describe('grenade audio', () => {
  it('an HE blast is a long low noise with a falling sub thump; cover muffles it', async () => {
    const f = audioFixture(); await f.audio.unlock();
    f.audio.blast('he', { distance: 6, pan: .3, occluded: false });
    const direct = f.nodes.slice(1);
    const noise = direct.find(n => n.kind === 'buffer'), sub = direct.find(n => n.kind === 'oscillator');
    expect(noise.stop.mock.calls[0][0] - f.context.currentTime).toBeGreaterThan(.6);
    expect(sub.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
    f.audio.blast('he', { distance: 6, pan: .3, occluded: true });
    const covered = f.nodes.slice(direct.length + 1);
    expect(covered.find(n => n.kind === 'filter').frequency.value).toBeLessThan(direct.find(n => n.kind === 'filter').frequency.value);
  });
  it('flash pop and smoke hiss differ, and the smoke hiss lasts', async () => {
    const f = audioFixture(); await f.audio.unlock();
    f.audio.blast('flash', { distance: 4, pan: 0, occluded: false });
    const pop = f.buffers().at(-1).stop.mock.calls[0][0] - f.context.currentTime;
    f.audio.blast('smoke', { distance: 4, pan: 0, occluded: false });
    const hiss = f.buffers().at(-1).stop.mock.calls[0][0] - f.context.currentTime;
    expect(hiss).toBeGreaterThan(pop * 3);
  });
  it('a flash rings for its length and ducks other sounds until it fades', async () => {
    const f = audioFixture(); await f.audio.unlock();
    f.audio.shot(); const master = f.nodes.find(n => n.kind === 'gain'), normal = master.gain.value;
    const before = f.nodes.length; f.audio.flashRing(1, 3);
    const ring = f.nodes.slice(before).filter(n => n.kind === 'oscillator');
    expect(ring.length).toBeGreaterThanOrEqual(2);
    expect(ring[0].stop.mock.calls[0][0] - f.context.currentTime).toBeGreaterThanOrEqual(3);
    f.audio.shot(); expect(master.gain.value).toBeLessThan(normal * .5);
    f.context.currentTime += 3.5; f.audio.shot(); expect(master.gain.value).toBeCloseTo(normal);
  });
  it('grenade bounces are short metallic ticks within the voice ceiling', async () => {
    const f = audioFixture(); await f.audio.unlock();
    expect(f.audio.bounce({ distance: 3, pan: -1, occluded: false })).toBe(true);
    expect(f.buffers().at(-1).stop.mock.calls[0][0] - f.context.currentTime).toBeLessThan(.08);
    expect(f.audio.bounce({ distance: 40, pan: 0, occluded: false })).toBe(false);
  });
});
