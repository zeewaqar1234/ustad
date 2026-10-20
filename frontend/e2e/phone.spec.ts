import { expect, type Page, test } from '@playwright/test'

// Needs a throwaway DB prepared by backend scripts/e2e_setup.py (one Manzil card due). See docs/PROGRESS.md.
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

// Each test gets a fresh browser context, so log in first.
async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

test('review screen: prompt, then graded answer with diff', async ({ page }) => {
  await login(page)
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: true })
  await page.goto('/review/manzil')
  const input = page.getByLabel('Your answer in German')
  await expect(input).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/review-prompt.png`, fullPage: true })
  await input.fill(process.env.E2E_ANSWER ?? 'unt')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/review-feedback.png`, fullPage: true })
})

test('daily loop: Manzil done unlocks Sabaq, attempt before answer at 375px', async ({ page }) => {
  await login(page)
  // Sabaq stays locked until Manzil is done; the one due card was answered in the test above.
  await page.goto('/review/manzil')
  await expect(page.getByRole('heading', { name: 'Manzil done.' })).toBeVisible()
  await page.goto('/')
  await page.getByRole('link', { name: /Sabaq/ }).click()
  await expect(page.getByText('Try first: say it in German')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/sabaq-prompt.png`, fullPage: true })
  await page.getByLabel('Your answer in German').fill('und')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/sabaq-feedback.png`, fullPage: true })

  // no horizontal scroll at phone width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(overflow).toBe(false)
})
