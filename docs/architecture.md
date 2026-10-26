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
| LLM | local **Ollama** server (`llama3.1:8b` default) behind `app/llm/` provider interface | free; §9 (docs/llm.md) |
| Audio in (STT) | browser **Web Speech API** `SpeechRecognition` (`lang="de-DE"`, `continuous`, `interimResults`), tap-start / tap-stop; free fallback: self-hosted Whisper on the server | free; see "Free-resources decision" below |
| Audio out (TTS) | browser **Web Speech API** `speechSynthesis` with a de-DE voice from the device | free; no audio file is produced (see below) |
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

### Free-resources decision (2026-10-21, Zee)

Claude (Anthropic) and Azure Speech are replaced. Nothing in the app needs a paid API key.

| Was | Now | What changes |
|---|---|---|
| Claude Haiku/Sonnet (Tutor, Grader, Author) | Ollama on Zee's machine or the server | quality of German feedback depends on the local model; LanguageTool pre-check and `needs_review` matter more |
| OpenAI `gpt-4o-mini-transcribe` (STT) | `SpeechRecognition` in the browser | see risks below |
| Azure neural TTS → cached mp3 | `speechSynthesis` in the browser | voice quality depends on the phone/OS; no mp3 |
| Azure pronunciation assessment | none (Web Speech gives only `transcript` + `confidence`) | Shadowing scores by word match against the reference text (the fallback already planned in §16) |

Risks and how the app handles them (facts from the W3C/WICG spec, MDN and mdn/browser-compat-data, checked 2026-10-21):
- **Turn end (stammer rule).** The spec says `end` fires whenever the session ends, for any reason, and the
  browser decides when recognition stops; Chrome Android ignores `continuous` ("can be set, but has no
  effect"). Rule in code: the app restarts recognition on every `end` event and appends the text; only Zee's
  tap on Stop ends a turn. No timer, no silence detection in app code. Risk left: words spoken in the short gap
  between `end` and restart can be lost, and a long block can cut a recognition segment. Phase 3 must test
  this with Zee's real speech; if it loses words, switch STT to self-hosted Whisper (free, record with
  `MediaRecorder`, transcribe on the server) behind the same interface.
- **Privacy.** MDN: by default recognition is server-based ("your audio is sent to a web service", e.g.
  Chrome). Voice content leaves the device to the browser vendor. Chrome desktop 139+ has `processLocally`
  for on-device recognition; Chrome Android and Safari do not. The diary and writing never go through this;
  only spoken turns do. The self-hosted Whisper fallback avoids it.
- **Support.** Chrome (desktop + Android) and Safari 14.1+ (webkit prefix; `continuous` correct from Safari 17).
  Firefox: preview only. The app shows a text-input fallback when `SpeechRecognition` is missing.
  Secure context (HTTPS) required, same as the microphone.
- **TTS has no file output.** `speechSynthesis` only speaks (`speak/cancel/pause/resume/getVoices`); it cannot
  produce an mp3. So the Phase 4 Commute Podcast (mp3 concatenation + offline cache) needs another free engine:
  Piper TTS on the server (voices `thorsten`/`kerstin`, CC0, §11). In-app read-aloud uses `speechSynthesis`.
- **Ollama hardware.** 8 GB RAM for 7B models (Ollama README v0.5.0); plus LanguageTool (1 GB heap). A small
  VPS may not fit both; running the server on Zee's laptop and reaching it over HTTPS is the free option.

Sources: https://webaudio.github.io/web-speech-api/ · https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition ·
https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API ·
https://github.com/mdn/browser-compat-data (api/SpeechRecognition.json) ·
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionAlternative/confidence ·
https://github.com/ollama/ollama/blob/main/docs/api.md

## 10. Data model

SQLite (single user), SQLAlchemy 2.x + Alembic migrations. All timestamps UTC, display Europe/Berlin.

| Table | Key fields |
|---|---|
| `profile` | id=1, name, level_band, explanation_lang, settings_json, gate_override |
| `life_fact` | id, category (work/routine/event/person_role/interest), text, valid_from, valid_to |
| `item` | id, kind (word/chunk/pattern/sentence), de, en, gender, plural, pos, lemma, tags[], cefr, freq_rank, source, status (ok/needs_review), wrong (fix_sentence prompt, deck `ghalti`), known_from_placement |
| `card` | id, item_id, card_type (recog/produce/cloze/audio/gender/plural/verbforms/fix_sentence), FSRS state (due, stability, difficulty, state, reps, lapses, last_review) |
| `review_log` | id, card_id, ts, rating, answer_given, auto_graded, elapsed_ms |
| `pattern` | id, code (e.g. VE_WEIL), title, rule_en, slot_diagram, examples_json, order, group, common_error, tags[], drills_json, homework, status, known_from_placement, rounds, best_pct, done_at |
| `lesson` (Sabaq) | id, date, type (pattern/chunks/reading), pattern_id?, scenario, items[], status |
| `session` | id, kind (manzil/sabqi/sabaq/bolna/homework/feed/test/free), started, ended, active_s |
| `attempt` | id, session_id, task_ref, input, correct, error_tags[], score |
| `mistake` (Ghalti) | id, ts, last_ts, source, orig, fix, tag, note, count, card_id? |
| `homework` | id, kind (homework/tagebuch/placement), assigned, due, pattern_id?, prompt, submission, grade_json, status (open/graded/lt_only), submitted_at |
| `recitation_progress` | code, stage (highest passed, -1 none), last_passed, passes |
| `placement_result` | id, ts, answers, by_band, writing_homework_id, level_band, items_marked |
| `text` | id, title, body_de, level, topic, known_density, source_url, licence, audio_asset_id? |
| `audio_asset` | id, path, kind (tts/user/external), text_ref, voice, duration_s |
| `voice_session` / `voice_turn` | session meta; turn: user_transcript, reply_de, pron_json, audio refs (grading lives in the session review) |
| `test` / `test_result` | type (weekly/monthly/mock), module scores 0–100, items_json |
| `milestone` | code, title, achieved_at, evidence_ref |
| `day_log` | date, study_day bool, freeze_used bool, minutes |
| `report_card` | week, json, pdf_path |
| `cost_ledger` | ts, vendor, model, units, unit_type, eur |

**Error tags (enum `ErrorTag`):** `V2_POSITION`, `VERB_FINAL`, `SEP_PREFIX`, `AUX_HABEN_SEIN`, `PARTIZIP`, `TENSE_CHOICE`, `CASE_AKK`, `CASE_DAT`, `PREP_CASE`, `GENDER`, `ADJ_ENDING`, `PLURAL`, `CONNECTOR_CHOICE`, `MIDDLE_FIELD_ORDER`, `WORD_CHOICE`, `FALSE_FRIEND`, `REGISTER_DU_SIE`, `SPELLING`, `UMLAUT`, `CAPITALISATION`, `PRONUNCIATION`, `OTHER`.

## 12. Privacy, security, cost control

**Security (the app is on the internet and has your voice + diary):**
- Single user, password login (argon2 hash) + httpOnly secure session cookie; login rate limit; optional passkey later.
- All API keys only on the server (`.env`, never in the frontend bundle, never committed). `.env.example` committed with blank values. Since the free-resources decision no paid keys are needed; the rule stays for any key added later.
- HTTPS is mandatory: browsers only allow microphone access in a secure context (localhost is exempt for development).
- Nightly SQLite backup (`sqlite3 .backup`) to a second location; `/api/export` gives a full JSON export.

**Privacy:**
- User audio is deleted after STT + scoring by default (keep transcripts). Setting to keep audio for 7 days for "listen to yourself" review.
- Don't use any vendor free tier that trains on your data for voice or diary content (Gemini free tier states data is used to improve products).
- Before going live, check the data handling of the browser speech service on Zee's phone (Google for Chrome, Apple for Safari) and note it in `docs/vendors.md`. Not verified in this spec. Ollama and LanguageTool run on Zee's own machine/server: no third party sees writing or diary text.
- **Work confidentiality:** the app warns on the Life-facts page and in the journal: no client names, internal system names, order data or anything from the bank that is not public. The tutor prompt also enforces this. You work in a regulated environment; keep the app 100 % personal and off work devices/networks.

**Cost control:**
- Every external call writes to `cost_ledger` with computed € (prices in `config/prices.yaml`, editable).
- Budgets in Settings stay (daily soft cap, monthly hard cap, default €10) in case a paid service is added later; with Ollama + Web Speech every ledger row is €0.00.
- Expected API cost: €0/month. Real costs left: electricity/hardware for Ollama and the server (hosting, domain). The ledger still counts tokens per role, which shows load.

## 15. Out of scope for v1

Native iOS/Android apps (PWA only) · multiple users, friends, leaderboards · points shop/gems/leagues · Google Calendar/Outlook sync (manual life events instead) · realtime speech-to-speech (Phase 7) · handwriting OCR (Phase 7) · Austrian/Swiss variants · any integration with work systems or work accounts.

## 16. Open decisions and remaining uncertainty

| Item | Status | What to do |
|---|---|---|
| Vendor prices and model names | No paid vendors after 2026-10-21 | Re-check only if a paid service is added back |
| Pronunciation scoring | Azure dropped (free-resources decision); Web Speech has no pronunciation score | Shadowing scores by word match against the reference text; fluency score does not exist, so nothing to hide |
| Tagesschau terms (private use, 60 req/h) | From the documented terms quoted in the bundesAPI docs; the official page blocked my direct check | Read https://www.tagesschau.de/infoservices/rssfeeds yourself before enabling the poller |
| Local model quality for German grading | Not tested (model downloads blocked in the build container) | Phase 2 follow-up: run `RUN_OLLAMA=1 uv run pytest tests/test_grader_llm.py` on Zee's machine with 2–3 models; keep the one that finds all expected tags |
| STT quality for accented German | Not tested | Phase 3: record 10 test sentences, compare Web Speech (Chrome, Safari) vs self-hosted Whisper word error rate; pick the better one |
| Whether STT "cleans up" stammers or mis-transcribes blocks | Unknown | Phase 3 test with your real speech; if transcripts insert junk, add a cleanup step before grading |
| Browser speech service data handling | Not verified here; MDN confirms audio goes to a server by default | Check before Phase 3 voice use; document in `docs/vendors.md`; prefer Whisper if unclear |
| Hosting | Choice open (see §8) | Pick in Phase 1; must give HTTPS + persistent disk for SQLite |
| LLM-generated German accuracy | Known risk | LanguageTool check + `needs_review` + your spot checks; for grammar pattern cards, cross-check against a grammar reference |
| Evidence strength | Several design choices rest on MOD/WEAK evidence (shadowing, microlearning, streaks) | Treat as experiments; the progress data will show what works for you after 4 weeks |
| B1 timeline | Depends on real weekly hours | Trust the app's forecast, not this spec |
