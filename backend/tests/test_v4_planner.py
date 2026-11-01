"""V4: learner model + planner. The plan is Python over the evidence ledger; the model only writes content
inside the plan's constraints."""

import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.clock import local_date
from app.db import utcnow
from app.models import Card, DailyPlan, DayLog, Item, Pattern
from app.reading import author, density
from app.services import evidence, learner, planner, structure
from app.srs import scheduler
from app.voice import tutor
from tests.test_drills import PATTERNS
from tests.test_phase2_api import FakeLLM, llm, no_languagetool  # noqa: F401  (fixtures)
from tests.test_phase4 import draft


def add_patterns(db, done=()):
    for p in PATTERNS:
        row = Pattern(
            code=p.code, order=p.order, group=p.group, title=p.title, rule_en=p.rule_en,
            slot_diagram=p.slot_diagram, examples_json=p.examples_json, common_error=p.common_error,
            tags=p.tags, drills_json=p.drills_json, homework=p.homework, status="ok",
        )  # fmt: skip
        if p.code in done:
            row.done_at = utcnow()
        db.add(row)
    db.commit()


def ev(db, tag, outcome, n=1, skill="writing", days_ago=1, **kw):
    now = utcnow() - timedelta(days=days_ago)
    for i in range(n):
        evidence.record_event(db, now, skill, kw.pop("source", "homework"), outcome,
                              tag=tag, orig=kw.get("orig", f"Satz {tag} {outcome} {i}"),
                              fix="fix" if outcome == "error" else None,
                              pattern_code=kw.get("pattern_code"))  # fmt: skip
    db.commit()


def focus_tags(db):
    return [f["tag"] for f in planner.build(db, utcnow())["plan"]["focus"]]


# --- learner model ------------------------------------------------------------------------------


def test_recent_errors_weigh_more_than_old_ones(db):
    ev(db, "CASE_DAT", "error", 3, days_ago=1)
    ev(db, "CASE_AKK", "error", 3, days_ago=28)
    m = learner.tag_model(db, utcnow())
    assert m["CASE_DAT"]["w_errors"] > 2.5 > m["CASE_AKK"]["w_errors"]
    assert m["CASE_DAT"]["rate"] > m["CASE_AKK"]["rate"]


def test_smoothing_prior_is_one_error_and_one_correct(db):
    ev(db, "CASE_DAT", "error", 1, days_ago=0)
    m = learner.tag_model(db, utcnow())
    # (1 + 1) / (1 + 0 + 1 + 1) with weight 1 for an event from now
    assert m["CASE_DAT"]["rate"] == pytest.approx(2 / 3, abs=0.01)


def test_events_older_than_the_window_are_ignored(db):
    ev(db, "CASE_DAT", "error", 6, days_ago=40)
    assert "CASE_DAT" not in learner.tag_model(db, utcnow())


def test_pattern_states_new_shaky_ok_solid(db):
    add_patterns(db)
    now = utcnow()
    codes = [p.code for p in PATTERNS[:4]]
    assert learner.pattern_states(db, now)[codes[0]]["state"] == "new"
    # shaky: 3 right of 10
    for i in range(10):
        evidence.record_event(db, now, "grammar", "drill", "correct" if i < 3 else "error",
                              pattern_code=codes[0], tag="NOPE")  # fmt: skip
    # ok: 7 of 10, seen today
    for i in range(10):
        evidence.record_event(db, now, "grammar", "drill", "correct" if i < 7 else "error",
                              pattern_code=codes[1], tag="NOPE")  # fmt: skip
    # solid: 10 of 10 but last seen 20 days ago
    for _ in range(10):
        evidence.record_event(db, now - timedelta(days=20), "grammar", "drill", "correct",
                              pattern_code=codes[2], tag="NOPE")  # fmt: skip
    db.commit()
    st = learner.pattern_states(db, now)
    assert st[codes[0]]["state"] == "shaky" and st[codes[1]]["state"] == "ok"
    assert st[codes[2]]["state"] == "solid"


def test_weak_words_need_two_lapses(db):
    for n, lapses in enumerate((0, 1, 2, 5)):
        it = Item(
            deck="work", unit=1, unit_order=n, unit_title="t", kind="word", de=f"Wort{n}", en="x"
        )
        db.add(it)
        db.flush()
        db.add(Card(item_id=it.id, card_type="produce", lapses=lapses))
    db.commit()
    assert [w["de"] for w in learner.weak_words(db)] == ["Wort3", "Wort2"]


# --- planner: focus -----------------------------------------------------------------------------


def test_focus_is_highest_rate_tag_with_five_opportunities(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 5)
    ev(db, "CASE_DAT", "error", 3)
    ev(db, "CASE_DAT", "correct", 3)  # 6 uses, 50 % raw
    ev(db, "GENDER", "error", 4)  # only 4 uses: ignored however bad
    assert focus_tags(db) == ["VERB_FINAL", "CASE_DAT"]


def test_tags_with_fewer_than_five_uses_are_ignored(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 4)
    assert focus_tags(db) == []
    plan = planner.build(db, utcnow())
    assert plan["plan"]["reading"] is None and plan["plan"]["speaking_goal"] is None
    assert plan["why"].startswith("No repeated mistake yet")


def test_correct_uses_lower_the_rate_and_drop_the_tag(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 5)
    assert focus_tags(db) == ["VERB_FINAL"]
    ev(db, "VERB_FINAL", "correct", 20, days_ago=0)
    assert focus_tags(db) == []


def test_ties_go_to_the_tag_seen_in_more_skills(db):
    add_patterns(db)
    for tag, skills in (("CASE_AKK", ["writing"]), ("CASE_DAT", ["writing", "speaking"])):
        for sk in skills:
            now = utcnow() - timedelta(days=1)
            for i in range(3):  # same weights, same counts, different spread
                evidence.record_event(db, now, sk, "homework", "error", tag=tag, orig=f"{sk}{i}")
        if len(skills) == 1:
            for i in range(3):
                evidence.record_event(db, utcnow() - timedelta(days=1), "writing", "homework",
                                      "error", tag=tag, orig=f"extra{i}")  # fmt: skip
    db.commit()
    assert focus_tags(db) == ["CASE_DAT", "CASE_AKK"]


def test_focus_is_capped_at_two_and_other_is_never_a_focus(db):
    add_patterns(db)
    for tag in ("VERB_FINAL", "CASE_DAT", "CASE_AKK", "OTHER"):
        ev(db, tag, "error", 6)
    tags = focus_tags(db)
    assert len(tags) == 2 and "OTHER" not in tags


def test_why_is_built_from_numbers(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 4, skill="writing")
    ev(db, "VERB_FINAL", "error", 3, skill="speaking")
    ev(db, "VERB_FINAL", "correct", 4)
    why = planner.build(db, utcnow())["why"]
    assert why.startswith("Focus: verb at the end. 7 errors in 11 uses in 30 days")
    assert "writing 4, speaking 3" in why


# --- planner: new unit, pull forward, review ----------------------------------------------------


def seed_unit(db):
    it = Item(deck="work", unit=1, unit_order=1, unit_title="Im Büro", scenario="office", kind="chunk",
              de="Ich bin müde", en="x", example_de="Ich bin heute sehr müde.", status="ok")  # fmt: skip
    db.add(it)
    db.flush()
    db.add(Card(item_id=it.id, card_type="produce"))
    db.commit()


def test_new_unit_present_on_a_normal_day_and_absent_on_a_makeup_day(db):
    add_patterns(db)
    seed_unit(db)
    today = local_date(utcnow())
    unit = planner.build(db, utcnow())["plan"]["new_unit"]
    assert unit["sabaq"]["title"] == "Im Büro" and unit["pattern"]["code"] == PATTERNS[0].code
    assert not unit["makeup"]
    # makeup: an earlier study day exists, yesterday was missed
    db.add(DayLog(date=today - timedelta(days=3), study_day=True, minutes=0.0, manzil_done=True,
                  sabqi_done=False, sabaq_done=False))  # fmt: skip
    db.commit()
    unit = planner.build(db, utcnow())["plan"]["new_unit"]
    assert unit["makeup"] and unit["sabaq"] is None and unit["pattern"] is None


def test_pattern_is_pulled_forward_when_a_focus_tag_has_no_taught_pattern(db):
    add_patterns(db)
    fixed = PATTERNS[0].code
    ev(db, "ADJ_ENDING", "error", 6)
    new = planner.build(db, utcnow())["plan"]["new_unit"]["pattern"]
    assert new["pulled_forward"] and new["for_tag"] == "ADJ_ENDING"
    assert new["code"] != fixed and "ADJ_ENDING" in next(
        p.tags for p in PATTERNS if p.code == new["code"]
    )


def test_taught_pattern_is_drilled_in_sabqi_not_pulled_forward(db):
    add_patterns(db, done={"VE_WEIL"})
    ev(db, "VERB_FINAL", "error", 6)
    plan = planner.build(db, utcnow())["plan"]
    assert plan["new_unit"]["pattern"]["pulled_forward"] is False
    drills = plan["sabqi_drills"]
    assert drills and drills[0]["n"] == 5 and drills[0]["reteach"]
    assert "VERB_FINAL" in next(p.tags for p in PATTERNS if p.code == drills[0]["pattern_code"])


def test_done_pattern_that_fell_to_shaky_is_reviewed_once(db):
    add_patterns(db, done={"VE_WEIL", "VE_DASS"})
    for code, right in (("VE_WEIL", 2), ("VE_DASS", 4)):
        for i in range(10):
            evidence.record_event(db, utcnow(), "grammar", "drill", "correct" if i < right else "error",
                                  pattern_code=code, tag="NOPE")  # fmt: skip
    db.commit()
    plan = planner.build(db, utcnow())["plan"]
    assert plan["review_pattern"]["pattern_code"] == "VE_WEIL"  # lowest accuracy, max 1 a day
    assert plan["sabqi_drills"][0]["pattern_code"] == "VE_WEIL"


def test_review_needs_five_events(db):
    add_patterns(db, done={"VE_WEIL"})
    for i in range(4):
        evidence.record_event(
            db, utcnow(), "grammar", "drill", "error", pattern_code="VE_WEIL", tag="NOPE"
        )
    db.commit()
    assert planner.build(db, utcnow())["plan"]["review_pattern"] is None


def test_current_pattern_follows_the_plan(db):
    add_patterns(db)
    ev(db, "ADJ_ENDING", "error", 6)
    p = planner.current_pattern(db, utcnow())
    assert "ADJ_ENDING" in p.tags and p.order != 1
    p.done_at = utcnow()  # once done it is no longer today's new pattern
    db.commit()
    assert planner.current_pattern(db, utcnow()).code != p.code


def test_plan_is_stable_for_the_same_day(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 6)
    first = planner.get_or_build(db, utcnow())
    db.commit()
    ev(db, "CASE_DAT", "error", 9)  # new data later the same day
    again = planner.get_or_build(db, utcnow())
    assert again.plan_json == first.plan_json and again.why == first.why
    assert len(db.scalars(select(DailyPlan)).all()) == 1


def test_rote_then_use_adds_one_use_task(db):
    add_patterns(db)
    seed_unit(db)
    t = planner.build(db, utcnow())["plan"]["use_task"]
    assert (
        t["kind"] == "free_drill"
        and t["pattern_code"] == PATTERNS[0].code
        and "Im Büro" in t["text"]
    )


# --- wiring: Mazmoon spec, Author, tutor, Diktat, homework grader ------------------------------


def test_mazmoon_spec_has_at_most_two_constraints(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 6)
    must = planner.build(db, utcnow())["plan"]["mazmoon"]["must_use"]
    assert 1 <= len(must) <= 2 and must[-1] == {
        "kind": "tag",
        "code": "VERB_FINAL",
        "label": "verb at the end",
    }


def test_structure_checks():
    assert (
        structure.count_uses("VERB_FINAL", "Ich lerne, weil ich muss. Er sagt, dass er kommt.") == 2
    )
    assert structure.count_uses("AUX_HABEN_SEIN", "Ich habe gestern Pizza gegessen.") == 1
    assert structure.count_uses("CASE_DAT", "Ich fahre mit dem Zug.") == 1
    assert (
        structure.count_uses("GENDER", "irgendein Text") is None
    )  # no check: callers skip and log


def test_author_receives_the_constraint_and_regenerates_once_when_the_structure_is_missing(
    db,
    llm,  # noqa: F811
    monkeypatch,
):
    words = density.lemmas_of([" ".join(s["de"] for s in draft()["sentences"])])
    monkeypatch.setattr(author, "known_words", lambda db: words)
    monkeypatch.setattr(author, "DENSITY_RANGE", (90.0, 100.0))
    base = [s["de"] for s in draft()["sentences"]]
    with_weil = draft(sentences=[*base, "Er bleibt, weil er müde ist.", "Sie sagt, dass es regnet.",
                                 "Ich weiß, dass er kommt."])  # fmt: skip
    seen: list[str] = []
    orig_chat = FakeLLM.chat

    def spy(self, messages, schema, **kw):
        seen.append(messages[-1]["content"])
        return orig_chat(self, messages, schema, **kw)

    monkeypatch.setattr(FakeLLM, "chat", spy)
    llm.queue += [draft(), with_weil]
    c = {"topic": "work", "tag": "VERB_FINAL", "label": "verb at the end", "min_uses": 3,
         "density": [93, 99], "checkable": True}  # fmt: skip
    t = author.write_text(db, llm, "work", None, c)
    assert len(seen) == 2 and "Planner constraint" in seen[0] and "VERB_FINAL" in seen[0]
    assert "appears too rarely" in seen[1]
    assert structure.count_uses("VERB_FINAL", t.body_de) == 3  # the second draft was kept


def test_author_skips_the_check_for_a_tag_without_one(db, llm, monkeypatch):  # noqa: F811
    words = density.lemmas_of([" ".join(s["de"] for s in draft()["sentences"])])
    monkeypatch.setattr(author, "known_words", lambda db: words)
    monkeypatch.setattr(author, "DENSITY_RANGE", (90.0, 100.0))
    llm.queue += [draft()]
    c = {"topic": "work", "tag": "GENDER", "label": "noun gender", "min_uses": 3, "density": [93, 99],
         "checkable": False}  # fmt: skip
    author.write_text(db, llm, "work", None, c)
    assert llm.queue == []  # one call, no regeneration


def test_reading_constraints_follow_the_focus_tag(db):
    add_patterns(db)
    assert planner.reading_constraints(db, utcnow()) is None
    ev(db, "VERB_FINAL", "error", 6)
    c = planner.reading_constraints(db, utcnow())
    assert (
        c["tag"] == "VERB_FINAL"
        and c["min_uses"] == 3
        and c["density"] == [93, 99]
        and c["checkable"]
    )


def test_tutor_prompt_carries_the_speaking_goal_and_never_corrects(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 6)
    sc = tutor.scenarios()[0]
    p = tutor.system_prompt(db, sc)
    assert "weil, dass or wenn" in p and "never correct" in p


def test_tutor_prompt_without_focus_has_no_goal(db):
    add_patterns(db)
    assert "speaking goal" not in tutor.system_prompt(db, tutor.scenarios()[0])


def test_diktat_contains_the_plan_picks(db):
    from app.listening import diktat

    add_patterns(db)
    for n in range(8):
        de = (
            f"Ich lerne heute, weil ich Nummer {n} brauche."
            if n < 2
            else f"Das Haus Nummer {n} ist sehr groß."
        )
        it = Item(deck="work", unit=1, unit_order=n, unit_title="t", kind="chunk", de=f"chunk {n}",
                  en="x", example_de=de, status="ok")  # fmt: skip
        db.add(it)
        db.flush()
        c = Card(item_id=it.id, card_type="produce")
        db.add(c)
        db.flush()
        scheduler.introduce(c, utcnow())
    db.commit()
    ev(db, "VERB_FINAL", "error", 6)
    rows = diktat.todays(db, local_date(utcnow()))
    with_weil = [r for r in rows if "weil" in r.de]
    assert len(with_weil) == 2 and len(rows) == 5


def test_homework_grader_asks_for_the_focus_tags(db):
    add_patterns(db)
    ev(db, "VERB_FINAL", "error", 6)
    focus = [f["tag"] for f in planner.get_or_build(db, utcnow()).plan_json["focus"]]
    assert "VERB_FINAL" in evidence.target_tags(focus)


# --- API ----------------------------------------------------------------------------------------


@pytest.fixture
def api(client, session_factory):
    s = session_factory()
    add_patterns(s)
    s.close()
    assert client.post("/auth/login", json={"password": "richtig-lang-123"}).status_code == 200
    return client


def test_plan_api_and_history(api, session_factory):
    s = session_factory()
    ev(s, "VERB_FINAL", "error", 6)
    s.close()
    r = api.get("/api/plan").json()
    assert r["focus"][0]["tag"] == "VERB_FINAL" and r["why"].startswith("Focus: verb at the end")
    assert r["blocks"]["speaking"] and r["blocks"]["reading"]
    hist = api.get("/api/plans").json()["plans"]
    assert len(hist) == 1 and hist[0]["data"]["tags"][0]["tag"] == "VERB_FINAL"
    assert api.get("/api/plan").json() == r  # stable


def test_limited_drill_round_is_five_drills_without_answers(api):
    r = api.get("/api/drills/VE_WEIL?limit=5").json()
    assert r["limited"] and len(r["drills"]) == 5
    assert "answer" not in json.dumps(r["drills"][0]).lower().replace("answers", "")
    again = api.get("/api/drills/VE_WEIL?limit=5").json()
    assert [d["id"] for d in again["drills"]] == [d["id"] for d in r["drills"]]  # same pick all day
    assert not api.get("/api/drills/VE_WEIL").json()["limited"]


def test_seeded_writing_errors_change_the_whole_next_day(api, session_factory):
    """The e2e from the brief: VERB_FINAL errors in writing -> Sabqi drills, Diktat sentence, Mazmoon
    must-use, tutor goal and Author constraint all target it."""
    s = session_factory()
    for p in s.scalars(select(Pattern).where(Pattern.code == "VE_WEIL")):
        p.done_at = utcnow()
    for n in range(4):
        it = Item(deck="work", unit=1, unit_order=n, unit_title="t", kind="chunk", de=f"chunk {n}",
                  en="x", example_de=f"Ich bleibe zu Hause, weil ich Nummer {n} habe.", status="ok")  # fmt: skip
        s.add(it)
        s.flush()
        c = Card(item_id=it.id, card_type="produce")
        s.add(c)
        s.flush()
        scheduler.introduce(c, utcnow())
    s.commit()
    ev(s, "VERB_FINAL", "error", 6, skill="writing")
    s.close()
    plan = api.get("/api/plan").json()
    assert plan["sabqi_drills"][0]["pattern_code"] == "VE_WEIL"
    assert api.get("/api/dictation/today").json()["sentences"][0]["say"].count("weil") == 1
    assert plan["mazmoon"]["must_use"][-1]["code"] == "VERB_FINAL"
    assert "weil" in plan["speaking_goal"]["text"]
    assert plan["reading"]["tag"] == "VERB_FINAL"


def test_migration_round_trip(tmp_path):
    import subprocess
    import sys

    env = {"DATABASE_URL": f"sqlite:///{tmp_path}/m.db", "PATH": "/usr/bin:/bin"}
    import os

    env = {**os.environ, **env}

    def alembic(*a):
        return subprocess.run([sys.executable, "-m", "alembic", *a], env=env, capture_output=True, check=False,
                              text=True, cwd=os.path.dirname(os.path.dirname(__file__)))  # fmt: skip

    assert alembic("upgrade", "head").returncode == 0
    assert alembic("downgrade", "d3v2void04").returncode == 0
    r = alembic("upgrade", "head")
    assert r.returncode == 0, r.stderr
