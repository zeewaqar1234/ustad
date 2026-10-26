import { expect, type Page, test } from '@playwright/test'

// Phase 4 reading + listening at 375px against the real backend. Headless Chromium has no German
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
  expect(w).toBeLessThanOrEqual(375)
}

test('reader: tap to gloss, English hidden by default, answers only after Check', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Reading and listening')).toBeVisible()
  await page.goto('/read')
  await expect(page.getByRole('heading', { name: 'Lesen' })).toBeVisible()
  await expect(page.getByLabel('Known words').first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-reader-list.png`, fullPage: true })

  await page.getByRole('link', { name: /Bilals erster Tag/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Bilals erster Tag' })).toBeVisible()
  // interlinear off: no English sentence until asked
  const firstEn = page.getByText('Bilal is 27 years old', { exact: false })
  await expect(firstEn).toHaveCount(0)
  await page.getByRole('button', { name: 'Translate sentence 1', exact: true }).click()
  await expect(page.locator('article p.text-neutral-600').first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-reader.png`, fullPage: false })

  await page.locator('article').getByRole('button', { name: 'Bank', exact: true }).first().click()
  await expect(page.getByRole('dialog').or(page.getByLabel(/Meaning of/))).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/p4-gloss.png` })
  await page.getByRole('button', { name: 'Close' }).click()

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
  await q.screenshot({ path: `${SHOTS}/p4-questions.png` })
})

test('diktat: sentence hidden until Check, then diff by error kind', async ({ page }) => {
  await login(page)
  await page.goto('/listen')
  await expect(page.getByRole('heading', { name: 'Hören' })).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-listen.png`, fullPage: true })
  await page.goto('/listen/diktat')
  await expect(page.getByRole('heading', { name: 'Diktat' })).toBeVisible()
  const today = await page.evaluate(async () => (await fetch('/api/dictation/today')).json())
  const say: string = today.sentences.find((s: { done: boolean }) => !s.done).say
  await expect(page.getByText(say)).toHaveCount(0)
  await page.getByRole('button', { name: '▶ Play' }).click()
  // type it lower case with one umlaut dropped, so capitals/umlauts show up in the diff
  await page.getByLabel('Write what you hear').fill(say.toLowerCase().replace('ä', 'a').replace('ü', 'u'))
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByLabel('Word by word')).toBeVisible()
  await expect(page.getByText(say).first()).toBeVisible()
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-diktat.png`, fullPage: true })
})

test('podcast and sources', async ({ page }) => {
  await login(page)
  await page.goto('/listen/podcast')
  await expect(page.getByRole('heading', { name: 'Commute Podcast' })).toBeVisible()
  await page.getByRole('button', { name: "Build today's episode" }).click()
  await expect(page.locator('audio')).toBeVisible({ timeout: 60_000 })
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-podcast.png`, fullPage: true })

  await page.goto('/listen/sources')
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible()
  await page.getByLabel('YouTube link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveAttribute(
    'src',
    /cc_load_policy=1&cc_lang_pref=de/,
  )
  await noSideScroll(page)
  await page.screenshot({ path: `${SHOTS}/p4-sources.png`, fullPage: true })
})
