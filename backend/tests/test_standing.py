"""V2: Stand box service and API. Fixture data lives here only, never in Zee's DB."""

import ast
import json
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from app.core.clock import local_date
from app.core.config import settings
from app.db import utcnow
from app.models import ActivityLog, Card, EvidenceEvent, ExamResult, Item, Pattern
from app.services import standing as st

LOGIN = {"password": "richtig-lang-123"}


@pytest.fixture
def authed(client):
    assert client.post("/auth/login", json=LOGIN).status_code == 200
    return client


def today() -> date:
    return local_date(utcnow())


def add_result(db, module, points, days_ago, kind="practice_full", level="B1"):
    pts_max = 84.0 if module == "sprechen" and kind != "real_exam" else 100.0
    db.add(ExamResult(taken=today() - timedelta(days=days_ago), level=level, module=module, kind=kind,
                      points=points, points_max=pts_max))  # fmt: skip
    db.commit()


def add_hours(db, skill, days_ago, hours):
    d = today() - timedelta(days=days_ago)
    row = db.get(ActivityLog, (d, skill))
    if row is None:
        db.add(ActivityLog(date=d, skill=skill, seconds=hours * 3600))
    else:
        row.seconds += hours * 3600
    db.commit()


def module(db, name):
    return {m["module"]: m for m in st.standing(db, utcnow())["modules"]}[name]


# --- empty DB ------------------------------------------------------------------------------------


def test_empty_db_every_module_not_measured_and_no_numbers(db):
    out = st.standing(db, utcnow())
    assert out["level"] == "B1" and out["pass_points"] == 60
    for m in out["modules"]:
        assert m["status"] == "none" and m["status_word"] == "Not measured yet"
        assert (
            m["low"] is None and m["high"] is None and m["centre"] is None and m["to_pass"] is None
        )
        assert m["action"].startswith("Measure ")
        assert m["evidence"] == []
    assert out["pace"]["measured"] is False
    assert out["needed_pace"] is None


def test_empty_db_api(authed, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "private_dir", tmp_path)
    r = authed.get("/api/standing")
    assert r.status_code == 200
    assert all(m["low"] is None for m in r.json()["modules"])
    p = authed.get("/api/progress").json()
    assert (
        p["wordlist"]["measured"] is False
        and "Add the Goethe B1 word list" in p["wordlist"]["note"]
    )
    assert p["error_rate"]["measured"] is False
    assert len(p["weekly_hours"]["weeks"]) == 12


# --- estimates -----------------------------------------------------------------------------------


def test_one_practice_test_gives_plus_minus_ten(db):
    add_result(db, "lesen", 50, 0)
    m = module(db, "lesen")
    assert m["low"] == 40 and m["high"] == 60 and m["centre"] == 50
    assert m["status"] == "near"  # the range touches the pass tick
    assert m["to_pass"] == 10
    assert m["forecast"]["state"] == "need_more" and m["forecast"]["missing"] == 2
    assert "2 more Lesen checks: 3 in total, spanning at least 14 days" in m["forecast"]["text"]


def test_status_words_follow_the_range(db):
    add_result(db, "lesen", 30, 0)
    add_result(db, "hoeren", 75, 0)
    add_result(db, "schreiben", 60, 0)
    assert module(db, "lesen")["status"] == "below"
    assert module(db, "hoeren")["status"] == "at_or_above"  # low end 65 >= 60
    assert module(db, "schreiben")["status"] == "near"


def test_weights_and_recency(db):
    add_result(db, "lesen", 40, 0)
    add_result(db, "lesen", 80, 30)  # half weight after one half-life
    m = module(db, "lesen")
    assert m["mean"] == pytest.approx((40 * 1 + 80 * 0.5) / 1.5)
    assert m["n_eff"] == pytest.approx(1.5**2 / (1 + 0.25))
    assert (m["high"] - m["low"]) / 2 >= 10  # n_eff < 2 keeps the wide default range


def test_range_floor_and_shrink_with_many_equal_results(db):
    for i in range(6):
        add_result(db, "hoeren", 70, i)
    m = module(db, "hoeren")
    assert m["high"] - m["low"] == pytest.approx(10)  # floor 5 each side
    assert m["centre"] == pytest.approx(70)


def test_teil_counts_half(db):
    add_result(db, "lesen", 80, 0, kind="practice_teil")
    add_result(db, "lesen", 40, 0, kind="practice_full")
    m = module(db, "lesen")
    assert m["mean"] == pytest.approx((80 * 0.5 + 40 * 1) / 1.5)


def test_real_exam_overrides_everything(db):
    add_result(db, "schreiben", 30, 3)
    add_result(db, "schreiben", 33, 0)
    add_result(db, "schreiben", 64, 1, kind="real_exam")
    m = module(db, "schreiben")
    assert m["official"] is True and m["state"] == "official"
    assert m["low"] == m["high"] == 64 and m["status"] == "at_or_above"
    assert m["forecast"]["state"] == "official"


def test_sprechen_range_allows_for_unmeasured_aussprache(db):
    add_result(db, "sprechen", 50, 0, kind="practice_full")  # out of 84
    m = module(db, "sprechen")
    assert m["pronunciation_unknown"] == 16
    assert m["high"] == pytest.approx(50 + 10 + 16)
    assert m["low"] == pytest.approx(40)  # not scaled up
    add_result(db, "sprechen", 58, 0, kind="real_exam")
    m2 = module(db, "sprechen")
    assert m2["official"] and m2["low"] == m2["high"] == 58


def test_goal_level_switches_the_official_file(authed, db):
    r = authed.post("/api/goals", json={"target_exam": "B2", "weekly_hours": 5})
    assert r.status_code == 200
    out = authed.get("/api/standing").json()
    assert out["level"] == "B2" and out["exam"] == "Goethe-Zertifikat B2"
    assert authed.get("/api/goals").json()["weekly_hours"] == 5


# --- entering results ------------------------------------------------------------------------------


def post(client, **kw):
    body = {"level": "B1", "taken": today().isoformat(), **kw}
    return client.post("/api/exam-results", json=body)


def test_lesen_full_test_uses_333_and_rounds(authed):
    r = post(authed, module="lesen", kind="practice_full", teile={1: 4, 2: 4, 3: 4, 4: 4, 5: 2})
    assert r.status_code == 200
    row = authed.get("/api/exam-results").json()["results"][0]
    assert row["raw"] == 18 and row["points"] == 60  # 18 correct = 60 (official example)
    r = post(authed, module="lesen", kind="practice_full", teile={1: 6, 2: 6, 3: 7, 4: 7, 5: 4})
    assert authed.get("/api/exam-results").json()["results"][0]["points"] == 100


def test_lesen_teil_scaled_by_item_count(authed):
    post(authed, module="lesen", kind="practice_teil", teil=3, raw=7)
    row = authed.get("/api/exam-results").json()["results"][0]
    assert row["points"] == 100 and row["raw_max"] == 7
    post(authed, module="hoeren", kind="practice_teil", teil=2, raw=3)
    assert authed.get("/api/exam-results").json()["results"][0]["points"] == 60


def test_schreiben_full_sums_rater_points_and_sprechen_is_out_of_84(authed):
    post(authed, module="schreiben", kind="practice_full", teile={1: 25, 2: 25, 3: 12})
    row = authed.get("/api/exam-results").json()["results"][0]
    assert row["points"] == 62 and row["points_max"] == 100
    post(authed, module="sprechen", kind="practice_full", teile={1: 20, 2: 30, 3: 12})
    row = authed.get("/api/exam-results").json()["results"][0]
    assert row["points"] == 62 and row["points_max"] == 84
    out = authed.get("/api/standing").json()
    assert {m["module"]: m for m in out["modules"]}["sprechen"]["verified"] is False


@pytest.mark.parametrize("body", [
    {"module": "lesen", "kind": "practice_full", "teile": {1: 4, 2: 4, 3: 4, 4: 4}},  # Teil 5 missing
    {"module": "lesen", "kind": "practice_full", "teile": {1: 7, 2: 4, 3: 4, 4: 4, 5: 2}},  # 7 of 6
    {"module": "lesen", "kind": "practice_teil", "teil": 9, "raw": 1},
    {"module": "schreiben", "kind": "practice_teil", "teil": 3, "raw": 21},
    {"module": "lesen", "kind": "real_exam", "points": 101},
    {"module": "lesen", "kind": "real_exam"},
])  # fmt: skip
def test_bad_entries_are_refused(authed, body):
    assert post(authed, **body).status_code == 422
    assert authed.get("/api/exam-results").json()["results"] == []


def test_future_date_refused(authed):
    tomorrow = (today() + timedelta(days=1)).isoformat()
    r = authed.post("/api/exam-results", json={"level": "B1", "module": "lesen", "kind": "real_exam",
                                               "points": 70, "taken": tomorrow})  # fmt: skip
    assert r.status_code == 422


# --- forecast --------------------------------------------------------------------------------------


def test_three_rising_results_over_14_days_give_a_date(db):
    for d, p in ((20, 30), (10, 40), (0, 50)):
        add_hours(db, "reading", d + 1, 4)
        add_result(db, "lesen", p, d)
    for d in range(28):  # a steady last 28 days: pace
        add_hours(db, "reading", d, 0.5)
    f = module(db, "lesen")["forecast"]
    assert f["state"] == "date", f
    assert f["slope_per_hour"] > 0 and f["r2"] >= 0.3
    assert date.fromisoformat(f["date"]) > today()
    assert "Assumes your last 28 days' pace" in f["assumption"]
    assert f["text"].startswith("About ")


def test_falling_scores_have_no_reliable_trend(db):
    for d, p, h in ((20, 60, 4), (10, 50, 4), (0, 40, 4)):
        add_hours(db, "reading", d + 1, h)
        add_result(db, "lesen", p, d)
    assert module(db, "lesen")["forecast"] == {
        "state": "no_trend",
        "text": "No reliable trend yet.",
    }


def test_checks_closer_than_14_days_say_what_is_missing(db):
    for d in (4, 2, 0):
        add_result(db, "hoeren", 50 + d, d)
    f = module(db, "hoeren")["forecast"]
    assert f["state"] == "need_span" and "spanning at least 14 days" in f["text"]


def test_no_recent_practice_means_no_date(db):
    for d, p in ((60, 30), (40, 45), (20, 60)):
        add_hours(db, "reading", d + 1, 5 * (60 - d) / 10 + 1)
        add_result(db, "lesen", p, d)
    f = module(db, "lesen")["forecast"]
    assert f["state"] in ("no_pace", "reached", "no_trend")


def test_far_forecast_says_more_than_a_year(db):
    for d, p, h in ((20, 10, 100), (10, 11, 100), (0, 12, 100)):
        add_hours(db, "reading", d + 1, h)
        add_result(db, "lesen", p, d)
    add_hours(db, "reading", 0, 0.01)
    f = module(db, "lesen")["forecast"]
    assert f["state"] == "far" and f["text"] == "More than a year at this pace."


def test_old_activity_does_not_count_as_pace(db):
    for d in range(60, 70):
        add_hours(db, "writing", d, 1)
    assert st.standing(db, utcnow())["pace"]["measured"] is False


def test_whole_items_only_for_lesen(authed):
    assert post(authed, module="lesen", kind="practice_teil", teil=1, raw=4.5).status_code == 422
    assert post(authed, module="lesen", kind="real_exam", points=59.5).status_code == 422
    assert (
        post(authed, module="schreiben", kind="practice_teil", teil=1, raw=22.5).status_code == 200
    )


def test_pace_needs_seven_days(db):
    for d in range(6):
        add_hours(db, "writing", d, 1)
    assert st.standing(db, utcnow())["pace"]["measured"] is False
    add_hours(db, "writing", 6, 1)
    pace = st.standing(db, utcnow())["pace"]
    assert pace["measured"] and pace["hours_per_week"] == pytest.approx(7 / 4)
    assert pace["per_skill"]["writing"] == pytest.approx(7 / 4)


def test_needed_pace_for_target_date(authed, db):
    goal = {"target_exam": "B1", "target_date": (today() + timedelta(days=70)).isoformat()}
    authed.post("/api/goals", json=goal)
    assert (
        authed.get("/api/standing").json()["needed_pace"]["measured"] is False
    )  # no trend anywhere
    for d, p in ((20, 30), (10, 40), (0, 50)):
        add_hours(db, "reading", d + 1, 4)
        add_result(db, "lesen", p, d)
    for d in range(28):
        add_hours(db, "reading", d, 0.5)
    out = authed.get("/api/standing").json()
    lesen = {m["module"]: m for m in out["modules"]}["lesen"]["forecast"]
    need = out["needed_pace"]
    assert need["measured"] is False  # a headline number would understate the need
    assert "Hören, Schreiben, Sprechen" in need["note"]
    for mod_, pts in (
        ("hoeren", (30, 40, 50)),
        ("schreiben", (30, 40, 50)),
        ("sprechen", (30, 40, 50)),
    ):
        sk = {"hoeren": "listening", "schreiben": "writing", "sprechen": "speaking"}[mod_]
        for (d, _), p in zip(((20, 0), (10, 0), (0, 0)), pts):
            add_hours(db, sk, d + 1, 4)
            add_result(db, mod_, p, d)
        for d in range(28):
            add_hours(db, sk, d, 0.5)
    out = authed.get("/api/standing").json()
    need = out["needed_pace"]
    total = sum(m["forecast"]["hours_needed"] for m in out["modules"])
    assert need["measured"] is True and need["hours_per_week"] == pytest.approx(
        total / 10
    )  # 70 days
    assert lesen["hours_needed"] > 0


# --- indicators ------------------------------------------------------------------------------------


def _pattern(db, code, order):
    p = Pattern(code=code, order=order, group="g", title=code, rule_en="r")
    db.add(p)
    db.commit()


def _ev(db, code, outcome, days_ago, tag=None, skill="grammar"):
    ts = datetime.now(UTC) - timedelta(days=days_ago)
    db.add(
        EvidenceEvent(
            ts=ts, skill=skill, source="drill", outcome=outcome, pattern_code=code, tag=tag
        )
    )
    db.commit()


def test_grammar_states(db):
    for i, c in enumerate(("NEW", "SHAKY", "OK", "SOLID", "FRESH")):
        _pattern(db, c, i)
    for _ in range(5):
        _ev(db, "SHAKY", "error", 1)
        _ev(db, "SOLID", "correct", 20)
        _ev(db, "FRESH", "correct", 1)
    for k in range(10):
        _ev(db, "OK", "correct" if k < 7 else "error", 1)
    states = {g["code"]: g["state"] for g in st.grammar_states(db, today())}
    assert states == {"NEW": "new", "SHAKY": "shaky", "OK": "ok", "SOLID": "solid", "FRESH": "ok"}


def test_error_rate_needs_20_opportunities(db):
    for i in range(19):
        _ev(db, None, "error" if i < 4 else "correct", 1, tag="VERB_FINAL", skill="writing")
    r = st.error_rate(db, utcnow())
    assert r["measured"] is False and "so far 19" in r["note"]
    _ev(db, None, "correct", 1, tag="V2_POSITION", skill="speaking")
    _ev(db, None, "error", 1, tag="VERB_FINAL", skill="grammar")  # other skill: not counted
    r = st.error_rate(db, utcnow())
    assert r["measured"] and r["opportunities"] == 20 and r["rate_pct"] == pytest.approx(20)
    assert r["target_pct"] == 10


def test_tag_weeks_hide_weeks_with_fewer_than_five_uses(db):
    for i in range(6):
        _ev(db, None, "error" if i < 3 else "correct", 1, tag="CASE_DAT", skill="writing")
    for i in range(2):
        _ev(db, None, "error", 10, tag="CASE_DAT", skill="writing")
    weeks = st.tag_weeks(db, today())["tags"][0]["weeks"]
    shown = [w for w in weeks if w["rate_pct"] is not None]
    assert len(shown) == 1 and shown[0]["rate_pct"] == pytest.approx(50)


def test_wordlist_coverage_only_with_private_file(db, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "private_dir", tmp_path)
    assert st.wordlist_coverage(db)["measured"] is False
    (tmp_path / "goethe_b1_wortliste.txt").write_text(
        "# list\nder Bahnhof, -e\nweil\nlernen\nsich bewerben\n"
    )
    it = Item(
        deck="work",
        unit=1,
        unit_order=1,
        unit_title="u",
        kind="word",
        de="der Bahnhof",
        en="station",
    )
    it2 = Item(deck="work", unit=1, unit_order=2, unit_title="u", kind="word", de="weil", en="because",
               known_from_placement=True)  # fmt: skip
    it3 = Item(
        deck="work", unit=1, unit_order=3, unit_title="u", kind="word", de="lernen", en="learn"
    )
    db.add_all([it, it2, it3])
    db.flush()
    db.add(Card(item_id=it.id, card_type="recog", introduced_at=utcnow(), stability=30.0))
    db.add(
        Card(item_id=it3.id, card_type="recog", introduced_at=utcnow(), stability=5.0)
    )  # not mature
    db.commit()
    w = st.wordlist_coverage(db)
    assert w["measured"] and w["list_lemmas"] == 4 and w["mature"] == 2
    assert w["list_size_official"] == 2400


# --- constants -------------------------------------------------------------------------------------


def test_service_has_no_numeric_literals_beyond_0_1_2():
    tree = ast.parse(Path(st.__file__).read_text())
    bad = []
    for node in ast.walk(tree):
        num = isinstance(node, ast.Constant) and isinstance(node.value, (int, float))
        if num and not isinstance(node.value, bool) and node.value not in (0, 1, 2):
            bad.append((node.lineno, node.value))
    assert bad == []


def test_official_files_carry_a_source_url_per_fact():
    d = settings.official_dir
    for name in ("goethe_b1.json", "goethe_b2.json"):
        j = json.loads((d / name).read_text())
        assert j["checked"] and all(u.startswith("https://") for u in j["sources"].values())
        assert j["pass_points"] == 60 and j["module_max_points"] == 100
        for k, m in j["modules"].items():
            assert re.match(r"https://www\.goethe\.de/", m["source_url"]), k
            assert isinstance(m["verified"], bool)
    j1 = json.loads((d / "goethe_b1.json").read_text())["modules"]
    assert [t["items"] for t in j1["lesen"]["teile"]] == [6, 6, 7, 7, 4]
    assert [t["items"] for t in j1["hoeren"]["teile"]] == [10, 5, 7, 8]
    assert [t["max"] for t in j1["schreiben"]["teile"]] == [40, 40, 20]
    assert sum(t["max"] for t in j1["sprechen"]["teile"]) == 84
    assert j1["sprechen"]["verified"] is False
    j2 = json.loads((d / "goethe_b2.json").read_text())["modules"]
    assert [t["items"] for t in j2["lesen"]["teile"]] == [9, 6, 6, 6, 3]
    assert [t["items"] for t in j2["hoeren"]["teile"]] == [10, 6, 6, 8]
    assert [t["max"] for t in j2["schreiben"]["teile"]] == [60, 40]
    c = json.loads((d / "cefr.json").read_text())
    assert c["sources"]["global_scale"].startswith("https://www.coe.int/")
    assert c["word_lists"]["B1"]["size"] == 2400


def test_migration_round_trip(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect

    url = f"sqlite:///{tmp_path}/m.db"
    monkeypatch.setattr(settings, "database_url", url)
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    names = lambda: inspect(create_engine(url)).get_table_names()
    command.upgrade(cfg, "head")
    assert "exam_result" in names()
    cols = lambda: {c["name"] for c in inspect(create_engine(url)).get_columns("exam_result")}
    assert "voided" in cols()
    command.downgrade(cfg, "c2v2stand03")
    assert "exam_result" in names() and "voided" not in cols()
    command.downgrade(cfg, "b1e7v1evid02")
    assert "exam_result" not in names()
    command.upgrade(cfg, "head")
    assert "exam_result" in names() and "voided" in cols()


def test_voided_result_counts_for_nothing_and_can_be_restored(authed):
    post(authed, module="lesen", kind="real_exam", points=85)  # typo for 58
    first = authed.get("/api/exam-results").json()["results"][0]["id"]
    m = {x["module"]: x for x in authed.get("/api/standing").json()["modules"]}["lesen"]
    assert m["official"] and m["low"] == 85
    out = authed.post(f"/api/exam-results/{first}/void", json={}).json()
    m = {x["module"]: x for x in out["modules"]}["lesen"]
    assert m["status"] == "none" and m["low"] is None and m["evidence"] == []
    rows = authed.get("/api/exam-results").json()["results"]  # the row is kept, flagged
    assert len(rows) == 1 and rows[0]["voided"] is True
    post(authed, module="lesen", kind="real_exam", points=58)
    m = {x["module"]: x for x in authed.get("/api/standing").json()["modules"]}["lesen"]
    assert m["low"] == 58 and m["status"] == "below"
    out = authed.post(f"/api/exam-results/{first}/void", json={"voided": False}).json()
    assert {x["module"]: x for x in out["modules"]}["lesen"]["n"] == 2
    assert authed.post("/api/exam-results/999/void", json={}).status_code == 404


def test_voided_results_do_not_feed_the_forecast(db):
    for d, p in ((20, 30), (10, 40), (0, 50)):
        add_hours(db, "reading", d + 1, 4)
        add_result(db, "lesen", p, d)
    for d in range(28):
        add_hours(db, "reading", d, 0.5)
    assert module(db, "lesen")["forecast"]["state"] == "date"
    row = db.query(ExamResult).filter_by(points=50).one()
    row.voided = True
    db.commit()
    assert module(db, "lesen")["forecast"]["state"] == "need_more"
