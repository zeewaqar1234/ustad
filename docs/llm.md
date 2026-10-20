# LLM tutor design

_Split from SPEC.md sections §9. SPEC.md stays the source of truth; edit both if a rule changes._

## 9. LLM tutor design

**Roles (one module `app/llm/` with a provider interface so models can be swapped):**

| Role | Model (default) | Used for | Output |
|---|---|---|---|
| Tutor | `claude-haiku-5-5` | voice turns, quick hints, feed card generation | JSON |
| Grader | `claude-sonnet-5-5` | writing correction, test marking, end-of-session voice review, weekly remarks | JSON |
| Author | `claude-sonnet-5-5` | graded texts, Sabaq content, scenario cards, seed decks | JSON, stored in DB |

Rules:
- **All LLM output is structured JSON validated with Pydantic.** On validation failure: one retry with the error message, then a graceful fallback. No free-text parsing.
- **Generate ahead, don't generate live.** Author content (texts, Sabaq, scenarios, feed cards) is generated in a nightly batch job for the next 2 days and stored. Live calls only for Tutor and Grader. This cuts cost and latency and lets bad content be caught.
- **Prompt caching** on the static parts (system prompt + learner profile + pattern list): put them first, mark with `cache_control`. Note the minimum cacheable prompt length (512 tokens on 5.x models per Anthropic docs).
- **German quality guard:** every generated German text runs through LanguageTool (§11) before storing. Items with flagged issues are marked `needs_review`; Zee can approve/fix in an admin view. LLM German is good but not perfect, and wrong German drilled with SRS is worse than none.
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
