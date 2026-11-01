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

## Level and practice (V2 redo, 2026-10-30)

Code: `services/readiness.py` (numbers), `services/insight.py` (wording). Parameters: `data/official/readiness_method.json`
(modelling choices, written down so they can be checked). Shown on Today and at the top of Progress (`features/standing/LevelBox.tsx`).
This replaces the first redesign, which compared the share of app answers right with the Goethe pass mark (60 of 100 points).
Those are different quantities, so that comparison is gone. No number on this box is an exam score.

**Level.** Only the placement test sets it (`profile.level_band`, rule in `services/placement.py`: bands A2, B1.1, B1.2, B2 in
order, a band passes at 70 % right, the first band under 70 % is the one Zee works on). The ladder shows passed bands filled, the
band being worked on hatched, and the goal as the accent line after B1.2 (B1 exam) or B2 (B2 exam). Practice never moves the level:
the app's lessons are B1 material without sub-bands (all seed texts B1.1, patterns have no band), so practice cannot place Zee in a band.

**Line.** 70 %, the placement band rule (`placement.PASS`). An app rule, not a Goethe number.

**Evidence streams.** As before, one per skill from `evidence_event`:

| Skill | Sources counted (weight) |
|---|---|
| Grammatik | drill 1, recitation 1, placement 1 (B1.1, B1.2, B2 items only) |
| Wortschatz | placement 1 (B1 bands only). The word list count is shown on Progress as an indicator and is not in this estimate |
| Lesen | reading_q 1 |
| Hören | diktat 0.5 (one answer per sentence) |
| Schreiben | homework 1, tagebuch 1, placement 1, voice_review 1 |
| Sprechen | voice_review 1, shadow 0.3 |

Not counted: SRS card reviews (the scheduler asks what you are about to forget), A2 placement items.

**Share right per skill.** Weight `w = source weight x 0.5^(age days / 60)`; successes `s`, failures `f` weighted. Beta(1 + s, 1 + f).
Shown: mean `a / (a + b)` and `± h` where `h` = half the width of the 95 % range (`mean -/+ 1.96 sd`, clipped to 0..1), in points.
Status: range low >= 70 % "70% or more"; range high >= 70 % "Around 70%, not clear yet"; else "Under 70%".
**Practice since placement** pools the weighted counts of all skills into one Beta. **Skills at the line** = count with status "70% or more".
**Move up** says "retake the placement test" only when every skill is at 70 % or more and Zee works on B1.1 or B1.2.

**Last 4 weeks.** Unweighted by age: share right in the last 28 days minus share right in the 28 days before, in points (source weights apply).
Shown only when both windows hold 10 answers; otherwise "not enough history". A skill measured only by placement says so.

**Time to goal.** Hours since placement = active hours from the placement day to today, all skills. Per skill: at the end of each of the
last 12 weeks the estimate is recomputed from events up to that day (at least 2 effective events). With 3 such points over 14 days, least
squares of the estimate against the skill's cumulative practice hours; slope > 0 and R^2 >= 0.3, else no estimate. If the fitted value
is already at 70 % while the range still spans it, the skill needs more answers, not hours, and gets no hours figure.
Hours needed = (0.70 - fitted now) / slope, summed over skills under the line; date = today + hours / the skill's weekly hours of the
last 28 days; the latest date wins. Needed per week = hours needed / weeks to the target date. Skills measured only by placement or with
no answers are left out and named. If any counted skill under the line has no estimate, no hours figure is shown and the reasons are listed.
The Days bar is days since placement against days left to the target date (calendar only).

**Check against practice tests.** On Progress only: for each Lesen or Hören practice test, the share right in the app before the test day
against the test points; mean absolute difference.

**Explanation.** `POST /api/readiness/insight` as before, with the new facts (share right, ± points, answers, 4-week change, hours, pace).
Every number in the model's answer must be in the facts and belong to the skill named in its sentence; level names only the placement
label, the band worked on or the goal exam. Otherwise fixed sentences are shown.

## V4: learner model and planner (2026-10-31)

Code: `services/learner.py` (understand), `services/planner.py` (decide), `services/structure.py` (does a text use a
structure). Parameters: `data/official/planner_method.json` (this app's modelling choices, not exam facts). Nothing here calls
a model. Table `daily_plan` (one row per Berlin day, built on the first request, never changed afterwards; `data_json` keeps
the numbers it was built from).

**Per tag** (last 30 days, `evidence_event` rows with a tag, all skills): weight `0.5 ^ (age days / 14)`. errors and correct =
raw counts; w_errors and w_correct = weighted sums; opportunities = errors + correct.
`rate = (w_errors + 1) / (w_errors + w_correct + 2)` (prior: 1 error and 1 correct use).
**Focus tags**: rate above 0.25 and at least 5 opportunities; highest rate first; ties go to the tag seen in more skills, then
alphabetical; at most 2. OTHER and PRONUNCIATION are never a focus. Tags are grouped into families (Verb position, Case and
gender, Perfekt and tense, Spelling, Words and register) in the method file; the `why` line says when both focus tags share one.

**Per pattern**: accuracy over its last 20 events (pattern_code equals the pattern, or tag is one of its tags). new = no events,
shaky = below 0.60, solid = above 0.85 and last seen more than 14 days ago, else ok. Weak words: cards with 2 or more lapses
(reader look-ups are not recorded yet, so they are not counted).

**Plan fields**: `focus` (with per-skill counts and up to 3 wrong sentences with their fix), `review_pattern` (a done pattern that is
shaky with at least 5 events, lowest accuracy, 1 a day), `new_unit` (next Sabaq plus new pattern; absent on a makeup day; a focus
tag with no taught pattern pulls the covering pattern forward), `sabqi_drills` (5 drills each: review pattern first, then the
taught pattern of each focus tag; rule card first, drills after), `mazmoon` (at most 2 must-use: new pattern, first focus tag;
the Mazmoon screen itself is Phase V3, not built), `reading` (structure to use at least 3 times, density 93 to 99), `diktat`
(2 taught sentences containing a focus structure), `speaking_goal` (fixed question styles per tag, the tutor only asks),
`use_task` (rote then use: new Sabaq chunks or a recitation today add one sentence task), `blocks` (one line per Today block).
`why` is built from the numbers above, never by a model.

**Wiring**: Author gets the constraint, checks it with `structure.count_uses` (regex per tag; tags without a check are skipped and
logged) and regenerates once, together with the density check (the draft with fewer missing uses, then closer density, is kept).
Tutor prompt gets the speaking goal. Diktat takes the picks first. The homework grader also looks for the focus tags. Today shows
the plan; Progress lists the last 14 plans with their data.

## Review fixes (2026-11-01)

These replace the matching rules above where they differ.
- **Readiness forecast** (`readiness.weekly_shares`): fitted to the share right inside each week (that week's answers only,
  weeks with at least 10 answers), not to the running estimate. The running estimate drifts as answers pile up and gave
  dates for flat skills. A date needs R^2 of at least 0.6 (`readiness_method.json` `forecast_min_r2`). Check: 60 simulated flat
  histories at 60 % right gave 13 dates with the old rule and 0 with the new one.
- **Few answers**: under 10 answers a skill shows its answer count ("4 answers so far; a percent needs 10"), no percent
  (`min_answers_for_percent`).
- **Range**: shown as "(62% to 81%)", the 95 % range, instead of "± points".
- **Level wording**: `level.plain` = "Working on <band>" (the first placement band under 70 %); the stored label (for example
  "A2+") is shown only as "its label". "A2+" never meant "above A2".
- **Move-up check** now also runs for A2: practice at the line on B1 material in at least 4 skills suggests a placement retake.
- **One pattern state** for Today and Progress (`learner.pattern_states`): the last 20 events of the pattern; events that only
  share a tag count once the pattern is taught. Progress's grammar grid no longer has its own 14-day weighted rule.
- **Generated texts**: `text.level` is the level the Author is asked to write at ("B1"), never the model's own label.
