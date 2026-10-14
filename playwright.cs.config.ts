import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Windows headless Chromium otherwise selects CPU SwiftShader. Exercise the
// same hardware WebGL backend used by a normal desktop browser for this 3D game.
// Product assertions and the cross-browser fallback/device checks are unchanged.
export default defineConfig({
  ...base,
  testMatch: /games-cs(?:-renderer|-feedback|-death-record|-armory|-map|-grenades)?\.spec\.ts/,
  workers: 1,
  outputDir: 'tmp/cs-v5-e2e',
  reporter: [['list']],
  projects: base.projects?.map(project => ({
    ...project,
    use: {
      ...project.use,
      ...(process.platform === 'win32' && project.name === 'chromium'
        ? { launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-webgl'] } }
        : {}),
    },
  })),
});
