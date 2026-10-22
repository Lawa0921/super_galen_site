import { describe, expect, it, vi } from 'vitest';
import { Router, type Scene } from './scene';

const fake = (log: string[], name: string): Scene => ({
  enter: (root) => { log.push(`enter ${name}`); root.append(document.createElement('div')); },
  exit: () => log.push(`exit ${name}`),
  onAction: (a) => log.push(`${name}:${a}`),
});

describe('Router', () => {
  it('switches scenes, routes actions to the current one and ignores input while fading', async () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const r = new Router(root, (n) => fake(log, n), {} as never, 0);
    await r.go('title');
    r.onAction('down');
    const switching = r.go('town');
    r.onAction('confirm');
    await switching;
    r.onAction('up');
    expect(log).toEqual(['enter title', 'title:down', 'exit title', 'enter town', 'town:up']);
    expect(r.current()).toBe('town');
    expect(root.childElementCount).toBe(1);
  });
});

describe('Router guards', () => {
  it('ignores a second switch while one is running and locks pointer input meanwhile', async () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const r = new Router(root, (n) => fake(log, n), {} as never, 20);
    const first = r.go('title');
    expect(root.hasAttribute('inert')).toBe(true);
    void r.go('town');
    await first;
    expect(log.filter((l) => l.startsWith('enter'))).toEqual(['enter title']);
    expect(root.hasAttribute('inert')).toBe(false);
  });
});

describe('Router input timing', () => {
  it('accepts input as soon as the new scene is on screen, during the fade-in', async () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const r = new Router(root, (n) => fake(log, n), {} as never, 40);
    const going = r.go('title');
    await new Promise((res) => setTimeout(res, 30));   // past the 20 ms fade-out, scene entered
    r.onAction('confirm');
    await going;
    expect(log).toEqual(['enter title', 'title:confirm']);
    expect(root.hasAttribute('inert')).toBe(false);
  });

  it('tells the new scene which scene it came from', async () => {
    const seen: (string | undefined)[] = [];
    const r = new Router(document.createElement('div'), (n, ctx) => { seen.push(ctx.from); return fake([], n); }, {} as never, 0);
    await r.go('title');
    await r.go('settings');
    expect(seen).toEqual([undefined, 'title']);
  });
});

describe('Router prepare', () => {
  it("awaits a scene's prepare before it enters, while input is still locked", async () => {
    const log: string[] = [];
    const root = document.createElement('div');
    let release!: () => void;
    const scene: Scene = { ...fake(log, 'battle'), prepare: () => new Promise<void>((r) => { log.push('prepare'); release = r; }) };
    const r = new Router(root, () => scene, {} as never, 0);
    const going = r.go('battle');
    await new Promise((res) => setTimeout(res, 0));
    expect(log).toEqual(['prepare']);
    expect(root.hasAttribute('inert')).toBe(true);
    release();
    await going;
    expect(log).toEqual(['prepare', 'enter battle']);
  });
});
