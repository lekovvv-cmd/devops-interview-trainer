import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'on-first-retry' },
  webServer: { command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
