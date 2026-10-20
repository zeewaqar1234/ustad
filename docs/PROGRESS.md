# Progress

Read this first every session. Then read only the docs/ file for the current phase (see CLAUDE.md).

## Status

| Phase | Status | Date |
|---|---|---|
| 0. Scaffold | Done | 2026-10-20 |
| 1. MVP: SRS + daily loop | Next | |
| 2–7 | Not started | |

**Next session:** `Read CLAUDE.md and docs/PROGRESS.md, then do Phase 1.` Acceptance list: docs/phases.md.
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

## Dependencies added (one-line reasons)

Backend:
- fastapi, uvicorn[standard]: API server (§8).
- pydantic-settings: typed config from `.env`.
- httpx: LanguageTool HTTP client; also used by FastAPI's TestClient.
- dev: pytest (§8 tests), ruff (lint/format).

Frontend (from the Vite react-ts template: react, react-dom, vite, typescript, @vitejs/plugin-react, oxlint), plus:
- tailwindcss, @tailwindcss/vite: styling (§8).
- vitest, jsdom, @testing-library/react, @testing-library/jest-dom: frontend tests (§8).

Deferred on purpose (added when first used): SQLAlchemy/Alembic (Phase 1, first tables), fsrs (Phase 1),
React Router + TanStack Query (Phase 1, first multi-page UI), vite-plugin-pwa (Phase 1), Playwright (Phase 1 phone screenshot).

## Known issues / notes

- Docker Hub returned 429 (pull rate limit) in the cloud container; the LanguageTool image comes from
  `mirror.gcr.io`, Google's Docker Hub mirror. Same image ID as Docker Hub's `6.8` tag at time of pull.
- In the cloud container the Docker daemon is not started automatically: run `dockerd` in the background first.
- pytest shows a StarletteDeprecationWarning about `httpx` in TestClient (upstream; harmless for now).
- The LanguageTool test skips (not fails) when the container is not running, so `make test` works without Docker.
