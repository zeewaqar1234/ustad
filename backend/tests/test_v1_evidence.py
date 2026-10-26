"""V1: the evidence ledger. One test per source, correct-use span rules, recurring-by-tag, backfill,
study day, activity per skill."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.core.clock import day_bounds, local_date
from app.db import utcnow
from app.llm.provider import LLMUnavailable
from app.models import (
    ActivityLog,
    Attempt,
    Card,
    DayLog,
    EvidenceEvent,
    Mistake,
    Pattern,
    ReadingText,
    ReviewLog,
)
from app.services import backfill, drills, evidence, ghalti
from app.services.streak import refresh_study_day
from tests.test_drills import PATTERNS
from tests.test_grader_schema import FIXTURES
from tests.test_phase2_api import api, llm, no_languagetool  # noqa: F401  (fixtures)

FX = FIXTURES[0]  # VERB_FINAL error in "weil ich ... gehe"


def events(session_factory, **where):
    s = session_factory()
    q = select(EvidenceEvent).order_by(EvidenceEvent.id)
    for k, v in where.items():
        q = q.where(getattr(EvidenceEvent, k) == v)
    rows = list(s.scalars(q))
    s.close()
    return rows


def graded(reply_extra=None):
    return {**FX["model_reply"], **(reply_extra or {})}


# --- grader: correct uses ------------------------------------------------------------------------


def test_correct_use_spans_not_in_text_or_on_an_error_are_dropped(db, llm):  # noqa: F811
    from app.services import grading

    llm.queue.append(
        graded({"correct_uses": [
            {"span": "Ich bleibe heute", "tag": "V2_POSITION"},
            {"span": "this is not in the text", "tag": "CASE_DAT"},
            {"span": FX["model_reply"]["errors"][0]["span"], "tag": "VERB_FINAL"},  # on an error
        ]})
    )  # fmt: skip
    g = grading.grade_text(db, llm, FX["text"], "task")
    assert len(g["correct_uses"]) == 1
    assert g["dropped_correct_uses"] == 2
    u = g["correct_uses"][0]
    assert FX["text"][u["start"] : u["end"]] == u["span"]


def test_correct_uses_are_capped_at_twelve(db):
    from app.services import grading

    text = "Ich gehe. " * 20
    uses = [{"span": "Ich gehe", "tag": "V2_POSITION"} for _ in range(20)]
    out, dropped = grading.locate_correct_uses(text, uses, [])
    assert len(out) == 12 and dropped == 8


def test_grader_prompt_names_the_target_tags(db, llm):  # noqa: F811
    from app.services import grading

    llm.queue.append(graded())
    llm.calls = []
    llm.chat_calls = []
    grading.grade_text(db, llm, FX["text"], "task", ["SEP_PREFIX"])
    # FakeLLM in test_phase2_api does not record calls; check the message builder directly
    msg = grading._user_message(FX["text"], "t", [], ["SEP_PREFIX"])
    assert "SEP_PREFIX" in msg and "correct_uses" in msg
    assert "VERB_FINAL" in grading._user_message(FX["text"], "t", [])


# --- one test per source ----------------------------------------------------------------------


def test_homework_writes_errors_correct_uses_and_writing_time(api, llm, session_factory):  # noqa: F811
    hw = api.post("/api/homework/today").json()
    first = FX["text"].split()[0]
    llm.queue.append(graded({"correct_uses": [{"span": first, "tag": "V2_POSITION"}]}))
    r = api.post(
        f"/api/homework/{hw['id']}/submit", json={"text": FX["text"], "elapsed_ms": 240_000}
    )
    assert r.status_code == 200
    ev = events(session_factory, source="homework")
    errs = [e for e in ev if e.outcome == "error"]
    ok = [e for e in ev if e.outcome == "correct"]
    assert errs and errs[0].skill == "writing" and errs[0].tag == FX["expected_tags"][0]
    assert errs[0].orig and errs[0].fix is not None and errs[0].severity in (1, 2, 3)
    assert len(ok) == 1 and ok[0].tag == "V2_POSITION" and ok[0].orig
    s = session_factory()
    row = s.get(ActivityLog, (local_date(utcnow()), "writing"))
    assert row.seconds == pytest.approx(240)  # writing time now counts (L7)
    assert s.get(DayLog, local_date(utcnow())).minutes == pytest.approx(4.0)


def test_languagetool_only_grade_writes_no_evidence_until_regrade(api, llm, session_factory):  # noqa: F811
    hw = api.post("/api/homework/today").json()
    llm.queue.append(LLMUnavailable("down"))
    r = api.post(f"/api/homework/{hw['id']}/submit", json={"text": FX["text"]}).json()
    assert r["status"] == "lt_only"
    assert events(session_factory, source="homework") == []
    llm.queue.append(graded())
    api.post(f"/api/homework/{hw['id']}/regrade")
    assert events(session_factory, source="homework")


def test_tagebuch_source(api, llm, session_factory):  # noqa: F811
    llm.queue.append(graded())
    api.post("/api/homework/tagebuch", json={"text": FX["text"], "elapsed_ms": 60_000})
    assert {e.source for e in events(session_factory)} == {"tagebuch"}


def test_drill_first_try_event_per_day(api, session_factory):  # noqa: F811
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    s = session_factory()
    p = s.scalar(select(Pattern).where(Pattern.code == "V2_STATEMENT"))
    d = next(d for d in rnd["drills"] if d["type"] != "free")
    exp = drills.expected(p, d["id"])
    wrong = api.post(
        "/api/drills/answer", json={"drill_id": d["id"], "answer": "x y z", "answers": ["q"]}
    )
    assert wrong.json()["correct"] is False
    api.post("/api/drills/answer", json={"drill_id": d["id"], "answer": exp.answer, "answers": exp.answers,
                                          "elapsed_ms": 30_000})  # fmt: skip
    ev = events(session_factory, source="drill")
    assert len(ev) == 1  # only the first try counts
    assert (
        ev[0].outcome == "error"
        and ev[0].pattern_code == "V2_STATEMENT"
        and ev[0].skill == "grammar"
    )
    assert ev[0].tag == exp.tag
    assert s.get(ActivityLog, (local_date(utcnow()), "grammar")).seconds > 0


def test_skipped_drill_is_not_evidence(api, session_factory):  # noqa: F811
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    d = next(d for d in rnd["drills"] if d["type"] != "free")
    api.post("/api/drills/answer", json={"drill_id": d["id"], "answer": "", "answers": []})
    assert events(session_factory, source="drill") == []


def test_recitation_event_typed_and_voice(api, session_factory):  # noqa: F811
    codes = api.get("/api/recitation").json()
    code = codes[0]["code"]
    api.post(f"/api/recitation/{code}", json={"rows": [], "elapsed_ms": 45_000})
    api.post(f"/api/recitation/{code}/voice", json={"rows": [], "elapsed_ms": 15_000})
    ev = events(session_factory, source="recitation")
    assert [(e.skill, e.outcome, e.meta_json["mode"]) for e in ev] == [
        ("grammar", "error", "typed"), ("grammar", "error", "voice")]  # fmt: skip
    s = session_factory()
    assert s.get(ActivityLog, (local_date(utcnow()), "grammar")).seconds == pytest.approx(60)


def _teach_card(session_factory, card_type="produce", de="Tisch", tags=None, deck="life"):
    from app.models import Item
    from app.srs import scheduler

    s = session_factory()
    it = Item(deck=deck, unit=1, unit_order=1, unit_title="u", kind="word", de=de, en="table",
              gender="m", pos="noun", tags=tags or [], source="ghalti" if tags else "seed")  # fmt: skip
    s.add(it)
    s.flush()
    c = Card(item_id=it.id, card_type=card_type)
    s.add(c)
    s.flush()
    scheduler.introduce(c, utcnow())
    s.commit()
    return c.id


def test_review_events_vocab_gender_and_fix_sentence(api, session_factory):  # noqa: F811
    vocab = _teach_card(session_factory, "produce", "Tisch")
    gender = _teach_card(session_factory, "gender", "Stuhl")
    fix = _teach_card(
        session_factory, "fix_sentence", "Ich gehe, weil ich müde bin.", ["VERB_FINAL"], "ghalti"
    )
    for cid, ans in ((vocab, "der Tisch"), (gender, "die"), (fix, "wrong sentence")):
        api.post("/api/review/answer", json={"card_id": cid, "block": "manzil", "answer": ans,
                                             "elapsed_ms": 10_000})  # fmt: skip
    by = {e.source_ref: e for e in events(session_factory, source="review")}
    assert (by[f"card:{vocab}"].skill, by[f"card:{vocab}"].tag, by[f"card:{vocab}"].outcome) == (
        "vocab",
        None,
        "correct",
    )
    assert (by[f"card:{gender}"].skill, by[f"card:{gender}"].tag, by[f"card:{gender}"].outcome) == (
        "vocab",
        "GENDER",
        "error",
    )
    assert (by[f"card:{fix}"].skill, by[f"card:{fix}"].tag, by[f"card:{fix}"].outcome) == (
        "grammar",
        "VERB_FINAL",
        "error",
    )
    s = session_factory()
    assert s.get(ActivityLog, (local_date(utcnow()), "vocab")).seconds == pytest.approx(20)
    assert s.get(ActivityLog, (local_date(utcnow()), "grammar")).seconds == pytest.approx(10)


def test_sabaq_attempt_event(api, session_factory):  # noqa: F811
    from tests.test_api_flow import _seed

    _seed(session_factory)
    api.get("/api/daily")  # nothing due: Manzil counts as done, Sabaq opens
    first = api.get("/api/sabaq").json()["items"][0]
    api.post(
        "/api/sabaq/attempt", json={"item_id": first["item_id"], "answer": "", "elapsed_ms": 5000}
    )
    ev = events(session_factory, source="sabaq")
    assert len(ev) == 1 and ev[0].skill == "vocab" and ev[0].outcome == "error"


def test_voice_review_typed_lines_are_writing_never_speaking(api, llm, session_factory):  # noqa: F811
    sess = api.post("/api/voice/session", json={"scenario_code": "GUPSHUP"}).json()
    reply = {"reply_de": "Was machst du heute?", "reply_en_gloss": "What do you do today?"}
    llm.queue += [reply, reply]
    api.post("/api/voice/turn", json={"session_id": sess["id"], "text": "Ich habe gestern nach Hause gegangen.",
                                      "input_mode": "voice", "elapsed_ms": 30_000})  # fmt: skip
    api.post("/api/voice/turn", json={"session_id": sess["id"], "text": "Ich arbeite heute im Büro.",
                                      "input_mode": "text", "elapsed_ms": 20_000})  # fmt: skip
    llm.queue.append({
        "lines": [
            {"turn": 1, "better": "Ich bin gestern nach Hause gegangen.",
             "errors": [{"span": "habe", "fix": "bin", "tag": "AUX_HABEN_SEIN", "reason_en": "sein"}],
             "correct_uses": [{"span": "nach Hause", "tag": "PREP_CASE"}, {"span": "not there", "tag": "CASE_DAT"}]},
            {"turn": 2, "better": "Ich arbeite heute im Büro.", "errors": [],
             "correct_uses": [{"span": "im Büro", "tag": "CASE_DAT"}]},
        ],
        "teaching_points": [],
    })  # fmt: skip
    api.post(f"/api/voice/session/{sess['id']}/review")
    ev = events(session_factory, source="voice_review")
    assert {(e.skill, e.outcome, e.tag) for e in ev} == {
        ("speaking", "error", "AUX_HABEN_SEIN"), ("speaking", "correct", "PREP_CASE"),
        ("writing", "correct", "CASE_DAT")}  # fmt: skip
    assert not [e for e in ev if e.tag == "CASE_DAT" and e.skill == "speaking"]
    s = session_factory()
    assert s.get(ActivityLog, (local_date(utcnow()), "speaking")).seconds == pytest.approx(30)
    assert s.get(ActivityLog, (local_date(utcnow()), "writing")).seconds == pytest.approx(20)
    assert s.get(DayLog, local_date(utcnow())).other_done is True  # a reviewed voice session


def test_shadow_event_is_recognition_only(api, session_factory):  # noqa: F811
    s = session_factory()
    from app.models import Item

    it = Item(deck="work", unit=1, unit_order=1, unit_title="u", kind="sentence", de="Ich gehe heute nach Hause.",
              en="x", source="seed", status="ok")  # fmt: skip
    s.add(it)
    s.flush()
    from app.srs import scheduler

    c = Card(item_id=it.id, card_type="produce")
    s.add(c)
    s.flush()
    scheduler.introduce(c, utcnow())
    s.commit()
    api.post(
        "/api/voice/shadow",
        json={"item_id": it.id, "transcript": "Ich gehe heute nach Hause", "elapsed_ms": 9000},
    )
    api.post(
        "/api/voice/shadow", json={"item_id": it.id, "transcript": "Ich Hause", "elapsed_ms": 9000}
    )
    ev = events(session_factory, source="shadow")
    assert [(e.skill, e.outcome, e.tag, e.meta_json["kind"]) for e in ev] == [
        ("speaking", "correct", None, "recognition"), ("speaking", "error", None, "recognition")]  # fmt: skip


def test_diktat_events_by_word_and_study_day(api, session_factory):  # noqa: F811
    api.get("/api/texts")  # loads the seed texts so Diktat has sentences
    d = api.get("/api/dictation/today").json()
    assert d["total"] == 5
    first = d["sentences"][0]
    api.post(
        "/api/dictation/check",
        json={"ref": first["ref"], "typed": first["say"], "elapsed_ms": 8000},
    )
    typed = first_wrong = d["sentences"][1]["say"].replace("e", "a", 1)
    api.post(
        "/api/dictation/check",
        json={"ref": d["sentences"][1]["ref"], "typed": typed, "elapsed_ms": 8000},
    )
    ev = events(session_factory, source="diktat")
    assert ev[0].outcome == "correct" and ev[0].skill == "listening" and ev[0].tag is None
    errs = [e for e in ev if e.outcome == "error"]
    assert errs and all(e.tag for e in errs) and first_wrong != d["sentences"][1]["say"]
    s = session_factory()
    assert (
        s.get(DayLog, local_date(utcnow())) is None
        or not s.get(DayLog, local_date(utcnow())).other_done
    )
    for x in d["sentences"][2:]:
        api.post("/api/dictation/check", json={"ref": x["ref"], "typed": x["say"]})
    assert session_factory().get(DayLog, local_date(utcnow())).other_done is True  # Diktat 5 of 5


@pytest.mark.parametrize(
    ("kind", "expected", "tag"),
    [("umlaut", "Mädchen", "UMLAUT"), ("capital", "Haus", "CAPITALISATION"), ("spelling", "Haus", "SPELLING"),
     ("missing", "Haus", "OTHER"), ("ending", "guten", "ADJ_ENDING"), ("ending", "Hunde", "PLURAL"),
     ("ending", "einen", "ADJ_ENDING")],
)  # fmt: skip
def test_diktat_tag_mapping(kind, expected, tag):
    sentence = {"guten": "Wir haben einen guten Plan.", "Hunde": "Die Hunde schlafen im Garten.",
                "einen": "Ich habe einen Bruder."}.get(expected)  # fmt: skip
    assert evidence.diktat_tag(kind, expected, sentence) == tag


def test_reading_questions_events_and_study_day(api, session_factory):  # noqa: F811
    tid = api.get("/api/texts").json()["today"][0]["id"]
    s = session_factory()
    qs = s.get(ReadingText, tid).questions_json
    wrong = {q["id"]: [1 - q["answer"][0]] + q["answer"][1:] for q in qs}
    api.post(f"/api/texts/{tid}/answers", json={"answers": wrong, "elapsed_ms": 120_000})
    ev = events(session_factory, source="reading_q")
    assert len(ev) == 3 and all(e.skill == "reading" and e.meta_json["question_type"] for e in ev)
    assert session_factory().get(DayLog, local_date(utcnow())).other_done is True
    assert session_factory().get(
        ActivityLog, (local_date(utcnow()), "reading")
    ).seconds == pytest.approx(120)


def test_placement_events(api, session_factory):  # noqa: F811
    items = api.get("/api/placement").json()["items"]
    answers = {i["id"]: (i["choices"][0] if i["choices"] else "x") for i in items}
    api.post(
        "/api/placement",
        json={
            "answers": answers,
            "writing": FX["text"] + " Das ist gut. Ich lerne heute. Wir gehen morgen. Es regnet.",
        },
    )
    ev = events(session_factory, source="placement")
    assert {e.skill for e in ev} >= {"grammar", "vocab"}
    assert len([e for e in ev if e.skill in ("grammar", "vocab")]) == len(items)


def test_all_six_skills_appear(api, llm, session_factory):  # noqa: F811
    # writing
    hw = api.post("/api/homework/today").json()
    llm.queue.append(graded())
    api.post(f"/api/homework/{hw['id']}/submit", json={"text": FX["text"]})
    # grammar
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    s = session_factory()
    p = s.scalar(select(Pattern).where(Pattern.code == "V2_STATEMENT"))
    d = next(d for d in rnd["drills"] if d["type"] != "free")
    e = drills.expected(p, d["id"])
    api.post(
        "/api/drills/answer", json={"drill_id": d["id"], "answer": e.answer, "answers": e.answers}
    )
    # vocab
    cid = _teach_card(session_factory)
    api.post("/api/review/answer", json={"card_id": cid, "block": "manzil", "answer": "der Tisch"})
    # reading + listening
    tid = api.get("/api/texts").json()["today"][0]["id"]
    qs = session_factory().get(ReadingText, tid).questions_json
    api.post(f"/api/texts/{tid}/answers", json={"answers": {q["id"]: q["answer"] for q in qs}})
    first = api.get("/api/dictation/today").json()["sentences"][0]
    api.post("/api/dictation/check", json={"ref": first["ref"], "typed": first["say"]})
    # speaking
    sess = api.post("/api/voice/session", json={"scenario_code": "GUPSHUP"}).json()
    llm.queue.append({"reply_de": "Was machst du?", "reply_en_gloss": "What do you do?"})
    api.post(
        "/api/voice/turn",
        json={"session_id": sess["id"], "text": "Ich arbeite im Büro.", "input_mode": "voice"},
    )
    llm.queue.append(
        {
            "lines": [
                {
                    "turn": 1,
                    "better": "Ich arbeite im Büro.",
                    "errors": [],
                    "correct_uses": [{"span": "im Büro", "tag": "CASE_DAT"}],
                }
            ],
            "teaching_points": [],
        }
    )
    api.post(f"/api/voice/session/{sess['id']}/review")
    s = session_factory()
    counts = dict(
        s.execute(select(EvidenceEvent.skill, func.count()).group_by(EvidenceEvent.skill)).all()
    )
    assert set(counts) == set(evidence.SKILLS), counts


# --- Ghalti by tag ----------------------------------------------------------------------------


def _err(db, tag, orig, days_ago=1):
    evidence.record_event(
        db, utcnow() - timedelta(days=days_ago), "writing", "homework", "error", tag=tag, orig=orig
    )


def test_recurring_by_tag_needs_two_different_sentences(db):
    for _ in range(3):
        _err(db, "VERB_FINAL", "Ich gehe, weil ich bin müde.")  # one sentence three times
    for orig in (
        "Er sagt, dass er hat Zeit.",
        "Sie fragt, ob er kommt morgen.",
        "Er sagt, dass er hat Zeit.",
    ):
        _err(db, "V2_POSITION", orig)  # two sentences
    db.flush()
    stats = ghalti.tag_stats(db, utcnow())
    assert stats["VERB_FINAL"]["recurring"] is False
    assert stats["V2_POSITION"]["recurring"] is True


def test_events_older_than_30_days_do_not_count(db):
    for orig in ("a eins", "b zwei", "c drei"):
        _err(db, "VERB_FINAL", orig, days_ago=45)
    db.flush()
    assert "VERB_FINAL" not in ghalti.tag_stats(db, utcnow())


def test_error_rate_needs_five_events(db):
    _err(db, "PARTIZIP", "x eins")
    _err(db, "PARTIZIP", "x zwei")
    for _ in range(2):
        evidence.record_event(
            db, utcnow(), "writing", "homework", "correct", tag="PARTIZIP", orig="ok"
        )
    db.flush()
    assert ghalti.tag_stats(db, utcnow())["PARTIZIP"]["rate"] is None  # 4 events: too few uses
    evidence.record_event(
        db, utcnow(), "writing", "homework", "correct", tag="PARTIZIP", orig="ok2"
    )
    db.flush()
    assert ghalti.tag_stats(db, utcnow())["PARTIZIP"]["rate"] == pytest.approx(0.4)


def test_register_api_has_tag_rates_and_top_tags(api, llm, session_factory):  # noqa: F811
    hw = api.post("/api/homework/today").json()
    llm.queue.append(graded())
    api.post(f"/api/homework/{hw['id']}/submit", json={"text": FX["text"]})
    reg = api.get("/api/mistakes").json()
    row = reg["by_tag"][0]
    assert {"errors_30d", "correct_30d", "rate", "recurring"} <= row.keys()
    assert reg["top_tags"][0]["tag"] == row["tag"]


# --- study day --------------------------------------------------------------------------------


def test_study_day_rules():
    d = DayLog(manzil_done=True, sabqi_done=False, sabaq_done=False, other_done=False)
    refresh_study_day(d)
    assert d.study_day is False
    d.other_done = True
    refresh_study_day(d)
    assert d.study_day is True
    d.manzil_done = False  # Manzil still comes first
    refresh_study_day(d)
    assert d.study_day is False


# --- backfill ---------------------------------------------------------------------------------


def test_backfill_converts_old_rows_and_is_idempotent(db):
    now = utcnow()
    db.add(
        Mistake(
            ts=now,
            last_ts=now,
            source="homework",
            orig="Ich bin gegangen gestern.",
            fix="x",
            tag="V2_POSITION",
            note="n",
            count=2,
        )
    )
    db.add(
        Mistake(ts=now, last_ts=now, source="voice", orig="v", fix="x", tag="PARTIZIP", note="n")
    )  # skipped
    db.add(
        Attempt(
            ts=now,
            task_ref="drill:V2_STATEMENT:fill:0",
            input="x",
            correct=False,
            error_tags=["CASE_DAT"],
        )
    )
    db.add(
        Attempt(
            ts=now,
            task_ref="drill:V2_STATEMENT:fill:1",
            input=" / ",
            correct=False,
            error_tags=["CASE_DAT"],
        )
    )  # skipped
    db.add(
        Attempt(
            ts=now,
            task_ref="diktat:ref1",
            input="x",
            correct=False,
            error_tags=["UMLAUT", "SPELLING"],
        )
    )
    db.add(Attempt(ts=now, task_ref="recitation:PRONOUNS", input="x", correct=True))
    db.add(Attempt(ts=now, task_ref="shadow:1", input="x", correct=True, score=95))
    db.flush()
    first = backfill.run(db)
    db.flush()
    assert first == 6
    assert backfill.run(db) == 0  # idempotent
    rows = list(db.scalars(select(EvidenceEvent)))
    assert all(r.meta_json["backfilled"] is True for r in rows)
    assert {r.source for r in rows} == {"homework", "drill", "diktat", "recitation", "shadow"}
    assert not [r for r in rows if r.source == "drill" and r.outcome == "correct"]
    assert next(r for r in rows if r.source == "drill").pattern_code == "V2_STATEMENT"


def test_backfill_fix_sentence_reviews_skip_hard(db):
    c = _mk_fix_card(db)
    now = utcnow()
    for r in (1, 2, 3):
        db.add(ReviewLog(card_id=c.id, ts=now, rating=r, block="manzil"))
    db.flush()
    backfill.run(db)
    ev = list(db.scalars(select(EvidenceEvent).where(EvidenceEvent.source == "review")))
    assert sorted(e.outcome for e in ev) == ["correct", "error"] and {e.tag for e in ev} == {
        "VERB_FINAL"
    }


def _mk_fix_card(db):
    from app.models import Item

    it = Item(deck="ghalti", unit=0, unit_order=1, unit_title="g", kind="sentence", de="Ich gehe, weil ich müde bin.",
              en="x", tags=["VERB_FINAL"], source="ghalti")  # fmt: skip
    db.add(it)
    db.flush()
    c = Card(item_id=it.id, card_type="fix_sentence")
    db.add(c)
    db.flush()
    return c


# --- review fixes ----------------------------------------------------------------------------


def test_backfill_skips_rows_newer_than_the_first_live_event(db):
    old, new = utcnow() - timedelta(days=3), utcnow()
    db.add(Attempt(ts=old, task_ref="shadow:1", input="x", correct=True, score=95))
    db.add(Attempt(ts=new, task_ref="shadow:2", input="x", correct=True, score=95))
    evidence.record_event(
        db, new - timedelta(seconds=1), "speaking", "shadow", "correct", source_ref="shadow:2"
    )
    db.flush()
    assert backfill.run(db) == 1  # only the row older than the live event


def test_backfill_gives_correct_old_drills_their_tag(db):
    src = PATTERNS[0]
    cols = ("code", "order", "group", "title", "rule_en", "slot_diagram", "examples_json", "common_error",
            "tags", "drills_json", "homework")  # fmt: skip
    p = Pattern(**{c: getattr(src, c) for c in cols}, status="ok")
    db.add(p)
    d = drills.generate(p)[0]
    db.add(
        Attempt(ts=utcnow() - timedelta(days=2), task_ref=f"drill:{d.id}", input="x", correct=True)
    )
    db.flush()
    backfill.run(db)
    ev = list(db.scalars(select(EvidenceEvent)))
    assert len(ev) == 1 and ev[0].tag == drills.expected(p, d.id).tag and ev[0].outcome == "correct"


def test_drill_first_try_resets_on_the_next_berlin_day(api, session_factory):  # noqa: F811
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    d = next(d for d in rnd["drills"] if d["type"] != "free")
    s = session_factory()
    # yesterday evening Berlin time (still "today" in UTC if the window were UTC-based)
    start, _ = day_bounds(local_date(utcnow()))
    s.add(EvidenceEvent(ts=start - timedelta(hours=1), skill="grammar", source="drill", source_ref=d["id"],
                        outcome="error", orig=d["id"]))  # fmt: skip
    s.commit()
    api.post("/api/drills/answer", json={"drill_id": d["id"], "answer": "x y z", "answers": ["q"]})
    assert len(events(session_factory, source="drill")) == 2


def test_free_drill_resubmit_does_not_write_evidence_twice(api, llm, session_factory):  # noqa: F811
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    free = next(d for d in rnd["drills"] if d["type"] == "free")
    for _ in range(2):
        llm.queue.append(graded())
        api.post("/api/drills/answer", json={"drill_id": free["id"], "answer": FX["text"]})
    assert len([e for e in events(session_factory, source="drill") if e.outcome == "error"]) == 1


def test_recurring_counts_sentence_less_events_by_source_ref(db):
    for ref in ("V2_STATEMENT:fill:0", "V2_STATEMENT:fill:1", "V2_STATEMENT:fill:2"):
        evidence.record_event(
            db, utcnow(), "grammar", "drill", "error", source_ref=ref, tag="V2_POSITION"
        )
    db.flush()
    assert ghalti.tag_stats(db, utcnow())["V2_POSITION"]["recurring"] is True


def test_correct_use_needs_whole_words_once_and_outside_errors():
    from app.services import grading

    text = "Im Winter gehe ich nach Hause. Nach Hause gehe ich gern."
    uses = [
        {"span": "in", "tag": "PREP_CASE"},  # inside "Winter": not a whole word
        {"span": "nach Hause", "tag": "PREP_CASE"},
        {"span": "nach Hause", "tag": "PREP_CASE"},  # second occurrence is the other sentence
        {"span": "nach Hause", "tag": "PREP_CASE"},  # no third position: dropped
    ]
    out, dropped = grading.locate_correct_uses(text, uses, [])
    assert [(u["start"]) for u in out] == [text.index("nach Hause"), text.index("Nach Hause")]
    assert dropped == 2
    # first occurrence overlaps an error: the later one is used
    err = [{"start": text.index("nach Hause"), "end": text.index("nach Hause") + 10}]
    out, _ = grading.locate_correct_uses(text, [uses[1]], err)
    assert out[0]["start"] == text.index("Nach Hause")


def test_reading_time_counts_once_per_text(api, session_factory):  # noqa: F811
    tid = api.get("/api/texts").json()["today"][0]["id"]
    api.post(f"/api/texts/{tid}/read", json={"elapsed_ms": 100_000})
    qs = session_factory().get(ReadingText, tid).questions_json
    api.post(
        f"/api/texts/{tid}/answers",
        json={"answers": {q["id"]: q["answer"] for q in qs}, "elapsed_ms": 100_000},
    )
    assert session_factory().get(
        ActivityLog, (local_date(utcnow()), "reading")
    ).seconds == pytest.approx(100)
