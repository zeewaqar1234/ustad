import { defineConfig } from '@playwright/test'

// Smoke e2e at phone width against a running app (default: the built PWA served by FastAPI).
// Run: E2E_PASSWORD=... npx playwright test  (see docs/PROGRESS.md for the setup)
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8000',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
})
