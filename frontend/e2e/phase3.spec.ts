import { expect, type Page, test } from '@playwright/test'

// Phase 3 voice screens at 375px against the real backend. Headless Chromium has no working speech
// service, so a fake SpeechRecognition is injected: `window.__say(text)` delivers a final result and
// `window.__end()` makes the browser-side session end (as Chrome Android does after each phrase).
// Without a running Ollama the tutor is offline and the review is LanguageTool only (documented fallback).
const PASSWORD = process.env.E2E_PASSWORD ?? ''
const SHOTS = process.env.E2E_SHOTS ?? 'e2e/.results'

const FAKE_STT = () => {
  type Rec = { onresult: ((e: unknown) => void) | null; onend: (() => void) | null; starts: number }
  const w = window as unknown as Record<string, unknown>
  class FakeRecognition {
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 1
    onresult: ((e: unknown) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onend: (() => void) | null = null
    starts = 0
    constructor() {
      w.__rec = this
    }
    start() {
      this.starts++
      w.__starts = ((w.__starts as number) ?? 0) + 1
    }
    stop() {
      queueMicrotask(() => this.onend?.())
    }
  }
  w.SpeechRecognition = FakeRecognition
  w.__say = (t: string) => {
    const r = w.__rec as Rec
    r.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] })
  }
  w.__end = () => (w.__rec as Rec).onend?.()
}

async function login(page: Page) {
  await page.addInitScript(FAKE_STT)
  await page.goto('/')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

// let entry animations finish so screenshots show the settled screen (test code only)
async function settle(page: Page) {
  await page.waitForTimeout(900)
}

async function noSideScroll(page: Page) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(w).toBeLessThanOrEqual(375)
}

test('roleplay: restarts keep the turn open, Stop + Send, then Say it better', async ({ page }) => {
  await login(page)
  await page.goto('/voice')
  await expect(page.getByRole('heading', { name: 'Bolna' })).toBeVisible()
  await expect(page.getByText(/no speech recognition/)).toHaveCount(0)
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-voice-home.png`, fullPage: true })

  await page.getByRole('button', { name: /Kantine/ }).click()
  await expect(page.getByText('Useful chunks', { exact: false }).or(page.getByText('Goal:'))).toBeVisible()
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-scenario-card.png`, fullPage: true })
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('Wie war dein Wochenende?')).toBeVisible()

  await page.getByRole('button', { name: 'Tap to talk' }).click()
  await page.evaluate(() => (window as unknown as { __say: (t: string) => void }).__say('Am am Wochenende ähm habe ich'))
  // the browser ends recognition three times during a long block: the turn must stay open
  for (let i = 0; i < 3; i++) await page.evaluate(() => (window as unknown as { __end: () => void }).__end())
  await page.evaluate(() => (window as unknown as { __say: (t: string) => void }).__say('nach Frankfurt gefahren'))
  expect(await page.evaluate(() => (window as unknown as { __starts: number }).__starts)).toBe(4)
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-listening.png`, fullPage: true })

  await page.getByRole('button', { name: 'Stop' }).click()
  const box = page.getByLabel('What was heard (you can fix it)')
  await expect(box).toHaveValue('Am am Wochenende ähm habe ich nach Frankfurt gefahren')
  await page.getByRole('button', { name: 'Send' }).click()
  // stored text is the cleaned transcript
  await expect(page.getByText('Am Wochenende habe ich nach Frankfurt gefahren', { exact: true })).toBeVisible({ timeout: 60_000 })
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-turn.png`, fullPage: true })

  await page.getByRole('button', { name: 'End and review' }).click()
  await expect(page.getByRole('heading', { name: 'Say it better' })).toBeVisible({ timeout: 60_000 })
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-say-it-better.png`, fullPage: true })
})

test('shadowing word match and voice recitation; typed fallback', async ({ page }) => {
  await login(page)
  await page.goto('/voice/shadow')
  await expect(page.getByRole('heading', { name: 'Takrar' })).toBeVisible()
  const sentence = (await page.locator('section p[lang="de"]').first().textContent()) ?? ''
  await page.getByRole('button', { name: 'Tap to talk' }).click()
  await page.evaluate((t) => (window as unknown as { __say: (t: string) => void }).__say(t), sentence)
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('status').filter({ hasText: /heard/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /of 3 stars/ }).first()).toBeVisible()
  await expect(page.getByText(/fluency/i)).toHaveCount(0)
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-shadowing.png`, fullPage: true })

  await page.goto('/voice/recite/SEIN_PRAESENS')
  await expect(page.getByRole('heading', { name: /sein/ })).toBeVisible()
  for (const row of ['ich bin', 'du bist', 'er sie es ist', 'wir sind', 'ihr seid', 'sie Sie sind']) {
    await page.getByRole('button', { name: 'Type instead' }).click()
    await page.getByLabel('Your answer in German').fill(row)
    await page.getByRole('button', { name: 'Next row' }).click()
  }
  await expect(page.getByText('Clean.')).toBeVisible()
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-recitation-voice.png`, fullPage: true })
})

// Visual check of the chat and the graded review with the API mocked: this container has no Ollama, so
// real replies are always "offline". The mocks only shape the screenshots; logic is tested in vitest/pytest.
test('chat without mid-turn grading, stars in the review (API mocked)', async ({ page }) => {
  await login(page)
  await page.goto('/voice')
  await page.getByRole('button', { name: /Deutsche Bahn/ }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('Guten Tag, wie kann ich Ihnen helfen?')).toBeVisible()
  const replies = [
    { user: 'Mein Zug hatte Verspätung.', reply_de: 'Das tut mir leid. Wohin möchten Sie fahren?' },
    { user: 'Ich habe meinen Anschluss nach Frankfurt verpasst mit der Zug.', reply_de: 'Der nächste Zug fährt um 14 Uhr.' },
  ]
  let n = 0
  await page.route('**/api/voice/turn', async (route) => {
    const r = replies[n++]
    await route.fulfill({ json: { idx: n, input_mode: 'voice', reply_en: 'gloss', tutor_status: 'ok', needs_review: false, ...r } })
  })
  for (const r of replies) {
    await page.getByRole('button', { name: 'Tap to talk' }).click()
    await page.evaluate((t) => (window as unknown as { __say: (t: string) => void }).__say(t), r.user)
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(r.reply_de)).toBeVisible()
  }
  await expect(page.getByRole('img', { name: /of 3 stars/ })).toHaveCount(0) // no grading during the talk
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-chat.png` })

  const url = page.url()
  const id = url.split('/').pop()
  await page.route(`**/api/voice/session/${id}/review`, async (route) => {
    const s = await (await page.request.get(`/api/voice/session/${id}`)).json()
    await route.fulfill({
      json: {
        ...s,
        status: 'reviewed',
        review: {
          source: 'ollama',
          teaching_points: ["'mit' always takes the Dativ: mit dem Zug."],
          summary: { lines: 2, graded: 2, clean: 1, errors: 1, stars: 5, max_stars: 6 },
          lines: [
            { turn: 1, said: replies[0].user, better: replies[0].user, graded: true, errors: [], stars: 3, needs_review: false },
            {
              turn: 2, said: replies[1].user, better: 'Ich habe meinen Anschluss nach Frankfurt mit dem Zug verpasst.',
              graded: true, stars: 2, needs_review: false,
              errors: [{ span: 'der Zug', fix: 'dem Zug', tag: 'CASE_DAT', reason_en: 'mit + Dativ', start: 54, end: 61 }],
            },
          ],
        },
      },
    })
  })
  await page.getByRole('button', { name: 'End and review' }).click()
  await expect(page.getByRole('heading', { name: 'Say it better' })).toBeVisible()
  await expect(page.getByRole('img', { name: '3 of 3 stars' })).toBeVisible()
  await expect(page.getByLabel('5 of 6 stars')).toBeVisible()
  await noSideScroll(page)
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/p3-review-stars.png`, fullPage: true })
})
