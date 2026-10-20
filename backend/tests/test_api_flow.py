"""End-to-end daily loop on a tiny deck: login, Manzil gate, Sabaq, reviews, streak, gate."""

from datetime import UTC, date, datetime, timedelta

from app.models import Card, DayLog, Item
from app.services.cards import card_types_for
from app.services.streak import streak_info

PW = "richtig-lang-123"


def _seed(session_factory, n=3):
    s = session_factory()
    for i in range(n):
        item = Item(
            deck="life", unit=1, unit_order=3, unit_title="Bahn", scenario="S-Bahn", kind="word",
            de=f"Straße{i}" if i else "Straße", en=f"the street {i}", alt=[], gender="f",
            plural="Straßen", pos="noun", tags=[], example_de="Die Straße ist gesperrt.",
            example_en="The street is closed.", status="ok", review_notes=[],
        )  # fmt: skip
        s.add(item)
        s.flush()
        for ct in card_types_for(item):
            s.add(Card(item_id=item.id, card_type=ct))
    s.add(
        Item(deck="work", unit=1, unit_order=1, unit_title="x", kind="chunk", de="Falsch",
             en="flagged", pos="phrase", status="needs_review", alt=[], tags=[], review_notes=[])
    )  # fmt: skip
    s.commit()
    s.close()


def _login(client):
    assert client.post("/auth/login", json={"password": PW}).status_code == 200


def test_api_requires_login(client):
    assert client.get("/api/daily").status_code == 401
    assert client.get("/api/review/next").status_code == 401
    assert client.get("/api/health").status_code == 200


def test_login_rate_limit(client):
    for _ in range(5):
        assert client.post("/auth/login", json={"password": "nope"}).status_code == 401
    assert client.post("/auth/login", json={"password": PW}).status_code == 429


def test_login_sets_httponly_cookie(client):
    r = client.post("/auth/login", json={"password": PW})
    assert "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401


def test_daily_loop(client, session_factory):
    _seed(session_factory)
    _login(client)
    d = client.get("/api/daily").json()
    assert d["manzil"]["done"] is True  # nothing due on day 1
    assert d["sabaq"]["locked"] is None
    assert d["sabaq"]["unit"]["items"] == 3  # needs_review item excluded

    sabaq = client.get("/api/sabaq").json()
    assert [i["done"] for i in sabaq["items"]] == [False] * 3
    assert all(i["reveal"] is None for i in sabaq["items"])  # ask before tell
    first = sabaq["items"][0]
    r = client.post(
        "/api/sabaq/attempt", json={"item_id": first["item_id"], "answer": "die Strasse"}
    )
    assert r.json()["grade"]["rating"] == 2
    assert r.json()["item"]["de"] == "die Straße"
    for it in sabaq["items"][1:]:
        r = client.post("/api/sabaq/attempt", json={"item_id": it["item_id"], "answer": ""})
    assert r.json()["lesson_done"] is True

    d = client.get("/api/daily").json()
    assert d["sabaq"]["done"] and d["study_day"] and d["streak"]["current"] == 1

    # produce cards are in learning (due within minutes); sibling cards wait until tomorrow
    s = session_factory()
    produce = s.query(Card).filter_by(card_type="produce").all()
    others = s.query(Card).filter(Card.card_type != "produce").all()
    assert all(c.due - c.introduced_at < timedelta(minutes=11) for c in produce)
    assert all(c.due - c.introduced_at > timedelta(hours=1) for c in others)
    for c in produce:
        c.due = datetime.now(UTC) - timedelta(seconds=1)
    s.commit()
    s.close()

    nxt = client.get("/api/review/next?block=manzil").json()
    assert nxt["card"]["mode"] == "type"
    assert "Straße" not in str(nxt["card"])  # prompt carries no answer
    ans = client.post(
        "/api/review/answer",
        json={"card_id": nxt["card"]["card_id"], "answer": "der Straße", "elapsed_ms": 4000},
    ).json()
    assert ans["rating"] == 1  # wrong article


def test_gender_card_and_max_three_reps(client, session_factory):
    _seed(session_factory, n=1)
    s = session_factory()
    now = datetime.now(UTC) - timedelta(minutes=1)
    for c in s.query(Card).filter(Card.item.has(Item.status == "ok")):
        c.introduced_at, c.due, c.state, c.step = now, now, 1, 0
    s.commit()
    gender_id = s.query(Card).filter_by(card_type="gender").one().id
    s.close()
    _login(client)
    r = client.post("/api/review/answer", json={"card_id": gender_id, "answer": "die"}).json()
    assert r["rating"] == 3
    shown = []
    for _ in range(12):
        nxt = client.get("/api/review/next?block=manzil").json()["card"]
        if nxt is None:
            break
        shown.append(nxt["card_id"])
        body = {"card_id": nxt["card_id"], "answer": "", "self_rating": 1}
        client.post("/api/review/answer", json=body)
    # 3 cards, each failed: at most 3 showings per card per day, then back to the scheduler
    assert all(shown.count(cid) + (cid == gender_id) <= 3 for cid in set(shown))


def test_streak_freezes(db):
    today = date(2026, 10, 22)  # Thursday
    for d in [date(2026, 10, 16), date(2026, 10, 17), date(2026, 10, 18), date(2026, 10, 20)]:
        db.add(DayLog(date=d, study_day=True, minutes=20))
    db.commit()
    # Mon 19 missed (freeze), Wed 21 missed (freeze), today not yet studied: streak alive
    info = streak_info(db, today)
    assert info["current"] == 4
    assert info["freezes_left"] == 0
    assert db.get(DayLog, date(2026, 10, 19)).freeze_used


def test_streak_breaks_after_third_miss_in_a_week(db):
    for d in [date(2026, 10, 19)]:
        db.add(DayLog(date=d, study_day=True))
    db.commit()
    # Tue, Wed, Thu missed; Fri today. Only 2 freezes a week: streak resets, freezes not wasted
    info = streak_info(db, date(2026, 10, 23))
    assert info["current"] == 0
    assert info["freezes_left"] == 2


def test_gate_endpoint(client, session_factory):
    _login(client)
    r = client.get("/api/stats/gate").json()
    assert r == {"study_days_last_7": 0, "open": False, "override": False}
