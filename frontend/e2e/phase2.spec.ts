import { expect, type Page, test } from '@playwright/test'

// Phase 2 screens at 1440x900 against the real backend + self-hosted LanguageTool. Same setup as
// phone.spec.ts plus `make grammar-build` and load_seed (patterns). Without a running Ollama the
// homework red-pen view comes from LanguageTool only, which is the documented fallback.
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: /^Guten (Morgen|Tag|Abend), Zee$/ })).toBeVisible()
}

// No horizontal scroll at the two supported widths (the page starts at 1440).
async function noSideScroll(page: Page) {
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(w, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(width)
  }
}

test('pattern card and a drill: answer hidden until Check', async ({ page }) => {
  await login(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-home.png`, fullPage: true })
  await page.goto('/grammar/VE_WEIL')
  await expect(page.getByRole('heading', { name: /weil/ })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-pattern-card.png`, fullPage: true })
  await page.goto('/grammar/VE_WEIL/drills')
  await expect(page.getByLabel('Your sentence')).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-drill-surgery.png`, fullPage: true })
  // tap the chips in the shuffled order: a wrong build
  const chips = page.locator('button[data-token]')
  const n = await chips.count()
  for (let i = 0; i < n; i++) await chips.first().click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Not yet.')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-p2-drill-feedback.png`, fullPage: true })
})

test('homework: red-pen view (LanguageTool only without Ollama), then Ghalti', async ({ page }) => {
  await login(page)
  await page.goto('/homework')
  await page.getByLabel('Your homework in German').fill('Ich habe gestern nach Hause gegangen. Ich bin müde.')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/LanguageTool/).first()).toBeVisible({ timeout: 60_000 })
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-redpen.png`, fullPage: true })
  await page.goto('/ghalti')
  await expect(page.getByRole('heading', { name: 'Ghalti' })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-ghalti.png`, fullPage: true })
})

test('recitation table and placement start', async ({ page }) => {
  await login(page)
  await page.goto('/recitation/SEIN_PRAESENS')
  await expect(page.getByRole('heading', { name: /sein/ })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-recitation.png`, fullPage: true })
  await page.goto('/placement')
  await expect(page.getByRole('heading', { name: 'Placement test' })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-p2-placement.png`, fullPage: true })
})
