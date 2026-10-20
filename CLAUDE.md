# Ustad: personal German coach (single user: Zee)

Full spec: SPEC.md. Do NOT read it whole each session. Read docs/PROGRESS.md first, then only the
docs/ file for the current phase:
- phase acceptance checks: docs/phases.md
- learner + tutor rules: docs/learner_profile.md, docs/llm.md
- pedagogy/daily loop: docs/pedagogy.md · modules: docs/modules.md
- engagement/progress: docs/engagement.md · stack/data/security: docs/architecture.md
- content licences: docs/content_sources.md · research/vendor links: docs/sources.md

## Commands
- make dev (backend :8000 + frontend :5173) · make test · make lint · make migrate
- backend: cd backend && uv run pytest -q · frontend: cd frontend && npm run test
- LanguageTool: make lt-up (docker compose, :8010) · make lt-check
- If the Docker daemon is not running in a cloud container: start `dockerd` in the background.
  Docker Hub may rate-limit (429); images come from mirror.gcr.io for that reason.

## Non-negotiables
- IMPORTANT: Speaking features never add time pressure: no auto turn-end, no timers, no interruption,
  fluency score hidden unless setting on, strip disfluencies before grading. User stammers.
- Ask before telling: every exercise hides the answer until an attempt.
- All LLM output = JSON validated by Pydantic. Generated German must pass LanguageTool or be marked needs_review.
- LanguageTool = self-hosted container only. Never call the public LanguageTool API.
- API keys server-side only. Never commit .env, *.db, audio/.
- Every external API call writes to cost_ledger.
- UI: phone-first (375px), works one-handed; laptop second. Report cards grayscale.
- Copy tone: short, direct, specific. No hype, no em dashes, no fake praise.
- Builder gate: before starting any NEW feature (Phase ≥ 2), call GET /api/stats/gate.
  If study_days_last_7 < 5, do bug fixes only and tell Zee why.
- New dependency = one-line reason in docs/PROGRESS.md.

## Workflow
- One phase per session. Finish with: acceptance checks run + output shown, PROGRESS.md updated, git commit.
- Use subagents for wide searches and for the end-of-phase diff review.
- When compacting, preserve: current phase checklist, modified files, test commands.
