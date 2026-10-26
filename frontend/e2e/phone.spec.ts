import { expect, type Page, test } from '@playwright/test'

// MacBook (1440x900) smoke. Needs a throwaway DB prepared by backend scripts/e2e_setup.py (one Manzil card due). See docs/PROGRESS.md.
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

// Each test gets a fresh browser context, so log in first.
async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
}

async function expectNoSideScroll(page: Page, where = 'page') {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, `horizontal scroll on ${where}`).toBeLessThanOrEqual(innerWidth)
}

test('review screen: prompt, then graded answer with diff', async ({ page }) => {
  await login(page)
  await page.screenshot({ path: `${SHOTS}/v0-home.png`, fullPage: true })
  await page.goto('/review/manzil')
  const input = page.getByLabel('Your answer in German')
  await expect(input).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-review-prompt.png`, fullPage: true })
  await input.fill(process.env.E2E_ANSWER ?? 'unt')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-review-feedback.png`, fullPage: true })
})

test('daily loop: Manzil done unlocks Sabaq, attempt before answer', async ({ page }) => {
  await login(page)
  // Sabaq stays locked until Manzil is done; the one due card was answered in the test above.
  await page.goto('/review/manzil')
  await expect(page.getByRole('heading', { name: 'Manzil done.' })).toBeVisible()
  await page.goto('/')
  await page.getByRole('link', { name: 'Start Sabaq' }).click()
  await expect(page.getByText('Try first: say it in German')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-sabaq-prompt.png`, fullPage: true })
  await page.getByLabel('Your answer in German').fill('und')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-sabaq-feedback.png`, fullPage: true })
  await expectNoSideScroll(page)
})

// Every route of this spec and phase2.spec.ts, at the two widths the app supports.
const ROUTES = [
  '/', '/review/manzil', '/sabaq', '/grammar', '/grammar/VE_WEIL', '/recitation', '/homework',
  '/ghalti', '/placement', '/check', '/settings', '/progress',
]

for (const width of [1024, 1440]) {
  test(`no horizontal scroll at ${width}px on every route`, async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width, height: 900 })
    for (const route of ROUTES) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expectNoSideScroll(page, `${route} at ${width}px`)
      if (width === 1440) {
        const slug = route === '/' ? 'today' : route.slice(1).replaceAll('/', '-')
        await page.screenshot({ path: `${SHOTS}/v0-${slug}.png`, fullPage: true })
      }
    }
  })
}
