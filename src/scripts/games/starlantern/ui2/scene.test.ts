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
