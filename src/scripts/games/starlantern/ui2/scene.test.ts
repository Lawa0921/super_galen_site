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
