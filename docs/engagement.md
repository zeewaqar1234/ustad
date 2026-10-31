# Engagement, milestones, progress tracking

_Split from SPEC.md sections §1, §6, §7. SPEC.md stays the source of truth; edit both if a rule changes._

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

### 6.6 Build-gate (retired 2026-10-31 by Zee; kept for history, no longer enforced)
- The dashboard has a **"Builder gate"** card: study days in last 7. Claude Code must check it (via an API endpoint `/api/stats/gate`) at the start of every phase after Phase 1 and **refuse to start new feature work if < 5/7**, offering bug fixes only. This is written into CLAUDE.md.

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
