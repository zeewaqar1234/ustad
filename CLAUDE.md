# Ustad: personal German coach (single user: Zee)

Full spec: SPEC.md (do NOT read it whole). Read docs/PROGRESS.md first. The v2 change brief is
docs/USTAD_V2_CODEX_BRIEF.md: read its sections 0 to 2 and only the phase you are doing. Where the brief
overrides older docs (phone layout, PWA, stars), the brief wins. AGENTS.md carries the same rules.
Per-topic docs: phases.md · learner_profile.md, llm.md · pedagogy.md, modules.md · engagement.md ·
architecture.md · content_sources.md · sources.md.

## Commands
- make dev (backend :8000 + frontend :5173) · make test · make lint · make migrate
- backend: cd backend && uv run pytest -q · frontend: cd frontend && npm run test
- LanguageTool: make lt-up (docker compose, :8010) · make lt-check
- If the Docker daemon is not running in a cloud container: start `dockerd` in the background.
  Docker Hub may rate-limit (429); images come from mirror.gcr.io for that reason.

## Non-negotiables
- IMPORTANT: Speaking never adds time pressure: no auto turn-end, no timers, no interruption, fluency
  score hidden unless setting on, strip disfluencies before grading. User stammers. Absolute.
- Ask before telling: every exercise hides the answer until an attempt.
- All LLM output = JSON validated by Pydantic. Generated German must pass LanguageTool or be marked needs_review.
- LanguageTool = self-hosted container only. Never call the public LanguageTool API.
- API keys server-side only. Never commit .env, *.db, audio/, data/private/.
- Every external API call writes to cost_ledger.
- No invented numbers: every number shown is an official constant (data/official/*.json with source URL) or
  computed from Zee's own rows with the formula in docs/v2/metrics.md. No data = "Not measured yet".
  A level label never comes from the LLM.
- The LLM never decides what Zee studies. Planning, scheduling, scoring, level estimates = deterministic
  Python with tests. The model only writes content inside the planner's constraints.
- UI: MacBook only, 1280x800 to 1728x1117 CSS px, designed at 1440x900, min width 1024. No phone layout,
  no PWA, no touch-only interactions, no bottom sheets. Keyboard first.
- No emoji, no decorative or "AI-looking" icons (sparkles, robots, avatars, gradients, orbs, confetti).
  Text labels first; plain monochrome line icons only for play, stop, mic, close.
- Visual: grayscale base + one accent colour only for the next action and the pass line. Everything
  readable printed in black and white. Right/wrong = weight/underline, not colour alone.
- Copy tone: short, direct, specific. No hype, no em dashes, no exclamation marks, no fake praise.
- Builder gate: retired by Zee on 2026-10-31. No study-day check blocks any phase.
- New dependency = one-line reason in docs/PROGRESS.md. Prefer none.
- Schema change = Alembic migration with downgrade (and backfill where old rows convert). Never rename
  or delete user data.

## Workflow
- One phase per session. Finish with: acceptance checks run + output shown, PROGRESS.md updated
  (section "V2 phases"), screenshots at 1440x900 in docs/evidence/v2/, one git commit per phase.
- Use subagents for wide searches and for the end-of-phase diff review.
- When compacting, preserve: current phase checklist, modified files, test commands.
