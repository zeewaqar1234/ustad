# Progress

Read this first every session. Then read only the docs/ file for the current phase (see CLAUDE.md).

## Status

| Phase | Status | Date |
|---|---|---|
| 0. Scaffold | Done | 2026-10-20 |
| 1. MVP: SRS + daily loop | Done except deploy (open item below) | 2026-10-20 |
| 2. Grammar (§5.2) + writing (§5.6) + Ghalti (§5.7) | Done (acceptance evidence below); real local-model run open | 2026-10-21 |
| 3. Voice tutor | Not started | |
| 4. Reading (§5.3) + listening (§5.5) | Not started; Reading stays scheduled here | |
| 5–7 | Not started (work-writing templates of §5.6 scheduled in Phase 5) | |

**Next session:** run `make test-ollama` on Zee's machine (open Phase 2 item), approve the 7 flagged
patterns in the check queue, then Phase 3. Deploy over HTTPS is still open from Phase 1.
Acceptance list: docs/phases.md.

## Builder gate log

| Date | study_days_last_7 | Result |
|---|---|---|
| 2026-10-21 | 1 (Zee's count; the cloud-container DB had 0 because it is a fresh copy) | Closed by the rule. Zee overrode it: `profile.gate_override = true` in the container DB, `GET /api/stats/gate` → `{"study_days_last_7":0,"open":true,"override":true}`. Zee first asked for 4 mock `day_log` rows; Claude proposed the existing override instead so streak/attendance data stays real, and Zee chose the override. Phase 2 built as a gate exception. |

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

## Known issues / notes

- Docker Hub returned 429 (pull rate limit) in the cloud container; the LanguageTool image comes from
  `mirror.gcr.io`, Google's Docker Hub mirror. Same image ID as Docker Hub's `6.8` tag at time of pull.
- In the cloud container the Docker daemon is not started automatically: run `dockerd` in the background first.
- pytest shows a StarletteDeprecationWarning about `httpx` in TestClient (upstream; harmless for now).
- The LanguageTool test skips (not fails) when the container is not running, so `make test` works without Docker.
