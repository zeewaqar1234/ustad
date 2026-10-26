"""Phase 4: known-word density, Diktat diff, reader API (ask before tell), Author job with the density
loop (model mocked), Diktat API, Commute Podcast (fake Piper writing real WAVs), nightly job."""

import stat
import wave
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app import jobs
from app.core.clock import local_date
from app.core.config import settings
from app.db import utcnow
from app.listening import diktat, podcast
from app.llm.provider import LLMUnavailable
from app.models import (
    Attempt,
    Card,
    CostLedger,
    DayLog,
    DictationItem,
    Item,
    Mistake,
    ReadingText,
)
from app.reading import author, density
from app.reading import texts as reading
from app.srs import scheduler
from tests.test_phase2_api import PW, FakeLLM, llm  # noqa: F401  (fixture)

T = density.Tok


@pytest.fixture(autouse=True)
def no_languagetool(monkeypatch):
    from app.core import languagetool

    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


# --- density calculator (unit) ------------------------------------------------------------------


def test_density_counts_known_lemmas_and_skips_names_numbers_punct():
    toks = [T("Bilal", "Bilal", "PROPN"), T("arbeitet", "arbeiten", "VERB"), T("in", "in", "ADP"),
            T("der", "der", "DET"), T("Bank", "Bank", "NOUN"), T("seit", "seit", "ADP"),
            T("2024", "2024", "NUM"), T(".", ".", "PUNCT"), T("Die", "der", "DET"),
            T("Kollegen", "Kollege", "NOUN"), T("sind", "sein", "AUX"), T("hilfsbereit", "hilfsbereit", "ADJ")]  # fmt: skip
    d = density.measure(toks, {"arbeiten", "bank"})
    # counted: arbeitet in der Bank seit Die Kollegen sind hilfsbereit = 9 (name, number, dot skipped)
    assert d.words == 9
    assert d.known == 7  # function words count as known, arbeiten + Bank by lemma
    assert d.unknown == ["Kollege", "hilfsbereit"]
    assert d.pct == pytest.approx(77.8)


def test_density_matches_surface_form_and_lists_each_unknown_lemma_once():
    toks = [
        T("Kredite", "Kredit", "NOUN"),
        T("Kredit", "Kredit", "NOUN"),
        T("gibt", "geben", "VERB"),
    ]
    d = density.measure(toks, {"gibt"})
    assert (d.words, d.known, d.unknown) == (3, 1, ["Kredit"])


def test_density_empty_text_is_full():
    assert density.measure([], set()).ratio == 1.0


def test_density_with_spacy_lemmas():
    known = density.lemmas_of(["arbeiten", "die Bank", "der Kollege", "nett"])
    d = density.text_density("Ich arbeite in der Bank. Meine Kollegen sind nett.", known)
    assert d.pct == 100.0
    d2 = density.text_density("Meine Kollegen sind hilfsbereit.", known)
    assert d2.unknown == ["hilfsbereit"] and d2.words == 4


# --- Diktat diff (unit) -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("given", "expected", "kind"),
    [
        ("Strasse", "Straße", "umlaut"), ("Muller", "Müller", "umlaut"), ("Mueller", "Müller", "umlaut"),
        ("fur", "für", "umlaut"), ("Mädchen", "Madchen", "umlaut"),
        ("ihnen", "Ihnen", "capital"), ("termin", "Termin", "capital"), ("Gestern", "gestern", "capital"),
        ("einen", "einem", "ending"), ("gute", "guten", "ending"), ("neu", "neue", "ending"),
        ("arbeite", "arbeitet", "ending"),
        ("Kollegen", "Kollegin", "spelling"), ("Haus", "Häuser", "spelling"),
        ("Arzt.", "Arzt", "ok"),
        ("den", "dem", "ending"), ("ihn", "ihm", "ending"), ("die", "der", "ending"),
        ("mus", "muss", "spelling"), ("Komen", "Kommen", "spelling"),
    ],
)  # fmt: skip
def test_diktat_word_kinds(given, expected, kind):
    assert diktat.classify(given, expected) == kind


def test_diktat_diff_aligns_missing_extra_and_scores_words():
    r = diktat.check("ich habe einen termin mit dem Arzt", "Ich habe einen Termin beim Arzt.")
    kinds = [(w["given"], w["expected"], w["kind"]) for w in r["words"]]
    assert ("ich", "Ich", "capital") in kinds and ("termin", "Termin", "capital") in kinds
    assert ("mit", "beim", "spelling") in kinds and ("dem", None, "extra") in kinds
    # 3 ok of 6 expected words + 1 extra
    assert r["counts"]["ok"] == 3 and r["accuracy"] == pytest.approx(round(100 * 3 / 7, 1))
    assert r["diff"] and all(op in ("equal", "insert", "delete") for op, _ in r["diff"])


def test_diktat_missing_word_and_perfect():
    r = diktat.check("Ich gehe nach Hause", "Ich gehe heute nach Hause.")
    assert [w["kind"] for w in r["words"]] == ["ok", "ok", "missing", "ok", "ok"]
    assert diktat.check("Wir fahren mit der Bahn.", "Wir fahren mit der Bahn.")["accuracy"] == 100


# --- reader API ---------------------------------------------------------------------------------


@pytest.fixture
def api(client):
    assert client.post("/auth/login", json={"password": PW}).status_code == 200
    return client


def test_texts_list_loads_seed_texts_and_offers_two_unread(api):
    r = api.get("/api/texts").json()
    assert len(r["library"]) >= 6 and len(r["today"]) == 2
    s = r["today"][0]
    assert {"id", "title", "known_pct", "words", "read", "status"} <= s.keys()
    assert 120 <= s["words"] <= 250


def test_text_detail_hides_answers_until_attempt(api):
    tid = api.get("/api/texts").json()["today"][0]["id"]
    t = api.get(f"/api/texts/{tid}").json()
    assert len(t["questions"]) == 3 and all("answer" not in q for q in t["questions"])
    assert t["credit"] and t["licence"] and t["result"] is None
    assert t["density"]["words"] > 100 and all("de" in s and "en" in s for s in t["sentences"])


def test_answers_scored_once_and_kept(api, session_factory):
    tid = api.get("/api/texts").json()["today"][0]["id"]
    s = session_factory()
    qs = s.get(ReadingText, tid).questions_json
    right = {q["id"]: q["answer"] for q in qs}
    wrong = {**right, qs[0]["id"]: [1 - qs[0]["answer"][0]]}  # rf wrong
    res = api.post(
        f"/api/texts/{tid}/answers", json={"answers": wrong, "elapsed_ms": 300_000}
    ).json()
    slots = sum(len(q["answer"]) for q in qs)
    assert res["score"] == round(100 * (slots - 1) / slots)
    assert res["results"][0]["correct"] is False and res["results"][0]["answer"] == qs[0]["answer"]
    again = api.post(f"/api/texts/{tid}/answers", json={"answers": right}).json()
    assert again == res  # first attempt is kept
    s.expire_all()
    t = s.get(ReadingText, tid)
    assert t.read_at is not None
    day = s.get(DayLog, local_date(utcnow()))
    assert day.minutes == pytest.approx(5.0)  # 5 active minutes, not capped at 1 for reading
    assert (
        s.scalar(select(func.count()).select_from(Attempt).where(Attempt.task_ref == f"text:{tid}"))
        == 1
    )
    assert api.get("/api/texts").json()["today"][0]["id"] != tid  # read text leaves "today"


def test_gloss_from_text_glossary_and_add_to_srs(api, session_factory):
    t = api.get("/api/texts").json()["today"][0]
    s = session_factory()
    g0 = s.get(ReadingText, t["id"]).glossary_json[0]
    g = api.get("/api/texts/gloss", params={"word": g0["word"], "text_id": t["id"]}).json()
    assert g["lemma"] == g0["lemma"] and g["en"] == g0["en"] and g["in_srs"] is False
    r = api.post(f"/api/texts/{t['id']}/add",
                 json={"word": g0["word"], "lemma": g0["lemma"], "en": g0["en"], "gender": g0["gender"]})  # fmt: skip
    assert r.json()["added"] is True
    item = s.get(Item, r.json()["item_id"])
    assert item.deck == "reader" and item.de == g0["lemma"] and item.example_de
    assert item.cards and all(c.introduced_at is not None for c in item.cards)
    again = api.post(f"/api/texts/{t['id']}/add", json={"word": g0["word"], "en": g0["en"]}).json()
    assert again == {"item_id": item.id, "added": False}
    g2 = api.get("/api/texts/gloss", params={"word": g0["word"], "text_id": t["id"]}).json()
    assert g2["in_srs"] is True and g2["known"] is True


def test_gloss_lemma_from_sentence_context_and_no_meaning_without_glossary(api):
    tid = next(
        t["id"]
        for t in api.get("/api/texts").json()["library"]
        if t["title"] == "Bilals erster Tag"
    )
    g = api.get("/api/texts/gloss", params={"word": "Jahre,", "text_id": tid}).json()
    assert (g["word"], g["lemma"], g["en"]) == ("Jahre", "Jahr", None)
    bank = api.get("/api/texts/gloss", params={"word": "Bank", "text_id": tid}).json()
    # spaCy's guess from context is shown apart and never stored as fact
    assert bank["gender"] is None and bank["gender_guess"] == "f"


def test_known_pct_rises_when_words_are_taught(api, session_factory):
    t = api.get("/api/texts").json()["today"][0]
    before = t["known_pct"]
    s = session_factory()
    for n, lemma in enumerate(api.get(f"/api/texts/{t['id']}").json()["density"]["unknown"][:10]):
        it = Item(deck="work", unit=1, unit_order=n, unit_title="t", kind="word", de=lemma, en="x")
        s.add(it)
        s.flush()
        c = Card(item_id=it.id, card_type="produce")
        s.add(c)
        s.flush()
        scheduler.introduce(c, utcnow())
    s.commit()
    after = next(x for x in api.get("/api/texts").json()["library"] if x["id"] == t["id"])[
        "known_pct"
    ]
    assert after > before


# --- Author job (model mocked) ------------------------------------------------------------------


def draft(topic="serial", episode=None, sentences=None):
    sentences = sentences or [
        "Bilal arbeitet in der Bank.", "Er trinkt jeden Morgen Tee.", "Die Kollegen sind nett.",
        "Am Abend fährt er nach Hause.", "Er lernt jeden Tag Deutsch.",
    ]  # fmt: skip
    return {
        "title": "Ein Tag", "topic": topic, "level": "B1.1", "series_episode": episode,
        "sentences": [{"de": s, "en": "in English"} for s in sentences],
        "glossary": [{"word": "Bank", "lemma": "Bank", "en": "bank", "gender": "f", "plural": "Banken"}],
        "questions": [
            {"id": "q1", "kind": "rf", "prompt": "Bilal trinkt Kaffee.", "options": ["richtig", "falsch"], "answer": [1]},
            {"id": "q2", "kind": "mc", "prompt": "Was trinkt Bilal?", "options": ["Tee", "Kaffee", "Wasser"], "answer": [0]},
            {"id": "q3", "kind": "match", "prompt": "Was passt?", "left": ["Am Morgen", "Am Abend"],
             "options": ["trinkt er Tee.", "fährt er nach Hause.", "schläft er."], "answer": [0, 1]},
        ],
    }  # fmt: skip


@pytest.fixture
def known_all(monkeypatch):
    """Zee knows every word of the default draft (so its density is 100 %)."""
    words = density.lemmas_of([" ".join(s["de"] for s in draft()["sentences"])])
    monkeypatch.setattr(author, "known_words", lambda db: words)
    return words


def test_author_regenerates_once_when_too_easy_and_keeps_closer(db, llm, known_all):  # noqa: F811
    base = [x["de"] for x in draft()["sentences"]]
    harder = draft(sentences=[*base, "Er trinkt den Tee im Büro."])  # one new word: Büro
    llm.queue += [draft(), harder]
    t = author.write_text(db, llm, "serial", utcnow().date())
    # 100 % is above the 93-99 % band: one regeneration with feedback; the second is closer
    assert len(llm.queue) == 0
    assert "Büro" in t.body_de and 0.93 <= t.known_density < 1.0
    assert t.series_episode == 1 and t.kind == "generated" and t.status == "ok"
    assert t.licence and t.credit
    rows = db.scalars(select(CostLedger).where(CostLedger.model.like("%(author)%"))).all()
    assert len(rows) == 2 and all(r.eur == 0 for r in rows)


def test_author_feedback_names_unknown_words(db, llm, monkeypatch):  # noqa: F811
    monkeypatch.setattr(author, "known_words", lambda db: set())
    seen = []
    orig = llm.chat
    llm.chat = lambda messages, schema, **kw: (seen.append(messages), orig(messages, schema, **kw))[
        1
    ]
    llm.queue += [draft(), draft()]
    author.write_text(db, llm, "markets", None)
    assert "Too hard" in seen[1][-1]["content"] and "trinken" in seen[1][-1]["content"]


def test_author_in_range_no_regeneration_and_languagetool_flags(db, llm, monkeypatch):  # noqa: F811
    from app.core import languagetool

    d = draft()
    text = " ".join(s["de"] for s in d["sentences"])
    toks = density.tokens(text)
    counted = [t for t in toks if t.pos not in density.SKIP_POS and density._WORD.search(t.surface)]
    # know all but one of the counted content words -> about 95 %
    content = [t for t in counted if t.pos not in density.KNOWN_POS]
    known = {t.lemma.lower() for t in content[1:]}
    monkeypatch.setattr(author, "known_words", lambda db: known)
    monkeypatch.setattr(author, "DENSITY_RANGE", (90.0, 99.0))
    monkeypatch.setattr(
        languagetool,
        "check",
        lambda text, **kw: (
            [{"rule": {"id": "X"}, "message": "flag", "replacements": []}] if "Tee" in text else []
        ),
    )
    llm.queue.append(d)
    t = author.write_text(db, llm, "serial", None)
    assert 90 <= 100 * t.known_density <= 99
    assert t.status == "needs_review" and t.review_notes[0]["message"] == "flag"


def test_author_ensure_two_per_day_serial_continues(db, llm, known_all):  # noqa: F811
    today = utcnow().date()
    llm.queue += [draft()] * 8
    made = author.ensure(db, llm, today, days=2)
    assert len(made) == 4
    assert [t.topic for t in made] == [
        *author.topics_for(today),
        *author.topics_for(today + timedelta(days=1)),
    ]
    serial = [t.series_episode for t in made if t.topic == "serial"]
    assert serial == [3, 4]  # seed episodes 1 and 2 exist
    assert author.ensure(db, llm, today, days=2) == []  # filled: nothing more


def test_generate_endpoint_offline_returns_503(api, llm):  # noqa: F811
    r = api.post("/api/texts/generate")
    assert r.status_code == 503 and "offline" in r.json()["detail"]


def test_today_prefers_generated_texts(api, session_factory):
    s = session_factory()
    reading.ensure_seed(s)
    d = draft()
    s.add(ReadingText(kind="generated", title="Heute", topic="serial", body_de="Text heute.",
                      sentences_json=d["sentences"], questions_json=d["questions"],
                      for_date=local_date(utcnow())))  # fmt: skip
    s.commit()
    assert [t["title"] for t in api.get("/api/texts").json()["today"]] == ["Heute"]


def test_nightly_job_survives_offline_model(monkeypatch, session_factory):
    monkeypatch.setattr(jobs, "SessionLocal", session_factory)

    class Down:
        vendor, model = "ollama", "down"

        def chat(self, *a, **kw):
            raise LLMUnavailable("connection refused")

    monkeypatch.setattr(jobs, "OllamaProvider", Down)
    assert jobs.nightly_author() == 0


def test_jobs_off_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "jobs_enabled", False)
    assert jobs.start() is None


def test_jobs_schedule_author_nightly_and_catch_up_at_startup(monkeypatch):
    ran = []
    monkeypatch.setattr(jobs, "nightly_author", lambda: ran.append(1) or 0)
    monkeypatch.setattr(settings, "jobs_enabled", True)
    sched = jobs.start()
    try:
        job = sched.get_job("author")
        assert job is not None and "hour='3'" in str(job.trigger)
        import time

        for _ in range(50):  # the one-off catch-up runs right after start
            if ran:
                break
            time.sleep(0.05)
        assert ran == [1]
    finally:
        sched.shutdown(wait=False)


# --- Diktat API ---------------------------------------------------------------------------------


def test_diktat_today_five_fixed_and_check(api, session_factory):
    a = api.get("/api/dictation/today").json()
    assert a["total"] == 5 and a["done"] == 0
    assert all(4 <= len(s["say"].split()) <= 14 for s in a["sentences"])
    assert (
        api.get("/api/dictation/today").json()["sentences"] == a["sentences"]
    )  # fixed for the day
    first = a["sentences"][0]
    r = api.post("/api/dictation/check", json={"ref": first["ref"], "typed": first["say"].lower(),
                                               "replays": 2})  # fmt: skip
    res = r.json()
    assert res["expected"] == first["say"] and res["replays"] == 2
    again = api.post(
        "/api/dictation/check", json={"ref": first["ref"], "typed": first["say"]}
    ).json()
    assert again == res  # first attempt kept
    assert api.get("/api/dictation/today").json()["done"] == 1
    assert (
        api.post("/api/dictation/check", json={"ref": "item:999999", "typed": "x"}).status_code
        == 404
    )
    s = session_factory()
    att = s.scalar(select(Attempt).where(Attempt.task_ref == f"diktat:{first['ref']}"))
    assert att is not None and att.score == res["accuracy"]


def test_diktat_prefers_taught_items(db):
    for n in range(6):
        it = Item(deck="work", unit=1, unit_order=n, unit_title="t", kind="chunk", de=f"chunk {n}",
                  en="x", example_de=f"Ich schreibe heute die Mail Nummer {n}.", status="ok")  # fmt: skip
        db.add(it)
        db.flush()
        c = Card(item_id=it.id, card_type="produce")
        db.add(c)
        db.flush()
        if n < 3:
            scheduler.introduce(c, utcnow())
    rows = diktat.todays(db, utcnow().date())
    refs = [r.ref for r in rows]
    taught = [r for r in refs if r.startswith("item:")]
    assert len(taught) == 3 and len(rows) == 5  # never the 3 untaught items
    assert db.scalar(select(func.count()).select_from(DictationItem)) == 5


# --- Commute Podcast ----------------------------------------------------------------------------

FAKE_PIPER = """#!/usr/bin/env python3
# fake piper: --model M --output_file F [--length_scale X], text on stdin -> 0.1 s of audio per word
import sys, wave
args = sys.argv[1:]
out = args[args.index("--output_file") + 1]
words = len(sys.stdin.read().split())
rate = 16000 if "en_" in args[args.index("--model") + 1] else 22050
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    w.writeframes(b"\\x01\\x00" * int(rate * 0.1 * words))
"""


@pytest.fixture
def piper(monkeypatch, tmp_path):
    fake = tmp_path / "piper"
    fake.write_text(FAKE_PIPER)
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setattr(settings, "piper_bin", str(fake))
    monkeypatch.setattr(settings, "piper_model", "de_DE-thorsten-medium.onnx")
    monkeypatch.setattr(settings, "piper_model_en", "")
    monkeypatch.setattr(settings, "audio_dir", tmp_path / "audio")
    return fake


def _taught_item(db, n, de):
    it = Item(
        deck="work", unit=1, unit_order=n, unit_title="t", kind="sentence", de=de, en=f"en {n}"
    )
    db.add(it)
    db.flush()
    c = Card(item_id=it.id, card_type="produce")
    db.add(c)
    db.flush()
    scheduler.introduce(c, utcnow())
    return it


def test_wav_join_adds_silence_exactly(tmp_path):
    a = tmp_path / "a.wav"
    with wave.open(str(a), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"\x01\x00" * 22050)  # 1 s
    out = tmp_path / "out.wav"
    assert podcast.join([a, 2.5, a], out) == pytest.approx(4.5)
    with wave.open(str(out), "rb") as r:
        assert r.getnframes() == round(22050 * 4.5)


def test_podcast_script_mistakes_then_sentences_with_pauses(db):
    _taught_item(db, 1, "Ich habe morgen einen Termin.")
    yesterday = utcnow() - timedelta(days=1)
    db.add(Mistake(ts=yesterday, last_ts=yesterday, source="homework", orig="Ich habe gegangen.",
                   fix="Ich bin gegangen.", tag="AUX_HABEN_SEIN"))  # fmt: skip
    db.flush()
    segs = podcast.script(db, local_date(utcnow()))
    kinds = [s.kind for s in segs]
    texts = [s.text for s in segs]
    assert "Falsch: Ich habe gegangen." in texts and "Richtig: Ich bin gegangen." in texts
    assert texts.index("Falsch: Ich habe gegangen.") < texts.index("Ich habe morgen einen Termin.")
    # every prompt/answer to think about is followed by a pause; no English without an English voice
    assert kinds.count("pause") >= 4 and all(s.lang == "de" for s in segs)
    assert podcast._estimate(segs) <= podcast.MAX_S


def test_podcast_script_english_prompts_with_english_voice(db, monkeypatch):
    monkeypatch.setattr(settings, "piper_model_en", "en_US-lessac-medium.onnx")
    _taught_item(db, 1, "Ich habe morgen einen Termin.")
    segs = podcast.script(db, local_date(utcnow()))
    i = next(i for i, s in enumerate(segs) if s.lang == "en")
    assert (
        segs[i].text == "en 1"
        and segs[i + 1].kind == "pause"
        and segs[i + 2].text.startswith("Ich habe")
    )


def test_podcast_target_length_10_to_20_minutes(db):
    for n in range(300):
        _taught_item(
            db, n, f"Heute schreibe ich meinem Kollegen eine kurze Nachricht über Projekt {n}."
        )
    est = podcast._estimate(podcast.script(db, local_date(utcnow())))
    assert podcast.TARGET_S <= est <= podcast.MAX_S


def test_podcast_needs_piper(api, monkeypatch):
    monkeypatch.setattr(settings, "piper_bin", "")
    assert api.get("/api/podcast/status").json()["piper"] is False
    assert api.post("/api/podcast/build").status_code == 503
    assert api.get("/api/podcast/script").json()["items"][0]["kind"] == "title"


def test_podcast_nothing_to_read_is_422(api, piper):
    assert api.post("/api/podcast/build").status_code == 422


def test_podcast_build_serves_audio_and_writes_ledger(api, piper, monkeypatch, session_factory):
    s = session_factory()
    _taught_item(s, 1, "Ich habe morgen einen Termin.")
    _taught_item(s, 2, "Kannst du mir bitte helfen?")
    s.commit()
    monkeypatch.setattr(settings, "piper_model_en", "en_US-lessac-medium.onnx")  # 16 kHz: resampled
    r = api.post("/api/podcast/build")
    assert r.status_code == 200, r.text
    ep = r.json()
    assert ep["format"] == ("mp3" if podcast.ffmpeg() else "wav")
    assert ep["duration_s"] > 2 * podcast.THINK_S and ep["url"].endswith("/audio")
    audio = api.get(ep["url"])
    assert audio.status_code == 200 and audio.headers["content-type"].startswith("audio/")
    assert api.get("/api/podcast/status").json()["latest"]["id"] == ep["id"]
    ep2 = api.post("/api/podcast/build").json()  # rebuild replaces today's episode
    assert ep2["id"] != ep["id"] and api.get(ep["url"]).status_code == 404
    s.expire_all()
    assert (
        s.scalar(select(func.count()).select_from(CostLedger).where(CostLedger.vendor == "piper"))
        > 3
    )
    files = list(Path(settings.audio_dir, "podcast").iterdir())
    assert len(files) == 1


def test_first_visit_parallel_requests_do_not_collide(api):
    """Home asks for texts and Diktat at the same moment on a fresh DB (seen as a 500 in e2e)."""
    from concurrent.futures import ThreadPoolExecutor

    urls = ["/api/texts", "/api/dictation/today"] * 4
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda u: api.get(u).status_code, urls))
    assert codes == [200] * 8
    assert api.get("/api/dictation/today").json()["total"] == 5


def test_diktat_capital_counted_with_an_ending():
    r = diktat.check("gute Morgen", "Guten Morgen")
    assert r["words"][0]["kind"] == "ending" and r["words"][0]["capital"] is True
    assert r["counts"]["capital"] == 1 and r["counts"]["ending"] == 1


def test_author_keeps_first_draft_when_regeneration_fails(db, llm, known_all):  # noqa: F811
    llm.queue += [draft(), {"title": "kaputt"}, {"title": "kaputt"}]  # regeneration invalid twice
    t = author.write_text(db, llm, "serial", None)
    assert t.id and "Bilal arbeitet" in t.body_de


def test_podcast_failed_rebuild_keeps_current_episode(api, piper, monkeypatch, session_factory):
    s = session_factory()
    _taught_item(s, 1, "Ich habe morgen einen Termin.")
    s.commit()
    ep = api.post("/api/podcast/build").json()
    before = api.get(ep["url"]).content

    def broken(parts, out):
        out.write_bytes(b"half")
        raise OSError("disk full")

    monkeypatch.setattr(podcast, "join", broken)
    r = api.post("/api/podcast/build")
    assert r.status_code == 503 and "failed" in r.json()["detail"]
    assert api.get(ep["url"]).content == before
    assert not list(Path(settings.audio_dir, "podcast").glob("*.build.*"))
