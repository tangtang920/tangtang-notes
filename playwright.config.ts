import { defineConfig } from '@playwright/test'

const suite = process.argv.includes('--project=packaged') ? 'packaged' : 'electron'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `playwright-report/${suite}` }]],
  outputDir: `test-results/${suite}`,
  projects: [
    { name: 'electron', testMatch: 'desktop.spec.ts' },
    { name: 'packaged', testMatch: 'packaged.spec.ts' }
  ]
})
