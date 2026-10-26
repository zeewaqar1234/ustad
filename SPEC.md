# USTAD: personal German coach (build spec for Claude Code)

Version 1.0 · 20 Oct 2026 · Owner: Zee (single user)

---

## 0. How to use this file (read first, Zee)

1. Make an empty folder `ustad/`, run `git init`, put this file in it as `SPEC.md`.
2. Start Claude Code in that folder and paste exactly:

   > Read SPEC.md fully. Do Phase 0 only (section 13). Stop when Phase 0's acceptance checks pass and show me the evidence.

3. After each phase: run `/clear`, then: `Read CLAUDE.md and docs/PROGRESS.md, then do Phase N.` One phase per session. This keeps context small and cheap; the spec is long on purpose so Claude Code never has to guess, but it should not sit in context every session (Phase 0 splits it into small `docs/` files).
4. Use plan mode (Shift+Tab) at the start of Phases 3 and 5 (voice + LLM wiring), skip it for the rest.
5. If Claude Code goes wrong twice on the same thing: `/clear` and re-prompt with what you learned. Do not argue with it in a long session.

**Hard rule for you (candid-friend clause):** you have a pattern of building great tools and then the tool becomes the hobby. Phase 1 must be usable on your phone within the first weekend, and from then on **no new phase starts unless the app's own dashboard shows ≥ 5 study days in the previous 7.** The app enforces this (see 6.6). The goal is German, not a GitHub repo.

---

## 1. Mission and success metrics

**Mission:** get Zee from "B1-ish vocabulary, shaky grammar, avoids speaking" to **speaking naturally in daily and work life**, with **Goethe-Zertifikat B1** as the first formal milestone, then B2.

**North-star metric:** minutes of *active* German per day (retrieval, writing, speaking), not minutes in app.

| Metric | Target by week 12 |
|---|---|
| Study days | ≥ 6 of 7 per week |
| Daily active time | 20–30 min weekdays, 40 min one weekend day |
| SRS items mature (interval ≥ 21 days) | 1,200 |
| Speaking minutes / week | ≥ 60 |
| Error rate on verb position (V2 / verb-final) in writing | < 10 % |
| Mock B1 (all 4 modules) | ≥ 60/100 each (official pass mark per module, confirmed in the Goethe B1 Durchführungsbestimmungen, §17) |

---

## 2. The learner (this becomes `docs/learner_profile.md` and is fed to every LLM call)

Keep this file editable from the app's Settings page. The tutor reads it every time.

- **Name:** Zee. Pakistani, lives in Rüsselsheim, commutes by train to Frankfurt.
- **Languages:** Urdu, English (IELTS 7.5). German: roughly B1 *passive* vocabulary; weak on tenses (Perfekt vs Präteritum), sentence types and **conjunctions / verb position** (weil, dass, obwohl → verb to the end; deshalb, trotzdem → verb second). This is the #1 grammar gap.
- **Work (generic only, nothing confidential):** working student at a German bank on an equities/commission-trading desk; retail crypto monitoring; on-call weeks; Sparkassen as clients; exchange trading (Xetra, Börse Stuttgart). Colleagues speak German among themselves. Wants to talk in the morning meeting, the Kantine, on the phone, and write short German emails/chat messages.
- **Study:** MSc at Goethe University Frankfurt (economics/business), exams and a thesis running in parallel. CFA Level 1 in Feb 2027. Time is scarce: design for 20–30 min/day, split into 3–10 min chunks.
- **Interests for content:** finance and markets, crypto/stablecoins/MiCA, geopolitics and international relations, European history (Napoleon, 1848, German unification), Pakistan.
- **How he learns best:**
  - Reading first. Text before audio. Every audio item must have a transcript.
  - Core concepts distilled and logically connected, not encyclopedic text. Show the pattern, then drill it.
  - Grew up in the Pakistani school system: memorise, recite, practise, get tested, get a report card. Responds to structure, deadlines, a teacher who checks homework.
  - Gets bored fast, doom-scrolls, needs visible milestones and quick wins.
  - Prefers writing over phone calls.
- **Speaking constraint (important):** Zee stammers. The speaking features must never add time pressure: no auto-cutoff, no interrupting, no finishing his sentence, no penalty for repetitions/blocks/pauses. Fluency scores from any pronunciation API are hidden by default (see 5.4). He prefers not to talk while wearing headphones: speaking runs through phone/laptop speaker + mic; listening on headphones is fine.
- **Style of feedback he wants:** direct, specific, no fluff, no AI-sounding praise. Like a strict but fair Ustad.

---

## 3. Pedagogy: what the app is built on

Each principle has a design rule. Evidence strength in brackets: STRONG = meta-analysis / well replicated, MOD = solid but limited, WEAK = small or company-reported, CONTESTED = researchers disagree. Sources in §17.

| # | Principle | Evidence | Design rule |
|---|---|---|---|
| P1 | **Test, don't reread.** Retrieval beats restudy for long-term recall. Roediger & Karpicke 2006: 61 % vs 40 % recall after one week. | STRONG | Every screen asks before it tells. Answer is hidden until Zee attempts. No "read the lesson again" button; there is "test me again". |
| P2 | **Spacing.** Optimal gap between reviews grows with how long you need to remember (Cepeda et al. 2006). | STRONG | FSRS scheduler (`fsrs` on PyPI v6.x or `ts-fsrs` v5.x, both MIT), desired retention **0.90** (library and Anki default; workload explodes above that). Do not hand-roll SM-2. |
| P3 | **Rote + understanding is not a contradiction.** The "paradox of the Asian learner": memorising and understanding work together (Watkins & Biggs 1996; Marton et al.; Kember 1996). Pure recitation without varied context does not transfer (Hifz studies show no general memory boost). | MOD / CONTESTED | Keep the Pakistani-school repetition habit (recite, copy, dictation, tests) **but** every repetition of a chunk appears in a *new sentence* or context after day 1. Recitation is always followed by a use task. |
| P4 | **No cramming loops.** Overlearning helps at one week then fades fast (Rohrer et al. 2005). | MOD | Max 3 consecutive repetitions of the same card in a session; after that it goes back to the scheduler. |
| P5 | **Interleave confusables, block new vocab.** Interleaving overall g≈0.42 but for word learning blocking did better (Brunmair & Richter 2019). | CONTESTED for vocab | New chunk sets are learned in a block. Revision of confusables (der/die/das, Akk/Dat, weil vs denn vs deshalb) is interleaved. |
| P6 | **Prompts beat recasts.** Recasts (just restating correctly) rarely make learners self-correct; prompts (elicitation, metalinguistic clue) do (Lyster & Ranta 1997; Li 2010 meta-analysis: medium, lasting effect). | MOD–STRONG | Tutor correction is 2-step: first a **prompt** ("Check the verb position after *weil*"), Zee retries; only then the corrected sentence. In voice mode (changed 2026-10-26): no correction during the conversation at all; every error goes to the end-of-session review so conversation flow isn't broken and a local model replies fast. The prompt step happens there: the review shows the error first, then the corrected line to shadow. |
| P7 | **Output forces noticing** (Swain). | MOD | Every Sabaq ends with production (write or say), never only recognition. |
| P8 | **Comprehensible input** (Krashen): useful for reading/listening volume, but not enough alone; explicit grammar instruction helps. | CONTESTED | Graded texts at ~95–98 % known words (English-based coverage figures; German compounding makes them approximate) **plus** explicit grammar patterns. |
| P9 | **Chunks first.** Formulaic sequences are processed faster by learners and natives (Conklin & Schmitt 2008). | MOD | Unit of learning = chunk (§5.1). |
| P10 | **Shadowing.** Some listening gains, weak designs (Hamada 2014). | WEAK | Include as a mode, but don't build the curriculum around it. |
| P11 | **Short sessions** are justified by spacing research, not by "short attention spans". The "8-second attention span" is a myth with no underlying study. Heavy short-form video use *correlates* with worse attention (meta-analysis, r≈−0.38), causation not shown. | MOD | 3–10 min blocks with **hard stops**. The scroll feed (§5.10) is finite. |
| P12 | **Hours reality check.** Goethe-Institut estimates B1 = 260–490 hours of instruction from zero; B2 = 450–600. Zee starts with B1-ish vocabulary, so the remaining gap is mostly grammar automation + speaking hours. | Official estimate | My estimate (reasoning, not a source): at ~3.5 h/week, B1 exam readiness is plausible in ~4–6 months; the app's forecast must use his actual hours, not optimism. |

---

## 4. The daily loop: Sabaq, Sabqi, Manzil

Borrowed from the classic South Asian memorisation structure (new lesson / recent revision / old revision), mapped onto spaced repetition. One "Daily Sabaq" is ~25 min and can be split across the day.

| Block | Urdu name in UI | What | Time |
|---|---|---|---|
| 1 | **Manzil** (old revision) | Due SRS reviews (FSRS), oldest due first, capped at 60 cards; if more are due, the cap rolls over | 6–8 min |
| 2 | **Sabqi** (recent revision) | Re-drill everything from the last 7 days' lessons + yesterday's mistakes from the Ghalti Register | 4–5 min |
| 3 | **Sabaq** (new lesson) | One new micro-lesson: 1 grammar pattern OR 1 chunk set (8–12 items) OR 1 reading text, always tied to a life/work scenario | 6–8 min |
| 4 | **Bolna** (speaking) | 3–5 min voice task on today's Sabaq (shadowing, recitation, or roleplay) | 3–5 min |
| 5 | **Homework** | One written task due by midnight, auto-checked, red-pen feedback | 3–5 min |

Rules:
- Order is fixed: revision before new material (old first). New Sabaq is **locked** until Manzil is done. This is the "no new lesson until yesterday's is recited" rule.
- Each block is independently completable so the loop fits into train rides (S-Bahn ≈ 2–3 blocks).
- If a day is missed: next day shows a **Makeup** banner; the cap on Manzil rises to 90 and no new Sabaq unlocks until backlog < 30. No guilt text, just the rule.

---

## 5. Modules

### 5.1 Vocabulary and chunks (SRS core)

- **Unit of learning = chunk, not single word.** e.g. "Ich habe heute Rufbereitschaft", "Kannst du das bitte wiederholen?", "Die Order wurde ausgeführt". Single words exist too, but with gender + plural + one example sentence.
- Card types (each item can spawn several): DE→EN recognition, EN→DE production (typed), cloze in sentence, audio→meaning (listening card), gender drill (der/die/das tap), plural drill, verb forms (Präsens er-form, Präteritum, Partizip II + haben/sein).
- Scheduler: FSRS (see §3, §8). Rating buttons: Again / Hard / Good / Easy, but for typed answers the app auto-grades (exact = Good, minor typo/umlaut = Hard with diff shown, wrong = Again).
- **Gender colours** (grayscale-safe: also use symbols): der = ▲, die = ●, das = ■ prefix on every noun everywhere in the app.
- Seed decks (Phase 1): base vocabulary from Kaikki/Wiktionary + frequency ranks, with B1 coverage checked locally against the Goethe lists (licence handling in §11), a **Work Deck** (banking, trading, IT-ops, meetings, email phrases), a **Life Deck** (Bahn, Bürgeramt, Arzt, Wohnung, Supermarkt, Kantine), and a **Connector Deck** (all subordinating/coordinating conjunctions and adverbs with verb-position tags).
- "Add from anywhere": any word tapped in any reading/listening text → add to deck with context sentence auto-attached.

### 5.2 Grammar: patterns, recitation, drills

Grammar is taught as **~40 patterns**, each a 1-screen card: rule in one line, slot diagram, 3 examples (one work, one life, one finance/history), common error, then drills. Priority order for Zee:

1. V2 rule + Satzklammer (position 2 verb, final position participle/infinitive/prefix)
2. Connectors by verb effect: Group 0 (und, aber, oder, denn, sondern: no change), Group V2 (deshalb, trotzdem, dann, außerdem: inversion), Group VE (weil, dass, obwohl, wenn, als, ob, damit: verb end)
3. Perfekt with haben/sein; Partizip II forms; when spoken German uses Präteritum (sein, haben, Modalverben, wissen, es gab)
4. Modal verbs + infinitive at end
5. Cases in the sentence: Nom/Akk/Dat with articles + pronouns; Wechselpräpositionen
6. Separable verbs; reflexive verbs
7. Relative clauses; indirect questions
8. Konjunktiv II for politeness (hätte gern, könnten Sie, würde)
9. Passive (Vorgangspassiv) for work/process language
10. Futur I vs Präsens for future

**Recitation ("Pahara") mode:** like reciting multiplication tables. The app shows a conjugation/declension table, Zee reads it aloud (or types it) row by row; next day the table is shown with gaps; day 3 blank. Tables included: sein/haben/werden/modals in Präsens + Präteritum, article declension table, personal pronouns by case, connector groups. Recitation is checked by speech-to-text (lenient: content only, never speed).

**Drill types:**
- Sentence surgery: given words in random order → build the sentence (drag on phone, type on laptop)
- Transform: "Ich bin müde. Ich gehe nach Hause." → join with *weil* / *deshalb* / *obwohl*
- Tense shift: Präsens → Perfekt
- Error spotting: find and fix the one error
- Fill-the-ending: articles/adjective endings
- Free production: "Write one sentence about your on-call week using *obwohl*."

### 5.3 Reading

- **Graded texts generated by the LLM** at Zee's current level (i+1: ≥ 95 % known words, measured against his SRS known-word set, see §3), 120–250 words, topics rotated from interests: markets news, a crypto explainer, a German-history anecdote, a Pakistani-German comparison, a short story serial (one recurring character, e.g. a Pakistani trainee in Frankfurt, episodes continue across weeks to create a narrative hook like a drama serial).
- **Real texts** from licensed/linkable sources (§11), opened in the app's reader when the licence allows, otherwise linked out with a companion vocab list.
- Reader features: tap word → gloss + gender + add to SRS; long-press sentence → translation; "unknown word density" meter; 3 comprehension questions (Goethe B1 Lesen style: richtig/falsch, multiple choice, matching).
- Interlinear toggle for hard texts (EN under DE, off by default).

### 5.4 Speaking: the voice tutor ("Ustad voice")

> **Superseded in part on 2026-10-21 (free-resources decision, docs/architecture.md §8):** STT = browser `SpeechRecognition`, TTS = browser `speechSynthesis`, Tutor = local Ollama. No Azure pronunciation assessment: Shadowing scores by word match. The vendor and cost tables below are kept as history only. The stammer rules are unchanged and still apply in full.

**Architecture decision: turn-based pipeline, not a realtime speech-to-speech model.**

Why: Zee needs zero time pressure, so ~1–2 s latency per turn is a feature, not a bug. A pipeline gives full control over turn-taking, transcripts, corrections and cost; realtime models re-send the whole conversation on each response and cost several times more.

```
[Browser]  hold-to-talk (or tap-start / tap-stop) → MediaRecorder (webm/opus)
     │ POST /api/voice/turn (audio blob)
     ▼
[FastAPI]  1. STT  (OpenAI gpt-4o-mini-transcribe, language="de")
           2. Pronunciation (Azure Speech, de-DE, scripted mode, only for shadowing/recitation
              turns where a reference text exists)
           3. Tutor LLM (Claude Haiku 5.5; Sonnet 5.5 for end-of-session review)
           4. TTS (Azure Neural de-DE voice) → mp3
     │ JSON {transcript, reply_text, reply_audio_url, corrections[], scores{}}
     ▼
[Browser]  plays reply through speaker, shows transcript + reply text
```

Vendor notes (verified 20 Oct 2026, prices change, re-check before coding):

| Piece | Choice | Price / limit | Notes |
|---|---|---|---|
| STT | OpenAI `gpt-4o-mini-transcribe` | ~$0.003/min | fallback `gpt-transcribe` ($0.0045/min) if quality is weak |
| Tutor LLM | Claude `claude-haiku-5-5` | $0.10 / $0.50 per M tokens (prompts ≤ 100K) | use prompt caching for the static system prompt + learner profile |
| Review/grading LLM | Claude `claude-sonnet-5-5` | $2 / $10 per M tokens | writing correction, weekly remarks, test generation |
| TTS | Azure AI Speech neural, de-DE (e.g. Katja / Conrad / Seraphina) | free tier 0.5M chars/month, then ~$15 per 1M chars | one male + one female voice for roleplays |
| Pronunciation | Azure pronunciation assessment, de-DE | billed as STT, ~$1/audio hour; free tier includes 5 STT hours/month | German gets accuracy (phoneme/word/text), fluency, completeness, PronScore, miscues. **Prosody is en-US only.** Phoneme *names* not available for German, only scores. |

**Estimated running cost:** at 25 min speaking/day for 30 days: STT ≈ $1.13 + Haiku ≈ $0.60 + TTS ≈ $0 (inside free tier) + pronunciation ≈ $0–1.25 ⇒ **about $2–3/month** (subagent estimate with stated assumptions; treat as order of magnitude). The app must show actual spend (§12).

Rejected for v1 (keep as later option behind an interface `VoiceEngine`):
- OpenAI Realtime (`gpt-realtime-2.1-mini`: $10/M audio in, $20/M audio out): ≈ $12/month estimated, could be much higher if context caching misses. Supports push-to-talk (`turn_detection: null`, then `input_audio_buffer.commit` + `response.create`) and `semantic_vad` with `eagerness: "low"`. Good for a later "natural conversation" mode.
- Gemini Live: cheap per minute but WebSocket-only, ephemeral tokens still Preview, sessions end at ~10–15 min, and the free tier uses data to improve products. Do not send voice recordings to a free tier.
- Browser Web Speech API for STT: not a cross-browser standard, no control over end-of-speech, Chrome sends audio to a server anyway. Use only as an offline-less fallback for the scroll feed's tiny audio answers if at all.
- Speechace (no German). SpeechSuper supports German but has a $20/month minimum.

**Modes:**
1. **Shadowing / Chorus (Takrar):** app plays a sentence (TTS), shows text, Zee repeats. Pronunciation scored per word (accuracy only by default). Sentences come from today's Sabaq.
2. **Recitation (Pahara):** see 5.2, by voice.
3. **Scenario roleplay:** tutor plays a role, Zee plays himself. Scenario cards with goal + 5 useful chunks shown before starting. Library v1:
   - Kantine small talk with a colleague (weekend, weather, Bahn delays)
   - Morning desk meeting: say what you worked on yesterday and today
   - Phone: a Sparkasse employee asks about the status of an order (generic, no real data)
   - Explaining a system incident from your on-call week
   - Asking your manager for more responsibility
   - Doctor appointment by phone; Bürgeramt appointment; landlord about a repair
   - Deutsche Bahn: missed connection, ask for alternatives
   - Goethe B1 Sprechen Teil 1 / 2 / 3 simulation (see §5.8)
4. **Free talk (Gupshup):** open conversation about Zee's day; tutor asks follow-ups, uses his life context.
5. **"Say it better" replay:** after any session, the app shows the transcript with Zee's sentences on the left and a corrected, more natural version on the right; tap to shadow the corrected version. Mistakes go to the Ghalti Register.

**Stammer-safe rules (non-negotiable, put in CLAUDE.md):**
- Default turn-taking = **push-to-talk / tap-to-finish**. Zee decides when his turn ends. Optional hands-free mode with a long silence threshold (≥ 2.5 s, configurable).
- The tutor never interrupts, never completes his sentence, never comments on hesitation, repetition or pace.
- Pronunciation API **fluency/prosody scores are not shown and not used in grading** unless Zee turns them on in Settings. Only accuracy (did the sounds land) and grammar/vocabulary matter.
- No timers on speaking tasks. Ever.
- In the corrected transcript, remove disfluencies (repeated sounds, fillers) before showing it, so feedback is about German, not about the stammer.
- Speaking is always available in **text fallback** (type the answer), and the tutor treats typed and spoken answers equally for streaks.

### 5.5 Listening (reading-first)

- Every listening item: **read the transcript first (optional), then listen, then answer.** Speed 0.75×/1×, sentence-by-sentence replay, transcript toggle.
- **Diktat (Imla):** hear one sentence, type it; diff highlights errors (umlauts, endings, capitals). This trains listening + spelling + grammar endings at once. Daily 5 sentences.
- Sources: TTS-generated audio from the app's own texts (always available, unlimited), plus real audio from licensed sources (§11), and YouTube embeds via the official player with the app's own questions and vocab list.
- **Commute mode:** a 10–20 min auto-generated "Podcast" episode: today's Sabaq sentences + yesterday's mistakes, read slowly with pauses for Zee to answer in his head, then the answer. Downloadable for offline (PWA cache).

### 5.6 Writing and homework (Kaam / Copy checking)

- **Daily homework:** 3–6 sentences, tied to the Sabaq pattern and Zee's real day ("Write 4 sentences about yesterday using Perfekt; one must use *weil*").
- **Tagebuch (journal):** optional free daily entry; corrected the same way.
- **Work writing:** short German emails / chat messages from templates (meeting request, status update, absence note, asking a colleague for help).
- **Red-pen correction format** (LLM, structured JSON → rendered):
  - original with errors underlined, corrected version, one-line reason per error, error tag from the taxonomy (§10), and a grade out of 10.
  - Max 3 "teaching points" per correction (do not drown him).
  - Each error → Ghalti Register → becomes an SRS card ("fix this sentence").
- Grammar pre-check with the self-hosted LanguageTool (§11) before LLM grading to cut tokens and catch spelling.

### 5.7 Ghalti Register (mistake notebook)

Every mistake from any module lands here with: original, correction, tag, source, date, times repeated. Views: by tag (heat map), top 10 recurring. Recurring errors (≥ 3 times) become **priority drills** in Sabqi. This is the single most important table in the app.

### 5.8 Tests, exams, report cards

- **Weekly test (Friday):** 15 min, mixed, covers the week's Sabaq + Ghalti top-10. Marked out of 50. Shown as "Weekly Test", not "quiz".
- **Monthly exam:** 45 min, all four skills, harder; result determines whether the next "class" (level band) unlocks.
- **Board exam = Goethe B1 mock:** mirrors the real exam: Lesen 65 min, Hören ~40 min, Schreiben 60 min, Sprechen ~15 min in pairs (10 min individually; the voice tutor plays the partner), each module 100 points, pass at 60. Modules can be taken separately in the real exam, so the mock reports them separately too. Unlocks when monthly exam ≥ 70 %. Sprechen part done with the voice tutor in examiner mode.
- **Report Card (Result Card):** weekly, printable A4, **grayscale only**. Contents: attendance (days studied), marks per skill, words learned/mature, speaking minutes, top 3 recurring errors, "Ustad's remarks" (3 lines, specific, honest, e.g. "Verb-final after *weil* still weak: 7 errors this week. Akkusativ improved."), next week's target. Export as PDF.

### 5.9 Life-context engine ("knows about me")

- **Profile + life facts** stored in DB (editable list): job, desk, routine, people *by role only* (manager, colleague, landlord), upcoming events Zee enters ("Thursday: on-call starts", "Monday: exam"). The tutor uses these to generate today's Sabaq scenario, reading topics and roleplays.
- **Morning check-in (30 s):** "What's on today?" (pick chips or type 1 line, in German if possible). App generates 3 phrases he will likely need today.
- **Evening check-out (2 min):** "Write/say 3 sentences about your day." This is the homework when no other homework is set.
- **Privacy rule:** never enter client names, internal system details, trade data or anything confidential from work. The app shows a one-line warning on the life-facts page and the LLM system prompt instructs the tutor not to ask for such details.

### 5.10 Scroll feed (doom-scroll replacement)

- Vertical, full-screen, swipe-up feed like Reels/Shorts. Every card is a 5–15 s retrieval task: one SRS card, a "which connector?" choice, a gender tap, a 1-line cloze, a 6-second audio clip with "what did you hear?", a meme-style example sentence with a blank.
- Infinite feel, but **finite in reality:** a soft stop after 40 cards ("Done for now. 40 cards, 34 correct."). Variable but honest rewards: occasional "combo" streak animation, new-word reveal, a funny/curious German fact.
- The PWA home-screen icon opens straight into the feed if the daily loop is done, and into the daily loop if not.
- Use case: replace Instagram/YouTube Shorts on the train. Put the app icon where the doom-scroll app currently sits.

---

## 6. Engagement and milestones (motivation design)

Evidence base: self-determination theory (autonomy, competence, relatedness; Ryan & Deci 2000); expected tangible rewards undermine intrinsic motivation while informational positive feedback raises it (Deci, Koestner & Ryan 1999, STRONG); gamification has a real but modest effect on learning, mostly cognitive (Sailer & Homner 2020); goal-gradient effect, people speed up near a goal and a partly pre-filled card helps (Kivetz et al. 2006); implementation intentions "if X then Y" have d≈0.65 (Gollwitzer & Sheeran 2006, STRONG); habit automaticity took 18–254 days and **missing one day did not materially hurt** (Lally et al. 2010); Duolingo reports streak features improve retention (company-reported, WEAK).

### 6.1 Structure: classes, chapters, milestones
- **Classes** = CEFR bands: "Class A2+", "Class B1.1", "Class B1.2", "Class B1 Board", "Class B2.1"... Each class = ~6 **chapters**, each chapter = 5–7 Sabaq + a chapter test.
- Each class shows a progress bar that **starts partly filled** (credit for what he already knows from the placement test) → goal-gradient.
- **Milestones** are *can-do* statements, not XP totals. Examples: "Told a colleague about your weekend for 2 min without switching to English", "Wrote a German email asking for a meeting", "Passed mock Lesen ≥ 60/100", "500 mature chunks", "First 10-minute free talk". Each milestone unlocks with evidence (a session ID, a test score).
- The **Goethe B1 board exam** is the visible end boss on the home screen with a countdown to a target date Zee sets (suggest: book the real exam once two mock exams pass).

### 6.2 Streak with honesty
- Streak = days with the Daily Sabaq done (Manzil + one more block minimum).
- **2 freezes per week** auto-applied (on-call weeks, exam days). Missing one day is fine (Lally); the app says so.
- A streak counts only active work, never "opened the app".
- Weekly **attendance %** is shown alongside the streak, so one broken streak doesn't feel like zero.

### 6.3 Notifications (PWA web push; ask permission in onboarding)
- Onboarding asks 3 **if-then plans** and turns them into notification schedules: "When I sit down on the train to Frankfurt, I open Ustad." / "When I finish lunch, I do Bolna." / "When I get home, I do homework."
- Max 2 notifications/day. Content is a concrete task, never guilt ("3 Manzil cards + 1 sentence with *obwohl*: 4 min").
- Quiet hours default 22:00–07:30; respect on-call: Zee can mark an on-call week → notifications reduce to 1/day.

### 6.4 Rewards
- Informational feedback over prizes: "You used *weil* correctly 9/10 times this week (last week 4/10)."
- Small, unexpected delight is allowed (rare German proverb, a history anecdote card, a "combo" animation in the feed) but **no points shop, no gems, no leagues**. Tangible expected rewards backfire.
- Personal bests: longest free talk, fastest typed conjugation table, best weekly test.

### 6.5 Accountability (Pakistani-teacher mode)
- **Homework is due.** Missed homework shows on the report card as "Not submitted". It rolls into the next day once, then is replaced.
- **Monthly "Parent-Teacher Meeting":** a 1-page summary Zee can optionally send to one accountability person (friend or tandem partner) as a PDF. Off by default.
- Ustad's tone: strict, fair, specific, short. Never sarcastic, never shaming, never fake praise.
- Weekly target set by Zee on Sunday (minutes, speaking sessions); report card compares target vs actual.

### 6.6 Build-gate (anti-procrastination for the builder)
- The dashboard has a **"Builder gate"** card: study days in last 7. Claude Code must check it (via an API endpoint `/api/stats/gate`) at the start of every phase after Phase 1 and **refuse to start new feature work if < 5/7**, offering bug fixes only. This is written into CLAUDE.md.

---

## 7. Progress tracking and reporting

**Tracked automatically (never self-reported):**

| Measure | How computed |
|---|---|
| Active time | Sum of time with input events, idle > 60 s not counted |
| Study day | Daily Sabaq minimum done |
| Vocab | items seen / learning / mature (FSRS stability ≥ 21 d) / known-from-placement |
| Grammar mastery per pattern | Accuracy of last 20 attempts on that pattern, recency-weighted; states: new / shaky (< 60 %) / ok (60–85 %) / solid (> 85 % and last seen > 14 d ago) |
| Error rates | Errors per 100 words written/spoken, per error tag, per week |
| Speaking | minutes, turns, words per turn, % turns needing a prompt, mean pronunciation accuracy (fluency hidden by default) |
| Listening | Diktat word accuracy, comprehension accuracy |
| Reading | texts read, words read, known-word density of texts chosen |
| Tests | weekly / monthly / mock scores per module (0–100) |
| Cost | € per day/month by vendor (§12) |

**Skill estimate per Goethe module** (Lesen, Hören, Schreiben, Sprechen): the latest mock or monthly exam score, adjusted by the last 14 days of drill accuracy; displayed as a band (e.g. "B1 Lesen: ~55 ± 8"), never a fake precise number.

**Forecast:** "At your last 4 weeks' pace (X h/week), B1 mock pass forecast: <month>." Show the assumption. If pace drops, the date moves. No optimism.

**Views:** Home (today's loop + streak + next milestone), Progress (charts: active minutes/week, mature items, error rate by tag, module bands), Ghalti Register, Report Cards archive.

**Weekly Report Card:** generated Sunday 20:00, grayscale A4 via print CSS (and server-side PDF as option), see §5.8.

---

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
- Correction policy (changed 2026-10-26): NO correction during the conversation. Reply to his meaning
  only. All errors are graded once, in the end-of-session review (Grader role, long timeout).
  (e.g. "Achtung: Verb nach 'weil'?"). Let him retry. Save other errors for the end-of-session review.
- If he says "Englisch bitte" or is stuck twice, explain briefly in English, then return to German.
- Use his life context (job role, routine, upcoming events) to make topics real. Never ask for or
  repeat confidential work details (client names, internal systems, trade data). If he mentions any,
  steer to a generic version.
- No praise inflation. Acknowledge correct use specifically ("weil + Verb am Ende: richtig").
- Output JSON: {reply_de, reply_en_gloss}
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
| `text` | id, title, body_de, sentences (de/en), glossary, questions, level, topic, known_density, for_date, source_url, licence, credit, status, audio_asset_id? |
| `audio_asset` | id, path, kind (tts/podcast/user/external), text_ref, voice, duration_s, meta_json (podcast script) |
| `dictation_item` | date, idx, ref (item/text sentence), de, typed, accuracy, result_json (the day's 5 Diktat sentences) |
| `voice_session` / `voice_turn` | session meta; turn: user_transcript, reply_de, pron_json, audio refs (grading lives in the session review) |
| `test` / `test_result` | type (weekly/monthly/mock), module scores 0–100, items_json |
| `milestone` | code, title, achieved_at, evidence_ref |
| `day_log` | date, study_day bool, freeze_used bool, minutes |
| `report_card` | week, json, pdf_path |
| `cost_ledger` | ts, vendor, model, units, unit_type, eur |

**Error tags (enum `ErrorTag`):** `V2_POSITION`, `VERB_FINAL`, `SEP_PREFIX`, `AUX_HABEN_SEIN`, `PARTIZIP`, `TENSE_CHOICE`, `CASE_AKK`, `CASE_DAT`, `PREP_CASE`, `GENDER`, `ADJ_ENDING`, `PLURAL`, `CONNECTOR_CHOICE`, `MIDDLE_FIELD_ORDER`, `WORD_CHOICE`, `FALSE_FRIEND`, `REGISTER_DU_SIE`, `SPELLING`, `UMLAUT`, `CAPITALISATION`, `PRONUNCIATION`, `OTHER`.

## 11. Content sources and licensing

Checked 20 Oct 2026 against official pages. **Not legal advice.** Baseline assumption: the app is private, single-user, non-commercial and behind a login. German private-copy rules (§53 UrhG) cover private copies by a natural person; once anything becomes publicly reachable, that cover is gone. **Never make the app or its content public** (no public GitHub repo containing third-party content, no shared links).

**Storable core (safe to store in the DB and use for generation):**

| Source | Use in app | Licence / terms |
|---|---|---|
| Tatoeba German sentences (weekly dump `deu_sentences.tsv.bz2`) | example sentences for cards, cloze items | CC BY 2.0 FR (part CC0); credit authors. Audio licences vary per contributor, so don't import audio |
| Kaikki / Wiktextract German JSONL | lemmas, gender, plurals, **full verb conjugations** (best open conjugation source) | Wiktionary data CC BY-SA 4.0 + GFDL; credit |
| DWDS Lemmadatenbank (download) | lemma list | CC BY-SA 4.0. **Do not script calls to the DWDS API**: terms require permission for automated queries |
| spaCy `de_core_news_sm` | lemmatising, known-word density | MIT |
| LanguageTool **self-hosted** (Docker) | German checks on generated content and homework pre-check | LGPL 2.1+. **The public API forbids automated requests** (and is limited to 20 req/min), so self-host it as a container in docker-compose. Note: it is a Java service; give it ~1–2 GB RAM (verify on your host) |
| Piper TTS voices `thorsten` or `kerstin` | offline/free TTS fallback | voices CC0; Piper engine now GPL-3.0 (fine for private use). Avoid `pavoque` (non-commercial share-alike) |
| Bundesbank German RSS (Pressemitteilungen, Reden) | finance-domain reading texts, reader + auto vocab | storing/copying allowed, credit "Quelle: Deutsche Bundesbank", don't alter text (images excluded) |
| BaFin RSS (Presse etc.) | finance/regulation reading | storing/copying allowed with source credit |
| ECB/EZB | German versions arrive via Bundesbank feeds; ECB's own feed is English | reproduce accurately with credit |
| Tagesschau CC videos | listening | CC BY-SA 4.0, credit "tagesschau" |

**Private-use only (OK in a login-gated personal app, never republish):**

| Source | Use | Terms |
|---|---|---|
| Tagesschau API (`https://www.tagesschau.de/api2u/news/`) + RSS (incl. Wirtschaft/Finanzen) + "Tagesschau in 100 Sekunden" podcast | daily real news reading + short audio | private non-commercial use allowed, publication not; **max 60 requests/hour**: poll every 30–60 min max, cache |
| nachrichtenleicht.de RSS + weekly podcast (easy German) | easy reading/listening early on | no text licence found; personal reading only |
| DW "Top-Thema mit Vokabeln" (B1) and "Langsam gesprochene Nachrichten" (B2) RSS | MP3 for personal listening; **link out** to the article page for the transcript ("Manuskript" tab) | no published reuse licence found; feeds contain no transcript. Do not scrape article text |
| Goethe-Zertifikat A1/A2/B1 Wortlisten (PDF) | **local reference only**: run a coverage check on your laptop ("which B1 words are not yet in my decks?"), then let the Author generate cards for the missing words in its own sentences | the PDFs are copyrighted and state they may not be stored and put into a network. **Do not import the lists into the deployed database.** This is the conservative reading; uncertain |
| OpenSubtitles via OPUS (`de.freq.gz`) | word frequency ranks only | no licence stated; grey area; use for statistics, never store subtitle text |

**Link / embed only:**

| Source | How |
|---|---|
| YouTube (Easy German, Deutsch für Euch, DW Learn German) | official IFrame embed with `cc_load_policy=1&cc_lang_pref=de` (German captions shown in the player); the app adds its own questions and vocab list. **Do not scrape transcripts** (YouTube terms ban it; `captions.download` only works for videos you own). Data API quota (10,000 units/day) is plenty for metadata if needed |
| DW Nicos Weg | link to course pages (third-party rights, no feed) |
| verbformen.de, Deutsche Börse pages, Handelsblatt | link only; do not copy |

**Rule for Claude Code:** every stored text keeps `source_url` and `licence` fields (§10), and a credit line is shown in the reader.

---

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

## 13. Build phases (token-efficient)

**Session rules for Claude Code:** one phase per session; `/clear` between phases; read only `CLAUDE.md`, `docs/PROGRESS.md` and the `docs/` file for the current phase (not this whole spec again); use subagents for any wide search; finish each phase with the acceptance checks *run*, output pasted as evidence, `docs/PROGRESS.md` updated, and a git commit. If a phase is too big for one session, split it at a sub-step boundary and record where it stopped in PROGRESS.md.

| Phase | Goal | Done when (acceptance checks, all must be run and shown) |
|---|---|---|
| **0. Scaffold** (≈1 session) | Repo, tooling, docs split | `docs/` contains: `learner_profile.md`, `pedagogy.md` (§3–4), `modules.md` (§5), `engagement.md` (§6–7), `architecture.md` (§8, §10, §12), `llm.md` (§9), `content_sources.md` (§11), `PROGRESS.md`. `CLAUDE.md` created from §14 (< 80 lines). Backend + frontend start with one command (`make dev`); `/api/health` returns ok; `pytest` and `vitest` run with one passing test each; LanguageTool container starts in docker-compose and a test call on "Ich habe gestern nach Hause gegangen." returns a match; `.env.example` exists; `.gitignore` excludes `.env`, `*.db`, `audio/`. |
| **1. MVP: SRS + daily loop** (≈1 weekend, must be on phone) | Usable daily from day 3 | Login works. Seed decks loaded: Connector Deck (all connectors with verb-effect tags), Work Deck (~150 chunks), Life Deck (~150 chunks), generated via a script into JSON, LanguageTool-checked, marked `needs_review` where flagged. FSRS reviews with typed answers + auto-grading (umlaut/typo tolerance with diff). Daily loop screen with Manzil + Sabqi + a simple Sabaq (next pattern in fixed order). Streak + freezes + `day_log`. PWA installable on Android/iOS home screen. Deployed on HTTPS. **Tests:** FSRS scheduling unit tests (intervals increase on Good, reset on Again); answer-grader tests (`Strasse`≈`Straße`, `ae`≈`ä` → Hard, wrong article → Again). Evidence: screenshot of the review screen on a phone-width viewport. |
| **2. Grammar (§5.2) + writing (§5.6) + Ghalti (§5.7)** | The #1 gap: verb position, connectors, tenses | 40 patterns as JSON (generated in batches of 5, LanguageTool-checked). Pattern card screen + 6 drill types (§5.2). Recitation (Pahara) in typed mode. Homework + Tagebuch with Grader JSON → red-pen view. Ghalti Register (table + by-tag heat map) and auto-creation of `fix_sentence` cards. Placement test (≈35 items + one 5-sentence writing sample) setting `level_band` and marking known items. **Tests:** Grader schema validation with 5 fixture sentences containing known errors (each expected tag must appear); drill generators produce valid items. |
| **3. Voice tutor** (use plan mode) | Speaking without time pressure | Hold-to-talk + tap-start/tap-stop; pipeline browser STT (Web Speech `SpeechRecognition`, restarted on every `end`, only Zee's tap ends a turn) → FastAPI Tutor (Ollama) → browser TTS (`speechSynthesis`) (§5.4, free-resources decision in §8). Modes: Shadowing (word-match scoring against the reference text, no fluency score), Recitation by voice, 6 scenario roleplays, Free talk, end-of-session "Say it better" review. Stammer-safe rules enforced in code: no auto-stop, no timers; disfluency-stripping before grading. Cost ledger entries for every LLM call (€0, tokens counted). Text fallback when `SpeechRecognition` is missing. Self-hosted Whisper fallback if Web Speech loses words in Zee's tests. **Tests:** pipeline test with 3 recorded fixture transcripts (mock Ollama in unit tests, one real call behind `RUN_OLLAMA=1`); assert no code path ends a user turn automatically; assert fluency score is not displayed when setting is off. |
| **4. Reading (§5.3) + listening (§5.5)** | Input volume, reading-first | Reader (§5.3) with tap-to-gloss/add, comprehension Qs; nightly Author job for 2 graded texts/day with known-word density check; read-aloud for every text via `speechSynthesis`; Diktat (5/day) with diff; Commute Podcast episode generator (mp3 concatenation, audio from self-hosted Piper TTS because `speechSynthesis` cannot write files) + offline cache in service worker; external sources page per §11 (links/embeds only where licence allows). **Tests:** density calculator unit test; Diktat diff test (umlauts, capitals, endings). |
| **5. Life engine + curriculum + feed** | "Knows me", plans my day | Life-facts CRUD with confidentiality warning; morning check-in → 3 phrases for today; evening check-out; curriculum engine choosing next Sabaq from pattern mastery + Ghalti top tags + upcoming life events; if-then onboarding + web push (max 2/day, quiet hours, on-call mode); Scroll feed with 40-card soft stop; work writing templates (§5.6: meeting request, status update, absence note), graded by the Phase 2 Grader. **Tests:** curriculum picks a pattern with highest error rate when mastery < 60 %; notification scheduler respects quiet hours. |
| **6. Tests, milestones, report card** | Pakistani-school accountability | Weekly test (Friday), monthly exam, B1 mock in 4 modules (Sprechen via voice tutor in examiner mode), milestones with evidence, report card (grayscale print CSS + PDF), forecast, Builder gate endpoint. **Tests:** report card renders with fixture data; forecast math unit test. |
| **7. Later** | Only if gate ≥ 5/7 for 4 weeks | Realtime conversation mode behind `VoiceEngine` (OpenAI `gpt-realtime-2.1-mini` is paid: only if Zee drops the free-only rule; otherwise a local option); photo-of-handwritten-homework grading; calendar import; Anki export. |

**Token discipline:**
- Never paste big generated content into the chat. Generators write to `data/seed/*.json`; Claude Code reads a sample of 5, not the whole file.
- Use subagents for: a wide codebase search, a review of the diff against the phase checklist, reading vendor docs. Keep the main session for implementation.
- Prefer small libraries already chosen in §8; do not add dependencies without a one-line reason in PROGRESS.md.
- When context gets heavy mid-phase: `/compact Keep the phase checklist, modified files and test commands.`
- At the end of each phase, run one review subagent: "Check the diff against the Phase N acceptance list in SPEC/docs. Report only missing requirements or correctness bugs, not style."

---

## 14. CLAUDE.md starter (Claude Code creates this in Phase 0; keep < 80 lines)

```markdown
# Ustad: personal German coach (single user: Zee)

Full spec: SPEC.md. Do NOT read it whole each session. Read docs/PROGRESS.md first, then only the
docs/ file for the current phase:
- learner + tutor rules: docs/learner_profile.md, docs/llm.md
- pedagogy/daily loop: docs/pedagogy.md · modules: docs/modules.md
- engagement/progress: docs/engagement.md · stack/data/security: docs/architecture.md
- content licences: docs/content_sources.md

## Commands
- make dev (backend :8000 + frontend :5173) · make test · make lint · make migrate
- backend: cd backend && uv run pytest -q · frontend: cd frontend && npm run test

## Non-negotiables
- IMPORTANT: Speaking features never add time pressure: no auto turn-end, no timers, no interruption,
  fluency score hidden unless setting on, strip disfluencies before grading. User stammers.
- Ask before telling: every exercise hides the answer until an attempt.
- All LLM output = JSON validated by Pydantic. Generated German must pass LanguageTool or be marked needs_review.
- API keys server-side only. Never commit .env, *.db, audio/.
- Every external API call writes to cost_ledger.
- UI: phone-first (375px), works one-handed; laptop second. Report cards grayscale.
- Copy tone: short, direct, specific. No hype, no em dashes, no fake praise.
- Builder gate: before starting any NEW feature (Phase ≥ 2), call GET /api/stats/gate.
  If study_days_last_7 < 5, do bug fixes only and tell Zee why.

## Workflow
- One phase per session. Finish with: acceptance checks run + output shown, PROGRESS.md updated, git commit.
- Use subagents for wide searches and for the end-of-phase diff review.
- When compacting, preserve: current phase checklist, modified files, test commands.
```

---

## 15. Out of scope for v1

Native iOS/Android apps (PWA only) · multiple users, friends, leaderboards · points shop/gems/leagues · Google Calendar/Outlook sync (manual life events instead) · realtime speech-to-speech (Phase 7) · handwriting OCR (Phase 7) · Austrian/Swiss variants · any integration with work systems or work accounts.

---

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

---

## 17. Sources

All checked 20 Oct 2026. Evidence tags as in §3.

**Learning science**
- Roediger & Karpicke 2006, testing effect: https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Adesope et al. 2017, practice testing meta-analysis: https://journals.sagepub.com/doi/10.3102/0034654316689306
- Dunlosky et al. 2013, learning techniques: https://journals.sagepub.com/doi/10.1177/1529100612453266
- Cepeda et al. 2006, distributed practice: https://pubmed.ncbi.nlm.nih.gov/16719566/
- Brunmair & Richter 2019, interleaving meta-analysis: https://doi.org/10.1037/bul0000209
- Rohrer et al. 2005, overlearning: https://digitalcommons.usf.edu/psy_facpub/1772/
- FSRS libraries: https://github.com/open-spaced-repetition/py-fsrs · https://github.com/open-spaced-repetition/ts-fsrs · benchmark (by FSRS authors, not peer-reviewed): https://github.com/open-spaced-repetition/srs-benchmark · Anki retention guidance: https://docs.ankiweb.net/deck-options.html
- Ye, Su & Cao 2022 (KDD), FSRS precursor: https://doi.org/10.1145/3534678.3539081
- Watkins & Biggs (eds.) 1996, *The Chinese Learner*: https://cerc.edu.hku.hk/?p=3095 · Kember 1996: https://link.springer.com/article/10.1007/BF00128436 · Dahlin & Watkins 2000: https://doi.org/10.1348/000709900157976
- Hifz and memory (small n): https://pure.york.ac.uk/portal/en/publications/does-learning-the-quran-improve-memory-capacity-practical-and-the/
- Lyster & Ranta 1997, corrective feedback: https://doi.org/10.1017/s0272263197001034 · Li 2010 meta-analysis: https://researchspace.auckland.ac.nz/handle/2292/24985
- Swain & Lapkin 1995, output: https://doi.org/10.1093/applin/16.3.371
- Conklin & Schmitt 2008, formulaic sequences: https://nottingham-repository.worktribe.com/output/3208445/formulaic-sequences-are-they-processed-more-quickly-than-nonformulaic-language-by-native-and-nonnative-speakers
- Nation 2006, vocabulary coverage: https://openaccess.wgtn.ac.nz/articles/journal_contribution/How_large_a_vocabulary_is_needed_for_reading_and_listening_/12552221/1
- Hamada 2014, shadowing: https://jalt-publications.org/sites/default/files/pdf-article/38.1tlt_art1.pdf
- Ryan & Deci 2000, SDT: https://doi.org/10.1037/0003-066X.55.1.68 · Deci, Koestner & Ryan 1999, rewards: https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/
- Sailer & Homner 2020, gamification: https://link.springer.com/article/10.1007/s10648-019-09498-w
- Kivetz et al. 2006, goal gradient: https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal
- Gollwitzer & Sheeran 2006, implementation intentions: https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f
- Lally et al. 2010, habit formation: https://doi.org/10.1002/ejsp.674
- Duolingo streaks (company-reported): https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/
- "Goldfish attention span" myth: https://internet.psych.wisc.edu/wp-content/uploads/532-Master/532-UnitPages/Unit-09/Goldfish_MythBusting.pdf
- Short-form video and attention, meta-analysis (correlational): https://ifp.nyu.edu/2025/journal-article-abstracts/bul0000498/
- Goethe-Institut hours per level: https://www.goethe.de/ins/gb/en/m/sta/lon/kur/faq.html
- Goethe-Zertifikat B1 rules (modules, 100 points each, pass at 60): https://www.goethe.de/resources/files/pdf325/durchfuehrungsbestimmungen_b1-1.pdf

**Speaking and stammering**
- STAMMA, talking with someone who stammers: https://stamma.org/about-stammering/talking-someone-who-stammers
- Stuttering Foundation, six tips: https://www.stutteringhelp.org/sites/default/files/SixTips-En.pdf
- ASHA: https://www.asha.org/news/2024/asha-highlights-need-for-increased-understanding-and-acceptance-this-stuttering-awareness-week/

**Vendors**
- OpenAI pricing: https://developers.openai.com/api/docs/pricing · Realtime VAD: https://developers.openai.com/api/docs/guides/realtime-vad · push-to-talk: https://developers.openai.com/api/docs/guides/realtime-conversations · cost guide: https://developers.openai.com/api/docs/guides/voice-latency-cost
- Gemini Live: https://ai.google.dev/gemini-api/docs/live-api · pricing: https://ai.google.dev/gemini-api/docs/pricing · session limits: https://ai.google.dev/gemini-api/docs/live-session
- Azure Speech languages (TTS voices, pronunciation assessment): https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support · pronunciation how-to: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment · pricing: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Claude models and pricing: https://platform.claude.com/docs/en/about-claude/pricing · prompt caching: https://docs.claude.com/en/docs/build-with-claude/prompt-caching
- SpeechSuper pricing: https://www.speechsuper.com/pricing.html
- MDN SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

**Content and licences**
- §53 UrhG: https://www.gesetze-im-internet.de/urhg/__53.html
- Tagesschau RSS + terms: https://www.tagesschau.de/infoservices/rssfeeds · API docs: https://github.com/bundesAPI/tagesschau-api/blob/main/README.md · CC content: https://www.tagesschau.de/creativecommons
- DW feeds: https://rss.dw.com/xml/DKpodcast_topthemamitvokabeln_de · https://rss.dw.com/xml/DKpodcast_lgn_de · podcasts list: https://learngerman.dw.com/de/podcasts/s-61934454
- nachrichtenleicht usage: https://www.nachrichtenleicht.de/benutzung-100.html
- YouTube IFrame API: https://developers.google.com/youtube/iframe_api_reference · captions.download: https://developers.google.com/youtube/v3/docs/captions/download · developer policies: https://developers.google.com/youtube/terms/developer-policies
- Tatoeba downloads/terms: https://tatoeba.org/en/downloads · https://tatoeba.org/en/terms_of_use
- Kaikki German: https://kaikki.org/dictionary/German/ · Wiktionary licence: https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- DWDS terms: https://www.dwds.de/d/nutzungsbedingungen · Lemmadatenbank: https://www.dwds.de/lemma/list
- Goethe word list (B1): https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf
- LanguageTool public API limits: https://dev.languagetool.org/public-http-api · server: https://dev.languagetool.org/http-server
- spaCy German model: https://huggingface.co/spacy/de_core_news_sm
- Piper voices: https://huggingface.co/rhasspy/piper-voices
- Bundesbank terms: https://www.bundesbank.de/de/startseite/benutzerhinweise/benutzerhinweise-642874 · BaFin terms: https://www.bafin.de/DE/service/nutzungsbedingungen/nutzungsbedingungen_node.html

**Claude Code practice**
- Best practices: https://code.claude.com/docs/en/best-practices · CLAUDE.md (target < 200 lines; imports load at launch): https://code.claude.com/docs/en/memory
