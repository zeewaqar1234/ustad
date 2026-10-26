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
