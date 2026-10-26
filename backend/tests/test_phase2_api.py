"""Phase 2 API flows: pattern card, drill round, homework red-pen -> Ghalti -> fix_sentence review,
Tagebuch, recitation stages across days, placement test. The local model is faked here."""

import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core import languagetool
from app.llm.provider import LLMUnavailable, Usage, get_provider
from app.main import app
from app.models import Card, Item, Pattern, Profile
from app.services import drills
from app.services import recitation as rec
from tests.test_drills import PATTERNS
from tests.test_grader_schema import FIXTURES

PW = "richtig-lang-123"


class FakeLLM:
    vendor, model = "ollama", "fake"

    def __init__(self):
        self.queue: list = []

    def chat(self, messages, schema, **kw):
        r = self.queue.pop(0) if self.queue else LLMUnavailable("no reply queued")
        if isinstance(r, Exception):
            raise r
        return json.dumps(r), Usage(10, 10)


@pytest.fixture
def llm():
    fake = FakeLLM()
    app.dependency_overrides[get_provider] = lambda: fake
    yield fake


@pytest.fixture(autouse=True)
def no_languagetool(monkeypatch):
    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


@pytest.fixture
def api(client, session_factory, llm):
    s = session_factory()
    for p in PATTERNS[:3]:
        s.add(Pattern(**{c: getattr(p, c) for c in ("code", "order", "group", "title", "rule_en",
                         "slot_diagram", "examples_json", "common_error", "tags", "drills_json",
                         "homework")}, status="ok"))  # fmt: skip
    s.commit()
    s.close()
    assert client.post("/auth/login", json={"password": PW}).status_code == 200
    return client


def test_pattern_card_and_drill_round(api, session_factory):
    lst = api.get("/api/patterns").json()
    assert lst["current"] == "V2_STATEMENT" and len(lst["patterns"]) == 3
    card = api.get("/api/patterns/V2_STATEMENT").json()
    assert len(card["examples"]) == 3 and card["slot_diagram"]["labels"]
    rnd = api.get("/api/drills/V2_STATEMENT").json()
    s = session_factory()
    p = s.scalar(select(Pattern).where(Pattern.code == "V2_STATEMENT"))
    for d in rnd["drills"]:
        assert "answer" not in d
        if d["type"] == "free":
            continue
        exp = drills.expected(p, d["id"])
        r = api.post("/api/drills/answer", json={"drill_id": d["id"], "answer": exp.answer,
                                                  "answers": exp.answers}).json()  # fmt: skip
        assert r["correct"], d["id"]
    fin = api.post("/api/drills/V2_STATEMENT/finish", json={"started": rnd["started"]}).json()
    # everything right except the free sentence (not answered): >= 80 %
    assert fin["pct"] >= 0.8 and fin["done"]
    assert api.get("/api/patterns").json()["current"] == "V2_INVERSION"


def test_wrong_drill_answer_lands_in_ghalti(api):
    api.post("/api/drills/answer", json={"drill_id": "V2_STATEMENT:error_spot:0", "answer": "x y"})
    reg = api.get("/api/mistakes").json()
    assert reg["total"] == 1 and reg["rows"][0]["source"] == "drill"


def test_homework_red_pen_creates_fix_card_in_manzil(api, llm):
    hw = api.post("/api/homework/today").json()
    assert hw["status"] == "open" and hw["prompt"]
    fx = FIXTURES[0]
    llm.queue.append(fx["model_reply"])
    r = api.post(f"/api/homework/{hw['id']}/submit", json={"text": fx["text"]}).json()
    assert r["status"] == "graded" and r["grade"]["errors"][0]["tag"] == "VERB_FINAL"
    reg = api.get("/api/mistakes").json()
    assert reg["by_tag"] == [{"tag": "VERB_FINAL", "count": 1}]
    nxt = api.get("/api/review/next?block=manzil").json()["card"]
    assert nxt["card_type"] == "fix_sentence" and nxt["prompt"] == fx["text"]
    ans = api.post("/api/review/answer", json={"card_id": nxt["card_id"], "block": "manzil",
                                               "answer": fx["model_reply"]["corrected_text"]})  # fmt: skip
    assert ans.json()["rating"] == 3
    assert api.post(f"/api/homework/{hw['id']}/submit", json={"text": "x"}).status_code == 409


def test_homework_offline_model_gives_lt_only_and_regrade(api, llm, session_factory):
    hw = api.post("/api/homework/today").json()
    r = api.post(f"/api/homework/{hw['id']}/submit", json={"text": "Ich bin müde."}).json()
    assert r["status"] == "lt_only" and r["grade"]["source"] == "languagetool_only"
    assert api.get("/api/mistakes").json()["total"] == 0  # provisional: not in Ghalti
    llm.queue.append(FIXTURES[0]["model_reply"] | {"errors": [], "corrected_text": "Ich bin müde."})
    r = api.post(f"/api/homework/{hw['id']}/regrade").json()
    assert r["status"] == "graded"


def test_tagebuch(api, llm):
    fx = FIXTURES[2]
    llm.queue.append(fx["model_reply"])
    r = api.post("/api/homework/tagebuch", json={"text": fx["text"]}).json()
    assert r["kind"] == "tagebuch" and r["grade"]["errors"][0]["tag"] == "AUX_HABEN_SEIN"
    assert api.get("/api/homework?kind=tagebuch").json()[0]["id"] == r["id"]


def test_free_drill_uses_grader(api, llm):
    llm.queue.append(FIXTURES[0]["model_reply"])
    r = api.post("/api/drills/answer", json={"drill_id": "V2_STATEMENT:free:0",
                                             "answer": FIXTURES[0]["text"]}).json()  # fmt: skip
    assert not r["correct"] and r["grade"]["errors"]


def test_recitation_stages_open_one_per_day(db):
    code = rec.tables()[0]["code"]
    t = rec.table(code)
    d0 = date(2026, 10, 21)
    p = rec.progress(db, code)
    assert rec.shown_stage(p, d0) == 0
    assert all(c is not None for row in rec.view(t, 0)["rows"] for c in row)
    assert not rec.check(db, code, [], d0)["passed"]
    assert rec.check(db, code, t["rows"], d0)["passed"]
    assert rec.shown_stage(p, d0) == 0  # gaps only from tomorrow
    assert rec.shown_stage(p, d0 + timedelta(days=1)) == 1
    gaps = rec.view(t, 1)["rows"]
    assert any(c is None for row in gaps for c in row) and all(row[0] for row in gaps)
    rec.check(db, code, t["rows"], d0 + timedelta(days=1))
    assert rec.shown_stage(p, d0 + timedelta(days=2)) == 2
    blank = rec.view(t, 2)["rows"]
    assert all(c is None for row in blank for c in row[1:])


def test_recitation_api_hides_cells(api):
    code = api.get("/api/recitation").json()[0]["code"]
    v = api.get(f"/api/recitation/{code}").json()
    assert v["stage"] == 0
    r = api.post(f"/api/recitation/{code}", json={"rows": [["", "falsch"]]}).json()
    assert not r["passed"] and r["cells"][0][1]["expected"]


def test_placement_sets_level_and_marks_known(api, llm, session_factory):
    s = session_factory()
    s.add(Item(deck="work", unit=1, unit_order=1, unit_title="x", kind="word", de="Besprechung",
               en="meeting", gender="f", pos="noun", status="ok", alt=[], tags=[],
               review_notes=[]))  # fmt: skip
    s.flush()
    s.add(Card(item_id=s.scalar(select(Item.id)), card_type="produce"))
    s.commit()
    t = api.get("/api/placement").json()
    assert 30 <= len(t["items"]) <= 40
    assert all("answer" not in i for i in t["items"])
    from app import content

    key = {i["id"]: i["answer"] for i in content.load("placement")["items"]}
    answers = {i["id"]: key[i["id"]] for i in t["items"] if i["band"] in ("A2", "B1.1")}
    short = api.post("/api/placement", json={"answers": answers, "writing": FIXTURES[3]["text"]})
    assert short.status_code == 422  # one sentence; the sample needs 5
    llm.queue.append(FIXTURES[3]["model_reply"])  # writing sample: score 8
    writing = " ".join([FIXTURES[3]["text"]] + ["Ich arbeite in Frankfurt."] * 4)
    r = api.post("/api/placement", json={"answers": answers, "writing": writing}).json()
    assert r["level_band"] == "B1.2"  # A2 + B1.1 passed, B1.2 not
    assert r["items_marked"] >= 1
    s = session_factory()
    assert s.get(Profile, 1).level_band == "B1.2"
    item = s.scalar(select(Item).where(Item.de == "Besprechung"))
    assert item.known_from_placement and item.cards[0].introduced_at is not None
    s.close()


def test_placement_level_rule():
    from app.services.placement import level

    full = {b: {"correct": 10, "total": 10} for b in ("A2", "B1.1", "B1.2", "B2")}
    assert level(full, 9) == "B2.1"
    assert level({**full, "A2": {"correct": 5, "total": 10}}, 9) == "A2+"
    assert (
        level({**full, "B1.2": {"correct": 1, "total": 9}}, 4) == "B1.1"
    )  # weak writing: one down


def test_fix_sentence_cards_never_become_sabaq(api, llm, session_factory):
    llm.queue.append(FIXTURES[0]["model_reply"])
    hw = api.post("/api/homework/today").json()
    api.post(f"/api/homework/{hw['id']}/submit", json={"text": FIXTURES[0]["text"]})
    from app.services.daily import next_unit_order

    s = session_factory()
    assert next_unit_order(s) is None
    assert s.scalar(select(Card).where(Card.card_type == "fix_sentence")) is not None
    s.close()


def test_drills_refuse_unapproved_pattern(api, session_factory):
    s = session_factory()
    s.scalar(select(Pattern).where(Pattern.code == "W_QUESTION")).status = "needs_review"
    s.commit()
    assert api.get("/api/drills/W_QUESTION").status_code == 409
    assert api.post("/api/items/patterns/W_QUESTION/approve").json() == {"ok": True}
    assert api.get("/api/drills/W_QUESTION").status_code == 200


def test_source_files_exist():
    assert Path(__file__).resolve().parents[2].joinpath("data/seed/source/placement.json").exists()


def test_i_dont_know_is_not_a_mistake(api):
    api.post("/api/drills/answer", json={"drill_id": "V2_STATEMENT:error_spot:0", "answer": ""})
    api.post("/api/drills/answer", json={"drill_id": "V2_STATEMENT:transform:0", "answer": " "})
    assert api.get("/api/mistakes").json()["total"] == 0


def test_two_same_tag_errors_in_one_sentence_count_once(api, llm):
    text = "Ich bleibe zu Hause, weil ich bin krank und ich habe Fieber."
    reply = {"score_10": 7, "corrected_text": "x", "teaching_points": [], "model_sentence_for_srs": [],
             "errors": [{"span": "ich bin krank", "fix": "ich krank bin", "tag": "VERB_FINAL",
                         "reason_en": "r", "severity": 2},
                        {"span": "ich habe Fieber", "fix": "ich Fieber habe", "tag": "VERB_FINAL",
                         "reason_en": "r", "severity": 2}]}  # fmt: skip
    llm.queue.append(reply)
    api.post("/api/homework/tagebuch", json={"text": text})
    reg = api.get("/api/mistakes").json()
    assert reg["by_tag"] == [{"tag": "VERB_FINAL", "count": 1}]


def test_choice_hit_does_not_mark_pattern_known(db):
    from app.db import utcnow
    from app.services.placement import mark_known

    db.add(Pattern(code="VE_WEIL", order=10, group="connectors", title="t", rule_en="r"))
    db.flush()
    item = {"pattern": "VE_WEIL", "mode": "choice", "marks": []}
    mark_known(db, utcnow(), [{"ok": True, "item": item}])
    assert not db.scalar(select(Pattern)).known_from_placement
    mark_known(db, utcnow(), [{"ok": True, "item": {**item, "mode": "type"}}])
    assert db.scalar(select(Pattern)).known_from_placement


def test_untested_band_is_not_passed():
    from app.services.placement import level

    by = {b: {"correct": 10, "total": 10} for b in ("A2", "B1.1", "B1.2")}
    assert level({**by, "B2": {"correct": 0, "total": 0}}, 9) == "B1 Board"


def test_get_today_homework_does_not_write(api, session_factory):
    from app.models import Homework

    s = session_factory()
    pre = api.get("/api/homework/today").json()
    assert pre["id"] is None and pre["prompt"] and pre["status"] == "open"
    assert s.query(Homework).count() == 0
    created = api.post("/api/homework/today").json()
    assert created["id"] is not None
    assert api.post("/api/homework/today").json()["id"] == created["id"]
    assert api.get("/api/homework/today").json()["id"] == created["id"]


def test_level_band_is_null_until_placement_and_prompts_say_so(api, session_factory):
    from app.reading.author import NOT_PLACED, _learner
    from app.voice import tutor

    s = session_factory()
    assert s.get(Profile, 1).level_band is None
    assert _learner(s) == NOT_PLACED
    assert "not placed" in tutor._learner(s)
