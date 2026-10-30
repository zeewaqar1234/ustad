# Metrics (v2)

Every number the app shows is an official constant (data/official/*.json) or one of the formulas here, from
Zee's own rows. Code location in brackets. No data means "Not measured yet".

## V1: evidence ledger

**evidence_event** (`models.EvidenceEvent`, written only through `services/evidence.py`). One row per right or
wrong use. Columns: skill (vocab, grammar, reading, listening, writing, speaking), source, source_ref,
pattern_code, tag (ErrorTag), outcome (correct, error), severity (1 to 3, errors from the grader), orig (the
sentence), fix, meta_json. Indexes on (tag, ts), (pattern_code, ts), (skill, ts).

What each source writes:

| Source | Skill | Event |
|---|---|---|
| review, sabaq (card answer) | vocab; fix_sentence cards: grammar | Rating 1 (Again) = error, 3 and 4 = correct, 2 (Hard: a typo or umlaut slip) = no event. Tag: the Ghalti item's tag for fix_sentence, GENDER for gender cards, none for other cards. [`evidence.record_card_review`] |
| drill | grammar | The first try of each drill per day: correct or error, with pattern code and the drill's tag. "I don't know" (empty answer) is not an event. Free drills write the grader's errors and correct uses. [`api/patterns.py`] |
| recitation | grammar | One event per submit: correct if the table had no wrong cell, else error. meta.mode typed or voice. No tag. |
| homework, tagebuch | writing | Every grader error (with severity) and every correct use. Not written while the result is LanguageTool-only (provisional); written when the tutor re-grades it. [`evidence.record_grade`] |
| placement | grammar or vocab per item; writing for the sample | One event per placement item (ok or not), plus the grader events of the writing sample. |
| voice_review | speaking for lines with `voice_turn.input_mode = voice`, writing for typed lines | Errors and correct uses per line from the end-of-session review. Not written for LanguageTool-only reviews. |
| shadow | speaking | correct if at least 90 % of the words were heard, else error. No tag. meta.kind = recognition (it is not pronunciation). |
| diktat | listening | One event per wrong word: umlaut = UMLAUT, capital = CAPITALISATION, spelling = SPELLING, ending = ADJ_ENDING when spaCy tags the expected word ADJ or DET in its sentence, PLURAL when NOUN, else OTHER; missing and extra = OTHER. One correct event (no tag) per fully correct sentence. [`evidence.diktat_tag`] |
| reading_q | reading | One event per question (richtig/falsch, multiple choice, matching), meta.question_type. |

**Correct uses.** The Grader may return up to 12 `correct_uses` {span, tag} per text (voice review: per
line). A span that is not in Zee's text, or that overlaps an error span, is dropped and counted
(`dropped_correct_uses`). Target tags in the prompt: the pattern's tags plus V2_POSITION, VERB_FINAL,
AUX_HABEN_SEIN, PARTIZIP, CASE_AKK, CASE_DAT, PREP_CASE, ADJ_ENDING (until V4 passes the planner's focus
tags). [`services/grading.py: locate_correct_uses`]

**activity_log** (date, skill, seconds). `evidence.add_activity` adds the active time of an answer, capped at
60 s per answer (reading a text: 15 min, writing a submit: 30 min; the editor itself drops idle gaps above
60 s). It also adds to `day_log.minutes`, which the old screens read. Voice turns count as speaking when
spoken and as writing when typed. Minutes recorded before V1 stay unsplit in `day_log`; activity_log starts
at the migration date.

**Study day** (`streak.refresh_study_day`): Manzil done (or nothing due) and at least one of: Sabqi, Sabaq,
or `day_log.other_done`. `other_done` is set by: a voice session reviewed by the tutor, Diktat 5 of 5, a text
read with its questions answered (Mazmoon submitted comes in V3).

**Ghalti by tag** (`ghalti.tag_stats`), window 30 days:
- errors = error events with that tag, correct = correct events with that tag.
- recurring = errors >= 3 and the errors come from >= 2 different sentences (lower-cased `orig`).
- wrong share = errors / (errors + correct), shown only with >= 5 events; else "too few uses".
- The habits list ranks tags by errors in the window. The sentence table (`mistake`) stays for the fix cards.

**Backfill** (`services/backfill.py`, run by the migration, also `python -m scripts.backfill_evidence`).
Converts: homework, tagebuch and placement `mistake` rows (one event each, meta.count keeps the repeat
count); drill, diktat, recitation and shadow `attempt` rows; reading question results; fix_sentence review
logs (rating 2 skipped); reviewed voice sessions line by line. Skipped on purpose: `mistake` rows from drills
and voice (they come from the attempts and the voice review, so nothing counts twice) and drill attempts with an
empty answer. Diktat attempts only know the coarse tag (ending = OTHER). Every converted row has
`meta_json.backfilled = true` and a `backfill_key`; a second run adds nothing.

## V2: Stand box and Progress page

Code: `services/standing.py`, `api/standing.py`. Constants: exam facts in `data/official/goethe_b1.json`,
`goethe_b2.json`, `cefr.json` (each with source URL and check date); method parameters (weights, half-life,
range floor, thresholds) in `data/official/standing_method.json`. A test fails if `standing.py` holds a numeric
literal other than 0, 1, 2. Nothing is asked of a model.

**exam_result** (Zee enters it in Settings): kind real_exam, practice_full, practice_teil (app_check is
reserved for V3/V5). `points` is on the measurable scale: 0 to 100, or 0 to 84 for Sprechen without a real exam.
- Lesen, Hören whole test: raw = sum of correct items over all Teile; points = raw x 3.33 rounded to the nearest
  point, capped at 100 (18 correct = 60). One Teil: points = correct / items of that Teil x 100.
- Schreiben, Sprechen whole test: points = sum of the rater points per Teil (Schreiben max 100, Sprechen max 84
  without Aussprache). One Teil: points = points / Teil max x module scale.
- Real exam: the module points from the certificate, 0 to 100.

**Estimate per module.** Evidence weight: real exam replaces everything (latest one is shown, no range);
whole practice test 1.0; one Teil 0.5; app check 0.35. Age weight 0.5^(age days / 30). Weighted mean
`m = sum(w p) / sum(w)`, `n_eff = (sum w)^2 / sum(w^2)`, weighted SD `s`. Half range = 10 while n_eff < 2, else
`max(5, 1.96 s / sqrt(n_eff))`. Range = m -/+ half range, clipped to 0..100. Sprechen: the high end adds 16
(Aussprache cannot be measured), the low end is never scaled up. No evidence = "Not measured yet", no number.
Status from the range: low >= 60 "At or above the pass line"; high >= 60 "Near the pass line"; else "Below".
"About N to pass" = 60 minus the centre of the range, rounded.

**Pace.** Hours per week = active hours of the last 28 days / 4, total and per skill, shown when at least 7 days
have `activity_log` rows.

**Forecast.** Needs at least 3 results spanning at least 14 days. Least-squares fit of points against cumulative
active hours (from the first activity or result day) of the module's skills (Lesen: reading + vocab, Hören:
listening, Schreiben: writing + grammar, Sprechen: speaking). Slope <= 0 or R^2 < 0.3: "No reliable trend yet".
Else hours needed = (60 - fitted points at today's cumulative hours) / slope; date = today + hours needed / (last 28
days weekly hours of those skills); more than 12 months: "More than a year at this pace". No practice in 28 days:
no date. Sprechen uses 60 on the measured scale (assumes Aussprache adds nothing). If a target date is set,
needed pace = sum of hours needed over modules below the pass line / weeks left; modules without a trend are
listed as missing.

**Indicators (not exam points).**
- Grammar pattern state: last 20 evidence events of the pattern, weights 0.5^(age days / 14); accuracy < 60 % shaky,
  > 85 % and last seen more than 14 days ago solid, else ok, no events new (SPEC section 7; the 14-day half-life is
  this app's choice, SPEC says only "recency-weighted").
- Verb position error rate: errors / (errors + correct) for tags VERB_FINAL and V2_POSITION in writing and
  speaking, last 14 days, shown with at least 20 uses. Target below 10 % (SPEC section 1).
- Error rate per tag per week: top 5 tags by errors in 12 weeks, a week shown only with at least 5 uses.
- Goethe B1 word list: list file `data/private/goethe_b1_wortliste.txt` (one entry per line, gitignored, Mac only).
  Mature = known from placement or a card with stability of at least 21 days. Matching by lemma or de without
  article. Without the file: "Add the Goethe B1 word list to measure this."
- Hours per skill: last 7 and 28 days, and weekly for 12 weeks (Monday start).

**Voided results.** `exam_result.voided = true` removes a row from every calculation above (estimate, weights,
forecast, evidence list). The row is kept and can be restored.

**Word list file.** Built by `python -m scripts.build_wortliste` from the official PDF; see docs/PROGRESS.md.

## V2 redesign: internal readiness (what Zee's own work says)

Code: `services/readiness.py` (numbers), `services/insight.py` (wording). Parameters: `data/official/readiness_method.json`;
entries there are modelling choices, not exam facts, and are listed so they can be checked. This replaces the official-points
box on Today. The official layer (exam results, `services/standing.py`) stays on Progress and now also checks the estimate.

**Evidence streams.** One stream per skill, taken from `evidence_event` (skill, source, outcome, band):

| Skill | Sources counted (weight) | Why |
|---|---|---|
| Grammatik | drill 1, recitation 1, placement 1 (B1.1, B1.2, B2 items only) | typed answers on the 40 B1 patterns |
| Wortschatz | word list count if `data/private/goethe_b1_wortliste.txt` exists (an indicator, no pass line); else placement vocabulary items (B1 bands) | counts words in your cards that are mature (stability 21 days or more) or known from placement |
| Lesen | reading_q 1 | exam-like questions on B1 texts |
| Hören | diktat 0.5 | spelling from audio is a proxy, not comprehension |
| Schreiben | homework 1, tagebuch 1, placement 1, voice_review (typed lines) 1 | grader errors and correct uses |
| Sprechen | voice_review (spoken lines) 1, shadow 0.3 | recognition only for shadowing; pronunciation is not measured |

Not counted: SRS card reviews (the scheduler asks what you are about to forget, so their accuracy says little about the exam),
A2 placement items (they say nothing about B1).

**Estimate.** Each event has weight `w = source weight x 0.5^(age days / 60)`. Successes `s` and failures `f` are the weighted counts.
Posterior is Beta(1 + s, 1 + f), a uniform prior. Estimate `m = a / (a + b)`, spread `sd = sqrt(ab / ((a+b)^2 (a+b+1)))`, 95 %
range `m -/+ 1.96 sd` clipped to 0..1. **Confidence** = 100 minus the width of that range in percentage points. With no
evidence it is about 5 %; it says how narrow the range is and nothing else. A skill with no events is "No evidence yet".
The line is `pass_points / module_max_points` of the chosen Goethe exam (60 %). Status: range low >= line "At or above";
range high >= line "Near"; else "Below". For Lesen the share of items right is exactly the share of exam points, so that
comparison is direct; for the other skills it is a proxy (see the proxy notes shown on the screen).

**Overall.** Mean of the measured skills (range: mean of their lows and highs). Confidence = mean of the skills' confidence
with unmeasured skills counted as 0, so it rises as more skills have evidence. The word list count is not in the overall.

**Trend and milestone.** At the end of each of the last 12 weeks the skill's estimate is recomputed from events up to that day
(only with at least 2 effective events). Needs 3 such points spanning 14 days; least squares of the estimate against the
cumulative practice hours of that skill; slope > 0 and R^2 >= 0.3, else "No reliable trend yet". Hours needed = (line - fitted
estimate now) / slope; date = today + hours needed / weekly hours of the last 28 days. The milestone date is the latest date
among skills below the line; if one of them has no trend the milestone says so instead of a date. With a target date: needed
hours per week = hours needed (sum over skills below the line) / weeks left, shown next to the current pace.

**Calibration (the only real accuracy figure).** For each non-voided Lesen or Hören practice test or exam result, the reading
or listening estimate is recomputed using only events before the test day and compared with the points. The mean absolute error
over those tests is shown as "off by N points on average". Until a test is entered it says that nothing has been checked.

**Level label.** The placement test's result (`profile.level_band`) with its date; it covers grammar, vocabulary and a writing
sample, and is not an official CEFR result. For a B2 goal the screen says the app's exercises are B1 level.

**Analysis text.** `POST /api/readiness/insight` gives the local model a JSON of the numbers above and asks for a summary,
strengths, weaknesses and next steps (schema `Insight`). Every number in its answer must appear in the facts; otherwise the answer is
dropped and fixed sentences from the same facts are shown. Cached per facts hash. The model never produces a number or a level.

