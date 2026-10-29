import { expect, type Page, test } from '@playwright/test'

// V2: Stand box, Progress page and the settings forms at 1440x900 against the real backend, on a fresh e2e DB.
// The first test runs on the empty DB; the second enters results through the real forms. Fixture data lives
// only in this throwaway DB.
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
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

test('empty DB: the box says Not measured yet for every module and shows no numbers', async ({ page }) => {
  await login(page)
  const box = page.getByRole('region', { name: 'Stand' })
  await expect(box.getByText('Not measured yet')).toHaveCount(5) // 4 modules + pace
  await expect(box.getByTestId('pass-tick')).toHaveCount(0)
  await expect(box.getByRole('link', { name: /^Measure \(/ })).toHaveCount(4)
  await expect(box.getByText('Pass = 60 of 100 in each module')).toBeVisible()
  const h = (await box.boundingBox())!.height
  expect(h, 'box height').toBeLessThanOrEqual(260)
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-stand-empty.png` })
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'Fortschritt' })).toBeVisible()
  await expect(page.getByText(/Add the Goethe B1 word list to measure this\.|of \d+ words on the Goethe-Zertifikat B1 Wortliste/).first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-progress-empty.png`, fullPage: true })
})

test('results entered in Settings change the box and the Progress page', async ({ page }) => {
  await login(page)
  await page.goto('/settings')
  await page.getByLabel('Target date (optional)').fill(daysAgo(-120))
  await page.getByLabel('Weekly hours (your own target)').fill('5')
  await page.getByRole('button', { name: 'Save goal' }).click()
  await expect(page.getByRole('status').first()).toHaveText('Saved.')

  // Lesen, whole test through the form: 4+4+4+4+2 = 18 correct = 60 points (official example)
  await page.goto('/settings?result=lesen#result')
  await page.getByLabel('Date taken').fill(daysAgo(20))
  for (const [i, v] of [4, 4, 4, 4, 2].entries()) await page.getByLabel(new RegExp(`^Teil ${i + 1}:`)).fill(String(v))
  await page.getByRole('button', { name: 'Save result' }).click()
  await expect(page.getByText('Saved. The Stand box on Today has changed.')).toBeVisible()
  await expect(page.getByRole('cell', { name: '60 of 100 (raw 18 of 30)' })).toBeVisible()

  // Hören, one Teil (7 of 10 = 70 points scaled by item count) through the form
  await page.getByLabel('Module').selectOption('hoeren')
  await page.getByLabel('What you did').selectOption('practice_teil')
  await page.getByLabel(/^Correct items/).fill('7')
  await page.getByRole('button', { name: 'Save result' }).click()
  await expect(page.getByText('Saved. The Stand box on Today has changed.')).toBeVisible()

  // A bad entry is stopped by the form (the server also refuses it, see test_standing.py)
  await page.getByLabel('Module').selectOption('schreiben')
  await page.getByLabel('What you did').selectOption('real_exam')
  const points = page.getByLabel(/^Module points/)
  await points.fill('101')
  await page.getByRole('button', { name: 'Save result' }).click()
  expect(await points.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true)
  expect((await (await page.request.get('/api/exam-results')).json()).results).toHaveLength(2)

  // More Lesen checks and a real Schreiben result by API, same endpoint as the form
  for (const [d, teile] of [[10, [5, 5, 5, 5, 2]], [0, [5, 6, 6, 6, 3]]] as const) {
    const r = await page.request.post('/api/exam-results', {
      data: { level: 'B1', module: 'lesen', kind: 'practice_full', taken: daysAgo(d), teile: Object.fromEntries(teile.map((v, i) => [i + 1, v])) },
    })
    expect(r.ok()).toBeTruthy()
  }
  const w = await page.request.post('/api/exam-results', {
    data: { level: 'B1', module: 'schreiben', kind: 'real_exam', taken: daysAgo(3), points: 52 },
  })
  expect(w.ok()).toBeTruthy()
  // Void the Hören Teil result (soft delete), see the box change, restore it
  await page.getByRole('row', { name: /B1 hoeren/ }).getByRole('button', { name: 'Void' }).click()
  await expect(page.getByRole('row', { name: /B1 hoeren/ }).getByText('Voided')).toBeVisible()
  await expect.poll(async () => ((await (await page.request.get('/api/standing')).json()).modules as { module: string; status: string }[]).find((m) => m.module === 'hoeren')?.status).toBe('none')
  await page.getByRole('row', { name: /B1 hoeren/ }).getByRole('button', { name: 'Restore' }).click()
  await expect.poll(async () => ((await (await page.request.get('/api/standing')).json()).modules as { module: string; status: string }[]).find((m) => m.module === 'hoeren')?.status).not.toBe('none')
  await page.screenshot({ path: `${SHOTS}/v2-settings.png`, fullPage: true })

  await page.goto('/')
  const box = page.getByRole('region', { name: 'Stand' })
  await expect(box.getByText('Below the pass line')).toBeVisible() // Schreiben 52 official
  await expect(box.getByText('official result')).toBeVisible()
  await expect(box.getByText(/Target date: \d+ \w+ \d{4}/)).toBeVisible()
  await expect(box.getByText('Not measured yet', { exact: true })).toHaveCount(1) // Sprechen only
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-stand-data.png` })

  await box.getByRole('link', { name: 'Lesen' }).click()
  await expect(page).toHaveURL(/\/progress\?module=lesen/)
  await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible()
  await expect(page.getByText('Official tasks')).toBeVisible()
  await expect(page.getByText('App measures, not exam points.').first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v2-progress-lesen.png`, fullPage: true })
})
