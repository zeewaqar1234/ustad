"""Voice tutor pipeline (docs/modules.md §5.4), two separate steps so the conversation stays fast:

1. Turn: transcript -> disfluency strip -> Tutor (Ollama) replies only ({reply_de, reply_en_gloss}),
   -> LanguageTool on the generated German. No grading, no stars, no corrections during the talk.
2. Review (end of session): every line graded in one Grader call with a long timeout -> "Say it better",
   stars per line, Ghalti Register + fix_sentence cards.

A turn ends only when Zee sends it; nothing here waits, times or ends a turn. If the model is down,
the turn is still saved (tutor_status "offline") and the review can run later.
"""

import logging

from sqlalchemy.orm import Session

from app import content
from app.core.config import settings
from app.db import utcnow
from app.llm import prompt
from app.llm.provider import LLMInvalid, LLMUnavailable, Provider, complete_json
from app.llm.schemas import SessionReview, TutorReply
from app.models import Profile, VoiceSession, VoiceTurn
from app.services import ghalti
from app.services.grading import _locate, _lt_only, lt_check, lt_notes
from app.voice.disfluency import clean

log = logging.getLogger(__name__)
HISTORY_TURNS = 12  # older turns are dropped from the prompt to keep it short


def scenarios(include_flagged: bool = False) -> list[dict]:
    return [
        s for s in content.load("scenarios")["scenarios"] if include_flagged or s["status"] == "ok"
    ]


def scenario(code: str, include_flagged: bool = False) -> dict:
    """New sessions only start from approved scenarios; old sessions still open after a rebuild flags one."""
    for s in scenarios(include_flagged):
        if s["code"] == code:
            return s
    raise KeyError(code)


def _learner(db: Session) -> str:
    p = db.get(Profile, 1)
    band = p.level_band if p else "B1.1"
    return f"Learner: Zee. Level band: {band}. Explanations in English."


def system_prompt(db: Session, sc: dict) -> str:
    """Static parts first (tutor rules, learner, scenario), so the prefix repeats between turns."""
    chunks = "\n".join(f"- {c['de']} ({c['en']})" for c in sc["chunks"])
    return (
        f"{prompt('tutor')}\n\n{_learner(db)}\n\n"
        f"Scenario: {sc['title']} ({sc['level']}).\nYou play: {sc['tutor_role_en']}.\n"
        f"Setting: {sc['setting_en']}\nZee's goal: {sc['goal_en']}\n"
        f"Address him with '{sc['address']}'.\nUseful chunks he has seen:\n{chunks}"
    )


def _transcript(turns: list[VoiceTurn]) -> str:
    lines = []
    for t in turns[-HISTORY_TURNS:]:
        if t.user_clean:
            lines.append(f"Zee: {t.user_clean}")
        if t.reply_de:
            lines.append(f"You: {t.reply_de}")
    return "\n".join(lines)


def view_turn(t: VoiceTurn) -> dict:
    return {"idx": t.idx, "input_mode": t.input_mode, "user": t.user_clean, "reply_de": t.reply_de,
            "reply_en": t.reply_en, "tutor_status": t.tutor_status,
            "needs_review": t.needs_review}  # fmt: skip


def start(db: Session, sc: dict) -> VoiceSession:
    s = VoiceSession(mode=sc["kind"], scenario_code=sc["code"], started=utcnow())
    db.add(s)
    db.flush()
    db.add(VoiceTurn(session_id=s.id, idx=0, reply_de=sc["opening_de"], tutor_status="ok"))
    db.flush()
    db.refresh(s)
    return s


def take_turn(
    db: Session, llm: Provider, s: VoiceSession, raw: str, input_mode: str, stt_restarts: int = 0
) -> VoiceTurn:
    """Zee's turn is already finished (he tapped Send). Clean it, ask the tutor, check the German."""
    sc = scenario(s.scenario_code, include_flagged=True)
    cleaned = clean(raw)
    history = _transcript(s.turns)
    t = VoiceTurn(session_id=s.id, idx=len(s.turns), ts=utcnow(), input_mode=input_mode,
                  user_raw=raw, user_clean=cleaned, stt_restarts=stt_restarts)  # fmt: skip
    db.add(t)
    user = f"Conversation so far:\n{history}\n\nZee's new turn ({input_mode}):\n{cleaned}"
    try:
        out = complete_json(db, llm, "tutor", system_prompt(db, sc), user, TutorReply)
    except (LLMUnavailable, LLMInvalid) as e:
        log.warning("Tutor offline: %s", e)
        t.tutor_status = "offline"
        db.flush()
        return t
    t.reply_de, t.reply_en = out.reply_de.strip(), out.reply_en_gloss.strip()
    # generated German must pass LanguageTool or be marked needs_review
    notes = lt_notes(t.reply_de)
    if notes is None:
        notes = [{"rule": "LT_SKIPPED", "message": "LanguageTool not reachable; check by hand."}]
    t.needs_review, t.review_notes = bool(notes), notes
    db.flush()
    return t


def _review_user(db: Session, s: VoiceSession) -> str:
    convo = []
    for t in s.turns:
        if t.user_clean:
            convo.append(f"Zee [{t.idx}]: {t.user_clean}")
        if t.reply_de:
            convo.append(f"Tutor: {t.reply_de}")
    return f"{_learner(db)}\n\nTranscript (Zee's lines are numbered):\n" + "\n".join(convo)


def stars(errors: int) -> int:
    """1 to 3 stars per line from German errors only (never pace, pauses or fluency)."""
    return 3 if errors == 0 else 2 if errors == 1 else 1


def summary(rows: list[dict]) -> dict:
    graded = [r for r in rows if r["stars"] is not None]
    return {
        "lines": len(rows),
        "graded": len(graded),
        "clean": sum(not r["errors"] for r in graded),
        "errors": sum(len(r["errors"]) for r in graded),
        "stars": sum(r["stars"] for r in graded),
        "max_stars": 3 * len(graded),
    }


def review(db: Session, llm: Provider, s: VoiceSession) -> dict:
    """ "Say it better": all grading of the session happens here, in one Grader call with a long timeout.
    Zee's lines left, corrected version right, stars per line, errors to the Ghalti Register.
    LanguageTool-only results (model down) are provisional: no stars, not written to Ghalti (same as homework).
    A line the model left out is shown as not graded (no stars), never as correct."""
    now = utcnow()
    lines = [t for t in s.turns if t.user_clean]
    try:
        out = complete_json(
            db, llm, "grader", prompt("voice_review"), _review_user(db, s), SessionReview,
            timeout=settings.ollama_review_timeout, num_ctx=settings.ollama_review_num_ctx,
        )  # fmt: skip
        by_turn = {ln.turn: ln for ln in out.lines}
        source, teaching = llm.vendor, out.teaching_points[:3]
    except (LLMUnavailable, LLMInvalid) as e:
        log.warning("Voice review fallback to LanguageTool only: %s", e)
        by_turn, source, teaching = None, "languagetool_only", []
    rows = []
    for t in lines:
        said = t.user_clean or ""
        if by_turn is None:
            g = _lt_only(said, lt_check(said), "offline")
            rows.append({"turn": t.idx, "said": said, "better": g["corrected_text"], "graded": False,
                         "errors": g["errors"], "stars": None, "needs_review": True,
                         "review_notes": []})  # fmt: skip
            continue
        ln = by_turn.get(t.idx)
        if ln is None:
            rows.append({"turn": t.idx, "said": said, "better": said, "graded": False, "errors": [],
                         "stars": None, "needs_review": False, "review_notes": []})  # fmt: skip
            continue
        better = ln.better.strip()
        errs, _ = _locate(said, [e.model_dump(mode="json") for e in ln.errors])
        notes = lt_notes(better) if better != said else []
        if notes is None:
            notes = [
                {"rule": "LT_SKIPPED", "message": "LanguageTool not reachable; check by hand."}
            ]
        rows.append({"turn": t.idx, "said": said, "better": better, "graded": True, "errors": errs,
                     "stars": stars(len(errs)), "needs_review": bool(notes),
                     "review_notes": notes})  # fmt: skip
        if errs and better != said:
            # one card per wrong line; fix_card itself keeps flagged German out of SRS until approved
            card = ghalti.fix_card(db, now, said, better, errs[0]["tag"], errs[0]["reason_en"])
            seen: set[str] = set()
            for e in errs:
                if e["tag"] not in seen:
                    seen.add(e["tag"])
                    ghalti.record(db, now, "voice", said, better, e["tag"], e["reason_en"], card.id)
    s.review_json = {"source": source, "lines": rows, "teaching_points": teaching,
                     "summary": summary(rows)}  # fmt: skip
    s.status = "lt_only" if source == "languagetool_only" else "reviewed"
    s.ended = s.ended or now
    db.flush()
    return s.review_json
