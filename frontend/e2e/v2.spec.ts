import { expect, type Page, test } from '@playwright/test'

// V2: level box on Today, Progress page, goal and result forms at 1440x900 against the real backend,
// on a fresh e2e DB. Test 1 runs on the empty DB. Test 2 enters official results through the forms.
// Test 3 runs after `scripts.e2e_fixture_readiness` added fixture evidence to the throwaway DB (set E2E_FIXTURE=1).
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: /^Guten (Morgen|Tag|Abend), Zee$/ })).toBeVisible()
}

async function noSideScroll(page: Page) {
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(w, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(width)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE')

test.describe.configure({ mode: 'serial' })

test('empty DB: no level, no numbers, a goal question', async ({ page }) => {
  test.skip(!!process.env.E2E_FIXTURE, 'fixture run')
  await login(page)
  // Today shows a short level summary; the full box lives on Progress
  await expect(page.getByText('Not placed yet.', { exact: false }).first()).toBeVisible()
  await page.goto('/progress')
  const box = page.getByRole('region', { name: 'Your level' })
  await expect(box.getByText(/Not placed yet/)).toBeVisible()
  await expect(box.getByText('Which exam?')).toBeVisible()
  // no skill shows a percent yet: either nothing measured or under 10 answers (earlier specs add a few)
  await expect(box.getByRole('table', { name: 'Skills' }).getByText(/^(Not measured yet|\d+ answers so far)/)).toHaveCount(6)
  await expect(box.getByText(/±/)).toHaveCount(0)
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-today-empty.png` })
  // answer the goal question in the box
  await box.getByLabel('By when?').fill(daysAgo(-90))
  await box.getByRole('button', { name: 'Set goal' }).click()
  await expect(box.getByText(/Goethe-Zertifikat B1 by .*, (89|90|91) days left/)).toBeVisible()
  await expect(box.getByRole('heading', { name: 'Time to goal' })).toBeVisible()
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'Fortschritt' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Each skill, week by week' })).toBeVisible()
  await expect(page.getByText(/Add the Goethe B1 word list to measure this|words on the Goethe-Zertifikat B1 Wortliste/).first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-progress-empty.png`, fullPage: true })
})

test('official results entered in Settings show on Progress and can be voided', async ({ page }) => {
  test.skip(!!process.env.E2E_FIXTURE, 'fixture run')
  await login(page)
  await page.goto('/settings?result=lesen#result')
  await page.getByLabel('Date taken').fill(daysAgo(20))
  for (const [i, v] of [4, 4, 4, 4, 2].entries()) await page.getByLabel(new RegExp(`^Teil ${i + 1}:`)).fill(String(v))
  await page.getByRole('button', { name: 'Save result' }).click()
  await expect(page.getByText('Saved. Progress shows it under practice tests.')).toBeVisible()
  await expect(page.getByRole('cell', { name: '60 of 100 points', exact: true })).toBeVisible()
  await page.getByLabel('Module').selectOption('hoeren')
  await page.getByLabel('What you did').selectOption('practice_teil')
  await page.getByLabel(/^Correct items/).fill('7')
  await page.getByRole('button', { name: 'Save result' }).click()
  await expect(page.getByText('Saved. Progress shows it under practice tests.')).toBeVisible()
  await page.getByLabel('Module').selectOption('schreiben')
  await page.getByLabel('What you did').selectOption('real_exam')
  const field = page.getByLabel(/^Module points/)
  await field.fill('101')
  await page.getByRole('button', { name: 'Save result' }).click()
  expect(await field.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true)
  await page.getByRole('row', { name: /B1 hoeren/ }).getByRole('button', { name: 'Void' }).click()
  await expect(page.getByRole('row', { name: /B1 hoeren/ }).getByText('Voided')).toBeVisible()
  await page.getByRole('row', { name: /B1 hoeren/ }).getByRole('button', { name: 'Restore' }).click()
  await page.screenshot({ path: `${SHOTS}/v2-settings.png`, fullPage: true })
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'Practice tests you entered' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Lesen .* 60 of 100 yes/ })).toBeVisible()
  await noSideScroll(page)
})

test('with practice evidence: ladder, time to goal, skill table and the explanation', async ({ page }) => {
  test.skip(!process.env.E2E_FIXTURE, 'needs the fixture evidence (E2E_FIXTURE=1)')
  await login(page)
  await expect(page.getByText('Working on B1.1').first()).toBeVisible()
  await page.goto('/progress')
  const box = page.getByRole('region', { name: 'Your level' })
  await expect(box.getByText(/B1\.1/).first()).toBeVisible()
  await expect(box.getByTestId('band-B1.1')).toHaveAttribute('data-state', 'here')
  await expect(box.getByText(/practised skills at 70% or more|Every practised skill/).first()).toBeVisible()
  await expect(box.getByText(/h practised since placement/)).toBeVisible()
  await expect(box.getByText(/h\/week, last 4 weeks/)).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-today-fixture.png` })
  await box.getByRole('button', { name: 'Explain in words' }).click()
  await expect(page.getByTestId('insight')).toBeVisible({ timeout: 130_000 })
  await page.screenshot({ path: `${SHOTS}/v2-today-analysis.png` })
  await expect(page.getByRole('heading', { name: 'Each skill, week by week' })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-progress-fixture.png`, fullPage: true })
})
