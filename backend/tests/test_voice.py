"""Phase 3 voice tutor: disfluency stripping, shadowing word match, the turn pipeline with 3 fixture
transcripts (model mocked), "Say it better" review -> Ghalti, fallbacks, recitation by voice, Piper TTS,
and the stammer rules (fluency hidden when the setting is off; the server never ends a turn)."""

import json
import stat
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app import content
from app.core import languagetool
from app.core.config import settings
from app.llm.provider import LLMUnavailable, get_provider
from app.main import app
from app.models import Card, CostLedger, Item, Mistake, VoiceTurn
from app.services import recitation as rec
from app.srs import scheduler
from app.voice import shadowing
from app.voice.disfluency import clean
from tests.test_phase2_api import PW, FakeLLM

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "voice" / "transcripts.json").read_text()
)["fixtures"]
APP_DIR = Path(__file__).resolve().parents[1] / "app"


class RecordingLLM(FakeLLM):
    def __init__(self):
        super().__init__()
        self.calls: list[list[dict]] = []

    def chat(self, messages, schema):
        self.calls.append(messages)
        return super().chat(messages, schema)


@pytest.fixture
def llm():
    fake = RecordingLLM()
    app.dependency_overrides[get_provider] = lambda: fake
    yield fake


@pytest.fixture(autouse=True)
def no_languagetool(monkeypatch):
    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


@pytest.fixture
def api(client, llm):
    assert client.post("/auth/login", json={"password": PW}).status_code == 200
    return client


# --- disfluency -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "want"),
    [
        ("Ich ich ich habe ähm gestern gearbeitet.", "Ich habe gestern gearbeitet."),
        ("ge-ge-gestern war ich müde", "gestern war ich müde"),
        ("w- w- weil ich, äh, müde bin", "weil ich müde bin"),
        ("in der in der Stadt", "in der Stadt"),
        ("Ähm. Ich komme aus Pakistan.", "Ich komme aus Pakistan."),
        (
            "Ich war in Indien und um acht Uhr zu Hause.",
            "Ich war in Indien und um acht Uhr zu Hause.",
        ),
        ("Ich g gehe heute h- h- heute nicht.", "Ich gehe heute nicht."),
    ],
)
def test_disfluencies_are_stripped_and_german_is_kept(raw, want):
    assert clean(raw) == want


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_fixture_transcripts_clean_as_expected(fx):
    assert clean(fx["raw"]) == fx["clean"]


# --- shadowing ------------------------------------------------------------------------------------


def test_shadowing_word_match():
    r = shadowing.score(
        "Meine Bahn hatte heute Verspätung.", "meine meine Bahn ähm hatte Verspaetung"
    )
    assert [w["ok"] for w in r["words"]] == [True, True, True, False, True]
    assert (r["matched"], r["total"], r["pct"]) == (4, 5, 80)
    assert (
        shadowing.score(
            "Ich habe seit 3 Tagen Halsschmerzen.", "ich habe seit drei Tagen Halsschmerzen"
        )["pct"]
        == 100
    )
    assert shadowing.score("Gilt mein Ticket noch?", "")["pct"] == 0


def test_fluency_hidden_unless_setting_on():
    scores = {"pct": 90, "fluency": 41, "pace": 2.1, "words": []}
    assert "fluency" not in shadowing.visible_scores(scores, show_fluency=False)
    assert "pace" not in shadowing.visible_scores(scores, show_fluency=False)
    assert shadowing.visible_scores(scores, show_fluency=True)["fluency"] == 41


def _introduced_item(s, de="Mein Zug hatte Verspätung.") -> Item:
    item = Item(deck="life", unit=1, unit_order=1, unit_title="Bahn", kind="sentence", de=de,
                en="My train was late.", status="ok")  # fmt: skip
    s.add(item)
    s.flush()
    card = Card(item_id=item.id, card_type="produce")
    s.add(card)
    from app.db import utcnow

    scheduler.introduce(card, utcnow())
    s.commit()
    return item


def test_shadow_api_scores_and_hides_fluency_by_default(api, session_factory, monkeypatch):
    s = session_factory()
    item = _introduced_item(s)
    s.add(Item(deck="life", unit=1, unit_order=2, unit_title="Bahn", kind="sentence",
               de="Nicht gelernt.", en="not taught", status="ok"))  # fmt: skip
    s.commit()
    got = api.get("/api/voice/shadow").json()
    assert [x["de"] for x in got["sentences"]] == [
        "Mein Zug hatte Verspätung."
    ]  # untaught item hidden
    # even if an engine returned a fluency score, the API drops it while the setting is off
    real = shadowing.score
    monkeypatch.setattr(shadowing, "score", lambda ref, tr: {**real(ref, tr), "fluency": 33})
    r = api.post(
        "/api/voice/shadow", json={"item_id": item.id, "transcript": "Mein Zug hatte Verspätung"}
    )
    assert r.status_code == 200 and r.json()["pct"] == 100
    assert "fluency" not in r.json()
    assert api.get("/api/voice/settings").json() == {"show_fluency": False, "talk_mode": "tap"}
    api.post("/api/voice/settings", json={"show_fluency": True, "talk_mode": "hold"})
    r = api.post("/api/voice/shadow", json={"item_id": item.id, "transcript": "Mein Zug"})
    assert r.json()["fluency"] == 33


# --- turn pipeline with the 3 fixtures ------------------------------------------------------------


def test_scenarios_six_roleplays_plus_free_talk():
    sc = content.load("scenarios")["scenarios"]
    assert sum(s["kind"] == "roleplay" for s in sc) == 6
    assert any(s["kind"] == "free" for s in sc)
    assert all(len(s["chunks"]) == 5 and s["status"] == "ok" for s in sc)


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_pipeline_turn_and_review(api, llm, session_factory, fx):
    sess = api.post("/api/voice/session", json={"scenario_code": fx["scenario"]}).json()
    assert sess["turns"][0]["reply_de"] and sess["turns"][0]["user"] is None  # tutor opens
    llm.queue.append(fx["reply"])
    t = api.post("/api/voice/turn", json={"session_id": sess["id"], "text": fx["raw"],
                                          "stt_restarts": 2, "elapsed_ms": 20_000}).json()  # fmt: skip
    assert t["user"] == fx["clean"]
    assert t["reply_de"] == fx["reply"]["reply_de"]
    assert t["prompt_correction"] == fx["reply"]["prompt_correction"]
    assert t["tutor_status"] == "ok" and t["needs_review"] is False
    # the model saw the cleaned transcript, never the stammered one
    sent = llm.calls[-1][-1]["content"]
    assert fx["clean"] in sent and fx["raw"] not in sent
    assert "Never interrupt" in llm.calls[-1][0]["content"]  # tutor rules in the system prompt

    orig = fx["reply"]["errors"][0]
    llm.queue.append({"lines": [{"turn": 1, "better": fx["clean"].replace(orig["orig"], orig["fix"]),
                                 "errors": [{"span": orig["orig"], "fix": orig["fix"],
                                             "tag": fx["expected_tag"], "reason_en": orig["note"]}]}],
                      "teaching_points": [orig["note"]]})  # fmt: skip
    v = api.post(f"/api/voice/session/{sess['id']}/review").json()
    assert v["status"] == "reviewed"
    line = v["review"]["lines"][0]
    assert line["said"] == fx["clean"] and line["errors"][0]["tag"] == fx["expected_tag"]
    s = session_factory()
    m = s.scalar(select(Mistake).where(Mistake.source == "voice"))
    assert m.tag == fx["expected_tag"] and m.card_id is not None
    card = s.get(Card, m.card_id)
    assert card.card_type == "fix_sentence" and card.introduced_at is not None
    turn = s.scalar(select(VoiceTurn).where(VoiceTurn.idx == 1))
    assert (
        turn.user_raw == fx["raw"] and turn.stt_restarts == 2
    )  # raw kept for the STT word-loss test
    rows = list(s.scalars(select(CostLedger)))
    assert [r.vendor for r in rows] == ["ollama", "ollama"] and all(r.eur == 0 for r in rows)
    assert rows[0].model.endswith("(tutor)") and rows[1].model.endswith("(grader)")


def test_typed_turn_is_treated_like_voice(api, llm):
    sess = api.post("/api/voice/session", json={"scenario_code": "GUPSHUP"}).json()
    llm.queue.append(FIXTURES[0]["reply"])
    t = api.post("/api/voice/turn", json={"session_id": sess["id"], "text": "Ich bin müde.",
                                          "input_mode": "text"}).json()  # fmt: skip
    assert t["input_mode"] == "text" and t["reply_de"]


def test_filler_only_turn_is_refused_not_graded(api, llm):
    sess = api.post("/api/voice/session", json={"scenario_code": "KANTINE"}).json()
    r = api.post("/api/voice/turn", json={"session_id": sess["id"], "text": "ähm äh hm"})
    assert r.status_code == 422 and not llm.calls


def test_tutor_offline_keeps_turn_and_review_is_languagetool_only(
    api, llm, session_factory, monkeypatch
):
    sess = api.post("/api/voice/session", json={"scenario_code": "BAHN_ANSCHLUSS"}).json()
    llm.queue += [LLMUnavailable("down"), LLMUnavailable("down")]
    t = api.post(
        "/api/voice/turn", json={"session_id": sess["id"], "text": "Mein Zug hat Verspätung."}
    ).json()
    assert t["tutor_status"] == "offline" and t["reply_de"] is None
    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [
        {"offset": 9, "length": 3, "message": "Tempus?", "rule": {"id": "X", "category": {"id": "GRAMMAR"}},
         "replacements": [{"value": "hatte"}]}])  # fmt: skip
    v = api.post(f"/api/voice/session/{sess['id']}/review").json()
    assert v["status"] == "lt_only" and v["review"]["source"] == "languagetool_only"
    assert v["review"]["lines"][0]["better"] == "Mein Zug hatte Verspätung."
    s = session_factory()
    assert s.scalar(select(func.count()).select_from(Mistake)) == 0  # provisional: not in Ghalti
    # model back: the review can be re-run
    llm.queue.append({"lines": [{"turn": 1, "better": "Mein Zug hat Verspätung.", "errors": []}],
                      "teaching_points": []})  # fmt: skip
    assert api.post(f"/api/voice/session/{sess['id']}/review").json()["status"] == "reviewed"


def test_generated_reply_flagged_by_languagetool_is_needs_review(api, llm, monkeypatch):
    sess = api.post("/api/voice/session", json={"scenario_code": "KANTINE"}).json()
    llm.queue.append({**FIXTURES[0]["reply"], "reply_de": "Was hast du gemacht hat?"})
    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [
        {"offset": 0, "length": 3, "message": "Satzbau", "rule": {"id": "Y"}, "replacements": []}])  # fmt: skip
    t = api.post(
        "/api/voice/turn", json={"session_id": sess["id"], "text": "Ich war zu Hause."}
    ).json()
    assert t["needs_review"] is True


def test_session_closed_after_review(api, llm):
    sess = api.post("/api/voice/session", json={"scenario_code": "KANTINE"}).json()
    assert api.post(f"/api/voice/session/{sess['id']}/review").json()["status"] == "reviewed"
    r = api.post("/api/voice/turn", json={"session_id": sess["id"], "text": "Hallo"})
    assert r.status_code == 409


def test_server_has_no_turn_timeout_or_silence_logic():
    """Stammer rule: a turn ends only when Zee sends it. No timers or silence checks in voice code."""
    src = "\n".join(
        p.read_text() for p in [*(APP_DIR / "voice").glob("*.py"), APP_DIR / "api" / "voice.py"]
    )
    for banned in (
        "silence",
        "asyncio.sleep",
        "time.sleep",
        "threading.Timer",
        "max_turn",
        "turn_timeout",
    ):
        assert banned not in src, banned
    assert (
        src.count("timeout=") == 1 and "timeout=60" in src
    )  # the only timeout: Piper's process limit


# --- recitation by voice --------------------------------------------------------------------------


def test_recitation_by_voice_passes_with_stammer_and_flags_missing_cell(api):
    t = rec.table("SEIN_PRAESENS")
    spoken = [" ".join(row) for row in t["rows"]]
    spoken[0] = "ich ich b- bin"
    r = api.post("/api/recitation/SEIN_PRAESENS/voice", json={"rows": spoken}).json()
    assert r["passed"] is True and r["wrong"] == 0
    spoken[1] = "du"  # "bist" not said
    r = api.post("/api/recitation/SEIN_PRAESENS/voice", json={"rows": spoken}).json()
    assert r["passed"] is False and r["wrong"] == 1 and r["cells"][1][1]["ok"] is False


# --- Piper TTS fallback ---------------------------------------------------------------------------


def test_tts_unavailable_without_piper(api, monkeypatch):
    monkeypatch.setattr(settings, "piper_bin", "")
    assert api.get("/api/voice/tts/status").json() == {"piper": False}
    assert api.post("/api/voice/tts", json={"text": "Hallo"}).status_code == 503


def test_tts_with_piper_caches_and_writes_ledger(api, monkeypatch, tmp_path, session_factory):
    fake = tmp_path / "piper"
    fake.write_text(
        '#!/bin/sh\n# fake piper: --model M --output_file F, text on stdin\ncat > "$4"\n'
    )
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setattr(settings, "piper_bin", str(fake))
    monkeypatch.setattr(settings, "piper_model", "de_DE-thorsten-medium.onnx")
    monkeypatch.setattr(settings, "audio_dir", tmp_path / "audio")
    r = api.post("/api/voice/tts", json={"text": "Guten Tag, wie kann ich Ihnen helfen?"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    assert r.content == b"Guten Tag, wie kann ich Ihnen helfen?"
    api.post("/api/voice/tts", json={"text": "Guten Tag, wie kann ich Ihnen helfen?"})
    s = session_factory()
    rows = list(s.scalars(select(CostLedger).where(CostLedger.vendor == "piper")))
    assert len(rows) == 1 and rows[0].eur == 0  # second call is a cache hit


def test_shadow_a_say_it_better_line(api, llm):
    sess = api.post("/api/voice/session", json={"scenario_code": "KANTINE"}).json()
    llm.queue.append(FIXTURES[0]["reply"])
    api.post("/api/voice/turn", json={"session_id": sess["id"], "text": FIXTURES[0]["raw"]})
    llm.queue.append({"lines": [{"turn": 1, "better": "Am Wochenende bin ich nach Frankfurt gefahren.",
                                 "errors": []}], "teaching_points": []})  # fmt: skip
    api.post(f"/api/voice/session/{sess['id']}/review")
    body = {
        "session_id": sess["id"],
        "turn": 1,
        "transcript": "Am Wochenende bin ich nach Frankfurt gefahren",
    }
    assert api.post("/api/voice/shadow", json=body).json()["pct"] == 100
    assert api.post("/api/voice/shadow", json={**body, "turn": 7}).status_code == 404


@pytest.mark.parametrize(
    ("raw", "want"),
    [
        ("Ich mag das, das ist gut.", "Ich mag das, das ist gut."),
        ("Ich kenne die, die hier wohnen.", "Ich kenne die, die hier wohnen."),
        ("Die Frau, die die Stelle hat", "Die Frau, die die Stelle hat"),
        ("Die Frau, die die die Stelle hat", "Die Frau, die die Stelle hat"),
        ("Ich brauche 2 20-Cent-Stücke", "Ich brauche 2 20-Cent-Stücke"),
        ("Ich glaube, äh, dass er kommt.", "Ich glaube, dass er kommt."),
    ],
)
def test_real_german_is_not_stripped(raw, want):
    assert clean(raw) == want


def test_recitation_by_voice_keeps_repeated_cells():
    t = rec.table("PRONOUNS_CASE")
    rows = rec.rows_from_speech("PRONOUNS_CASE", [" ".join(r) for r in t["rows"]])
    assert rows == [list(r) for r in t["rows"]]


def test_shadow_post_refuses_untaught_item(api, session_factory):
    s = session_factory()
    item = Item(deck="life", unit=1, unit_order=1, unit_title="x", kind="sentence", de="Geheim.",
                en="secret", status="ok")  # fmt: skip
    s.add(item)
    s.flush()
    s.add(Card(item_id=item.id, card_type="produce"))
    s.commit()
    r = api.post("/api/voice/shadow", json={"item_id": item.id, "transcript": "x"})
    assert r.status_code == 404 and "Geheim" not in r.text
