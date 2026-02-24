import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: {
    timeout: 120_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  outputDir: 'test-results/artifacts',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'off',
    trace: 'off',
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=swiftshader',
        '--use-angle=swiftshader',
        '--disable-gpu-sandbox',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    { name: 'p5-taxonomy', testMatch: 'p5-taxonomy.spec.ts' },
    { name: 'p2-morphology', testMatch: 'p2-morphology.spec.ts' },
    { name: 'p1-sustainability', testMatch: 'p1-sustainability.spec.ts' },
    { name: 'p3-network', testMatch: 'p3-network.spec.ts' },
    { name: 'p4-fragment', testMatch: 'p4-fragment.spec.ts' },
  ],
});
