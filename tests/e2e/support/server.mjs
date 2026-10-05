import { dev } from 'astro';
import { fileURLToPath } from 'node:url';
import { getE2EPort } from './server-settings.mjs';

// The Astro CLI can daemonize in agent environments. The API keeps this
// process alive so Playwright owns startup and shutdown of its own server.
const root = new URL('../../../', import.meta.url);

try {
  const port = getE2EPort();
  const cacheDir = new URL(`.astro/e2e-${port}/`, root);
  const server = await dev({
    root: fileURLToPath(root),
    cacheDir: fileURLToPath(cacheDir),
    devToolbar: { enabled: false },
    server: { host: '127.0.0.1', port },
    vite: {
      cacheDir: fileURLToPath(new URL('vite/', cacheDir)),
      // Dependency optimization must not reload a page in the middle of a test.
      server: { strictPort: true, hmr: false },
    },
  });

  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(error);
  process.exit(1);
}
