import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': r('./src'),
      '@components': r('./src/components'),
      '@layouts': r('./src/layouts'),
      '@scripts': r('./src/scripts'),
      '@styles': r('./src/styles'),
      '@i18n': r('./src/i18n'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', '.git'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/scripts/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
    globals: true,
  },
});
