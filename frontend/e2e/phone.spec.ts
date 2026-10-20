import { expect, test } from '@playwright/test'

const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

test('login, daily loop, Sabaq attempt and review at 375px', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: true })

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

test('review screen: prompt, then graded answer with diff', async ({ page }) => {
  await page.goto('/review/manzil')
  if (await page.getByLabel('Password').isVisible().catch(() => false)) {
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.goto('/review/manzil')
  }
  const input = page.getByLabel('Your answer in German')
  await expect(input).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/review-prompt.png`, fullPage: true })
  await input.fill(process.env.E2E_ANSWER ?? 'unt')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/review-feedback.png`, fullPage: true })
})
