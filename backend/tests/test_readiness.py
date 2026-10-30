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


def test_empty_db_has_no_numbers(db):
    r = rd.readiness(db, utcnow())
    assert r["overall"]["mean"] is None and r["overall"]["confidence_pct"] == 0
    assert all(
        not s["measured"] and s["mean"] is None and s["status_word"] == "No evidence yet"
        for s in r["skills"]
    )
    assert r["calibration"]["n"] == 0 and "not been checked" in r["calibration"]["note"]
    assert r["milestone"]["forecast_date"] is None


def test_posterior_is_wide_with_little_evidence_and_narrows_with_practice(db):
    p0 = rd.posterior(0, 0)
    assert p0["mean"] == pytest.approx(0.5) and p0["confidence_pct"] <= 10
    ev(db, "reading", "reading_q", "correct", n=4)
    ev(db, "reading", "reading_q", "error", n=1)
    few = skills(db)["reading"]
    ev(db, "reading", "reading_q", "correct", n=32)
    ev(db, "reading", "reading_q", "error", n=8)
    many = skills(db)["reading"]
    assert few["confidence_pct"] < many["confidence_pct"]
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
    assert p["confidence_pct"] == round(100 * (1 - (p["hi"] - p["lo"])))


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
    assert s["listening"]["confidence_pct"] < s["reading"]["confidence_pct"]
    assert s["listening"]["proxy"] and "not comprehension" in s["listening"]["proxy"]
    ev(db, "speaking", "shadow", "correct", n=10)
    assert skills(db)["speaking"]["confidence_pct"] < s["reading"]["confidence_pct"]


def test_status_against_the_line(db):
    ev(db, "reading", "reading_q", "correct", n=60)
    ev(db, "grammar", "drill", "error", n=60)
    ev(db, "writing", "homework", "correct", n=6)
    ev(db, "writing", "homework", "error", n=4)
    s = skills(db)
    assert s["reading"]["status"] == "at_or_above" and "60%" in s["reading"]["status_word"]
    assert s["grammar"]["status"] == "below"
    assert s["writing"]["status"] == "near"


def test_overall_confidence_counts_unmeasured_skills_as_zero(db):
    ev(db, "reading", "reading_q", "correct", n=30)
    r = rd.readiness(db, utcnow())
    one = skills(db)["reading"]["confidence_pct"]
    assert r["overall"]["measured"] == 1 and r["overall"]["of"] == 6
    assert r["overall"]["confidence_pct"] == round(one / 6)


def test_vocab_uses_the_word_list_count_when_the_file_exists(db, tmp_path):
    (tmp_path / "goethe_b1_wortliste.txt").write_text("Bahnhof\nweil\nlernen\nHaus\n")
    from app.models import Card, Item

    for i, de in enumerate(("der Bahnhof", "weil", "lernen")):
        it = Item(deck="w", unit=1, unit_order=i, unit_title="u", kind="word", de=de, en="x")
        db.add(it)
        db.flush()
        db.add(
            Card(
                item_id=it.id,
                card_type="recog",
                introduced_at=utcnow(),
                stability=40.0 if i < 2 else 1.0,
            )
        )
    db.commit()
    v = skills(db)["vocab"]
    assert v["census"] and v["mean"] == pytest.approx(2 / 4) and v["n"] == 2
    assert v["status"] == "indicator" and v["status_word"] == "2 of 4 list words mature"
    r = rd.readiness(db, utcnow())  # a word count is not part of the overall and has no pass line
    assert (
        r["overall"]["measured"] == 0 and r["overall"]["of"] == 5 and r["overall"]["mean"] is None
    )


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


def test_level_label_is_the_placement_result(db):
    assert rd.level_info(db)["label"] is None
    db.add(Profile(id=1, level_band="B1.1")) if db.get(Profile, 1) is None else setattr(
        db.get(Profile, 1), "level_band", "B1.1"
    )
    db.add(PlacementResult(answers={}, by_band={}, level_band="B1.1"))
    db.commit()
    info = rd.level_info(db)
    assert (
        info["label"] == "B1.1" and info["taken"] and "Not an official CEFR result" in info["note"]
    )


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
        summary=f"Overall readiness is {f['overall']['readiness_pct']}%.",
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
    reply = {"summary": f"Readiness is {f['overall']['readiness_pct']}%.", "strengths": ["Lesen is strong."],
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


def test_word_list_count_neither_inflates_confidence_nor_enters_the_analysis(db, tmp_path):
    (tmp_path / "goethe_b1_wortliste.txt").write_text("Bahnhof\nweil\n")
    from app.models import Card, Item

    it = Item(deck="w", unit=1, unit_order=1, unit_title="u", kind="word", de="weil", en="x")
    db.add(it)
    db.flush()
    db.add(Card(item_id=it.id, card_type="recog", introduced_at=utcnow(), stability=40.0))
    db.commit()
    seeded(db)
    r = rd.readiness(db, utcnow())
    vocab = {s["skill"]: s for s in r["skills"]}["vocab"]
    assert vocab["confidence_pct"] == 0 and r["overall"]["of"] == 5
    scored = [s for s in r["skills"] if s["status"] != "indicator"]
    assert r["overall"]["confidence_pct"] == round(sum(s["confidence_pct"] for s in scored) / 5)
    f = insight.facts(db, utcnow())
    v = {s["skill"]: s for s in f["skills"]}["Wortschatz"]
    assert v["readiness_pct"] is None and v["range_pct"] is None and v["list_words_mature"] == 1
    out = insight.template(f)
    assert "None" not in out.summary and not any("Wortschatz" in w for w in out.weaknesses)


def test_template_with_only_a_word_count_says_no_evidence(db, tmp_path):
    (tmp_path / "goethe_b1_wortliste.txt").write_text("Bahnhof\n")
    out = insight.template(insight.facts(db, utcnow()))
    assert "None" not in out.summary and "No skill has evidence yet" in out.summary


def test_analysis_numbers_must_belong_to_the_skill_named_in_the_sentence(db):
    seeded(db)
    f = insight.facts(db, utcnow())
    sk = {s["skill"]: s for s in f["skills"]}
    lesen, schreiben = sk["Lesen"]["readiness_pct"], sk["Schreiben"]["readiness_pct"]
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


def test_overall_is_partial_until_every_scored_skill_has_evidence(db):
    ev(db, "reading", "reading_q", "correct", n=60)
    o = rd.readiness(db, utcnow())["overall"]
    assert (
        o["status"] == "partial"
        and o["status_word"] == "Partial: 1 of 5 skills measured"
        or o["of"] == 6
    )
    assert "Partial" in o["status_word"]


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
