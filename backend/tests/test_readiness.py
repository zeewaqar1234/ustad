"""Internal readiness model and its analysis text. Fixture data lives here only."""

import ast
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.clock import local_date
from app.db import utcnow
from app.llm.provider import LLMUnavailable, Usage
from app.llm.schemas import Insight
from app.models import ActivityLog, EvidenceEvent, ExamResult, PlacementResult, Profile
from app.services import insight
from app.services import readiness as rd
from app.services import standing as st

LOGIN = {"password": "richtig-lang-123"}


@pytest.fixture
def authed(client):
    assert client.post("/auth/login", json=LOGIN).status_code == 200
    return client


@pytest.fixture(autouse=True)
def no_wordlist(tmp_path, monkeypatch):
    monkeypatch.setattr(st.settings, "private_dir", tmp_path)


def ev(db, skill, source, outcome, days_ago=0, band=None, n=1, tag=None):
    for _ in range(n):
        db.add(EvidenceEvent(ts=datetime.now(UTC) - timedelta(days=days_ago), skill=skill, source=source,
                             outcome=outcome, tag=tag, meta_json={"band": band} if band else {}))  # fmt: skip
    db.commit()


def hours(db, skill, days_ago, h):
    d = local_date(utcnow()) - timedelta(days=days_ago)
    row = db.get(ActivityLog, (d, skill))
    if row is None:
        db.add(ActivityLog(date=d, skill=skill, seconds=h * 3600))
    else:
        row.seconds += h * 3600
    db.commit()


def skills(db):
    return {s["skill"]: s for s in rd.readiness(db, utcnow())["skills"]}


def test_posterior_is_wide_with_little_evidence_and_narrows_with_practice(db):
    p0 = rd.posterior(0, 0)
    assert p0["mean"] == pytest.approx(0.5) and p0["pm_pts"] >= 45
    ev(db, "reading", "reading_q", "correct", n=4)
    ev(db, "reading", "reading_q", "error", n=1)
    few = skills(db)["reading"]
    ev(db, "reading", "reading_q", "correct", n=32)
    ev(db, "reading", "reading_q", "error", n=8)
    many = skills(db)["reading"]
    assert few["pm_pts"] > many["pm_pts"]
    assert (many["hi"] - many["lo"]) < (few["hi"] - few["lo"])
    assert many["mean"] == pytest.approx(
        (1 + 36) / (2 + 45), abs=0.02
    )  # uniform prior, little decay


def test_posterior_formula():
    p = rd.posterior(8, 2)  # Beta(9, 3)
    assert p["mean"] == pytest.approx(9 / 12)
    sd = (9 * 3 / (12**2 * 13)) ** 0.5
    assert p["lo"] == pytest.approx(9 / 12 - 1.96 * sd) and p["hi"] == pytest.approx(
        9 / 12 + 1.96 * sd
    )
    assert p["pm_pts"] == round(100 * (p["hi"] - p["lo"]) / 2)


def test_old_evidence_counts_less(db):
    ev(db, "reading", "reading_q", "error", days_ago=200, n=10)
    ev(db, "reading", "reading_q", "correct", days_ago=0, n=10)
    assert skills(db)["reading"]["mean"] > 0.7


def test_placement_a2_items_do_not_count_for_b1(db):
    ev(db, "grammar", "placement", "correct", band="A2", n=6)
    assert skills(db)["grammar"]["measured"] is False
    ev(db, "grammar", "placement", "correct", band="B1.1", n=6)
    assert skills(db)["grammar"]["n"] == 6


def test_srs_reviews_do_not_count_as_accuracy(db):
    ev(db, "vocab", "review", "correct", n=20)
    ev(db, "grammar", "review", "correct", n=20)
    assert not skills(db)["vocab"]["measured"] and not skills(db)["grammar"]["measured"]


def test_proxy_sources_are_discounted(db):
    ev(db, "listening", "diktat", "correct", n=10)
    ev(db, "reading", "reading_q", "correct", n=10)
    s = skills(db)
    assert s["listening"]["pm_pts"] > s["reading"]["pm_pts"]
    assert s["listening"]["proxy"] and "not comprehension" in s["listening"]["proxy"]
    ev(db, "speaking", "shadow", "correct", n=10)
    assert skills(db)["speaking"]["pm_pts"] > s["reading"]["pm_pts"]


def test_status_against_the_line(db):
    ev(db, "reading", "reading_q", "correct", n=60)
    ev(db, "grammar", "drill", "error", n=60)
    ev(db, "writing", "homework", "correct", n=6)
    ev(db, "writing", "homework", "error", n=4)
    s = skills(db)
    assert s["reading"]["status"] == "at_or_above" and s["reading"]["status_word"] == "70% or more"
    assert s["grammar"]["status"] == "below" and s["grammar"]["status_word"] == "Under 70%"
    assert s["writing"]["status"] == "near"  # 7 of 12 with a uniform prior: the range spans 70%


def test_forecast_from_trend_and_needed_effort(authed, db):
    authed.post(
        "/api/goals",
        json={
            "target_exam": "B1",
            "target_date": (local_date(utcnow()) + timedelta(days=84)).isoformat(),
        },
    )
    for week in range(7, -1, -1):  # accuracy rises week by week
        errors = max(0, 6 - (7 - week))
        ev(db, "reading", "reading_q", "correct", days_ago=week * 7, n=10 - errors)
        ev(db, "reading", "reading_q", "error", days_ago=week * 7, n=errors + 4)
        hours(db, "reading", week * 7, 3)
    for d in range(28):
        hours(db, "reading", d, 0.5)
    r = authed.get("/api/readiness").json()
    reading = {s["skill"]: s for s in r["skills"]}["reading"]
    assert len(reading["history"]) >= 3 and reading["forecast"]["state"] in (
        "date",
        "reached",
        "far",
        "no_trend",
    ), reading["forecast"]
    ms = r["milestone"]
    if reading["status"] != "at_or_above" and reading["forecast"]["state"] == "date":
        assert ms["forecast_date"] and ms["needed_per_week"] is not None and ms["days_left"] == 84


def test_milestone_needs_a_trend_for_every_skill_below_the_line(db):
    ev(db, "reading", "reading_q", "error", n=20)
    r = rd.readiness(db, utcnow())
    assert r["milestone"]["state"] == "need_data" and "Lesen" in r["milestone"]["text"]


def test_calibration_compares_with_practice_tests(db):
    ev(db, "reading", "reading_q", "correct", days_ago=10, n=16)
    ev(db, "reading", "reading_q", "error", days_ago=10, n=4)
    db.add(
        ExamResult(
            taken=local_date(utcnow()),
            level="B1",
            module="lesen",
            kind="practice_full",
            points=70.0,
            points_max=100.0,
        )
    )
    db.add(
        ExamResult(
            taken=local_date(utcnow()),
            level="B1",
            module="lesen",
            kind="practice_full",
            points=10.0,
            points_max=100.0,
            voided=True,
        )
    )
    db.commit()
    c = rd.readiness(db, utcnow())["calibration"]
    assert c["n"] == 1  # the voided one is ignored
    assert c["mean_abs_error_pts"] == pytest.approx(abs(17 / 22 * 100 - 70), abs=0.5)


def test_b2_goal_says_the_content_is_b1(authed):
    authed.post("/api/goals", json={"target_exam": "B2"})
    assert "B1 foundation" in authed.get("/api/readiness").json()["b2_note"]


# --- analysis text -------------------------------------------------------------------------------


class FakeLLM:
    vendor, model = "ollama", "fake"

    def __init__(self, reply=None, fail=False):
        self.reply, self.fail, self.calls = reply, fail, 0

    def chat(self, messages, schema, **kw):
        self.calls += 1
        if self.fail:
            raise LLMUnavailable("down")
        return json.dumps(self.reply), Usage(10, 10)


def seeded(db):
    if db.get(Profile, 1) is None:
        db.add(Profile(id=1, name="Zee"))
        db.commit()
    ev(db, "reading", "reading_q", "correct", n=30)
    ev(db, "writing", "homework", "error", n=8, tag="VERB_FINAL")
    ev(db, "writing", "homework", "correct", n=2, tag="VERB_FINAL")


def test_insight_accepts_only_numbers_from_the_facts(db):
    seeded(db)
    f = insight.facts(db, utcnow())
    good = Insight(
        summary=f"On B1 work you get {f['practice']['right_pct']}% right.",
        strengths=[],
        weaknesses=[],
        next_steps=[],
    )
    assert insight.numbers_ok(good, f)
    bad = Insight(
        summary="You will reach B1 in 3 weeks with 97% accuracy.",
        strengths=[],
        weaknesses=[],
        next_steps=[],
    )
    assert not insight.numbers_ok(bad, f)


def test_insight_falls_back_to_the_template(db):
    seeded(db)
    now = utcnow()
    out = insight.get_insight(db, FakeLLM(fail=True), now)
    assert out["source"] == "template" and out["summary"] and "facts" in out
    liar = {
        "summary": "Zee will pass in 5 days with 99% certainty.",
        "strengths": [],
        "weaknesses": [],
        "next_steps": [],
    }
    out = insight.get_insight(db, FakeLLM(reply=liar), now, force=True)
    assert out["source"] == "template"


def test_insight_from_the_model_is_cached_by_facts(db):
    seeded(db)
    f = insight.facts(db, utcnow())
    reply = {"summary": f"You get {f['practice']['right_pct']}% right.", "strengths": ["Lesen is strong."],
             "weaknesses": [], "next_steps": ["Write the daily task in Schreiben."]}  # fmt: skip
    llm = FakeLLM(reply=reply)
    a = insight.get_insight(db, llm, utcnow())
    b = insight.get_insight(db, llm, utcnow())
    assert a["source"] == "model" and b["cached"] is True and llm.calls == 1
    ev(db, "reading", "reading_q", "error", n=5)  # facts changed
    assert insight.get_insight(db, llm, utcnow())["cached"] is False


def test_insight_api_works_without_a_model(authed, db):
    r = authed.post("/api/readiness/insight")
    assert r.status_code == 200 and r.json()["source"] == "template"


def test_readiness_service_has_no_numeric_literals_beyond_0_1_2():
    for mod in (rd, insight):
        tree = ast.parse(Path(mod.__file__).read_text())
        bad = []
        for node in ast.walk(tree):
            num = isinstance(node, ast.Constant) and isinstance(node.value, (int, float))
            if num and not isinstance(node.value, bool) and node.value not in (0, 1, 2):
                bad.append((node.lineno, node.value))
        assert bad == [], mod.__name__


# --- review fixes ---------------------------------------------------------------------------------


def test_analysis_numbers_must_belong_to_the_skill_named_in_the_sentence(db):
    seeded(db)
    f = insight.facts(db, utcnow())
    sk = {s["skill"]: s for s in f["skills"]}
    lesen, schreiben = sk["Lesen"]["right_pct"], sk["Schreiben"]["right_pct"]
    assert lesen != schreiben

    def ok(text):
        return insight.numbers_ok(
            Insight(summary=text, strengths=[], weaknesses=[], next_steps=[]), f
        )

    assert ok(f"Lesen is at {lesen}%.") and ok(f"Schreiben is at {schreiben}%.")
    assert not ok(f"Schreiben is at {lesen}%.")  # a real number, but Lesen's
    assert not ok("You are working towards C1.") and not ok("Your level is B2.")
    assert ok(f"Placed {f['placement_label']}.") if f["placement_label"] else True
    long = Insight(summary="x", strengths=["a" * 400], weaknesses=[], next_steps=[])
    assert not insight.numbers_ok(long, f)


def test_diktat_counts_one_answer_per_sentence(db):
    for ref in ("d1", "d2", "d3", "d4", "d5"):  # five sentences with one slip each
        db.add(
            EvidenceEvent(
                ts=datetime.now(UTC),
                skill="listening",
                source="diktat",
                outcome="error",
                source_ref=ref,
            )
        )
    for ref in ("d6",):  # one perfect sentence
        db.add(
            EvidenceEvent(
                ts=datetime.now(UTC),
                skill="listening",
                source="diktat",
                outcome="correct",
                source_ref=ref,
            )
        )
    for _ in range(3):  # three slips in one sentence still count once
        db.add(
            EvidenceEvent(
                ts=datetime.now(UTC),
                skill="listening",
                source="diktat",
                outcome="error",
                source_ref="d7",
            )
        )
    db.commit()
    assert skills(db)["listening"]["n"] == 7


def test_calibration_skips_tests_with_almost_no_prior_evidence(db):
    ev(db, "reading", "reading_q", "correct", days_ago=10, n=1)
    db.add(
        ExamResult(
            taken=local_date(utcnow()),
            level="B1",
            module="lesen",
            kind="practice_full",
            points=90.0,
            points_max=100.0,
        )
    )
    db.commit()
    c = rd.readiness(db, utcnow())["calibration"]
    assert c["n"] == 0 and c["skipped"] == 1 and "too little" in c["note"]


# --- level and practice (V2 redo) -----------------------------------------------------------------


def place(db, label, days_ago=10):
    p = db.get(Profile, 1)
    if p is None:
        db.add(Profile(id=1, level_band=label))
    else:
        p.level_band = label
    db.add(PlacementResult(answers={}, by_band={}, level_band=label,
                           ts=datetime.now(UTC) - timedelta(days=days_ago)))  # fmt: skip
    db.commit()


def test_empty_db_has_no_numbers(db):
    r = rd.readiness(db, utcnow())
    assert r["practice"]["mean"] is None and r["practice"]["pm_pts"] is None
    assert r["practice"]["measured"] == 0 and r["practice"]["of"] == 6
    assert all(not s["measured"] and s["mean"] is None and s["status_word"] == "Not measured yet"
               for s in r["skills"])  # fmt: skip
    assert r["level"]["label"] is None and r["hours_since_placement"] is None
    assert "placement test" in r["move_up"]["text"]
    assert r["calibration"]["n"] == 0 and r["milestone"]["forecast_date"] is None


def test_line_is_the_placement_band_rule_not_exam_points(db):
    from app.services import placement

    r = rd.readiness(db, utcnow())
    assert r["line"]["share"] == placement.PASS
    assert "not a Goethe number" in r["line"]["source"]


def test_level_comes_from_placement_and_ladder_follows_it(db):
    place(db, "B1.1")
    lv = rd.readiness(db, utcnow())["level"]
    assert lv["label"] == "B1.1" and lv["working_on"] == "B1.1" and lv["passed"] == ["A2"]
    assert (
        lv["goal_band"] == "B1.2"
        and not lv["goal_reached"]
        and "Not an official CEFR" in lv["note"]
    )
    place(db, "B1 Board")
    lv = rd.readiness(db, utcnow())["level"]
    assert (
        lv["working_on"] == "B2" and lv["passed"] == ["A2", "B1.1", "B1.2"] and lv["goal_reached"]
    )
    place(db, "A2+")
    assert rd.readiness(db, utcnow())["level"]["passed"] == []


def test_practice_pools_all_skills_and_counts_skills_at_the_line(db):
    place(db, "B1.1")
    ev(db, "reading", "reading_q", "correct", n=40)
    ev(db, "grammar", "drill", "correct", n=10)
    ev(db, "grammar", "drill", "error", n=30)
    r = rd.readiness(db, utcnow())
    pr = r["practice"]
    assert pr["measured"] == 2 and pr["at_line"] == 1 and pr["n"] == 80
    assert pr["mean"] == pytest.approx((1 + 50) / (2 + 80), abs=0.01)
    assert not r["move_up"]["ready"] and r["move_up"]["text"].startswith("1 of 2 practised skills")


def test_move_up_only_when_every_skill_is_at_the_line(db):
    place(db, "B1.1")
    for sk, src in [("vocab", "placement"), ("grammar", "drill"), ("reading", "reading_q"),
                    ("writing", "homework"), ("speaking", "voice_review")]:  # fmt: skip
        ev(db, sk, src, "correct", n=60, band="B1.1" if src == "placement" else None)
    for i in range(60):  # Diktat counts one answer per sentence
        db.add(EvidenceEvent(ts=datetime.now(UTC), skill="listening", source="diktat",
                             outcome="correct", source_ref=f"s{i}"))  # fmt: skip
    db.commit()
    mu = rd.readiness(db, utcnow())["move_up"]
    assert mu["ready"] and "Retake the placement test" in mu["text"]
    assert "Not counted, no practice answers: Wortschatz" in mu["text"]  # vocab is placement-only
    place(db, "B1 Board")  # beyond the B1 lessons: practice cannot speak for B2
    mu = rd.readiness(db, utcnow())["move_up"]
    assert not mu["ready"] and "B1 material" in mu["text"]


def test_hours_since_placement_count_only_from_that_day(db):
    hours(db, "reading", 20, 5)
    place(db, "B1.1", days_ago=10)
    hours(db, "reading", 5, 2)
    hours(db, "grammar", 0, 1)
    assert rd.readiness(db, utcnow())["hours_since_placement"] == pytest.approx(3)


def test_trend_is_last_four_weeks_against_the_four_before(db):
    ev(db, "reading", "reading_q", "correct", days_ago=35, n=5)
    ev(db, "reading", "reading_q", "error", days_ago=35, n=5)  # 50 % then
    ev(db, "reading", "reading_q", "correct", days_ago=3, n=8)
    ev(db, "reading", "reading_q", "error", days_ago=3, n=2)  # 80 % now
    assert skills(db)["reading"]["trend_pts"] == 30
    ev(db, "grammar", "drill", "correct", n=30)  # nothing in the four weeks before
    assert skills(db)["grammar"]["trend_pts"] is None


def test_no_new_answers_means_no_trend_even_as_old_answers_fade(db):
    ev(db, "vocab", "placement", "correct", days_ago=60, n=6, band="B1.1")
    ev(db, "vocab", "placement", "error", days_ago=60, n=2, band="B1.1")
    assert skills(db)["vocab"]["trend_pts"] is None


def test_placement_only_skill_is_shown_but_left_out_of_time_to_goal(db):
    ev(db, "vocab", "placement", "correct", days_ago=30, n=3, band="B1.1")
    ev(db, "vocab", "placement", "error", days_ago=30, n=5, band="B1.1")
    ev(db, "reading", "reading_q", "correct", n=60)
    r = rd.readiness(db, utcnow())
    v = {s["skill"]: s for s in r["skills"]}["vocab"]
    assert v["measured"] and v["placement_only"] and v["history"] == []
    assert (
        v["forecast"]["state"] == "placement_only"
        and "only the placement test" in v["forecast"]["text"]
    )
    ms = r["milestone"]
    assert ms["state"] == "reached" and "Wortschatz" in ms["note"]


def test_word_list_file_does_not_change_the_estimate(db, tmp_path):
    (tmp_path / "goethe_b1_wortliste.txt").write_text("Bahnhof\nweil\n")
    assert not skills(db)["vocab"]["measured"]


def test_milestone_never_reached_while_a_counted_skill_is_under_the_line(db):
    ev(db, "reading", "reading_q", "correct", n=60)
    ev(db, "grammar", "drill", "correct", n=7)
    ev(db, "grammar", "drill", "error", n=5)
    assert rd.readiness(db, utcnow())["milestone"]["state"] != "reached"


def test_empty_db_has_no_left_out_note(db):
    assert rd.readiness(db, utcnow())["milestone"]["note"] is None


def test_unclear_skills_are_named_but_do_not_block_hours():
    fc = {"date": {"state": "date", "hours_needed": 12.0, "date": "2027-01-01", "text": ""},
          "unclear": {"state": "unclear", "text": "Lesen: more answers will make it clear."}}  # fmt: skip
    sk = [
        {"label": "Hören", "measured": True, "placement_only": False, "status": "below", "forecast": fc["date"]},
        {"label": "Lesen", "measured": True, "placement_only": False, "status": "near", "forecast": fc["unclear"]},
    ]  # fmt: skip
    goals = {"target_date": "2027-02-01"}
    pace = {"measured": True, "hours_per_week": 3.0}
    today = local_date(utcnow())
    ms = rd.milestone(goals, sk, pace, today)
    assert ms["state"] == "date" and ms["hours_needed"] == 12.0 and ms["unclear"] == ["Lesen"]
    assert ms["slowest"] == "Hören"
    ms = rd.milestone(goals, sk[1:], pace, today)
    assert ms["state"] == "unclear" and ms["hours_needed"] is None and "more answers" in ms["text"]


def test_practice_figure_leaves_out_placement_items_and_answers_before_placement(db):
    ev(db, "reading", "reading_q", "error", days_ago=20, n=10)  # before placement
    place(db, "B1.1", days_ago=10)
    ev(db, "grammar", "placement", "correct", days_ago=10, n=8, band="B1.1")
    pr = rd.readiness(db, utcnow())["practice"]
    assert pr["n"] == 0 and pr["mean"] is None and pr["since_placement"]
    ev(db, "reading", "reading_q", "correct", days_ago=2, n=4)
    pr = rd.readiness(db, utcnow())["practice"]
    assert pr["n"] == 4 and pr["mean"] == pytest.approx(5 / 6, abs=0.01)


def test_move_up_needs_enough_practised_skills(db):
    place(db, "B1.1")
    ev(db, "reading", "reading_q", "correct", n=60)
    mu = rd.readiness(db, utcnow())["move_up"]
    assert not mu["ready"] and mu["text"].startswith("1 of 1 practised skills")


def test_unknown_level_label_counts_as_not_placed(db):
    place(db, "C1")
    lv = rd.readiness(db, utcnow())["level"]
    assert (
        lv["label"] is None
        and lv["passed"] == []
        and not lv["goal_reached"]
        and lv["taken"] is None
    )


def test_b2_class_counts_every_band_passed(db):
    place(db, "B2.1")
    lv = rd.readiness(db, utcnow())["level"]
    assert (
        lv["working_on"] is None
        and lv["passed"] == ["A2", "B1.1", "B1.2", "B2"]
        and lv["goal_reached"]
    )


def test_analysis_allows_labels_as_given_and_b1_work(db):
    place(db, "B1 Board")
    seeded(db)
    f = insight.facts(db, utcnow())

    def ok(text):
        return insight.numbers_ok(
            Insight(summary=text, strengths=[], weaknesses=[], next_steps=[]), f
        )

    assert ok("Placement put you in B1 Board.") and ok("This is B1 work.") and not ok("You are C1.")


def test_template_strengths_follow_the_range_not_the_mean(db):
    ev(db, "reading", "reading_q", "correct", n=3)
    ev(db, "reading", "reading_q", "error", n=1)  # 67 % mean, wide range: not at the line
    out = insight.template(insight.facts(db, utcnow()))
    assert out.strengths == [] and "0 of 1 practised skills" in out.summary
