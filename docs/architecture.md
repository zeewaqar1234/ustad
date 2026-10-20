# Architecture, data model, privacy/security/cost, scope

_Split from SPEC.md sections §8, §10, §12, §15, §16. SPEC.md stays the source of truth; edit both if a rule changes._

## 8. Technical architecture

Chosen to match what Zee already knows (FastAPI + React) and to keep one small deployable unit.

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, `uv` for deps | known stack; Python has `fsrs`, spaCy, good audio tooling |
| DB | SQLite (WAL mode) | single user; trivial backup; no DB server |
| Scheduler | `fsrs` (py-fsrs, MIT), desired_retention 0.90 | §3 P2 |
| Background jobs | APScheduler inside the app (nightly content, report card Sunday 20:00, backups) | no extra infra |
| Frontend | React + TypeScript + Vite, Tailwind, React Router, TanStack Query | known stack |
| PWA | `vite-plugin-pwa` (Workbox): installable, offline cache for SRS session + downloaded podcast | commute use |
| Audio in | `MediaRecorder` (webm/opus), hold-to-talk + tap mode | §5.4 |
| Audio out | server-generated mp3 (Azure TTS), cached by text hash | reuse = free |
| NLP helpers | spaCy `de_core_news_sm` for lemmatising known-word density; **self-hosted LanguageTool container** for checks (public API forbids automated use) | §9, §11 |
| Open data | Kaikki German JSONL (conjugations, gender, plurals), Tatoeba sentences, imported by scripts in `backend/scripts/` | §11 |
| Charts | Recharts | simple |
| PDF | print CSS (primary); WeasyPrint server-side (optional) | grayscale report card |
| Tests | pytest, vitest, Playwright (1–2 smoke e2e at phone width) | verification loop for Claude Code |
| Deploy | Docker Compose: app + Caddy (automatic HTTPS) on a small EU VPS, **or** a PaaS with a persistent volume. Decide in Phase 1 by price and whether it supports a persistent disk for SQLite. Prices not verified in this spec. | mic needs HTTPS; data stays in EU |

```
ustad/
  SPEC.md  CLAUDE.md  Makefile  docker-compose.yml  .env.example
  docs/ (split spec + PROGRESS.md + vendors.md)
  backend/app/{main.py, api/, core/, models/, srs/, llm/{prompts/}, voice/, content/, jobs/}
  backend/tests/
  frontend/src/{pages/, components/, features/{review,daily,voice,reader,feed,progress}/, lib/}
  data/seed/  config/prices.yaml
```

API surface (v1, REST JSON): `/auth/*`, `/api/daily` (today's loop), `/api/review/next|answer`, `/api/patterns/*`, `/api/drills/*`, `/api/homework/*`, `/api/mistakes`, `/api/texts/*`, `/api/dictation/*`, `/api/voice/session|turn|review`, `/api/feed`, `/api/tests/*`, `/api/stats/*` (incl. `/gate`), `/api/life/*`, `/api/report/*`, `/api/costs`, `/api/export`.

## 10. Data model

SQLite (single user), SQLAlchemy 2.x + Alembic migrations. All timestamps UTC, display Europe/Berlin.

| Table | Key fields |
|---|---|
| `profile` | id=1, name, level_band, explanation_lang, settings_json, gate_override |
| `life_fact` | id, category (work/routine/event/person_role/interest), text, valid_from, valid_to |
| `item` | id, kind (word/chunk/pattern/sentence), de, en, gender, plural, pos, lemma, tags[], cefr, freq_rank, source, status (ok/needs_review) |
| `card` | id, item_id, card_type (recog/produce/cloze/audio/gender/plural/verbforms/fix_sentence), FSRS state (due, stability, difficulty, state, reps, lapses, last_review) |
| `review_log` | id, card_id, ts, rating, answer_given, auto_graded, elapsed_ms |
| `pattern` | id, code (e.g. VE_WEIL), title, rule_en, slot_diagram, examples_json, order |
| `lesson` (Sabaq) | id, date, type (pattern/chunks/reading), pattern_id?, scenario, items[], status |
| `session` | id, kind (manzil/sabqi/sabaq/bolna/homework/feed/test/free), started, ended, active_s |
| `attempt` | id, session_id, task_ref, input, correct, error_tags[], score |
| `mistake` (Ghalti) | id, ts, source, orig, fix, tag, note, count, card_id? |
| `homework` | id, assigned, due, prompt, submission, grade_json, status |
| `text` | id, title, body_de, level, topic, known_density, source_url, licence, audio_asset_id? |
| `audio_asset` | id, path, kind (tts/user/external), text_ref, voice, duration_s |
| `voice_session` / `voice_turn` | session meta; turn: user_transcript, reply_de, prompt_correction, pron_json, audio refs |
| `test` / `test_result` | type (weekly/monthly/mock), module scores 0–100, items_json |
| `milestone` | code, title, achieved_at, evidence_ref |
| `day_log` | date, study_day bool, freeze_used bool, minutes |
| `report_card` | week, json, pdf_path |
| `cost_ledger` | ts, vendor, model, units, unit_type, eur |

**Error tags (enum `ErrorTag`):** `V2_POSITION`, `VERB_FINAL`, `SEP_PREFIX`, `AUX_HABEN_SEIN`, `PARTIZIP`, `TENSE_CHOICE`, `CASE_AKK`, `CASE_DAT`, `PREP_CASE`, `GENDER`, `ADJ_ENDING`, `PLURAL`, `CONNECTOR_CHOICE`, `MIDDLE_FIELD_ORDER`, `WORD_CHOICE`, `FALSE_FRIEND`, `REGISTER_DU_SIE`, `SPELLING`, `UMLAUT`, `CAPITALISATION`, `PRONUNCIATION`, `OTHER`.

## 12. Privacy, security, cost control

**Security (the app is on the internet and has your voice + diary):**
- Single user, password login (argon2 hash) + httpOnly secure session cookie; login rate limit; optional passkey later.
- All API keys only on the server (`.env`, never in the frontend bundle, never committed). `.env.example` committed with blank values.
- HTTPS is mandatory: browsers only allow microphone access in a secure context (localhost is exempt for development).
- Nightly SQLite backup (`sqlite3 .backup`) to a second location; `/api/export` gives a full JSON export.

**Privacy:**
- User audio is deleted after STT + scoring by default (keep transcripts). Setting to keep audio for 7 days for "listen to yourself" review.
- Don't use any vendor free tier that trains on your data for voice or diary content (Gemini free tier states data is used to improve products).
- Before going live, check each vendor's API data-retention policy (OpenAI, Azure, Anthropic) and note it in `docs/vendors.md`. Not verified in this spec.
- **Work confidentiality:** the app warns on the Life-facts page and in the journal: no client names, internal system names, order data or anything from the bank that is not public. The tutor prompt also enforces this. You work in a regulated environment; keep the app 100 % personal and off work devices/networks.

**Cost control:**
- Every external call writes to `cost_ledger` with computed € (prices in `config/prices.yaml`, editable).
- Budgets in Settings: daily soft cap (warning) and monthly hard cap (default €10). At hard cap: voice and live grading switch to text-only mode with pre-generated content; SRS keeps working (no API needed).
- Expected cost at normal use: ~€3–6/month total (voice ≈ $2–3 per §5.4 + Sonnet grading + nightly content). Verify against the ledger after week 1.

## 15. Out of scope for v1

Native iOS/Android apps (PWA only) · multiple users, friends, leaderboards · points shop/gems/leagues · Google Calendar/Outlook sync (manual life events instead) · realtime speech-to-speech (Phase 7) · handwriting OCR (Phase 7) · Austrian/Swiss variants · any integration with work systems or work accounts.

## 16. Open decisions and remaining uncertainty

| Item | Status | What to do |
|---|---|---|
| Vendor prices and model names | Verified on official pages 20 Oct 2026; they change often (OpenAI already marks older realtime/TTS models deprecated) | Claude Code re-checks `config/prices.yaml` against vendor pages in Phase 3 |
| Azure pronunciation assessment for de-DE | Listed as supported per the language-support tab (research check); I could not re-extract that tab myself. Prosody = en-US only and "fluency = silent breaks between words" both confirmed on the how-to page | Phase 3 first step: one real de-DE assessment call; if unsupported, ship Shadowing with STT word-match scoring instead |
| Tagesschau terms (private use, 60 req/h) | From the documented terms quoted in the bundesAPI docs; the official page blocked my direct check | Read https://www.tagesschau.de/infoservices/rssfeeds yourself before enabling the poller |
| Azure free tier limits and rate limits | Free amounts confirmed (0.5M TTS chars, 5 STT hours/month); request-rate limits not confirmed | Check in Azure portal when creating the resource; choose an EU region |
| STT quality for accented German | Not tested | Phase 3: record 10 test sentences, compare `gpt-4o-mini-transcribe` vs `gpt-transcribe` WER; pick the better one |
| Whether STT "cleans up" stammers or mis-transcribes blocks | Unknown | Phase 3 test with your real speech; if transcripts insert junk, add a cleanup step before grading |
| Vendor API data-retention policies | Not verified here | Check before storing voice; document in `docs/vendors.md` |
| Hosting | Choice open (see §8) | Pick in Phase 1; must give HTTPS + persistent disk for SQLite |
| LLM-generated German accuracy | Known risk | LanguageTool check + `needs_review` + your spot checks; for grammar pattern cards, cross-check against a grammar reference |
| Evidence strength | Several design choices rest on MOD/WEAK evidence (shadowing, microlearning, streaks) | Treat as experiments; the progress data will show what works for you after 4 weeks |
| B1 timeline | Depends on real weekly hours | Trust the app's forecast, not this spec |
