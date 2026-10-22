import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssetLoadWatchdog, loadOwnedResources } from './asset-loading';

const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('loading resource ownership', () => {
  it('preserves the timeout reason and releases resources that arrive after cancellation', async () => {
    const late = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([Promise.resolve(1), late.promise], release, controller.signal);
    const reason = new DOMException('Asset loading stalled', 'TimeoutError');
    const expected = expect(result).rejects.toBe(reason);
    await Promise.resolve(); controller.abort(reason); await expected;
    late.resolve(2); await Promise.resolve();
    expect(release.mock.calls).toEqual([[1], [2]]);
  });
  it('rejects without waiting for a pending resource and releases both collected and late resources once', async () => {
    const failed = deferred<number>(), late = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([Promise.resolve(1), failed.promise, late.promise], release, controller.signal);
    const expected = expect(result).rejects.toThrow('unavailable'); failed.reject(new Error('unavailable')); await expected;
    expect(release.mock.calls).toEqual([[1]]);
    late.resolve(3); await Promise.resolve(); controller.abort();
    expect(release.mock.calls).toEqual([[1], [3]]);
  });
  it('cancels pending ownership on disposal and reclaims late completion without replaying success', async () => {
    const late = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([Promise.resolve(1), late.promise], release, controller.signal);
    const expected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); late.resolve(2); await expected;
    await Promise.resolve();
    expect(release.mock.calls).toEqual([[1], [2]]);
  });
  it('transfers successful resources in request order and does not release them on a later abort', async () => {
    const early = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([early.promise, Promise.resolve(2)], release, controller.signal);
    early.resolve(1); expect(await result).toEqual([1, 2]); controller.abort();
    expect(release).not.toHaveBeenCalled();
  });
  it('observes an already aborted signal while still reclaiming resources from supplied promises', async () => {
    const controller = new AbortController(), release = vi.fn(); controller.abort();
    await expect(loadOwnedResources([Promise.resolve(1)], release, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(release.mock.calls).toEqual([[1]]);
  });
  it('keeps the first failure when cancellation races with a late rejection', async () => {
    const failed = deferred<number>(), late = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([Promise.resolve(1), failed.promise, late.promise], release, controller.signal);
    const expected = expect(result).rejects.toThrow('first failure');
    failed.reject(new Error('first failure')); await expected; controller.abort(); late.reject(new Error('late failure'));
    await Promise.resolve(); expect(release.mock.calls).toEqual([[1]]);
  });
  it('settles once when abort and a rejected request compete in the same turn', async () => {
    const failed = deferred<number>(), release = vi.fn(), controller = new AbortController();
    const result = loadOwnedResources([Promise.resolve(1), failed.promise], release, controller.signal);
    const expected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); failed.reject(new Error('queued failure')); controller.abort(); await expected;
    expect(release.mock.calls).toEqual([[1]]);
  });
});

describe('asset batch inactivity', () => {
  afterEach(() => vi.useRealTimers());

  it('cancels an unfinished batch once when no bytes or completed items arrive', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), cancelled = vi.fn();
    controller.signal.addEventListener('abort', cancelled);
    createAssetLoadWatchdog(controller);
    await vi.advanceTimersByTimeAsync(29999);
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.signal.reason).toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(60000);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a slow batch while any file or nested image still makes progress', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), watchdog = createAssetLoadWatchdog(controller);
    await vi.advanceTimersByTimeAsync(25000); watchdog.progress('world', 64);
    await vi.advanceTimersByTimeAsync(25000); watchdog.progress('soldier', 32);
    await vi.advanceTimersByTimeAsync(25000); watchdog.completed();
    await vi.advanceTimersByTimeAsync(25000); watchdog.progress('world', 128);
    expect(controller.signal.aborted).toBe(false);
    watchdog.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(controller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not mistake repeated, decreasing or invalid byte counts for progress', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), watchdog = createAssetLoadWatchdog(controller);
    watchdog.progress('world', 64);
    await vi.advanceTimersByTimeAsync(25000);
    for (const loaded of [64, 32, 0, -1, NaN, Infinity]) watchdog.progress('world', loaded);
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('does not rearm after completion or replace an external cancellation reason', async () => {
    vi.useFakeTimers();
    for (const cancelled of [false, true]) {
      const controller = new AbortController(), watchdog = createAssetLoadWatchdog(controller);
      const reason = new Error('page disposed');
      if (cancelled) controller.abort(reason); else watchdog.stop();
      watchdog.progress('world', 100); watchdog.completed(); watchdog.stop();
      await vi.advanceTimersByTimeAsync(60000);
      expect(controller.signal.aborted).toBe(cancelled);
      expect(controller.signal.reason).toBe(cancelled ? reason : undefined);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('does not start a timer for an already cancelled load', () => {
    vi.useFakeTimers();
    const controller = new AbortController(); controller.abort();
    const watchdog = createAssetLoadWatchdog(controller);
    watchdog.completed(); watchdog.progress('world', 10);
    expect(vi.getTimerCount()).toBe(0);
  });
});
