import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function loadConfig(port) {
  process.env.E2E_PORT = String(port);
  return (await import(`../../playwright.config.ts?port=${port}`)).default;
}

function launch(config, port, t) {
  const [command, ...args] = config.webServer.command.split(' ');
  assert.equal(command, 'node', 'The test server must stay in a directly managed Node process');
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, E2E_PORT: String(port) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  });
  return { child, output: () => output };
}

test('starts the current worktree and preserves page state as other routes compile', { timeout: 60000 }, async t => {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const config = await loadConfig(port);
  const origin = `http://127.0.0.1:${port}`;
  assert.equal(config.use.baseURL, origin);
  assert.equal(config.webServer.url, origin);
  assert.equal(config.webServer.reuseExistingServer, false);
  const runner = launch(config, port, t);
  const deadline = Date.now() + 25000;
  let response;
  while (Date.now() < deadline) {
    assert.equal(runner.child.exitCode, null, runner.output());
    try {
      response = await fetch(`${origin}/journal/`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(response?.status, 200, runner.output());
  assert.equal(runner.child.exitCode, null, 'Server must remain in the foreground');

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    let navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.goto(`${origin}/games`);
    await page.locator('.arcade-bgm-toggle').click();
    await expect(page.locator('.arcade-bgm-panel')).toBeVisible();

    const tetris = await context.newPage();
    await tetris.goto(`${origin}/games/tetris`);
    await tetris.getByRole('tab', { name: 'PROFILE' }).click();
    await expect(tetris.locator('#profile-guest')).toBeVisible();
    await expect(page.locator('.arcade-bgm-panel')).toBeVisible();
    assert.equal(navigations, 1, 'Compiling another route must not reload an active test page');
  } finally {
    await browser.close();
  }
});

test('refuses an occupied port without reusing or replacing its server', { timeout: 30000 }, async t => {
  const existing = createServer((_request, response) => response.end('existing worktree'));
  const port = await listen(existing);
  t.after(() => new Promise(resolve => existing.close(resolve)));
  const config = await loadConfig(port);
  assert.equal(config.webServer.reuseExistingServer, false);
  const runner = launch(config, port, t);
  const [code] = await once(runner.child, 'exit');
  assert.notEqual(code, 0, runner.output());
  assert.match(runner.output(), /already in use|EADDRINUSE/i);
  const response = await fetch(`http://127.0.0.1:${port}`);
  assert.equal(await response.text(), 'existing worktree');
});
