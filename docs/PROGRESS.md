# Progress

Read this first every session. Then read only the docs/ file for the current phase (see CLAUDE.md).

## Status

| Phase | Status | Date |
|---|---|---|
| 0. Scaffold | Done | 2026-10-20 |
| 1. MVP: SRS + daily loop | Done except deploy (open item below) | 2026-10-20 |
| 2. Grammar (§5.2) + writing (§5.6) + Ghalti (§5.7) | Done (acceptance evidence below); real local-model run open | 2026-10-21 |
| 3. Voice tutor | Done in code (evidence below); open: Zee's real-speech STT test, real Ollama + Piper runs | 2026-10-26 |
| 4. Reading (§5.3) + listening (§5.5) | Done in code (evidence below); open: real Ollama Author run, real Piper episode | 2026-10-26 |
| V0 (v2 brief) | Done (evidence in "V2 phases" below) | 2026-10-26 |
| V1 (v2 brief) | Done in code (evidence below); real-model correct-use run open | 2026-10-26 |
| V2 (v2 brief) | Done in code (evidence below) | 2026-10-29 |
| 5–7 | Not started (work-writing templates of §5.6 scheduled in Phase 5) | |

**Next session:** on Zee's machine: the Phase 3 STT word-loss test with his own speech, then
`make test-ollama` (grader + voice) and `make author` (first real Author texts; check density and German),
install Piper + `de_DE-thorsten-medium` and build one Commute Podcast episode on the phone, approve the
7 flagged patterns. Then Phase 5. Deploy over HTTPS is still open from Phase 1 (mic, speech recognition and
the offline podcast cache all need HTTPS on the phone). Acceptance list: docs/phases.md.

## Builder gate log

| Date | study_days_last_7 | Result |
|---|---|---|
| 2026-10-21 | 1 (Zee's count; the cloud-container DB had 0 because it is a fresh copy) | Closed by the rule. Zee overrode it: `profile.gate_override = true` in the container DB, `GET /api/stats/gate` → `{"study_days_last_7":0,"open":true,"override":true}`. Zee first asked for 4 mock `day_log` rows; Claude proposed the existing override instead so streak/attendance data stays real, and Zee chose the override. Phase 2 built as a gate exception. |
| 2026-10-26 | 0 in the container DB (fresh copy; Zee's real count unknown here) | `gate_override = true` still set from 2026-10-21, so the gate reads open. Zee asked for Phase 3 in this session; built under that override. Zee: clear the override (`profile.gate_override = false`) once real study days are logged, so the gate works again. |

| 2026-10-26 (Phase 4) | 0 in the container DB (`GET /api/stats/gate` → `{"study_days_last_7":0,"open":true,"override":true}`) | Open only through Zee's override from 2026-10-21. Zee asked for Phase 4 in this session; built under it. The override is still set: clear it (`profile.gate_override = false`) so the gate guards Phase 5. |

## Decision 2026-10-21: 100 % free resources

Claude (Anthropic) and Azure Speech are replaced by a local **Ollama** server (Tutor/Grader/Author) and the
browser **Web Speech API** (STT + TTS). Written up in docs/architecture.md §8 "Free-resources decision" and
docs/llm.md; SPEC.md §8, §9, §10, §12, §16 synced; §5.4 marked superseded in part; phases 3, 4, 7 rows adjusted.
Known costs of the switch, not hidden:
- Web Speech STT: the browser can end recognition by itself (Chrome Android ignores `continuous`). The app
  must restart on every `end` and only Zee's tap ends a turn. Words can be lost in the restart gap: Phase 3
  must test with Zee's speech; fallback = self-hosted Whisper (free). SPEC §5.4 had rejected Web Speech for
  this reason; the decision accepts the risk with that fallback.
- Web Speech STT is server-based by default (audio goes to Google/Apple). Not private like Ollama.
- No pronunciation scores (Azure gone): Shadowing uses word match.
- `speechSynthesis` cannot write mp3: Phase 4 Commute Podcast needs Piper TTS on the server.
- A local 8B model grades German less reliably than hosted models. Not measured yet (see open item).

## Phase 0: what exists

- `docs/`: spec split into learner_profile, pedagogy (§3–4), modules (§5), engagement (§1, §6–7),
  architecture (§8, §10, §12, §15, §16), llm (§9), content_sources (§11), plus phases (§13) and sources (§17).
  SPEC.md stays the source of truth.
- `CLAUDE.md` from §14 (35 lines), plus LanguageTool/Docker notes.
- Backend `backend/` (uv, Python 3.12): FastAPI app `app/main.py`, `GET /api/health` → `{"status":"ok"}`,
  settings in `app/core/config.py` (reads `../.env`), LanguageTool client `app/core/languagetool.py`.
- Frontend `frontend/` (Vite + React + TS + Tailwind v4): one page that calls `/api/health` through the Vite proxy.
- `docker-compose.yml`: LanguageTool 6.8 (`mirror.gcr.io/erikvl87/languagetool:6.8`) on 127.0.0.1:8010, 1 GB heap.
- `Makefile`: `dev`, `test`, `lint`, `migrate` (placeholder until Phase 1), `lt-up`, `lt-down`, `lt-check`, `install`.
- `.env.example` (blank keys), `.gitignore` (.env, *.db, audio/, venv, node_modules, dist).

## Phase 0 acceptance evidence (run 2026-10-20)

| Check | Result |
|---|---|
| docs/ files present | all 8 required + phases.md, sources.md |
| CLAUDE.md < 80 lines | 35 lines |
| `make dev` starts both | uvicorn :8000 + Vite :5173 from one command |
| `/api/health` | `{"status":"ok"}` HTTP 200, direct and via Vite proxy; page renders "Backend: ok" (headless Chromium DOM dump) |
| pytest | 2 passed (health + LanguageTool integration test) |
| vitest | 1 passed (App renders health status) |
| LanguageTool | "Ich habe gestern nach Hause gegangen." → rule `HILFSVERB_HABEN_SEIN`, suggestion "bin" (LT 6.8) |
| `.env.example`, `.gitignore` | present; `git check-ignore` confirms .env, *.db, audio/ ignored and .env.example not ignored |
| make lint | ruff check + format, oxlint, tsc all clean |

## Phase 1: what exists

- Backend: SQLAlchemy models + Alembic migration, FSRS scheduler (desired retention 0.90), typed-answer grader
  (umlaut/ß/case/typo tolerance, diff, article check), argon2 login with session cookie + rate limit,
  Manzil/Sabqi/Sabaq daily loop (Sabaq locked until Manzil done), streak with freezes, `day_log`,
  `GET /api/stats/gate`. FastAPI serves the built PWA from `frontend/dist`.
- Seed decks in `data/seed/`: connector 65, work 150, life 150 items; 855 cards after `make seed-load`.
- Frontend: login, Today screen, review (typed + reveal), Sabaq, check queue, umlaut keys, PWA (vite-plugin-pwa).
- Deploy config (not yet used): `Dockerfile`, `deploy/Caddyfile`, compose prod profile.

### Seed build: LanguageTool vs fast mode

- `make seed-build`: full LanguageTool check (needs `make lt-up`). Used for the current decks.
- `make seed-build-fast` (`build_seed --skip-lt`): no LanguageTool call. Items whose source content is unchanged
  keep their earlier LanguageTool result; every new or changed item is marked `needs_review` with note rule
  `LT_SKIPPED`, so it stays out of Sabaq until approved in the check queue. This keeps the CLAUDE.md rule
  ("pass LanguageTool or be marked needs_review"). Rebuilding the current decks with it changes nothing (verified).
- Current needs_review items (real LanguageTool flags): work "Sehr geehrte Damen und Herren" (ANREDE_KOMMA),
  life "Eine Fahrkarte nach Frankfurt, bitte" and "Ein halbes Kilo Tomaten, bitte" (FEHLERHAFTES_KOMMA_ALLG),
  connector "seitdem" and "sowohl ... als auch" (GERMAN_SPELLER_RULE). All five look like false positives on
  fragments; Zee approves or edits them in the check queue.

### Open Phase 1 item

- [ ] **Deploy on HTTPS.** Deferred by Zee on 2026-10-20. Needs a VPS + domain. Then: set `.env` on the server,
  `make migrate seed-load password`, start the compose prod profile (Caddy gets the certificate),
  and install the PWA on the phone from the HTTPS URL (iOS: Share > Add to Home Screen).
  Installability was checked only on localhost (a secure context), not yet on a real phone.

## Phase 1 acceptance evidence (run 2026-10-20)

| Check | Result |
|---|---|
| Login works | Playwright: password login, then Today screen (both e2e tests) |
| Seed decks loaded | fresh DB: `{'items_new': 365, 'items_updated': 0, 'cards_new': 855}`; connector 63 ok / 2 needs_review, work 149/1, life 148/2 |
| LanguageTool-checked, needs_review where flagged | done in the previous session with the self-hosted container; flags stored in `review_notes` |
| FSRS tests | `test_intervals_increase_on_good`, `test_again_resets_interval_and_counts_lapse` + 3 more pass |
| Grader tests | `Strasse`≈`Straße`, `Maedchen`≈`Mädchen` → Hard; wrong article → Again; all pass |
| Daily loop | Manzil card due → review → "Manzil done." → Sabaq unlocks → attempt before answer (e2e) |
| Streak + freezes + day_log | `test_streak_freezes`, `test_streak_breaks_after_third_miss_in_a_week`, `test_daily_loop` pass |
| PWA | manifest + service worker served; Chromium: SW active, manifest errors none, only installability error `in-incognito` (Playwright's temp profile) |
| Phone screenshot (375px) | `docs/evidence/phase1/review-prompt.png`, `review-feedback.png` (+ home, sabaq). No horizontal scroll. |
| pytest | 40 passed (after the review fixes below) |
| vitest | 2 passed (vitest now only collects `src/**/*.test.*`; it was picking up the Playwright spec) |
| Playwright | 2 passed at 375px |
| make lint | clean (oxlint: 2 warnings in ReviewSession.tsx, `Date.now` in render and setState in effect; not errors) |
| Deployed on HTTPS | **open**, see above |

### End-of-phase diff review (subagent) and fixes

- Fixed (blocker): `load_seed` never sent an edited item back to `needs_review` (the `not item.cards` guard
  was always false after the first load), so edited German could reach Sabaq unchecked. Now: if
  `alt`/`plural`/`example_de` changed and the new build says needs_review, the item goes back to review;
  unchanged items keep their status, so check-queue approvals survive a reload. Test added.
- Fixed: `/api/review/reveal` now refuses cards not yet taught (could leak `de` before a Sabaq attempt). Test added.
- Fixed: Sabaq copy said cards return "from tomorrow"; the produce card can come back the same day.
- Fixed: `e2e_setup` exits cleanly when the seed is not loaded.
- Open (should-fix, Phase 2 or later): items match on (deck, de), so renaming `de` in the source creates a new
  item and leaves the old one live as "ok". Rule for now: do not rename `de`; add a new item and retire the old
  one by hand.
- Open (nits): e2e tests depend on order and on the card not returning within 60 s; build_seed treats a typo
  flag like `--skip_lt` as a deck name; login rate limit is in-memory per IP.

### How to rerun the e2e check

```
SP=<scratch dir>; export DATABASE_URL=sqlite:///$SP/e2e.db E2E_PASSWORD=<10+ chars>
cd backend && uv run alembic upgrade head && uv run python -m scripts.load_seed && uv run python -m scripts.e2e_setup
uv run uvicorn app.main:app --port 8000 &      # serves frontend/dist, so run `npm run build` first
cd ../frontend && E2E_SHOTS=$SP/shots PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --workers=1
```
`e2e_setup` refuses to run unless DATABASE_URL contains "e2e". The two tests depend on order (review first).

## Phase 2: what exists

- **LLM layer** `backend/app/llm/`: `OllamaProvider` (`POST /api/chat`, JSON schema as `format`,
  temperature 0), `complete_json` (Pydantic validation, one retry with the error, then `LLMInvalid`),
  `LLMUnavailable` on network/HTTP/malformed replies, one `cost_ledger` row per call (vendor `ollama`,
  tokens, eur 0). Schemas: `ErrorTag`, `GradeError`, `GradeResult`. Prompts: `prompts/grader.md`, `tutor.md`.
- **Grader pipeline** `services/grading.py`: LanguageTool pre-check → Grader → span check (spans not in the
  text are dropped and counted) → LanguageTool check of the corrected text (flags → `needs_review`).
  Model down or invalid twice → LanguageTool-only result, shown as such, not written to Ghalti.
- **Patterns**: 40 in `data/seed/source/patterns/batch_01..08.json` (5 each, schema in `SCHEMA.md`), built by
  `make grammar-build` (`scripts/build_grammar.py`) into `data/seed/patterns.json`, loaded by `make seed-load`.
  Pattern card (rule, slot diagram, 3 examples work/life/finance-history, common error) and drill round.
- **6 drill types** `services/drills.py`: surgery (tap chips), transform, tense_shift, error_spot, fill
  (authored for case patterns, else one auto-blanked article ending from a transform answer not shown
  before), free (Grader + must_include). A round with ≥ 80 % first-try correct marks the pattern done;
  the current pattern is the first approved, not done, not known one.
- **Pahara** (typed): 12 tables (`data/seed/source/recitation.json`); full table → gaps (next day) → blank.
- **Homework + Tagebuch** (`/api/homework`): today's homework from the current pattern; red-pen view.
- **Ghalti Register** (`/api/mistakes`): every graded error and every wrong drill answer; by-tag heat map,
  top 10, recurring (≥ 3). Each wrong sentence → one `fix_sentence` card (deck `ghalti`, prompt = Zee's
  sentence), live at once if LanguageTool passes, else in the check queue. Ghalti items never become Sabaq.
- **Placement test**: 35 items (10 A2, 12 B1.1, 9 B1.2, 4 B2) + 5-sentence writing sample (server checks 5).
  Level = first band under 70 % → class (A2+, B1.1, B1.2, B1 Board, B2.1); writing < 5/10 → one class down.
  Correct vocab answers mark seed items known (cards start in FSRS Review, first check in 14–27 days);
  correct typed grammar answers mark the pattern known.
- **Check queue** now also lists flagged patterns and placement items.
- **SRS grader fix** (`srs/grader.py`): umlaut pairs that are different forms (hatte/hätte, war/wäre,
  wurde/würde, konnte/könnte, Mutter/Mütter …) are Again, not Hard. `haette` for `hätte` stays Hard.
  Found by the new drill test (error_spot "Ich hatte gern …" was accepted as correct).

### Phase 2 acceptance evidence (run 2026-10-21)

| Check | Result |
|---|---|
| Builder gate | `GET /api/stats/gate` → `{"study_days_last_7":0,"open":true,"override":true}` (override, see gate log) |
| 40 patterns, batches of 5, LanguageTool-checked | `make grammar-build`: 8 × "batch_0N.json: 5 patterns checked", "patterns: 40, 7 needs_review" (5 min 24 s, 4 parallel LanguageTool calls); first run flagged 9, 2 were real errors ("wenn/ob ich frei habe" → "freihabe", fixed); placement 35 items, 0 needs_review; recitation 12 tables |
| Pattern card + 6 drill types | `test_all_six_drill_types_are_generated`; screenshots `docs/evidence/phase2/p2-pattern-card.png`, `p2-drill-surgery.png`, `p2-drill-feedback.png` |
| Drill generators produce valid items | `tests/test_drills.py`: every drill of all 40 patterns: answer not in prompt, expected answer passes, empty fails, error_spot wrong sentence fails, fill answers not shown earlier |
| Recitation typed, full → gaps → blank by day | `test_recitation_stages_open_one_per_day`; `p2-recitation.png` |
| Homework + Tagebuch → red-pen | API tests (fake model) + Playwright against real LanguageTool (model offline → LanguageTool-only red pen): `p2-redpen.png` |
| Ghalti table + heat map, fix_sentence cards | `test_errors_become_ghalti_rows_and_fix_sentence_cards`, `test_homework_red_pen_creates_fix_card_in_manzil` (card shows in Manzil, corrected answer = Good); `p2-ghalti.png` |
| Placement test sets level_band, marks known | `test_placement_sets_level_and_marks_known` (A2 + B1.1 right → "B1.2", seed item known, card scheduled); `p2-placement.png` |
| Grader schema, 5 fixture sentences, each expected tag | `tests/test_grader_schema.py` 5 fixtures pass (VERB_FINAL; V2_POSITION + VERB_FINAL; AUX_HABEN_SEIN; CASE_DAT; PARTIZIP) with a **mocked** model reply; plus bad-schema rejection, retry, fallback, span drop |
| Same 5 fixtures on a real local model | **Not run.** `tests/test_grader_llm.py` skips without `RUN_OLLAMA=1`; this container cannot download models (registry.ollama.ai and huggingface.co denied by the network policy). Open item below. |
| pytest | 163 passed, 5 skipped (the 5 real-model tests); `test_built_patterns_match_source` guards against a stale build |
| vitest | 6 passed (RedPen, surgery chips, drill hides answer until Check) |
| Playwright 375px | 5 passed (3 new Phase 2 + 2 Phase 1); every new screen asserts no horizontal scroll |
| make lint | ruff check + format clean; oxlint 0 errors (2 old warnings in ReviewSession.tsx); tsc clean |
| New dependencies | none |

### Open Phase 2 items

- [ ] **Real local-model run.** On Zee's machine: install Ollama, `ollama pull llama3.1:8b`, `make lt-up`,
  `make test-ollama`. All 5 fixtures must find their tags. If not, try another model (`OLLAMA_MODEL=...`)
  and record the result here. Until then the grading quality of the free setup is unmeasured.
- [ ] **Approve or fix flagged patterns** in the check queue (7, all look like false positives: speller on Lahore, MiCA, Coin, CFA in V2_INVERSION, VE_ALS, MODAL_INFINITIVE, RELATIVE_CLAUSE, KONJ2_WISH, FUTURE; SCHENKEN_DATIV on the correct "Ich gebe ihn ihr." in MIDDLE_FIELD_ORDER). They stay out of drills until then.
- LanguageTool 6.8 misses some errors the model must catch, e.g. "Am Wochenende habe ich nach Frankfurt
  gefahren." gives no match (it does flag "Ich habe gestern nach Hause gegangen."). The LanguageTool-only
  fallback is a safety net, not a grader.

### End-of-phase diff review (subagent) and fixes

- Fixed: auto fill drills reused the card examples (answer visible just before the attempt); now built from
  transform/tense answers not shown on the card or earlier in the round, and fill runs before those. One
  authored fill (TWO_PART_CONNECTORS) duplicated a surgery sentence; replaced. Test added for all 40.
- Fixed: "I don't know" in a drill was written to Ghalti as "(no answer)" and merged into one fake recurring row.
- Fixed: two errors with the same tag in one sentence counted as a repeat (inflated "recurring").
- Fixed: a multiple-choice hit (possible guess) marked a whole pattern known; now typed items only.
- Fixed: malformed Ollama reply raised a 500; now `LLMUnavailable` → LanguageTool-only fallback.
- Fixed (nits): a band with no testable items counts as not passed; drill round start clamped to 24 h.
- Open (nits): a valid other word order in surgery still counts as wrong first-try (note shown); an error
  span crossing a sentence split (e.g. after "z.B.") is not written to Ghalti; `_locate` can anchor a
  repeated short span at an earlier occurrence.
- Open (frontend agent notes): `GET /api/homework/today` creates today's row (GET with a write); Home
  fetches the full placement payload only to read `last_result`.

### How to rerun the Phase 2 e2e check

Same as Phase 1 (below), plus `make grammar-build` before `load_seed` if `data/seed/patterns.json` is stale.
`npx playwright test` runs both `phone.spec.ts` and `phase2.spec.ts`.

## Phase 3: what exists

- **Speech in the browser** `frontend/src/lib/speech.ts`: `Recognizer` wraps `SpeechRecognition`
  (`de-DE`, `continuous`, `interimResults`). On every `end` it starts recognition again and keeps the text;
  interim words not finalised before `end` are kept (restart gap); Android cumulative results are not
  doubled; fatal errors (mic blocked, service off) stop restarting and switch to typing. Only Zee's
  Stop (or letting go of Hold) ends listening, and only Send ends the turn. No timers, no silence logic.
- **TalkInput** (`features/voice/TalkInput.tsx`): tap-start/tap-stop (default) or hold-to-talk (Settings);
  after Stop the transcript is editable, with Send / Add more / Clear; "Type instead" always there; text
  fallback when `SpeechRecognition` is missing. The restart count goes to the server with each turn
  (`voice_turn.stt_restarts`) for the word-loss test.
- **TTS** `lib/tts.ts`: `speechSynthesis` with a German device voice, rate 0.9; if there is none,
  `POST /api/voice/tts` (Piper on the server, cached wav in `audio/tts/`, ledger row vendor `piper`, €0);
  if Piper is not configured (`PIPER_BIN`, `PIPER_MODEL`) the text stays on screen.
- **Backend** `app/voice/`: `disfluency.clean` (fillers, sound repeats, broken-off starts, word and
  phrase repeats; "um", "eh", "in Indien" stay), `shadowing.score` (word match in order, umlaut spelling
  and digits tolerated, no time or pace), `visible_scores` (drops fluency/pace keys unless the setting is
  on), `tutor.take_turn` (clean → Tutor JSON `TutorTurn` → LanguageTool on `reply_de`, flags →
  `needs_review`), `tutor.review` ("Say it better", Grader JSON `SessionReview`; errors → Ghalti source
  `voice` + `fix_sentence` cards). Model down: turn saved as `offline`; review is LanguageTool only,
  provisional, not written to Ghalti, can be re-run. Tables `voice_session`, `voice_turn` (migration
  `db5d1f875cd8`).
- **API** `/api/voice/settings|scenarios|session|session/{id}|turn|session/{id}/review|shadow|tts|tts/status`,
  `/api/recitation/{code}/voice` (one transcript per row, cells matched in order, same stages as typed).
- **Content**: 6 roleplays (Kantine, desk meeting, on-call incident, asking the manager, doctor by phone,
  DB missed connection) + free talk (Gupshup), each with goal + 5 chunks + opening line, in
  `data/seed/source/scenarios.json`, built by `make voice-build` (LanguageTool: 7 scenarios, 0 needs_review;
  the first run flagged the name "Zee" in an opening line, removed).
- **Screens** (`/voice`): Bolna hub (settings: talk button, fluency score off by default), Takrar
  (shadowing from today's Sabaq items already attempted, else recent ones), roleplay/free-talk session
  with chunks, tutor line + Play + English toggle + one prompt correction, End and review → Say it better
  (shadow any corrected line), Pahara by voice row by row. Home has a "Bolna (speaking)" row.

### Phase 3 acceptance evidence (run 2026-10-26)

| Check | Result |
|---|---|
| Builder gate | container DB: `study_days_last_7 = 0`, `gate_override = true` → open (see gate log) |
| Hold-to-talk + tap-start/tap-stop | vitest `TalkInput` tests (tap: 10 browser `end` events, still listening, no send; hold: let go stops, Send still needed); Playwright `p3-listening.png` |
| Restart on every `end`, only Zee's tap ends a turn | vitest `speech.test.ts` 6 tests; Playwright: 3 forced `end` events → 4 starts, turn still open, text kept |
| Pipeline STT → Tutor (Ollama) → TTS | `test_pipeline_turn_and_review` ×3 fixture transcripts with a **mocked** model: cleaned text sent (raw not), reply, one prompt correction, review tags AUX_HABEN_SEIN / V2_POSITION / CASE_DAT reach Ghalti + fix_sentence card |
| One real call behind `RUN_OLLAMA=1` | `tests/test_voice_llm.py` written, **not run**: no Ollama in this container (localhost:11434 not reachable, model registry blocked). Open item |
| Shadowing word match, no fluency score | `test_shadowing_word_match`; API drops a fluency key while the setting is off (`test_shadow_api_scores_and_hides_fluency_by_default`); `p3-shadowing.png` |
| Fluency score not displayed when setting off | vitest `ShadowScore` test (score 41 given, not rendered; rendered only with the setting on) + backend `test_fluency_hidden_unless_setting_on` |
| No code path ends a user turn automatically | vitest static guard (no `setTimeout`/`setInterval`/`onspeechend`/`onsoundend`/`onaudioend`/`onnomatch` in voice turn code) + `test_server_has_no_turn_timeout_or_silence_logic` + the restart tests above |
| Disfluency stripping before grading | 7 + 3 cases in `test_voice.py`; filler-only turn refused (422) without a model call |
| Recitation by voice | `test_recitation_by_voice_passes_with_stammer_and_flags_missing_cell`; Playwright `p3-recitation-voice.png` |
| 6 scenario roleplays, free talk, Say it better | `test_scenarios_six_roleplays_plus_free_talk`; `p3-voice-home.png`, `p3-scenario-card.png`, `p3-turn.png`, `p3-say-it-better.png` (model offline → LanguageTool-only review) |
| Cost ledger for every LLM call | tutor + grader rows, vendor `ollama`, €0, tokens counted (in the pipeline test); Piper rows `piper`/chars/€0 (`test_tts_with_piper_caches_and_writes_ledger`, fake piper binary) |
| Text fallback without `SpeechRecognition` | vitest fallback test; typed turns stored as `input_mode=text`, minutes counted the same |
| Piper server TTS | code + test with a fake binary only; real Piper **not run** (voice download from huggingface.co refused by the network policy). Open item |
| Self-hosted Whisper fallback | **not built**: the phase makes it conditional on Zee's speech test losing words. Open item |
| pytest | 198 passed, 8 skipped (5 grader + 3 voice real-model tests, need `RUN_OLLAMA=1`) |
| vitest | 20 passed (8 new recognizer tests, 6 new voice UI tests) |
| Playwright 375px | 7 passed on a fresh e2e DB (2 new Phase 3 + 3 Phase 2 + 2 Phase 1), no horizontal scroll on new screens. A third run on a reused DB failed 2 old tests (homework already graded, no due card): the known order/state dependency, not a regression |
| make lint | ruff check + format clean; oxlint 0 errors (2 old warnings); tsc clean |
| New dependencies | none (Piper is a separate local program, called by path like Ollama) |

### Open Phase 3 items

- [ ] **STT word-loss test with Zee's speech** (docs/architecture.md §16). On the phone (HTTPS) and laptop
  Chrome: read the 10 test sentences below in a roleplay, with pauses and blocks as they come; compare
  the stored `voice_turn.user_raw` with the text, count lost words, note `stt_restarts`. If words are lost
  in restart gaps, build the Whisper fallback (record with `MediaRecorder`, transcribe on the server)
  behind the same `TalkInput`. Sentences: the 5 Kantine chunks and the 5 Bahn chunks in `scenarios.json`.
- [ ] **Real model run**: `make test-ollama` now also runs `tests/test_voice_llm.py` (3 fixtures, tutor
  turn + review must find the expected tag).
- [ ] **Piper**: install Piper, download `de_DE-thorsten-medium` (CC0), set `PIPER_BIN`/`PIPER_MODEL`,
  open the app in a browser without a German voice and press Play. The CLI flags used are
  `--model` and `--output_file` (text on stdin); check them against the installed Piper version.
- [ ] Browser speech privacy note in `docs/vendors.md` (architecture.md §12) before daily voice use.
- Fixture transcripts in `tests/fixtures/voice/transcripts.json` are authored, not recorded from Zee.
  Replace with his real transcripts after the STT test.

### End-of-phase diff review (subagent) and fixes

- Fixed: disfluency stripping removed real German: a repeat across a comma ("Ich mag das, das ist gut."),
  relative pronoun + article ("Die Frau, die die Stelle hat"), a digit before a number ("2 20-Cent-Stücke"),
  and the comma before "dass" around a filler. Tests added for each.
- Fixed: Pahara by voice ran the repeat stripper, so "wir uns uns" (PRONOUNS_CASE) could never pass;
  now only fillers are dropped. Test added.
- Fixed (ask before tell): `POST /api/voice/shadow` returned the German of any item, also Sabaq items not
  yet attempted. Now only taught items, like the list. Test added.
- Fixed: a failed Send cleared the spoken text; now the text stays and the error says so. Test added.
- Fixed: if restarting recognition threw, the turn hung in "One moment" with the text locked. Now one
  fresh instance is tried, then the text is handed back editable. Test added.
- Fixed: Pahara by voice had no retry after a failed submit; voice practice added 0 minutes to the day
  (now active time per turn, capped at 60 s like other modules, never shown); old sessions of a scenario
  later flagged needs_review returned 500.
- Open (nit): the Android duplicate-result guard compares text prefixes, so a final "Ja" followed by
  "Ja, genau" in the same recognition session keeps only "Ja, genau". Check with Zee's phone in the STT test.
- Open (nit): hold mode ends listening on `pointercancel` (e.g. a system gesture). The text is kept and
  "Add more" continues the turn; nothing is sent.

### How to rerun the Phase 3 e2e check

Same setup as Phase 1 (below). `npx playwright test` runs all three specs; `phase3.spec.ts` injects a fake
`SpeechRecognition` (headless Chromium has no speech service). Without Ollama the tutor shows "offline".

## Phase 3.1: Bolna UX overhaul (2026-10-26, before Phase 4)

Gate: container DB `study_days_last_7 = 0`, `gate_override = true` (Zee's override from 2026-10-21) → open.

- **Bug fix: roleplay/Gupshup Start returned 500** on a DB without the Phase 3 migration (`no such table:
  voice_session`). Reproduced: Phase 2 DB → 500 for GUPSHUP and KANTINE; migrated DB → 200. Cause: the Docker
  image runs `alembic upgrade head` on start, but `make dev` / `make backend` did not. Fix: both now depend on
  `make migrate`; a missing table/column now returns 503 "The database is older than the app. Run: make migrate"
  instead of a bare 500. Tests: `test_voice_start_on_unmigrated_db_says_run_migrate`, and every scenario
  (6 roleplays + Gupshup) starts a `voice_session` row (`test_every_scenario_starts_a_session`).
- **Chat UI** (`Session.tsx`): messenger layout, sticky header (scenario avatar, chunks sheet, End), tutor
  bubbles left (Listen, English toggle), Zee's bubbles right (spoken/typed icon), the one prompt correction
  as an amber hint chip, "Ustad is replying" dots, auto-scroll that also follows the growing composer,
  Say it better below the chat with a summary (lines spoken, lines without errors).
- **Live mic** (`TalkInput.tsx`): mic orb with breathing rings and a sound-bar wave while listening, plus a
  ripple each time the recogniser delivers words (driven by recognition results, not a second mic stream:
  opening `getUserMedia` next to `SpeechRecognition` can fight over the mic on Android). Live transcript in a
  draft bubble. CSS animations only, `motion-safe:` so reduced-motion users get none; still no timers.
- **Stars** (`lib/stars.ts`): 1 to 3 stars, German content only. Shadowing: share of words heard
  (≥ 90 % = 3, ≥ 60 % = 2). Turns: errors the tutor found (0 = 3, 1 = 2, more = 1), from the new
  `error_count` on each turn; no stars when the tutor was offline or the review is LanguageTool-only.
  Words: green with ✓ = heard, rose struck through = not heard. This is recognition, not pronunciation
  (Web Speech has no pronunciation score), and the copy says "heard".
- **Hub** redesigned (hero with Gupshup, Takrar/Pahara tiles, roleplay cards with level badges, segmented
  talk-mode control, fluency switch still off by default); shadowing with a progress strip and round stars;
  Pahara by voice restyled.
- Colour is used in Bolna only; report cards stay grayscale (CLAUDE.md).

| Check | Result |
|---|---|
| pytest | 207 passed, 8 skipped (real-model tests) |
| vitest | 24 passed (new: star rules, chat bubbles + stars + no stars when offline, mic orb pulses/ripples and stays live on browser `end`) |
| Playwright 375px | phase3: 3 passed (new: graded chat with the turn API mocked, since there is no Ollama here); full suite 7 passed before the last two visual-only changes |
| Screenshots | `docs/evidence/phase3/p3-chat-stars.png`, `p3-chat-listening.png`, `p3-shadowing.png`, `p3-voice-home.png` |
| make lint | ruff clean; oxlint 0 errors (2 old warnings); tsc clean |
| New dependencies | none (inline SVG icons, Tailwind keyframes) |

Open: pedagogy check. P6 says in-conversation feedback stays light; stars per turn show an error count during
the talk. If Zee finds it distracting, hide turn stars and keep them in the review only.

## Phase 3.2: talk now, grade later (2026-10-26)

Gate: `study_days_last_7 = 0`, `gate_override = true` → open. Reason: waiting for grammar grading mid-turn broke
the speaking flow, and the local model was slow doing reply + JSON grading in one call.

- `POST /api/voice/turn` only replies: schema `TutorReply` = {reply_de, reply_en_gloss}; tutor prompt says
  "do not correct". No prompt correction, no errors, no stars per turn (old `prompt_correction`/`errors_json`
  columns stay in the table for old rows, unused). Normal `OLLAMA_TIMEOUT` (120 s).
- `POST /api/voice/session/{id}/review` does all grading: one Grader call for every line with
  `OLLAMA_REVIEW_TIMEOUT` (default 180 s, test asserts >= 90) and `OLLAMA_REVIEW_NUM_CTX` 8192 (Ollama's default
  context of 2048/4096 tokens would cut a long session). Stars per line (0 errors = 3, 1 = 2, more = 1) and a
  summary {lines, graded, clean, errors, stars, max_stars} are computed on the server. A line the model leaves
  out is "not graded" (no stars), no longer shown as correct. Ghalti + fix_sentence cards as before.
- UI: chat shows bubbles only; End shows "Ustad is checking your German" while the review runs; the review
  opens at its top with 3 tiles (lines, without errors, stars) and stars per line.
- Rule change synced in SPEC.md + docs/pedagogy.md (P6), docs/llm.md (tutor prompt, implementation),
  docs/architecture.md (voice_turn columns).

| Check | Result |
|---|---|
| pytest | 209 passed, 8 skipped (new: turn schema is reply-only and uses the normal timeout; review passes timeout >= 90 and num_ctx 8192; real Ollama request body carries both; stars + summary; skipped line not graded) |
| vitest | 25 passed (chat has no stars/corrections; review stars from server; grading card on End) |
| Playwright 375px | 8 passed on a fresh e2e DB; `docs/evidence/phase3/p3-chat.png`, `p3-review-stars.png` (API mocked: no Ollama here) |
| make lint | ruff clean; oxlint 0 errors (2 old warnings); tsc clean |

Open: the review's real duration on Zee's laptop is unmeasured (no Ollama here). Worst case is two attempts
(one retry on invalid JSON), so up to 2 × 180 s. If a 15-turn session still times out, raise
`OLLAMA_REVIEW_TIMEOUT` or try a smaller model for the review.

## Phase 4: what exists (2026-10-26)

Gate: see the gate log (override). Branch restarted from `main` after PR #4 merged.

- **Tables** (migration `165b7859bd8a`): `text` (model `ReadingText`; sentences `[{de, en}]`, glossary,
  questions with answers, `known_density`, `for_date`, `source_url`/`licence`/`credit`, status, first
  comprehension result), `audio_asset` (podcast episodes, script in `meta_json`), `dictation_item` (the
  day's 5 Diktat sentences, fixed when first asked for).
- **Known-word density** `app/reading/density.py`: spaCy `de_core_news_sm` lemmas. Counted: every word
  except names, numbers, punctuation. Closed-class words (articles, pronouns, prepositions, conjunctions,
  auxiliaries, particles) count as known. Known set = lemmas and forms of every taught item (any card
  introduced) plus placement-known items, cached until that set changes. Compounds are not split, so the
  measure errs on the hard side.
- **Seed texts**: 6 own B1.1 texts (2 episodes of the Bilal serial, markets, history, Pakistan/Germany, sick
  note at work), 128 to 146 words each, `data/seed/source/texts.json` → `make texts-build` (LanguageTool:
  6 texts, 0 needs_review; the first run flagged "Lahore" and two short match options, both rewritten).
  Loaded into the DB on first use (idempotent, keeps read state).
- **Author job** `app/reading/author.py`: Author JSON `GradedText` (Pydantic, sent as Ollama `format`) →
  density against Zee's words → outside 93 to 99 %: one regeneration with feedback (unknown words named, or
  "too easy"), the closer draft kept → LanguageTool on body + question text; flag or LanguageTool down →
  `needs_review`. Per day: slot 1 = next serial episode (continues from the seed episodes), slot 2 rotates
  markets / crypto / history / pk_de / work / life. Ledger row per call (vendor `ollama`, €0).
  **Nightly**: APScheduler in the app lifespan, 03:17 Europe/Berlin, fills today + tomorrow up to 2 texts
  each; model offline = logged, retried next night. By hand: `make author` or "Generate texts now" in Lesen
  (`POST /api/texts/generate`, 503 when the model is offline). `JOBS_ENABLED=false` turns the job off.
- **Reader** (`/read`, `/read/:id`): today's texts (Author texts for today, else 2 unread seed texts) +
  library with a known-words meter; tap a word → gloss sheet (lemma in sentence context, article, plural,
  meaning from the text glossary or an existing item; gender guessed by spaCy when nothing is stored; no
  meaning → Zee types one) → Add to SRS (deck `reader`, recog + produce cards taught now, example sentence
  from the text). Long-press or EN → that sentence's English; "English under" (interlinear) off by default;
  density meter; credit line always shown; `needs_review` banner. 3 questions (richtig/falsch, multiple
  choice, matching), answers only in the Check response; first attempt kept; reading time counts up to
  15 active minutes per text.
- **Read-aloud / listening flow**: Listen to all, per-sentence replay, 0.75× / 1×, text hide/show
  (read first optional, then listen, then answer), via `speechSynthesis` (Piper fallback as in Phase 3).
- **Diktat** (`/listen/diktat`): 5 a day, from taught items' sentences (never untaught: ask before tell),
  then sentences of texts read, then seed texts; 4 to 14 words. Word diff names each error: umlaut
  (ä/ö/ü/ß in any spelling), capital, ending (known inflection endings), spelling, missing, extra; char
  diff as in reviews; accuracy = right words / (expected + extra). First attempt kept; attempt row with
  error tags.
- **Commute Podcast** (`/listen/podcast`): yesterday's mistakes first ("Falsch: … pause … Richtig: …",
  whole sentences from the fix card when there is one), then today's taught Sabaq sentences, then recently
  taught ones, until about 10 min (cap 20 min). German only by default: sentence (slow, Piper
  `--length_scale 1.3`), 4 s pause to say it in your head, sentence again. With `PIPER_MODEL_EN`: English
  prompt, pause, German answer. Segments synthesised by Piper (cached, ledger rows), joined with silences
  into one WAV (other sample rates resampled by ffmpeg), encoded to mp3 by ffmpeg when installed, else WAV.
  One episode a day, rebuilt on demand. Offline: "Save for offline" puts it in the `ustad-podcast` cache;
  the service worker serves `/api/podcast/*/audio` cache-first with range requests. Script viewable without
  Piper.
- **Sources** (`/listen/sources`): §11 groups with a one-line licence note each; links only to site or
  section pages; YouTube box embeds the official player (`youtube-nocookie.com/embed/<id>?cc_load_policy=1&cc_lang_pref=de`),
  no transcript scraping.
- Home: "Reading and listening" with Lesen and Hören (Diktat x of 5).

### Phase 4 acceptance evidence (run 2026-10-26)

| Check | Result |
|---|---|
| Builder gate | `{"study_days_last_7":0,"open":true,"override":true}` (override, see gate log) |
| Reader: tap-to-gloss/add, comprehension Qs | pytest: answers absent from `GET /api/texts/{id}`, scored once and kept, gloss from glossary, lemma in context ("Jahre" → "Jahr"), gender from context ("Bank" → f), add creates reader item with cards taught, second add `added: false`, known % rises after teaching; vitest: answers only after Check, interlinear off by default, tap opens gloss; Playwright `p4-reader-list.png`, `p4-reader.png`, `p4-gloss.png`, `p4-questions.png` |
| Nightly Author job, 2 texts/day, density check | pytest (model mocked): regeneration once when out of band and the closer draft kept, feedback names unknown words, in-band draft not regenerated, LanguageTool flag → `needs_review`, ledger rows €0, `ensure` makes 2/day (serial episodes 3, 4 after the seed's 1, 2), nothing more when filled, offline → 503 / job returns 0, scheduler registers the 03:xx job, off with `JOBS_ENABLED=false`. **Not run against a real model** (no Ollama here). Open item |
| Density calculator unit test | `test_density_counts_known_lemmas_and_skips_names_numbers_punct`, surface-form match, empty text, spaCy lemma test |
| Read-aloud via `speechSynthesis` | Reader buttons (all, per sentence, 0.75×/1×, text toggle); headless Chromium has no German voice, so audio itself is not verified here |
| Diktat (5/day) with diff | pytest: 15 word-kind cases (umlaut incl. ß/ae spellings, capitals, endings "einen/einem", "neu/neue", spelling), alignment with missing/extra, accuracy; API: 5 fixed per day, first attempt kept, 404 for other refs, attempt row; only taught items; vitest: sentence never shown before Check; result stays after the refetch; Playwright `p4-diktat.png` |
| Commute Podcast (Piper, concatenation, offline cache) | pytest with a fake Piper writing real WAVs: silence join exact to the frame, mistakes before sentences with pauses, English prompts only with an English voice, 10 to 20 min length bound, 503 without Piper, 422 with nothing to read, build → mp3 (ffmpeg present here) served as audio, a 16 kHz English voice resampled, rebuild replaces the file, ledger rows; Playwright `p4-podcast.png`; `vite build` sw.js has the `ustad-podcast` cache rule. **Real Piper voice not run** (as in Phase 3). Open item |
| Sources page per §11 | vitest YouTube parser + embed URL; Playwright `p4-sources.png` (embed has `cc_load_policy=1&cc_lang_pref=de`) |
| pytest | 266 passed, 8 skipped (real-model tests) |
| vitest | 37 passed (12 new: reader 5, listening 5, server TTS chunks 2) |
| Playwright 375px | 11 passed on a fresh e2e DB (3 new Phase 4 + 8 earlier), no horizontal scroll on new screens |
| make lint | ruff check + format clean; oxlint 0 errors (2 old warnings); tsc clean |

Bugs found by the e2e run and fixed (with regression tests): first visit to Home on a fresh DB returned 500
(texts and Diktat requests both inserting the seed texts / the day's Diktat set at once; now chosen and
committed inside a lock); Diktat jumped to the next sentence after Check and hid the result.

### End-of-phase diff review (subagent) and fixes

All 7 findings fixed, each with a test:
- Diktat: short case forms (den/dem, ihn/ihm, die/der) were "spelling", now "ending"; a doubled consonant
  (mus/muss) is "spelling", not "ending"; a capital error next to an ending error (gute/Guten) is counted too.
- Author: a regeneration that fails validation twice threw the first draft away; now the first draft is stored.
- Nightly job: a night missed because the app was off was never made up; now a catch-up run at startup
  (it calls the model only for days still missing texts).
- SQLite lock: Author and podcast builds held the write lock through slow model/Piper calls (other requests
  could get "database is locked"); ledger rows are now committed before each slow step.
- Podcast: a failed rebuild could corrupt today's episode and returned 500; it now builds to a temp file,
  replaces the episode only on success, and returns 503.
- Gloss: spaCy's gender guess was saved with the card as fact; it is now a separate `gender_guess`, shown as
  "Probably die (a guess from the sentence; check it)", never saved.
- Read-aloud without a German device voice: "Listen to all" sent 900+ characters to the server voice
  (limit 600, 422); now sent in sentence chunks under 500 characters, played in order, stoppable.
- Small: "Save for offline" keeps only the current episode in the cache; the sources heading now says
  "Free to store with credit" (the links leave the app).

### Open Phase 4 items

- [ ] YouTube box: §5.5 wants the app's own questions and vocab list next to an embedded video. Not built
  (needs per-video content; the Author could write them from a title Zee enters).

- [ ] **Real Author run**: `make author` with Ollama. Check: density lands in 93 to 99 % (in a fresh DB the
  seed texts read about 48 % known because almost nothing is taught yet; Zee's real DB will read higher),
  German quality, questions answerable. If the local model cannot hit the band, the closer draft is stored
  with its measured density.
- [ ] **Real Piper episode** on the phone: Piper + `de_DE-thorsten-medium`, optional English voice
  (check its licence first; `thorsten`/`kerstin` are the CC0 ones in §11), Build, Save for offline, play in
  flight mode. Piper flag `--length_scale` to be checked against the installed version.
- [ ] Docker image has no ffmpeg (episodes stay WAV there) and no Piper; add both if the server builds episodes.
- [ ] Not built (later): importing Bundesbank/BaFin RSS texts into the reader (storable with credit), DW
  Top-Thema MP3 feed in-app. The sources page links to them for now.
- Facts in seed texts are from the author's knowledge, not checked against sources here: history-01
  (Schabowski, 9 Nov 1989, paraphrased), work-01 (sick note after more than 3 calendar days, eAU since 2023,
  6 weeks continued pay). Zee: check before relying on them.

### How to rerun the Phase 4 e2e check

Same as Phase 1, plus a fake Piper so the podcast builds: start the server with
`PIPER_BIN=<fake piper> PIPER_MODEL=de_DE-thorsten-medium.onnx AUDIO_DIR=<scratch>/audio JOBS_ENABLED=false`
(the fake is `FAKE_PIPER` in `backend/tests/test_phase4.py`, saved as an executable file).

## Dependencies added (one-line reasons)

Backend:
- fastapi, uvicorn[standard]: API server (§8).
- pydantic-settings: typed config from `.env`.
- httpx: LanguageTool HTTP client; also used by FastAPI's TestClient.
- dev: pytest (§8 tests), ruff (lint/format).

Frontend (from the Vite react-ts template: react, react-dom, vite, typescript, @vitejs/plugin-react, oxlint), plus:
- tailwindcss, @tailwindcss/vite: styling (§8).
- vitest, jsdom, @testing-library/react, @testing-library/jest-dom: frontend tests (§8).

Phase 1 (added when first used): sqlalchemy + alembic (tables, migrations), fsrs (scheduler), argon2-cffi (password hash);
react-router + @tanstack/react-query (multi-page UI, server state), vite-plugin-pwa (installable PWA),
@playwright/test (phone-width e2e + screenshots). No new dependencies for the Phase 1 finish.
Phase 2: none (Ollama is called with the existing httpx; Ollama itself is a separate local program, not a
Python/npm dependency).
Phase 3: none (Web Speech is a browser API; Piper is an optional separate program run by path).
Phase 4: spacy + de_core_news_sm (lemmas for known-word density, as chosen in §8; model wheel pinned by URL,
MIT); apscheduler 3.x (nightly Author job inside the app, as chosen in §8). ffmpeg (mp3) is an optional
separate program, like Piper. Frontend: none.

## Known issues / notes

- Docker Hub returned 429 (pull rate limit) in the cloud container; the LanguageTool image comes from
  `mirror.gcr.io`, Google's Docker Hub mirror. Same image ID as Docker Hub's `6.8` tag at time of pull.
- In the cloud container the Docker daemon is not started automatically: run `dockerd` in the background first.
- pytest shows a StarletteDeprecationWarning about `httpx` in TestClient (upstream; harmless for now).
- The LanguageTool test skips (not fails) when the container is not running, so `make test` works without Docker.

## V2 phases

Brief: docs/USTAD_V2_CODEX_BRIEF.md (v2 overrides phone-first, PWA and stars in older docs). Next phase: V2 (after about 5 study days of use, brief section 0).
Builder gate applies from V3 on; V0 is a UI and bug-fix phase.

### V0: MacBook layout, clean UI shell, cleanup (2026-10-26)

- AGENTS.md created, CLAUDE.md updated to the same rules (46 lines each).
- Shell: fixed 220 px sidebar (Today; Practice: Lesen, Hören, Schreiben, Sprechen; Grammatik, Ghalti,
  Fortschritt; Settings with Placement, Check queue, Sources, Log out). Main area max 1120 px, exercise
  screens a centered 720 px column. Shared `PageHeader`, `ListRow`, `StatusPill`, `Column` in `components/ui.tsx`.
- Removed: phone layout, bottom sheets, hold-to-talk, PWA (`vite-plugin-pwa`, manifest, icons; `main.tsx`
  unregisters old service workers and caches), "Save for offline" (podcast keeps a download link), stars,
  emoji, mic orb animations, gradients and colour pills in the voice screens.
- Pahara typed and spoken merged on `/recitation` (Type / Speak switch, `?mode=speak`); old `/voice/recite` routes gone.
- Voice: click Start / Stop; Space toggles listening only outside text fields; Stop never sends. No timers.
- Today: Next, Today's loop, Practice. Placement, Ghalti, Check queue left Home.
- Backend: L8 `profile.level_band` NULL until placement (migration `a0c1v2zero01` with downgrade; Author and
  tutor get "level not placed" text; UI "Not placed"); L9 copy "Curriculum start: B1.1 stage. This is the app's
  own placement, not an official CEFR result."; L11 `GET /api/homework/today` read-only (`id: null` preview),
  `POST /api/homework/today` creates; L13 `make gate-reset`.
- Dependencies: removed `vite-plugin-pwa`. Added none.

| Check | Result |
|---|---|
| pytest | 265 passed, 10 skipped, 1 failed: `test_daily_loop` (assert on sibling card due > 1 h). It also fails on the commit before V0 (checked with the V0 changes stashed), so it is not from V0. Not investigated yet. |
| vitest | 43 passed |
| Playwright 1440x900 | 14 passed on a fresh e2e DB with a fake Piper; includes no horizontal scroll at 1024 and 1440 on 12 routes plus reading/listening routes and the voice routes |
| make lint | ruff check and format clean; oxlint 0 errors, 1 old warning (set-state-in-effect in ReviewSession); tsc clean |
| Forbidden-term grep | `max-w-md`, `isMobile`, `orientation`, `vite-plugin-pwa`, `StarRow`: no hits in frontend src, e2e, config |
| Emoji/symbol scan of `frontend/src` | only ✓ and ✗ marking right/wrong answers (Drills, Recitation, VoiceRecitation, Placement, Reader, ShadowScore). ▲ ● ■ gender symbols are outside the scanned ranges and kept on purpose. |
| Screenshots | `docs/evidence/v2/v0-*.png` at 1440x900 (today, reader gloss, voice chat, ghalti, settings and more) |

Open after V0:
- `test_daily_loop` failure above.
- Backend `VoiceSettings` still accepts `talk_mode` (dead; frontend no longer sends it).
- Docs older than V0 (SPEC.md, docs/*.md) still say phone-first; the brief and CLAUDE.md win.
- Zee: run `make gate-reset` on the Mac DB. The override from 2026-10-21 is still set there.
- Run the e2e on a fresh DB; the specs still depend on order and state. Login is rate limited in memory, so restart the server after failed login runs.

### V1: one evidence ledger for all four skills (2026-10-26)

Gate: not applicable (rule starts at V3).
- Tables (migration `b1e7v1evid02`, with downgrade): `evidence_event`, `activity_log`, `day_log.other_done`.
  The unused `session` table and `attempt.session_id` are dropped (L12); the table is kept if it has rows.
- `services/evidence.py`: `record_event`, `add_activity`, `record_grade`, card and Diktat helpers. Every
  `add_minutes` call is replaced by `add_activity` with the right skill. Writing time is new (L7): the editor
  sends `elapsed_ms`, counting gaps of 60 s or less (`lib/activeTime.ts`, no visible timer).
- Grader: `correct_uses` (max 12, spans must be whole words of Zee's text and outside error spans; dropped ones
  counted) for texts and per voice line; prompts and `grader_fixtures.json` extended.
- Ghalti by tag (L1): recurring = 3 or more errors from 2 or more sentences in 30 days; wrong share with 5 or
  more events, else "too few uses". The Ghalti page shows both. Sentence rows stay.
- Study day (L6): Manzil plus Sabqi, Sabaq, or `other_done` (voice session reviewed, Diktat 5 of 5, text read
  with its questions). Mazmoon joins in V3.
- Backfill (`services/backfill.py`, run in the migration and by `scripts.backfill_evidence`): idempotent, skips rows
  newer than the first live event. Formulas and rules: docs/v2/metrics.md.
- Dependencies: none.

| Check | Result |
|---|---|
| pytest | 309 passed, 15 skipped (real-model tests need `RUN_OLLAMA=1`). New file `tests/test_v1_evidence.py`: one test per source (review, sabaq, drill, recitation, homework, tagebuch, placement, voice review, shadow, diktat, reading questions), all six skills present in one run, typed voice lines are writing not speaking, correct-use span rules, recurring for 3 errors in 2 sentences and not for 3 repeats of one, 30-day window, 5-event rate rule, study-day rule, backfill idempotent, homework time in `activity_log` |
| Grader fixtures | 5 fixtures carry known correct uses; mocked-model test passes; real-model test `test_real_model_correct_uses_are_valid_spans` written, **not run** (no Ollama here) |
| Migration | upgrade, downgrade, upgrade on a DB with a `mistake`, an `attempt` and a `session` row: events created, `session` dropped, round trip clean |
| vitest / lint | 44 passed; ruff clean; oxlint 0 errors (1 old warning); tsc clean |
| Playwright 1440x900 | 14 passed. `SELECT skill, count(*) FROM evidence_event GROUP BY skill` after that run: grammar 1, listening 5, reading 3, speaking 1, vocab 2. **No writing rows**: the model is offline in e2e, so the red pen is LanguageTool-only, which is provisional and writes no evidence. The pytest run above shows all 6 skills. |

End-of-phase diff review (subagent): 7 findings. Fixed with tests: backfill re-run double counting live rows;
drill first-try window used UTC instead of the Berlin day; free drills wrote evidence on every re-submit;
sentence-less errors collapsed into one sentence for "recurring" (now source_ref); correct old drills had no tag;
substring and duplicate correct-use spans; reading time counted twice (read mark plus answers).
Not fixed: the migration's backfill imports the current ORM models, so a future migration that adds a column to
`attempt`, `card`, `item`, `mistake`, `text`, `review_log` or the voice tables could break a replay of the chain
from scratch. Existing databases are fine. If that happens, run the schema part and then
`python -m scripts.backfill_evidence`.

Open after V1:
- Real-model check of `correct_uses` on Zee's Mac (`make test-ollama`).
- Diktat attempts from before V1 only know the coarse tag (ending = OTHER).
- `test_daily_loop` failed twice on 2026-10-26 and passed later the same day: it depends on the time of day.
  Not investigated.

### V2: the Stand box and the Progress page (2026-10-29)

Gate: not applicable (rule starts at V3).
- Official data: `data/official/goethe_b1.json`, `goethe_b2.json`, `cefr.json` (facts from brief section 4, each with
  source URL and check date; Sprechen `verified: false`) and `standing_method.json` (weights, half-life, thresholds).
  `data/private/` is now in `.gitignore` (the B1 word list goes there).
- Table `exam_result` (migration `c2v2stand03`, with downgrade, round trip tested). Goals (target exam, date, weekly
  hours) live in `profile.settings_json["goals"]`.
- `services/standing.py` (deterministic, no model; test forbids numeric literals beyond 0, 1, 2): estimate with range,
  status words, forecast, needed pace, pace, indicators. API: `GET /api/standing`, `/api/progress`, `/api/goals`
  (GET, POST), `/api/exam-results` (GET, POST), `/api/exam-format`. Formulas: docs/v2/metrics.md.
- UI: Stand box at the top of Today (`features/standing/StandBox.tsx`), Progress page (module cards with history,
  evidence, official tasks, indicators; hours per skill as patterned stacked bars; error rate per tag per week; 40-cell
  grammar grid with state words; word-list line; "Then and now" waits for V3), Settings: goal form and "Add a result"
  (real result, whole practice test per Teil, one Teil). Accent colour only on the pass tick and pass line.
- Dependencies: none.

| Check | Result |
|---|---|
| pytest | 345 passed, 15 skipped. New `tests/test_standing.py` (36): empty DB gives "Not measured yet" and no numbers; one entry gives +/- 10; recency and weights; floor of 5; real exam overrides; Sprechen range +16 and never scaled up; rising results over 14+ days give a date; falling give "No reliable trend yet"; spans under 14 days; "More than a year"; pace needs 7 days in the window; needed pace; entry scoring (18 correct = 60, Teil scaling, rater points, whole items only, refused entries); grammar states; error rate gate of 20; weekly tag gate of 5; word list with and without the private file; no numeric literals in the service; official files carry source URLs and Teil sums; migration round trip |
| vitest | 48 passed (4 new: empty box has no number and no pass tick for modules, the four states, mixed box, pace line) |
| Playwright 1440x900 | `e2e/v2.spec.ts` 2 passed on a fresh e2e DB: empty box (5 "Not measured yet", 0 pass ticks, 4 Measure links, box height <= 260 px), results entered through the forms change the box, Progress at `?module=lesen`; no horizontal scroll at 1024 and 1440 on Today, Progress, Settings. Older specs were not re-run on this DB (they depend on state) |
| make lint | ruff clean; oxlint 0 errors, 1 old warning; tsc clean |
| Screenshots | `docs/evidence/v2/v2-stand-empty.png`, `v2-stand-data.png`, `v2-progress-empty.png`, `v2-progress-lesen.png`, `v2-settings.png` (the "data" shots use a throwaway e2e DB, not Zee's) |

End-of-phase diff review (subagent): 7 findings, 6 fixed with tests: Sprechen history chart scaled 84 up to 100;
Settings form kept a stale Teil or scores after switching module; fractional Lesen/Hören items and certificate
points accepted; forecast wording did not match the 3-checks-over-14-days gate; needed pace showed a partial number
when modules had no trend (now "Not measured yet" naming them); pace counted all-time activity days instead of the
28-day window.
Not fixed, for Zee to decide: **an entered result cannot be corrected or removed** (a mistyped real exam of 85 instead
of 58 would override everything). Rules say never delete user data, so no DELETE was added; options: a `voided`
flag with a Remove button, or enter a newer real result.

Known limits:
- The Stand box is about 290 px high at 1440x900 (brief: about 200). The pace and forecast lines wrap.
- Sprechen scales are `verified: false` until the Prüferblätter are checked; the UI says "provisional".
- B2 Sprechen is entered as one total out of 84 (per-Teil split not confirmed).
- Word list coverage needs `data/private/goethe_b1_wortliste.txt` (one entry per line) on the Mac.
- Forecasts need activity hours (V1 onward); a module with results but no recorded practice shows "No reliable trend yet".

