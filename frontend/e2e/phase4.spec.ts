import { expect, type Page, test } from '@playwright/test'

// Phase 4 reading + listening at 1440x900 against the real backend. Headless Chromium has no German
// voice, so Play falls back to the server (Piper; a fake Piper in the e2e setup) or shows the text note.
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

async function noSideScroll(page: Page) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(w).toBeLessThanOrEqual(page.viewportSize()?.width ?? 1440)
}

test('no horizontal scroll at 1024 and 1440 on reading and listening routes', async ({ page }) => {
  await login(page)
  const first = await page.evaluate(async () => {
    const t = await (await fetch('/api/texts')).json()
    return [...t.today, ...t.library][0]?.id as number | undefined
  })
  const routes = ['/read', ...(first ? [`/read/${first}`] : []), '/listen', '/listen/diktat', '/listen/podcast', '/listen/sources']
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of routes) {
      await page.goto(route)
      await expect(page.getByRole('heading').first()).toBeVisible()
      const w = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(w, `${route} at ${width}`).toBeLessThanOrEqual(width)
    }
  }
})

test('reader: tap to gloss, English hidden by default, answers only after Check', async ({ page }) => {
  await login(page)
    await page.goto('/read')
  await expect(page.getByRole('heading', { name: 'Lesen' })).toBeVisible()
  await expect(page.getByText('reading', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Known words').first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-reader-list.png`, fullPage: true })

  await page.getByRole('link', { name: /Bilals erster Tag/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Bilals erster Tag' })).toBeVisible()
  // interlinear off: no English sentence until asked
  const firstEn = page.getByText('Bilal is 27 years old', { exact: false })
  await expect(firstEn).toHaveCount(0)
  await page.getByRole('button', { name: 'Translate sentence 1', exact: true }).click()
  await expect(page.locator('article p.text-neutral-600').first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-reader.png`, fullPage: false })

  await page.locator('article').getByRole('button', { name: 'Bank', exact: true }).first().click()
  await expect(page.getByRole('dialog').or(page.getByLabel(/Meaning of/))).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/v0-reader-gloss.png` })
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('article').getByRole('button', { name: 'Bank', exact: true }).first().click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // questions: no right answer visible before Check
  await expect(page.getByText(/Score:/)).toHaveCount(0)
  const q = page.locator('section', { has: page.getByRole('heading', { name: 'Questions' }) })
  await q.getByRole('button', { name: 'richtig' }).first().click()
  const mcButtons = q.locator('div.rounded-lg').nth(1).getByRole('button')
  await mcButtons.first().click()
  for (const sel of await q.locator('select').all()) await sel.selectOption({ index: 1 })
  await q.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText(/Score: \d+%/)).toBeVisible()
  await noSideScroll(page)
  await q.screenshot({ path: `${SHOTS}/v0-reader-questions.png` })
})

test('diktat: sentence hidden until Check, then diff by error kind', async ({ page }) => {
  await login(page)
  await page.goto('/listen')
  await expect(page.getByRole('heading', { name: 'Hören' })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-listen.png`, fullPage: true })
  await page.goto('/listen/diktat')
  await expect(page.getByRole('heading', { name: 'Diktat' })).toBeVisible()
  const today = await page.evaluate(async () => (await fetch('/api/dictation/today')).json())
  const say: string = today.sentences.find((s: { done: boolean }) => !s.done).say
  await expect(page.getByText(say)).toHaveCount(0)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  // type it lower case with one umlaut dropped, so capitals/umlauts show up in the diff
  await page.getByLabel('Write what you hear').fill(say.toLowerCase().replace('ä', 'a').replace('ü', 'u'))
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByLabel('Word by word')).toBeVisible()
  await expect(page.getByText(say).first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-diktat.png`, fullPage: true })
})

test('podcast and sources', async ({ page }) => {
  await login(page)
  await page.goto('/listen/podcast')
  await expect(page.getByRole('heading', { name: 'Commute Podcast' })).toBeVisible()
  await page.getByRole('button', { name: "Build today's episode" }).click()
  await expect(page.locator('audio')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('link', { name: /^Download/ })).toHaveAttribute('download', /^ustad-podcast-\d{4}-\d{2}-\d{2}\.(mp3|wav)$/)
  await expect(page.getByText(/offline/i)).toHaveCount(0)
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-podcast.png`, fullPage: true })

  await page.goto('/listen/sources')
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible()
  await page.getByLabel('YouTube link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveAttribute(
    'src',
    /cc_load_policy=1&cc_lang_pref=de/,
  )
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/v0-sources.png`, fullPage: true })
})
