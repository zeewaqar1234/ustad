# Progress

Read this first every session. Then read only the docs/ file for the current phase (see CLAUDE.md).

## Status

| Phase | Status | Date |
|---|---|---|
| 0. Scaffold | Done | 2026-10-20 |
| 1. MVP: SRS + daily loop | Done except deploy (open item below) | 2026-10-20 |
| 2–7 | Not started | |

**Next session:** deploy Phase 1 over HTTPS (needs a server + domain from Zee), then Phase 2.
Acceptance list: docs/phases.md.
Builder gate applies from Phase 2. SPEC lists the `/api/stats/gate` endpoint under Phase 6, so if it does not exist
yet when Phase 2 starts, compute study days in the last 7 from `day_log` (built in Phase 1) instead.

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

## Known issues / notes

- Docker Hub returned 429 (pull rate limit) in the cloud container; the LanguageTool image comes from
  `mirror.gcr.io`, Google's Docker Hub mirror. Same image ID as Docker Hub's `6.8` tag at time of pull.
- In the cloud container the Docker daemon is not started automatically: run `dockerd` in the background first.
- pytest shows a StarletteDeprecationWarning about `httpx` in TestClient (upstream; harmless for now).
- The LanguageTool test skips (not fails) when the container is not running, so `make test` works without Docker.
