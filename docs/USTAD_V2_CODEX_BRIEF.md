# USTAD v2: change brief for Codex

Version 1.0 · 26 Oct 2026 · Owner: Zee (single user) · Repo: `zeewaqar1234/ustad`
Written from a full read of the repo at commit `956ad2d` (Phase 4 done). Everything below "Audit findings"
was checked against the code; file paths are given so you can verify before changing anything.

---

## 0. How Zee uses this file (read first, Zee)

1. Put this file in the repo root as `docs/V2_BRIEF.md` and commit it.
2. Codex reads `AGENTS.md`, not `CLAUDE.md`. Phase V0 creates `AGENTS.md`. Until then, start every Codex
   prompt with "Read CLAUDE.md first and follow it, except where docs/V2_BRIEF.md overrides it."
3. One phase per Codex task/session. Paste the prompt at the end of each phase section. Do not paste two phases
   at once. After each phase: check the acceptance list yourself, then start a new Codex session for the next.
4. If Codex fails the same thing twice: new session, paste the phase prompt again plus one line on what went
   wrong. Do not argue in a long session.
5. Phases V0 to V2 are the ones that change what you see and feel every day. **Use the app for at least 5 study
   days after V2 before starting V3.** The builder gate in this repo exists for exactly this reason (see §2).

Phase overview:

| Phase | What you get | Size |
|---|---|---|
| V0 | MacBook layout, sidebar, no emoji/fake icons, AGENTS.md, cleanup of known bugs | M |
| V1 | One evidence ledger: every mistake and every correct use from all 4 skills in one table; per-skill time | L |
| V2 | The **Stand** score box (official Goethe scale, your data only, pace + forecast) + Progress page | L |
| V3 | **Mazmoon**: daily essay inside the loop, graded on the official Goethe criteria, rewrite step | M |
| V4 | Adaptive Ustad: learner model + daily planner; all 4 skills feed each other; new teaching mixed in | L |
| V5 | Exam checks (official Übungssätze + app checks) feeding the Stand box; weekly test; report card | L |
| V6 | Motivation layer + Today screen final polish (minimum day, weekly target, Ustad's remarks) | M |

---

## 1. Audit findings (what exists, what is wrong)

### 1.1 What works and must be kept

- Daily loop Manzil → Sabqi → Sabaq with FSRS (`backend/app/services/daily.py`, `srs/`), Sabaq locked until
  Manzil is done, makeup day rule, 3-reps cap. Sound design; keep.
- Grader pipeline LanguageTool → Ollama JSON (Pydantic) → span check → LanguageTool on the correction
  (`services/grading.py`). Keep; it is the base for the essay grader.
- Ghalti Register + `fix_sentence` cards (`services/ghalti.py`). Keep the idea; fix the counting (1.2).
- Stammer-safe voice (no timers, tap ends the turn, grading only in the end review, disfluency stripping).
  Keep every rule.
- Reading with known-word density, Diktat with typed error kinds, podcast script from yesterday's mistakes.
- 40 grammar patterns with `tags` that already map to the `ErrorTag` enum (`data/seed/patterns.json`). This
  mapping is the hinge for V4.

### 1.2 Logic problems found in the code

| # | Problem | Where | Effect |
|---|---|---|---|
| L1 | Ghalti counts a repeat only when the **same sentence** (`lower(orig)` + tag) recurs. Two different sentences with the same `VERB_FINAL` error are two rows with count 1 each. | `services/ghalti.py` `record()` | "Recurring (≥ 3)" only fires when the exact same sentence is wrong 3 times; the top-10 list shows sentences, not habits. |
| L2 | Only **errors** are logged. Correct uses of a structure are never counted. | grader schema `llm/schemas.py` `GradeResult` | No error *rate* is possible (SPEC §1 target "verb position error rate < 10 %" cannot be computed). Mastery can only go down. |
| L3 | Errors flow **into** Ghalti but almost nothing flows **out**: the Author (reading), tutor (speaking), homework prompt and Diktat do not read Ghalti. Only the podcast does. | `reading/author.py`, `voice/tutor.py`, `api/homework.py`, `listening/diktat.py` | Skills are not integrated; content does not adapt to mistakes. |
| L4 | Next grammar pattern = fixed order only. | `api/patterns.py` `current_pattern()` | The app teaches pattern 12 while Zee keeps failing pattern 10. |
| L5 | Homework = the current pattern's `homework` text. Same prompt every day until the pattern is done. No essay anywhere. | `api/homework.py` `today()` | Requirement 2 missing; writing feels repetitive. |
| L6 | Study day = Manzil + (Sabqi or Sabaq). Writing, speaking, reading, listening never count. | `services/streak.py` `refresh_study_day()` | The app rewards card review only. Production (the actual gap) is invisible in attendance. |
| L7 | Active minutes: one number per day. Homework/Tagebuch writing adds **0** minutes. No split by skill. | `services/daily.py` `add_minutes()`; no call in `api/homework.py` | Pace per skill (needed for the forecast) cannot be computed. |
| L8 | `profile.level_band` defaults to `"B1.1"` before any placement; Author and tutor use it. | `models/__init__.py` line ~26, `reading/author.py`, `voice/tutor.py` | An assumption presented as a level. |
| L9 | Placement "classes" (A2+, B1.1, B1.2, B1 Board, B2.1), the 70 % band threshold and the 35 items are app-made, not an official test. The UI says "Your class: B1.2" with no caveat. | `services/placement.py`, `features/placement/Placement.tsx` | Looks official, is not. |
| L10 | No progress dashboard. `/api/stats` only has `/gate`. Progress bits are scattered over ~8 screens. | `api/stats.py`, frontend audit | Requirement 1 missing. |
| L11 | `GET /api/homework/today` writes a row (GET with side effect). | `api/homework.py` | Known nit from Phase 2; fix while touching the file. |
| L12 | `StudySession` table (`session`) exists but nothing writes it; `Attempt.session_id` always null. | `models/__init__.py` | Dead schema; reuse or drop in V1. |
| L13 | Builder gate is permanently open: `profile.gate_override = true` since 21 Oct; the gate log never shows ≥ 5 study days (Zee's own count on 21 Oct: 1). | `docs/PROGRESS.md` gate log | Phases 2 to 4 were built under the override. The gate no longer guards anything. |

### 1.3 UI problems found (frontend audit)

- Whole app capped at `max-w-md` (~448 px) in `src/App.tsx` (Shell), `pages/Login.tsx`, Reader bottom sheet.
  No breakpoints anywhere. Manifest `orientation: 'portrait'`, `display: 'standalone'` (`vite.config.ts`).
  Playwright runs only at 375×812 `isMobile` (`playwright.config.ts`). `CLAUDE.md` says "phone-first (375px)".
- Home shows **16 equal-weight cards** from 7 API calls; stats above the "Today" heading; Bolna listed under
  "Grammar and writing"; admin rows (Placement, Ghalti, Check queue) as prominent as daily tasks; no single
  "next thing to do".
- Top nav has Ghalti, Check queue, Log out; no route to Bolna, Lesen, Hören, Grammar.
- Emoji: `lib/voice.ts` SCENARIO_ICON (🍽️ 💻 🚨 📈 🩺 🚆 💬), `VoiceHome.tsx` (💬 🔁 📜 🎭), `Session.tsx` 🎓.
  Voice screens use emerald/teal gradients, violet/fuchsia pills, breathing/ripple mic animations: they look like
  a different app from the grayscale rest.
- Duplicates: Pahara typed (`/recitation`) and spoken (`/voice/recite`) in two styles; Lesen reachable from Home
  and Hören; three near-identical row components; three back-link styles.
- Writing is split across Homework, Tagebuch and Placement with no shared history.

---

## 2. Rules for Codex (non-negotiables)

Carry over from `CLAUDE.md`, with the changes marked NEW or CHANGED.

1. **Speaking never adds time pressure.** No auto turn-end, no timers in speaking, no interruption, fluency
   scores hidden, disfluencies stripped before grading. Zee stammers. Unchanged, absolute.
2. Ask before telling: every exercise hides the answer until an attempt. Unchanged.
3. All LLM output = JSON validated by Pydantic; generated German passes LanguageTool or is `needs_review`.
   LanguageTool self-hosted only. Unchanged.
4. **NEW: No invented numbers.** Every number on the Stand box and Progress page is either (a) an official
   constant from `data/official/*.json` with its source URL, or (b) computed from Zee's own rows in the DB with
   the formula written in `docs/v2/metrics.md`. If there is not enough data, show "Not measured yet" and what
   would measure it. Never fill gaps with defaults, demo data or LLM guesses. A level label never comes from the
   LLM.
5. **NEW: The LLM never decides what Zee studies.** Planning, scheduling, scoring and level estimates are
   deterministic Python with unit tests. The local model only writes content (texts, prompts, feedback) inside
   constraints the planner gives it. Reason: an 8B local model is not reliable or testable as a planner.
6. **CHANGED: MacBook only.** Target viewports 1280×800 to 1728×1117 (CSS px), designed at 1440×900, minimum
   supported width 1024. No phone layout, no touch-only interactions, no bottom sheets, no portrait lock.
   Keyboard first (shortcuts for submit, reveal, next).
7. **NEW: No emoji, no decorative or "AI-looking" icons** (sparkles, robots, avatars, gradient blobs, glowing
   orbs, confetti). Text labels first. A small set of plain functional line icons is allowed only where a text
   label would not fit (play, stop, mic, close), one icon set, monochrome.
8. Copy tone: short, direct, specific. No hype, no em dashes, no fake praise, no exclamation marks.
9. Visual: grayscale base + **one** accent colour used only for "current/next action" and the pass line. Every
   chart and score must stay readable printed in black and white (patterns/labels, not colour alone).
10. Builder gate stays. Before starting any phase ≥ V3, call `GET /api/stats/gate`. If
    `study_days_last_7 < 5` and Zee has not written "override for this phase" in the prompt, do bug fixes only
    and say why. V0 clears `gate_override` (see V0).
11. New dependency = one-line reason in `docs/PROGRESS.md`. Prefer none.
12. Each phase ends with: tests run and output shown, `docs/PROGRESS.md` updated (new section "V2 phases"),
    screenshots at 1440×900 in `docs/evidence/v2/`, one git commit per phase.
13. Do not rename or delete user data. Every schema change is an Alembic migration with a downgrade, and a
    backfill where old rows can be converted.

---

## 3. Target design in one picture

```
 every exercise (cards, drills, essay, voice review, Diktat, reading Qs, exam checks)
        │  writes
        ▼
 evidence_event  (skill, tag, pattern, outcome correct/error, source, ts)      activity_log (skill, seconds)
        │                                                                              │
        ▼                                                                              ▼
 learner model (Python): mastery per pattern, error rate per tag, vocab coverage, skill minutes/week
        │                                     │
        ▼                                     ▼
 daily planner (Python): today's plan      Stand box + Progress page (official scale + own data)
        │  focus tags, new pattern, essay task, Diktat picks, text constraints, scenario goals
        ▼
 generators (Ollama, JSON): Author text, essay prompt wording, tutor scenario, feedback
```

The loop that makes it "a teacher": a mistake in any skill raises that tag's priority → tomorrow the reading
text contains the structure, Diktat dictates it, the essay must use it, the tutor asks questions that force it,
Sabqi drills it → correct uses lower the priority → the planner moves on to new material.

---

## 4. Official reference data (the only allowed constants)

Checked 26 Oct 2026 against Goethe-Institut and Council of Europe pages. Codex: encode these in
`data/official/*.json` with the URL per fact. Do not add constants that are not in this section. If a later
official document differs, Zee updates the JSON, not the code.

### 4.1 Goethe-Zertifikat B1 (modular; rules "Stand: 1. September 2025")
Sources: Durchführungsbestimmungen B1 https://www.goethe.de/pro/relaunch/prf/de/Durchfuehrungsbestimmungen_B1.pdf ·
Übungssatz Erwachsene https://www.goethe.de/pro/relaunch/prf/materialien/B1/B1_Uebungssatz_Erwachsene.pdf ·
Modellsatz Erwachsene (2nd ed. 2015) https://www.goethe.de/pro/relaunch/prf/materialien/B1/b1_modellsatz_erwachsene.pdf ·
practice materials page https://www.goethe.de/ins/de/de/prf/gzb1/ueb.html

- Four modules: Lesen, Hören, Schreiben, Sprechen. Each can be taken alone. Each max **100** points.
- **Pass: at least 60 points per module.**
- Grade bands per module: 100 to 90 sehr gut · 89 to 80 gut · 79 to 70 befriedigend · 69 to 60 ausreichend ·
  59 to 0 nicht bestanden.
- **Lesen:** 65 min, 5 Teile, items 6 / 6 / 7 / 7 / 4 = 30, one point each. **Module points = raw × 3.33,
  rounded to the nearest whole point** (18 correct = 60).
- **Hören:** about 40 min, 4 Teile, items 10 / 5 / 7 / 8 = 30, same conversion (× 3.33, rounded).
- **Schreiben:** 60 min, 3 Aufgaben, rated by two independent raters (the app cannot do that; one more reason
  its essay points are an estimate).
  - Aufgabe 1: e-mail, about 80 words, 20 min suggested. Points: Erfüllung 10, Kohärenz 10, Wortschatz 10,
    Strukturen 10 = 40.
  - Aufgabe 2: Diskussionsbeitrag (opinion), about 80 words, 25 min suggested. Same 4 × 10 = 40.
  - Aufgabe 3: semi-formal e-mail, about 40 words, 15 min suggested. Erfüllung 4, Kohärenz 4,
    Wortschatz 6, Strukturen 6 = 20.
  - Bands A to E, no in-between values. Band scales on the sheet: 10 / 7.5 / 5 / 2.5 / 0, 6 / 4.5 / 3 / 1.5 / 0,
    4 / 3 / 2 / 1 / 0.
  - Erfüllung band E (incl. **less than 50 % of the required word count**, or off topic) → the whole Aufgabe
    scores 0.
- **Sprechen:** about 15 min per pair (10 min alone) + 15 min preparation. Teil 1 plan something together,
  Teil 2 present a topic with slides, Teil 3 react to feedback and questions. Criteria: Erfüllung, Kohärenz/
  Interaktion, Wortschatz, Strukturen per Teil, plus Aussprache across all Teile. Point split as read from
  the examiner sheets: Teil 1 Erfüllung 8, Interaktion 4, Wortschatz 8, Strukturen 8; Teil 2 Erfüllung 12,
  Kohärenz 4, Wortschatz 12, Strukturen 12; Teil 3 Erfüllung 16; Aussprache 16; total 100.
  **Verify:** a second check confirmed the criteria names and the scales (16/12/8/4/0, 12/9/6/3/0, 8/6/4/2/0,
  4/3/2/1/0) but not which scale belongs to which criterion. Zee or Codex checks the Prüferblätter in the
  Übungssatz PDF before encoding; the JSON gets `"verified": false` until then and the UI shows Sprechen
  check points as "provisional".
  - The app cannot score Aussprache (Web Speech gives no pronunciation score, SPEC §16). App-made Sprechen
    checks therefore score at most 84 of 100 measurable points; show "Aussprache not measured" and scale
    nothing up.
- Conflict to know: the 2015 Modellsatz text also names Register/soziokulturelle Angemessenheit for
  Schreiben; the Übungssatz rating sheet uses the 4 criteria above. Use the 4 criteria (they match the point
  table); note the conflict in the JSON.

### 4.2 Goethe-Zertifikat B2 (modular)
Sources: https://www.goethe.de/pro/relaunch/prf/de/Durchfuehrungsbestimmungen_B2.pdf ·
Modellsatz Erwachsene https://www.goethe.de/pro/relaunch/prf/materialien/B2/b2_modellsatz_erwachsene.pdf

- Same 100 points per module, pass 60, same grade bands, Lesen/Hören raw × 3.33.
- Lesen 65 min, 5 Teile, 9 / 6 / 6 / 6 / 3 = 30. Hören about 40 min, 4 Teile, 10 / 6 / 6 / 8 = 30.
- Schreiben 75 min: Aufgabe 1 Forumsbeitrag (opinion) about 150 words, 50 min, points 14 / 14 / 16 / 16 = 60;
  Aufgabe 2 message to a superior about 100 words, 25 min, 10 / 10 / 10 / 10 = 40.
- Sprechen about 15 min per pair + 15 min preparation: Teil 1 talk + questions, Teil 2 discussion; Aussprache 16.
  Same "verify" flag as B1 Sprechen.
- Do not use the old pre-modular B2 "Prüfungsziele" PDF (4 × 25 points); it describes the retired format.

### 4.3 CEFR (Council of Europe)
Sources: global scale https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale ·
Companion Volume 2020 https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4

- Use the global-scale descriptors as **text only** on the Progress page (what B1 and B2 mean), paraphrased:
  B1 = understands main points of clear standard input on familiar matters, writes simple connected text,
  gives brief reasons for opinions and plans. B2 = understands main ideas of complex texts incl. technical
  discussion in his field, interacts without strain, writes clear detailed text, explains a viewpoint with
  pros and cons.
- The CEFR gives **no vocabulary sizes and no study hours** (none found in the CEFR or Companion Volume;
  the CoE says language-specific content is left to separate descriptions, for German Profile Deutsch). So
  the app never shows "you know enough words for B1" from a CEFR number.

### 4.4 Official word lists (Goethe-Institut)
- B1 list: "circa 2400 lexikalische Einheiten" (2016), https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf
- A2 list: about 1300, A1 list: about 650. Exam texts may contain words outside the lists.
- No official Goethe list for B2 found. So word coverage is shown only for the B1 list; with a B2 target the
  line says "No official B2 word list; B1 list coverage shown".
- Licence: the PDFs restrict storing them in a network (SPEC §11). Keep the file and anything parsed from it
  in `data/private/` (gitignored), on the Mac only. Store only counts in the DB. Not legal advice.

### 4.5 Hours (NOT used in any calculation)
Goethe-Institut pages give course-hour ranges "depending on prior knowledge", e.g. B1 350 to 650 UE
(https://www.goethe.de/ins/si/de/spr/prf/gzb1/inf.html), while the London FAQ used in SPEC §3 P12 says
260 to 490 hours. The sources disagree and both describe classroom courses from zero, not Zee. The forecast
uses only Zee's own hours and results. Do not show "you need N hours for B1".

---

## 5. Teaching psychology rules (apply in every phase)

Zee grew up in the Pakistani school system: Sabaq/Sabqi/Manzil, recitation, copy checking, marks, report
cards, a strict teacher. The app keeps what works in that system and removes what hurts adult learning.

| Habit from school | Keep / change | Rule in the app |
|---|---|---|
| Marks out of 100, report card | Keep | Show marks on the **official** Goethe 0 to 100 scale per module; weekly report card. Marks always come with the next step ("Schreiben 52: 8 points to pass. Biggest loss: Strukturen"). |
| Teacher checks homework daily | Keep | Mazmoon is due daily, checked the same day, "Not submitted" shows on the report card. |
| Ratta (rote) and recitation | Keep, then add use | Every recitation or memorised chunk is followed the same day by a use task in a new sentence (SPEC P3). The planner enforces it. |
| "Write the correction 5 times" | Change | One rewrite of the wrong sentence after a hint, then the sentence goes to SRS. Spaced retrieval beats massed copying (SPEC P2, P4). |
| Cramming before the test | Change | Weekly test on a fixed day, no cram mode, no "study all due cards now". |
| Fear of being wrong / shame | Change | Mistakes are private notebook entries, never red floods: max 3 teaching points per correction, grayscale red-pen, wording neutral ("Verb position after weil: 3 times this week"). |
| All-or-nothing ("streak broken, so I quit") | Change | Minimum day, 2 freezes/week, attendance % next to the streak, "missing one day does not undo the habit". |
| Comparing with others / rank | Remove | Only compare Zee with Zee: this week vs last week, first essay vs latest essay. |
| Teacher decides everything | Balance | The Ustad plans the day, but Zee sets the target exam, target date and weekly hours (autonomy, SDT). The plan always says *why* (one line from data). |
| Avoiding speaking in front of others | Respect | Speaking stays private, untimed, typed fallback always on. Typed turns count for practice and streak, but **only spoken sessions count as Sprechen evidence** (honesty of the score). |

Feedback language: English by default. The Roman Urdu option stays off by default; a local 8B model writes
unreliable Roman Urdu, so it is not a priority.

---

## Phase V0: MacBook layout, clean UI shell, cleanup

**Goal:** the app fits a MacBook screen, looks like one calm app, has no emoji or fake icons, and the known
bugs that would corrupt later numbers are fixed. No new learning features.

Tasks:
1. **AGENTS.md.** Create `AGENTS.md` (< 80 lines) from `CLAUDE.md` with §2 of this brief applied (MacBook only,
   no invented numbers, LLM never plans, no emoji/decorative icons). Update `CLAUDE.md` to the same rules so both
   tools see one truth. Point both to `docs/V2_BRIEF.md`.
2. **Remove phone constraints.**
   - `src/App.tsx` Shell: drop `max-w-md`. New shell = fixed left sidebar (220 px) + main area. Main content
     `max-width: 1120px`, side padding 32 px. Exercise screens (review, Sabaq, drills, Diktat, Mazmoon, voice
     chat) use a centered 720 px column inside the main area.
   - Remove `min-h-[calc(100dvh-3.5rem)]`/`mt-auto` thumb-reach layouts (Sabaq, ReviewSession, Recitation,
     Placement, PatternCard, Drills, Session). Action buttons sit directly under the content.
   - Reader word gloss: right-side panel (or popover next to the word), not a bottom sheet. Sentence
     translation: an "EN" button on hover/focus instead of long-press.
   - Hold-to-talk: remove the pointer-capture hold mode. Talk mode = click Start / click Stop, plus the
     keyboard: `Space` starts and stops listening only when the focus is not in a text field. Stop never ends
     the turn; only Send does (unchanged rule).
   - Umlaut buttons: keep as a compact inline row; add a one-line hint for macOS long-press/Option shortcuts.
   - `index.html`: remove `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `viewport-fit=cover`.
   - **PWA:** remove `vite-plugin-pwa` and the manifest. Add a one-time script in `main.tsx` that unregisters
     any old service worker and deletes old caches, so stale builds do not stick after Codex changes. The
     Commute Podcast keeps "Download mp3" (Zee can play it on any device); remove "Save for offline".
   - Playwright: replace the phone project with a desktop project `1440×900, deviceScaleFactor 2`; add a
     no-horizontal-scroll check at 1024 and 1440 widths on every route. Update tests that assert 375 px.
3. **Navigation.** Sidebar groups:
   - Today
   - Practice: Lesen, Hören, Schreiben, Sprechen
   - Grammatik (pattern list + Pahara typed and spoken merged into one page with a "type / speak" switch)
   - Ghalti
   - Fortschritt (Progress; placeholder page until V2)
   - bottom: Settings (contains Placement test, Check queue, Sources, Log out)
   Every screen name gets one plain subtitle the first time it appears (e.g. "Manzil · old revision").
   Remove the top nav bar. Fix the double header on the voice session.
4. **Icon and emoji purge.**
   - Delete `SCENARIO_ICON` emoji in `lib/voice.ts` and every emoji in `VoiceHome.tsx`, `Session.tsx`.
     Scenario cards = title + one-line goal + level text, no avatar.
   - Restyle all `features/voice/*` to the shared grayscale system: no gradients, no violet/fuchsia/sky pills,
     no breathing/ripple/wave mic orb. Listening state = text "Listening. Click Stop when you are done." plus
     the live transcript.
   - Replace decorative symbols with text: `›`/`‹` chevrons → plain links ("Back to Hören"), `▶` → "Play",
     `↻` → "Repeat", `↗` → "(opens site)", `▴/▾` → "Show/Hide", `○` legend → text "known from placement".
     Keep `→` only inside corrections (wrong → right) and keep ✓/✗ only where they mark right/wrong answers.
   - Keep the gender symbols ▲ ● ■ (SPEC §5.1, they carry meaning in grayscale).
   - Favicon: keep the plain "U" mark; delete the PNG PWA icons.
   - Stars: replace star ratings with plain text ("3 of 4 lines without errors"). Stars add nothing a number
     does not and look gamified.
5. **Design tokens** in `src/index.css` (`@theme`): neutral scale, one accent (used for the next action and
   the pass line only), success/error as text weight + underline styles that survive grayscale print, radius
   6 px, spacing scale, system font stack (SF Pro on macOS), base size 16 px, line height 1.55 for German text.
   Remove the 6 motion keyframes except one subtle fade; respect `prefers-reduced-motion`.
   Build three shared components and use them everywhere: `ListRow`, `PageHeader` (title, subtitle, back link),
   `StatusPill` (text only).
6. **Bug fixes that would corrupt later numbers.**
   - L8: `profile.level_band` default → `NULL`. Author and tutor receive "level not placed yet; write at B1
     and keep sentences short" as an explicit fallback string, and the UI shows "Not placed".
   - L9: placement result copy → "Curriculum start: B1.1 stage. This is the app's own placement, not an
     official CEFR result." Rename "Class" to "Stage" everywhere in UI copy.
   - L11: `GET /api/homework/today` must not write; create the row on `POST`.
   - L13: add `make gate-reset` (sets `profile.gate_override = false`) and run it in the dev DB; tell Zee to
     run it on his Mac DB.
7. Today screen (temporary until V2/V6): one column, max 3 sections: "Next" (one primary button to the next
   undone block in loop order), "Today's loop" (the numbered blocks), "Practice" (Lesen, Hören, Sprechen links).
   Placement, Ghalti and Check queue leave Home.

Acceptance (run and show):
- Screenshots at 1440×900 of Today, Lesen reader with gloss panel open, voice chat, Ghalti, Settings:
  `docs/evidence/v2/v0-*.png`. No horizontal scroll at 1024 and 1440 (Playwright).
- `grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/src` returns nothing except the gender
  symbols ▲ ● ■ and ✓ ✗ in answer marks (list every remaining hit with the reason).
- No `max-w-md`, `isMobile`, `orientation`, `vite-plugin-pwa` left (`grep`).
- Voice: vitest guard still passes (no `setTimeout`/`setInterval`/silence logic in turn code); Space toggles
  listening, Stop does not send.
- `pytest`, `vitest`, `playwright`, `make lint` all pass.

**Codex prompt V0:**
> Read AGENTS.md if it exists, else CLAUDE.md, then docs/V2_BRIEF.md sections 0 to 2 and "Phase V0" only.
> Do Phase V0. Do not start V1. Stop when every V0 acceptance check is run; show the outputs and screenshots,
> update docs/PROGRESS.md under a new heading "V2 phases", commit.

---

## Phase V1: one evidence ledger for all four skills

**Goal:** every exercise writes what was right and what was wrong, tagged by skill, pattern and error tag,
plus active time per skill. This is the data the score box, the planner and the integration need.

Tasks:
1. **Tables** (Alembic migration with downgrade):
   - `evidence_event`: `id, ts, skill` (`vocab|grammar|reading|listening|writing|speaking`), `source`
     (`review|sabaq|drill|recitation|homework|mazmoon|tagebuch|voice_review|shadow|diktat|reading_q|exam_check|placement`),
     `source_ref` (string id of the row), `pattern_code` (nullable), `tag` (ErrorTag, nullable),
     `outcome` (`correct|error`), `severity` (nullable 1 to 3), `orig`, `fix` (nullable text), `meta_json`.
     Index on `(tag, ts)`, `(pattern_code, ts)`, `(skill, ts)`.
   - `activity_log`: `date, skill, seconds` (primary key date+skill).
   - Drop or reuse `session`/`Attempt.session_id` (L12): drop the unused `session` table if nothing reads it;
     keep `attempt`.
2. **One write path:** `services/evidence.py` with `record_event(...)` and `add_activity(db, now, skill, ms,
   cap_ms)`. `add_activity` also updates `day_log.minutes` so old screens keep working. Replace every
   `add_minutes` call with `add_activity` and the right skill:
   review/sabaq → vocab (fix_sentence cards → grammar), drills/recitation → grammar, texts → reading,
   diktat → listening, voice turns/shadow → speaking, **homework and Tagebuch → writing (new: send
   `elapsed_ms` from the editor using the same idle > 60 s rule)**.
3. **Correct uses (L2).** Extend `GradeResult` with `correct_uses: list[{span, tag}]` (max 12). Grader prompt:
   "List up to 12 places where Zee used one of these structures correctly: {target_tags}". Spans must occur in
   Zee's text (same span check as errors; dropped spans counted). Same extension for the voice
   `SessionReview` per line. Target tags = the pattern tags of the task plus V2_POSITION, VERB_FINAL,
   AUX_HABEN_SEIN, PARTIZIP, CASE_AKK, CASE_DAT, PREP_CASE, ADJ_ENDING (until V4 provides focus tags).
4. **Writers per source:**
   - review_log: `fix_sentence` card → its item tag, rating ≥ 3 correct, rating 1 error; gender card → tag
     GENDER; other vocab cards → skill vocab, tag null.
   - drills: pattern code + drill tag; first-try correct/incorrect.
   - homework/Tagebuch/essay: each error (with severity) and each correct use.
   - voice review: errors + correct uses per line; **only `voice_turn.input_mode = "voice"` lines get skill speaking**;
     typed lines get skill writing.
   - shadow: skill speaking, outcome correct if ≥ 90 % words heard, tag null, meta `kind: recognition`.
   - Diktat: one event per wrong word: umlaut → UMLAUT, capital → CAPITALISATION, spelling → SPELLING,
     ending → ADJ_ENDING if spaCy POS of the expected word is ADJ or DET, PLURAL if NOUN, else OTHER;
     one `correct` event per fully correct sentence (tag null).
   - reading questions: skill reading, outcome per question, meta question type.
5. **Ghalti counting (L1).** Keep `mistake` rows for the sentence table. "Recurring" and "top 10" move to
   tags: a tag is recurring when it has ≥ 3 error events in the last 30 days from ≥ 2 different `orig`
   sentences. Heat map shows errors and error rate (`errors / (errors + correct)`, shown only when the tag has
   ≥ 5 events; else "too few uses").
6. **Backfill:** migration script converts existing `mistake`, `attempt` (drills, diktat) and
   `review_log` rows of fix_sentence cards into `evidence_event` with `meta_json.backfilled = true`.
   Minutes already in `day_log` stay unsplit; `activity_log` starts at migration date (say so on Progress).
7. **Study day (L6).** Study day = Manzil done (or nothing due) **and** at least one of: Sabqi, Sabaq,
   Mazmoon submitted, a voice session reviewed, Diktat 5 of 5, a text read with its questions answered.
   Update `refresh_study_day` and its tests.
8. `docs/v2/metrics.md`: write each formula from this phase in plain words + code location.

Acceptance:
- pytest: each source writes the expected events (one test per source); correct_uses spans not in the text
  are dropped; typed voice lines never get skill speaking; recurring-by-tag fires for 3 errors in 2 different
  sentences and not for 3 repeats of one sentence; backfill is idempotent (running it twice adds nothing);
  homework time now adds to `activity_log` writing.
- Grader fixture test extended: 5 fixtures with known correct uses (mocked model) + the real-model test
  behind `RUN_OLLAMA=1`.
- `SELECT skill, count(*) FROM evidence_event GROUP BY skill` after the e2e run shows all 6 skills.

**Codex prompt V1:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases section) and docs/V2_BRIEF.md sections 1 to 3 and "Phase V1"
> only. Do Phase V1. Stop when every acceptance check is run; show outputs, update PROGRESS.md and
> docs/v2/metrics.md, commit.

---

## Phase V2: the Stand box (level, gap, pace) and the Progress page

**Goal (Requirement 1):** one box at the top of Today that tells Zee, from his own data and official scales
only: where he stands per Goethe module, how far the pass line is, his pace, and when he gets there at that
pace. Simple at a glance, detail one click away.

### V2.1 Official data files
Create `data/official/goethe_b1.json`, `data/official/goethe_b2.json`, `data/official/cefr.json` with exactly
the facts in §4 of this brief, each fact with `source_url` and `checked` date. A pytest asserts every numeric
constant in `services/standing.py` comes from these files (no literals like 60 or 100 in the service).

### V2.2 What is measured (evidence hierarchy)

A module estimate (Lesen, Hören, Schreiben, Sprechen; 0 to 100 points) comes **only** from exam-format
evidence. Drill accuracy, streaks and minutes never turn into exam points.

| Evidence | Weight | Where it comes from |
|---|---|---|
| Real Goethe exam result (entered by Zee) | replaces everything for that module; shown as "official result" | Settings → "Add exam result" |
| Official Goethe practice test (Übungssatz/Modellsatz) for one whole module | 1.0 | V2: Zee enters his raw score per Teil; V5: answer-sheet runner |
| Official practice test, single Teil | 0.5 | same; Lesen/Hören Teil scaled to 100 by its item count |
| App-made exam-format check (V5) or Mazmoon in exam mode (V3) | 0.35 | app, graded on official criteria |

Estimate per module = recency-weighted mean of evidence points (half-life 30 days) with a range:
`± max(5, 1.96 × weighted SD / sqrt(n_eff))`, and `± 10` while `n_eff < 2`. Formula goes in
`docs/v2/metrics.md`. Sprechen from app checks: Aussprache (16 points) cannot be measured, so the evidence is stored as points
out of 84 and the module range is `[points, points + 16]` (unknown Aussprache), never scaled up. A real
exam result has no such gap. No evidence item → the module shows **"Not measured yet"** and a button
"Measure Lesen (official practice test)". Never a default number.

Indicators (shown separately, labeled "Indicators: app measures, not exam points"):
- **Grammar:** patterns solid / ok / shaky / new (SPEC §7 states, from evidence_event; 40 patterns).
- **Error rate** for VERB_FINAL + V2_POSITION in writing and speaking, last 14 days, with the SPEC target
  < 10 % (SPEC §1). Shown only with ≥ 20 opportunities.
- **Official B1 word list coverage** (see §4 licence note): count of list lemmas that are mature (FSRS
  stability ≥ 21 d) or known from placement, out of the list size. The list file lives in
  `data/private/` (gitignored) on Zee's Mac, never in git. If the file is missing, show "Add the Goethe B1
  word list to measure this" instead of a number.
- **Active hours per skill**, last 7 and 28 days, from `activity_log`.

### V2.3 Pace and forecast
- Pace = active hours per week (28-day average) total and per skill. Always shown when ≥ 7 days of
  `activity_log` exist.
- Module forecast only when that module has ≥ 3 evidence items spanning ≥ 14 days: fit points against
  cumulative active hours of the matching skill (Lesen↔reading+vocab, Hören↔listening, Schreiben↔writing+grammar,
  Sprechen↔speaking). If slope ≤ 0 or the fit is weak (R² < 0.3), show "No reliable trend yet". Else:
  hours still needed to the pass line ÷ current weekly hours of that skill → date. Show the assumption
  under it in grey: "Assumes your last 28 days' pace (2.4 h/week Schreiben practice) and that the trend
  continues." More than 12 months → "More than a year at this pace".
- If Zee set a target date: "Needed pace for your date: X h/week" (same model), next to the actual pace.
- Below 3 data points the forecast line says what is missing: "Forecast needs 2 more Schreiben checks at
  least a week apart."

### V2.4 Visual (keep it calm)
At the top of Today, full width, max height ~200 px. (Sketch below uses made-up numbers to show the layout;
the real box shows only Zee's data. Same for every quoted example in this brief.)

```
Goethe-Zertifikat B1        Pass = 60 of 100 in each module        Target date: 15 Mar 2027 (edit)
Lesen      |=======[======|=====]-----------|   52 to 72   1 practice test     Near the pass line
Hören      | . . . . . . . . . . . . . . . . |   Not measured yet               Measure (40 min)
Schreiben  |======[====]  |    60            |   46 to 56   3 checks           about 9 points to pass
Sprechen   | . . . . . . . . . . . . . . . . |   Not measured yet               Measure (15 min)
Pace: 3.1 h/week (last 28 days) · needed for your date: 4.0 h/week · Schreiben at this pace: about Feb 2027
```
- One horizontal 0 to 100 track per module; one vertical pass tick at the official pass mark; the estimate
  drawn as a short range bar with a dot at the centre; unmeasured modules as a dotted empty track.
- Status words from fixed rules, not LLM: "Not measured yet", "Below the pass line", "Near the pass line"
  (range touches the pass tick), "At or above the pass line" (low end ≥ pass mark).
- Accent colour only on the pass tick. Readable in grayscale.
- Clicking a module opens Progress at that module: evidence list (date, type, points, weight), the official
  task list for that module from §4, and the indicators that feed it.
- Zee chooses B1 or B2 as the target in Settings; the box switches the official file.

### V2.5 Progress page (`/progress`)
- Module cards (same data as the box, with history line chart per module).
- Hours per skill per week, last 12 weeks (stacked bars with patterns, grayscale safe).
- Error rate per top 5 tags per week (only weeks with ≥ 5 uses of that tag).
- 40-cell pattern grid with state words (solid/ok/shaky/new), click → pattern.
- B1 word list coverage line (if the list file exists).
- "Then and now": first and latest graded essay side by side with their scores (after V3 exists).

### V2.6 Settings
Target exam (B1/B2), target date (optional), weekly hours target (Zee's own number), "Add exam result",
"Add official practice test result" (module, Teil, raw points per the official scoring in §4).

Acceptance:
- pytest `test_standing.py`: empty DB → every module "Not measured yet", no numbers; one practice-test entry →
  estimate with ± 10; three entries over 14+ days with rising scores → forecast date; falling scores →
  "No reliable trend yet"; real exam result overrides; constants loaded from JSON only.
- vitest: box renders all four states; no number rendered for unmeasured modules.
- Screenshots: empty DB and a fixture DB (fixture data only in tests, never in Zee's DB).

**Codex prompt V2:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases) and docs/V2_BRIEF.md sections 2, 4 and "Phase V2" only.
> Do Phase V2. Every number must come from data/official/*.json or from evidence_event/activity_log; if data
> is missing show "Not measured yet". Run all acceptance checks, show outputs, update PROGRESS.md and
> docs/v2/metrics.md, commit.

---

## Phase V3: Mazmoon, the daily essay inside the loop

**Goal (Requirement 2):** one essay a day that is part of the loop, uses today's lesson and Zee's weak
points, is graded on the official Goethe writing criteria, and feeds back into speaking, listening and SRS.

Gate check first (§2 rule 10).

1. **Place in the loop.** Today's loop becomes: 1 Manzil, 2 Sabqi, 3 Sabaq, **4 Mazmoon**, 5 Bolna.
   Mazmoon replaces the old pattern homework (L5). Tagebuch stays as an optional free entry on the
   Schreiben page. Old `homework` rows stay readable in the history.
2. **Task composition (deterministic, `services/mazmoon.py`):**
   - Task type rotates through the official writing task types of the target exam (§4: B1 Aufgabe 1, 2, 3; B2
     when the target is B2), with the official word target and content points structure.
   - Topic: today's reading text topic if Zee read it, else a life/work context from the profile, else the
     Sabaq scenario.
   - Must-use: today's Sabaq pattern + at most one focus tag (V4 fills focus; until then the tag with the
     most error events in 14 days). Never more than 2 constraints.
   - The local model only words the prompt (situation + content points) as JSON; Python checks the word
     target and constraints are present in the prompt.
   - Weekdays: one task at the official target length. Sunday: two tasks or one longer task (B2 length when
     the target is B2). Zee can switch a day to "short" (minimum day, V6).
3. **Flow:** optional 3-line plan (any language, not graded) → write (live word count; no timer by
   default; "Exam mode" toggle shows the official time for that task as information and records it; writing
   only, never speaking) → submit → red pen → **rewrite step**: for each severity ≥ 2 error (max 3), show the
   tag and reason but not the fix; Zee rewrites that sentence; check it (tolerant compare to the fix, else a
   quick grader call); then reveal the fix (prompt before recast, SPEC P6) → model sentences to SRS →
   done.
4. **Grading on official criteria.** Extend the grader for essays: Python computes word count and
   must-use presence; the model returns per-criterion judgements for the official criteria of that task
   (§4) with a quoted span as evidence for each judgement, plus content points covered/missing. Points per
   criterion and per task use only the official point scale in §4. Display "App estimate on the official
   criteria. Not an official score." Normal Mazmoon essays are practice and do **not** count as Schreiben
   module evidence; only exam-mode essays under official conditions count, at weight 0.35 (V2 table).
5. **Cross-skill handoff (start of the integration):**
   - Tomorrow's Diktat includes 1 corrected sentence from today's essay (after it is LanguageTool-ok).
   - Bolna gets a card "Say it": speak the 3 main points of today's essay (spoken, reviewed at the end).
   - The Commute Podcast already reads yesterday's mistakes; include essay corrections.
   - Every error/correct use goes to `evidence_event` with source `mazmoon`.
6. **Schreibheft (copy book):** one history list for Mazmoon, Tagebuch, placement writing and old homework,
   with date, task type, words, criteria points, and a link to the red pen.
7. Missed Mazmoon rolls into the next day once, then is replaced and marked "Not submitted" (SPEC §6.5).

Acceptance:
- pytest: task composition picks the right type rotation and word target from JSON; at most 2 constraints;
  rewrite step hides the fix until a rewrite attempt; normal essays add no module evidence, exam-mode essays
  add weight 0.35; essay correction appears in the next day's Diktat; mazmoon events in evidence_event.
- Real-model check behind `RUN_OLLAMA=1` with 3 fixture essays (known errors and known content gaps).
- Screenshots: task, writing with word count, red pen, rewrite step, Schreibheft.

**Codex prompt V3:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases), docs/V2_BRIEF.md sections 2, 4, 5 and "Phase V3" only.
> Call GET /api/stats/gate first and follow the builder-gate rule. Do Phase V3. Run all acceptance checks,
> show outputs, update PROGRESS.md, commit.

---

## Phase V4: the adaptive Ustad (learner model + planner, all skills linked)

**Goal (Requirements 5 and 6):** the app behaves like a teacher: it notices repeated mistakes in any skill,
re-teaches and drills them in every other skill, and still teaches new material every day.

Gate check first.

1. **Learner model** `services/learner.py` (pure functions over `evidence_event`):
   - Per tag: recency-weighted errors and correct uses (half-life 14 days), error rate with a smoothing
     prior of 1 error + 1 correct, count of opportunities, sources (which skills).
   - Per pattern: accuracy over its last 20 events (events with its `pattern_code` or one of its `tags`),
     states new / shaky (< 60 %) / ok (60 to 85 %) / solid (> 85 % and last seen > 14 days ago) (SPEC §7).
   - Weak words: cards with ≥ 2 lapses; words looked up in the reader ≥ 2 times.
2. **Planner** `services/planner.py`, one `daily_plan` row per day (created on first request, idempotent):
   - `focus_tags`: up to 2 tags with smoothed error rate > 25 % and ≥ 5 opportunities in 30 days, highest
     first; ties → the tag seen in more skills.
   - `review_pattern`: a done pattern that fell to shaky (≥ 5 events) → short re-teach card + 5 drills in
     Sabqi (max 1 per day).
   - `new_unit`: the next Sabaq in order, **always present** unless it is a makeup day (new learning every
     day). If a focus tag has no taught pattern yet, pull the pattern that covers it forward (teach before
     drill).
   - `mazmoon`: task from V3 with must-use = new pattern + first focus tag.
   - `reading_constraints`: topic + "use the structure X at least 3 times" + known-word band 93 to 99 %.
   - `diktat_picks`: 2 taught sentences containing a focus structure + 1 essay correction + rest as now.
   - `speaking_goal`: scenario + questions that make Zee use the focus structure (VERB_FINAL → "Warum ...?"
     questions that invite weil/dass; AUX_HABEN_SEIN/PARTIZIP → "Was hast du gestern/am Wochenende
     gemacht?"). The tutor still never corrects during the talk.
   - `why`: one line built from numbers, not the LLM: "Focus: verb at the end after weil/dass. 7 errors in
     11 uses this week (writing 4, speaking 3)."
3. **Wire the generators to the plan:** Author (`reading/author.py`) receives `reading_constraints`; after
   generation, Python checks the structure appears (spaCy dependency/regex check per tag where feasible; if
   no check exists for a tag, skip the check and log it) and regenerates once. Tutor prompt receives
   `speaking_goal`. Diktat and Mazmoon read the plan. Sabqi takes priority drills from `review_pattern` and
   focus patterns (drills from `patterns.json`, ask before tell).
4. **Pattern choice (L4):** `current_pattern()` uses the plan instead of fixed order only.
   **Rote then use (SPEC P3):** on a day with a Pahara recitation or new Sabaq chunks, the plan adds one use
   task with those forms in a new sentence (a free drill or a must-use in Mazmoon). A recitation never ends
   the day's work for that table on its own.
5. **Today shows the plan:** the "why" line above the loop, and each block's one-line description says what
   it targets ("Diktat: 2 sentences with verb at the end").
6. **No silent behaviour:** a "Plan" section on Progress lists the last 14 plans and what the data was.

Acceptance:
- pytest: planner picks the highest error-rate tag with ≥ 5 opportunities and ignores tags with fewer;
  correct uses lower the rate and drop the tag; new unit present on normal days and absent on makeup days;
  pattern pulled forward when a focus tag has no taught pattern; plan is stable for the same day; Author
  receives the constraints and regenerates once when the structure is missing; Diktat contains the picks.
- e2e: seed errors in writing for VERB_FINAL → next day's plan: Sabqi drills, Diktat sentence, Mazmoon
  must-use and tutor goal all target it (screenshots).

**Codex prompt V4:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases), docs/V2_BRIEF.md sections 2, 3, 5 and "Phase V4" only.
> Call GET /api/stats/gate first and follow the builder-gate rule. Do Phase V4. The LLM must not make plan
> decisions; the planner is Python with tests. Run all acceptance checks, show outputs, update PROGRESS.md
> and docs/v2/metrics.md, commit.

---

## Phase V5: exam checks, weekly test, report card

**Goal:** real measurement for the Stand box, in the official format.

Gate check first.

1. **Official practice test runner.** Goethe publishes free practice tests (see §4). The app does **not**
   store their texts or audio. It shows an answer sheet built from the module structure in §4 (Teil, item
   numbers, answer type), Zee works from the official PDF/audio in another window, enters his answers, then
   enters the official key once (stored only in `data/private/`, gitignored). Python scores with the
   official scoring from §4. Evidence weight 1.0 (whole module) or 0.5 (single Teil).
2. **App-made checks** per module in the official task format (reading tasks from Author texts, listening
   via TTS, Schreiben = Mazmoon exam mode, Sprechen = voice tutor in examiner mode following the official
   Sprechen parts). Sprechen: official preparation and speaking times are shown as information only; no
   timer, no cut-off (stammer rule beats exam realism). Graded on the official criteria in §4, weight 0.35,
   labeled "app-made check".
3. **Weekly test (Friday)** from the week's Sabaq + top-10 recurring tags, marked out of 50 (SPEC §5.8),
   writes evidence events (not module evidence).
4. **Weekly report card** (Sunday): attendance, active hours per skill vs Zee's target, module estimates,
   top 3 recurring tags with error rates, Mazmoon submitted x of 7, "Ustad's remarks" (3 lines built from
   data templates), next week's focus. Grayscale A4 print CSS.

Acceptance: scoring tests against the official scoring in §4 (including boundary values); app-made check
labeled and weighted; report card renders from fixture data; print preview grayscale screenshot.

**Codex prompt V5:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases), docs/V2_BRIEF.md sections 2, 4 and "Phase V5" only. Gate
> check first. Do Phase V5. Never store official test texts, audio or keys in git. Run all acceptance
> checks, show outputs, update PROGRESS.md, commit.

---

## Phase V6: motivation layer and final Today screen

Gate check first.

1. **Minimum day:** a "Short day" switch (on-call, exam day): Manzil capped at 15 cards + Mazmoon short
   (official B1 Aufgabe 3 length, about 40 words) + nothing else required. Counts as a study day, shown as "short day" on the
   report card. Purpose: stop all-or-nothing quitting.
2. **Weekly target** set by Zee on Sunday (hours + Mazmoon count + speaking sessions); Today shows actual vs
   target as one thin bar.
3. **Personal bests and then-vs-now:** longest spoken session (lines), best Mazmoon criteria score, error
   rate drop per tag ("verb at the end: 41 % → 12 % since 3 Nov"). Only from data.
4. **Today screen final layout (1440×900, no scrolling for the main content):**
   - Row 1: Stand box (V2).
   - Row 2, left (2/3 width): "Next" (one primary button) and the 5-block loop with one-line targets and
     time estimates; right (1/3): the "why" line, weekly target bar, streak + attendance (one line, not three
     tiles).
   - Row 3: Practice links (Lesen, Hören, Sprechen) as one text row.
   - Nothing else. Ghalti, Grammar, Progress, Settings live in the sidebar.
5. Copy pass on every screen: short, direct, no exclamation marks, no em dashes.

Acceptance: screenshot of Today at 1440×900 with fixture data, everything above the fold; vitest for the
short-day rules; report card shows short days.

**Codex prompt V6:**
> Read AGENTS.md, docs/PROGRESS.md (V2 phases), docs/V2_BRIEF.md sections 2, 5 and "Phase V6" only. Gate
> check first. Do Phase V6. Run all acceptance checks, show outputs, update PROGRESS.md, commit.

---

## 6. Out of scope for v2

Phone layout and PWA install · scroll feed (§5.10 of SPEC, phone use case) · web push notifications ·
leaderboards, points shop, gems · any paid API · any LLM-decided level · storing Goethe test content or
word lists in git.

## 7. Open items and uncertainty Zee should know

| Item | Status | What to do |
|---|---|---|
| Local model quality for German grading and rubric scoring | Never run on a real model (PROGRESS.md: all `RUN_OLLAMA=1` tests skipped) | Before V3, on the Mac: `make test-ollama`. If tags are missed, try another installed model via `OLLAMA_MODEL` and keep the one that passes. Rubric scores from an 8B model are rough; that is why app checks have weight 0.35. |
| Mac RAM vs model size | Unknown to this brief | Check `ollama ps` while grading; if slow, use a smaller model for tutor replies and the bigger one for grading/Author. |
| Speech recognition on the Mac | Web Speech in Chrome sends audio to Google by default; Chrome desktop has an on-device option (SPEC §8) | Prefer Chrome on the Mac; the Phase 3 word-loss test with Zee's own speech is still open. |
| Goethe word list licence | The PDF states it may not be stored and put into a network (SPEC §11, conservative reading) | Keep it in `data/private/` on the Mac only, gitignored. Coverage counts only. Not legal advice. |
| Repo visibility | Not verified (the review clone may have used session credentials) | Check on GitHub. If it is public, SPEC §11 says no third-party content in a public repo; check that nothing under `data/` is third-party. |
| Forecast accuracy | A trend from 3 to 5 checks is noisy | The box shows ranges and the assumption; trust it more after 6+ checks. |

