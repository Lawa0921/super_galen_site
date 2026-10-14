import { test, expect } from '@playwright/test';
import { open } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

test('a stalled model response exposes retry and a fresh download can start the game', async ({ page }, info) => {
  // Two bounded 60s waits plus navigation, interaction and evidence collection.
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const model = await open('public/assets/games/cs/environment.glb', 'r');
  const firstChunk = Buffer.alloc(65536);
  let size: number, bytesRead: number;
  try { size = (await model.stat()).size; ({ bytesRead } = await model.read(firstChunk, 0, firstChunk.length, 0)); }
  finally { await model.close(); }
  const responses = new Set<ServerResponse>();
  let sentAt = 0, cancelled = false;
  // A real HTTP body stalls after its first chunk. Keep native fetch/streams
  // and AbortSignal propagation intact. Socket closure alone is not a portable
  // cancellation signal: WebKit may keep the HTTP connection open after abort.
  const server = createServer((_request, response) => {
    responses.add(response);
    response.on('close', () => { cancelled = !response.writableEnded; responses.delete(response); });
    response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': size,
      'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    sentAt = performance.now(); response.write(firstChunk.subarray(0, bytesRead));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await page.route('**/assets/games/cs/environment.glb', route => route.continue({
      url: 'http://127.0.0.1:' + port + '/environment.glb',
    }), { times: 1 });
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      (window as any).csModelReads = { timeOrigin: performance.timeOrigin, fetchStartedAt: null, headersAt: null,
        bytes: 0, chunks: 0, firstByteAt: null, lastByteAt: null,
        maxProgressGapMs: 0, endedAt: null, failures: [] };
      // Observe the original reader and promises; never replace the response,
      // stream or request signal, or retain the Request in this observer.
      function observe(response: Response) {
        if (!response.url.endsWith('/environment.glb') || !response.body) return response;
        (window as any).csModelReads.headersAt = performance.now();
        const body = response.body, getReader = body.getReader.bind(body);
        body.getReader = (() => {
          const reader = getReader(), read = reader.read.bind(reader);
          reader.read = () => {
            const pending = read();
            void pending.then(value => {
              const reads = (window as any).csModelReads, now = performance.now();
              if (value.value?.byteLength) {
                reads.bytes += value.value.byteLength; reads.chunks++;
                if (reads.lastByteAt !== null) reads.maxProgressGapMs = Math.max(reads.maxProgressGapMs, now - reads.lastByteAt);
                reads.firstByteAt ??= now; reads.lastByteAt = now;
              }
              if (value.done) reads.endedAt = now;
            },
              error => { (window as any).csModelReads.failures.push(error.name); });
            return pending;
          };
          return reader;
        }) as typeof body.getReader;
        return response;
      }
      window.fetch = (...args) => {
        const target = args[0], address = typeof target === 'string' ? target : target instanceof URL ? target.href : target.url;
        if (address.endsWith('/environment.glb')) (window as any).csModelReads.fetchStartedAt = performance.now();
        return nativeFetch(...args).then(observe);
      };
      const original = console.error.bind(console);
      (window as any).csLoadErrors = [];
      console.error = (...args) => {
        for (const value of args) if (value && typeof value === 'object' && 'name' in value) {
          (window as any).csLoadErrors.push({ name: value.name, at: performance.now() });
        }
        original(...args);
      };
    });
    await page.goto('/games/cs');
    await expect.poll(() => sentAt).toBeGreaterThan(0);
    // The inactivity window starts after the last activity of the whole batch,
    // which may be later than this response's first chunk on a slow machine.
    await expect(page.locator('#cs-load-error')).toBeVisible({ timeout: 60000 });
    const elapsedMs = performance.now() - sentAt;
    await expect(page.locator('#cs-loading')).toBeHidden();
    await expect(page.locator('#cs-start')).toBeDisabled();
    // Explicit reader.cancel may close a pending read with done:true. The
    // server never ends this body, so either settlement proves client cleanup.
    await expect.poll(() => page.evaluate(() => (window as any).csModelReads.endedAt !== null || (window as any).csModelReads.failures
      .some((name: string) => name === 'AbortError' || name === 'TimeoutError'))).toBe(true);
    const reads = await page.evaluate(() => (window as any).csModelReads);
    expect(reads.bytes).toBeGreaterThan(0);
    const loadErrors = await page.evaluate(() => (window as any).csLoadErrors);
    expect(loadErrors.some((error: { name: string }) => error.name === 'TimeoutError')).toBe(true);
    expect(elapsedMs).toBeGreaterThanOrEqual(29950);
    await info.attach('loading-recovery-boundary', { body: JSON.stringify({ bytesSent: bytesRead, serverCancelled: cancelled, reads, elapsedMs, errors: loadErrors }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('stalled-download-retry.png') });
    await page.locator('#cs-retry').click();
    // The production deadline is 30s without batch activity, not 30s total.
    // Keep a finite retry window and prove the fresh body finished in full.
    await expect(page.locator('#cs-start')).toBeEnabled({ timeout: 60000 });
    const retriedReads = await page.evaluate(() => (window as any).csModelReads);
    expect(retriedReads.bytes).toBe(size);
    expect(Number.isFinite(retriedReads.endedAt)).toBe(true);
    expect(retriedReads.failures).toEqual([]);
    expect(await page.evaluate(() => (window as any).csLoadErrors)).toEqual([]);
    await expect(page.locator('#cs-load-error')).toBeHidden();
    await page.locator('#cs-start').click();
    await expect(page.locator('#cs-shop')).toBeVisible();
    await page.screenshot({ path: info.outputPath('download-recovered.png') });
    expect(errors).toEqual([]);
  } finally {
    try {
      const telemetry = page.isClosed() ? { available: false, error: 'Page closed' } : await page.evaluate(() => {
        const start = document.querySelector('#cs-start') as HTMLButtonElement | null;
        const error = document.querySelector('#cs-load-error') as HTMLElement | null;
        return { reads: (window as any).csModelReads, errors: (window as any).csLoadErrors,
          capturedAt: performance.now(), ready: start ? !start.disabled : null,
          loadingError: error ? !error.hidden : null };
      }).catch(error => ({ available: false, error: String(error) }));
      await info.attach('loading-recovery-final', { body: JSON.stringify(telemetry), contentType: 'application/json' });
    } catch (error) {
      console.warn('Loading evidence unavailable:', String(error));
    } finally {
      for (const response of responses) response.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
