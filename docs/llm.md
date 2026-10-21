# LLM tutor design

_Split from SPEC.md sections §9. SPEC.md stays the source of truth; edit both if a rule changes._

## 9. LLM tutor design

**Decision 2026-10-21 (Zee): 100 % free resources.** All three roles run on a local **Ollama** server
(`http://localhost:11434`, `POST /api/chat`). No paid LLM API. Claude models are no longer used by the app.

**Roles (one module `app/llm/` with a provider interface so models can be swapped):**

| Role | Model (default, `OLLAMA_MODEL`) | Used for | Output |
|---|---|---|---|
| Tutor | `llama3.1:8b` via Ollama | voice turns, quick hints, feed card generation | JSON |
| Grader | `llama3.1:8b` via Ollama | writing correction, test marking, end-of-session voice review, weekly remarks | JSON |
| Author | `llama3.1:8b` via Ollama (nightly batch, no latency limit) | graded texts, Sabaq content, scenario cards, seed decks | JSON, stored in DB |

One model for all roles by default; each role can point at a different local model later (e.g. a bigger one
for the nightly Author job). Model choice is not final: compare 2–3 local models on the 5 grader fixture
sentences (`tests/fixtures/grader/`) with `RUN_OLLAMA=1` and keep the one that finds the expected tags.

Rules:
- **All LLM output is structured JSON validated with Pydantic.** The Pydantic schema is sent as Ollama's
  `format` (JSON-schema structured outputs, Ollama ≥ 0.5.0), `stream: false`, `temperature: 0`.
  On validation failure: one retry with the error message, then a graceful fallback. No free-text parsing.
- **Graceful fallback when Ollama is down or the model fails twice:** writing is still checked by
  LanguageTool and shown as a red-pen view marked "LanguageTool only"; Zee can re-grade later.
  SRS, drills and recitation never need the LLM.
- **Generate ahead, don't generate live.** Author content (texts, Sabaq, scenarios, feed cards) is generated
  in a nightly batch job for the next 2 days and stored. Live calls only for Tutor and Grader. On a local model
  this is about latency and catching bad content, not money.
- **Static prompt parts first** (system prompt + learner profile + pattern list), so the request prefix is
  identical between calls. Keep the model loaded with Ollama's `keep_alive` (default 5 min) so a turn does not
  pay the model load time. (Anthropic `cache_control` no longer applies.)
- **Cost ledger:** every Ollama call still writes a `cost_ledger` row (vendor `ollama`, tokens =
  `prompt_eval_count + eval_count`, eur 0.00), so usage is visible and the CLAUDE.md rule holds.
- **Hardware:** Ollama's README (v0.5.0) states at least 8 GB RAM for 7B models, 16 GB for 13B. `llama3.1:8b`
  is a 4.7 GB download. It runs on Zee's laptop or on a server with enough RAM; a small VPS will be slow.
  The phone talks only to the FastAPI server, never to Ollama directly.
- **German quality guard:** every generated German text runs through LanguageTool (§11) before storing. Items with flagged issues are marked `needs_review`; Zee can approve/fix in an admin view. LLM German is good but not perfect (a local 8B model is weaker than the hosted models this spec first planned), and wrong German drilled with SRS is worse than none.
- **Level control:** the Author gets the list of Zee's known lemmas (top N by frequency) and must keep new words ≤ 5 %; the app measures actual known-word density after generation and regenerates once if outside 93–99 %.
- **Explanation language:** English by default; optional Roman Urdu for grammar explanations (Settings). German for everything else.

**Tutor system prompt (starting draft, store in `app/llm/prompts/tutor.md`):**

```
You are "Ustad", a strict but fair German teacher for one learner, Zee. Learner profile and current
level are below. Your job: make him speak and write correct, natural German for his real life and work.

Conversation rules:
- Speak German at his level (see known-word list). Short turns: max 2 sentences, then a question.
- Never interrupt, never finish his sentences, never comment on pauses, speed, repetitions or
  hesitation. Treat speech content only. He stammers; time pressure is forbidden.
- Ignore disfluencies in the transcript (repeated sounds/words, fillers) when judging his German.
- Correction policy: at most ONE in-conversation correction per turn, as a PROMPT not a recast
  (e.g. "Achtung: Verb nach 'weil'?"). Let him retry. Save other errors for the end-of-session review.
- If he says "Englisch bitte" or is stuck twice, explain briefly in English, then return to German.
- Use his life context (job role, routine, upcoming events) to make topics real. Never ask for or
  repeat confidential work details (client names, internal systems, trade data). If he mentions any,
  steer to a generic version.
- No praise inflation. Acknowledge correct use specifically ("weil + Verb am Ende: richtig").
- Output JSON: {reply_de, reply_en_gloss, prompt_correction|null, errors:[{orig, fix, tag, note}],
  new_chunks:[...], turn_goal_met: bool}
```

**Grader output schema (writing):**
```
{ "score_10": int, "corrected_text": str,
  "errors": [{ "span": str, "fix": str, "tag": ErrorTag, "reason_en": str, "severity": 1|2|3 }],
  "teaching_points": [str]  // max 3
  "model_sentence_for_srs": [str] }
```

Implementation (Phase 2): `app/llm/provider.py` (`OllamaProvider`, `complete_json`, `LLMUnavailable`,
`LLMInvalid`), schemas in `app/llm/schemas.py`, prompts in `app/llm/prompts/`. Grader pipeline in
`app/services/grading.py`: LanguageTool pre-check → Ollama Grader → span check → LanguageTool check of the
corrected text (flags → `needs_review`).

Sources: Ollama API https://github.com/ollama/ollama/blob/main/docs/api.md · structured outputs release
https://github.com/ollama/ollama/releases/tag/v0.5.0 · RAM guidance https://github.com/ollama/ollama/blob/v0.5.0/README.md
