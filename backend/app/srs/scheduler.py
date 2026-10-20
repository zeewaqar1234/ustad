"""FSRS wrapper (py-fsrs v6, desired retention 0.90). Do not hand-roll SM-2 (docs/pedagogy.md P2)."""

from datetime import datetime

from fsrs import Card as FsrsCard
from fsrs import Rating, Scheduler, State

from app.models import Card

DESIRED_RETENTION = 0.90

scheduler = Scheduler(desired_retention=DESIRED_RETENTION)


def to_fsrs(card: Card) -> FsrsCard:
    if card.state is None:
        return FsrsCard(card_id=card.id, due=card.due)
    return FsrsCard(
        card_id=card.id,
        state=State(card.state),
        step=card.step,
        stability=card.stability,
        difficulty=card.difficulty,
        due=card.due,
        last_review=card.last_review,
    )


def introduce(card: Card, now: datetime, due: datetime | None = None) -> None:
    """Make a taught card schedulable. FSRS starts it in Learning, step 0."""
    fc = FsrsCard(card_id=card.id, due=due or now)
    card.introduced_at = now
    card.due = fc.due
    card.state = fc.state.value
    card.step = fc.step


def review(card: Card, rating: int, now: datetime, sched: Scheduler = scheduler) -> None:
    """Apply one review to `card` in place."""
    fc, _ = sched.review_card(to_fsrs(card), Rating(rating), review_datetime=now)
    if card.state == State.Review.value and rating == Rating.Again:
        card.lapses += 1
    card.reps += 1
    card.state = fc.state.value
    card.step = fc.step
    card.stability = fc.stability
    card.difficulty = fc.difficulty
    card.due = fc.due
    card.last_review = fc.last_review
