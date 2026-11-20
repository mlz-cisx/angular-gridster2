import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './benchmarks',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list'], ['json', { outputFile: 'benchmark-results/results.json' }]],
  outputDir: 'benchmark-results/artifacts',
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:4300/',
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: 'npm run build-lib && npm run ng -- serve gridster-benchmark --configuration production --host 127.0.0.1 --port 4300',
    url: 'http://127.0.0.1:4300/',
    reuseExistingServer: false,
    timeout: 180000
  }
});
