"""FSRS scheduling: intervals grow on Good, reset on Again (Phase 1 acceptance)."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

from fsrs import Scheduler

from app.models import Card
from app.srs import scheduler as srs

NO_FUZZ = Scheduler(desired_retention=0.9, enable_fuzzing=False)
T0 = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)


def _new_card() -> Card:
    c = Card(id=1, card_type="produce", reps=0, lapses=0)
    srs.introduce(c, T0)
    return c


def _review_chain(card: Card, ratings: list[int]) -> list[timedelta]:
    now, intervals = T0, []
    for r in ratings:
        srs.review(card, r, now, sched=NO_FUZZ)
        intervals.append(card.due - now)
        now = card.due
    return intervals


def test_desired_retention_is_090():
    assert srs.scheduler.desired_retention == 0.90


def test_intervals_increase_on_good():
    intervals = _review_chain(_new_card(), [3] * 7)
    review_phase = intervals[2:]  # first two Goods walk the learning steps (1 min, 10 min)
    assert all(b > a for a, b in pairwise(review_phase)), intervals
    assert review_phase[0] >= timedelta(days=1)
    assert review_phase[-1] > timedelta(days=30)


def test_again_resets_interval_and_counts_lapse():
    card = _new_card()
    intervals = _review_chain(card, [3] * 5)
    assert intervals[-1] > timedelta(days=7)
    stability_before = card.stability
    srs.review(card, 1, card.due, sched=NO_FUZZ)
    assert card.lapses == 1
    assert card.state == 3  # relearning
    assert card.due - card.last_review <= timedelta(minutes=10)
    assert card.stability < stability_before


def test_again_on_new_card_stays_in_learning():
    card = _new_card()
    srs.review(card, 1, T0, sched=NO_FUZZ)
    assert card.state == 1
    assert card.due - T0 <= timedelta(minutes=1)
    assert card.lapses == 0


def test_hard_gives_shorter_interval_than_good():
    a, b = _new_card(), _new_card()
    _review_chain(a, [3, 3, 3])
    _review_chain(b, [3, 3, 3])
    now = a.due
    srs.review(a, 2, now, sched=NO_FUZZ)
    srs.review(b, 3, now, sched=NO_FUZZ)
    assert a.due < b.due
