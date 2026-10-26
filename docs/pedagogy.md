# Pedagogy and daily loop

_Split from SPEC.md sections §3, §4. SPEC.md stays the source of truth; edit both if a rule changes._

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
