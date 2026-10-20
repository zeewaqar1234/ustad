"""Phase 1 tables (docs/architecture.md §10). Later phases add their own tables."""

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


class Profile(Base):
    __tablename__ = "profile"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), default="Zee")
    level_band: Mapped[str] = mapped_column(String(20), default="B1.1")
    explanation_lang: Mapped[str] = mapped_column(String(10), default="en")
    settings_json: Mapped[dict] = mapped_column(JSON, default=dict)
    gate_override: Mapped[bool] = mapped_column(Boolean, default=False)
    password_hash: Mapped[str | None] = mapped_column(String(200))


class AuthSession(Base):
    __tablename__ = "auth_session"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    created: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires: Mapped[datetime] = mapped_column(UTCDateTime)


class Item(Base):
    __tablename__ = "item"
    __table_args__ = (UniqueConstraint("deck", "de", name="uq_item_deck_de"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    deck: Mapped[str] = mapped_column(String(20), index=True)  # connector / work / life
    unit: Mapped[int] = mapped_column(Integer)  # unit number inside the deck (1-based)
    unit_order: Mapped[int] = mapped_column(Integer, index=True)  # global fixed Sabaq order
    unit_title: Mapped[str] = mapped_column(String(120))
    scenario: Mapped[str] = mapped_column(String(200), default="")
    kind: Mapped[str] = mapped_column(String(10))  # word / chunk / pattern / sentence
    de: Mapped[str] = mapped_column(String(200))
    en: Mapped[str] = mapped_column(String(300))
    alt: Mapped[list] = mapped_column(JSON, default=list)
    gender: Mapped[str | None] = mapped_column(String(1))  # m / f / n
    plural: Mapped[str | None] = mapped_column(String(100))
    pos: Mapped[str | None] = mapped_column(String(20))
    lemma: Mapped[str | None] = mapped_column(String(100))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    cefr: Mapped[str | None] = mapped_column(String(4))
    freq_rank: Mapped[int | None] = mapped_column(Integer)
    example_de: Mapped[str | None] = mapped_column(Text)
    example_en: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(100), default="seed:llm-authored")
    status: Mapped[str] = mapped_column(String(15), default="ok")  # ok / needs_review
    review_notes: Mapped[list] = mapped_column(JSON, default=list)  # LanguageTool messages
    cards: Mapped[list["Card"]] = relationship(back_populates="item")


class Card(Base):
    __tablename__ = "card"
    __table_args__ = (UniqueConstraint("item_id", "card_type", name="uq_card_item_type"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("item.id"), index=True)
    # recog / produce / cloze / audio / gender / plural / verbforms / fix_sentence
    card_type: Mapped[str] = mapped_column(String(15))
    introduced_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # None = not yet taught
    # FSRS state (py-fsrs Card fields); None until introduced
    due: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    state: Mapped[int | None] = mapped_column(Integer)  # 1 learning, 2 review, 3 relearning
    step: Mapped[int | None] = mapped_column(Integer)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    last_review: Mapped[datetime | None] = mapped_column(UTCDateTime)
    item: Mapped[Item] = relationship(back_populates="cards")


class ReviewLog(Base):
    __tablename__ = "review_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("card.id"), index=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1 Again, 2 Hard, 3 Good, 4 Easy
    answer_given: Mapped[str | None] = mapped_column(Text)
    auto_graded: Mapped[bool] = mapped_column(Boolean, default=True)
    elapsed_ms: Mapped[int] = mapped_column(Integer, default=0)
    block: Mapped[str] = mapped_column(String(10), default="manzil")  # manzil / sabqi / sabaq
    scheduled: Mapped[bool] = mapped_column(Boolean, default=True)  # False = practice only (Sabqi)


class Lesson(Base):
    """One Sabaq."""

    __tablename__ = "lesson"
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(10), default="chunks")  # pattern / chunks / reading
    pattern_id: Mapped[int | None] = mapped_column(Integer)
    unit_order: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    scenario: Mapped[str] = mapped_column(String(200), default="")
    items: Mapped[list] = mapped_column(JSON, default=list)  # item ids in order
    status: Mapped[str] = mapped_column(String(10), default="open")  # open / done
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class StudySession(Base):
    __tablename__ = "session"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    started: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    ended: Mapped[datetime | None] = mapped_column(UTCDateTime)
    active_s: Mapped[float] = mapped_column(Float, default=0)


class Attempt(Base):
    __tablename__ = "attempt"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("session.id"))
    ts: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    task_ref: Mapped[str] = mapped_column(String(60))
    input: Mapped[str | None] = mapped_column(Text)
    correct: Mapped[bool] = mapped_column(Boolean)
    error_tags: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[float | None] = mapped_column(Float)


class DayLog(Base):
    __tablename__ = "day_log"
    date: Mapped[date] = mapped_column(Date, primary_key=True)  # Europe/Berlin calendar day
    study_day: Mapped[bool] = mapped_column(Boolean, default=False)
    freeze_used: Mapped[bool] = mapped_column(Boolean, default=False)
    minutes: Mapped[float] = mapped_column(Float, default=0)
    manzil_done: Mapped[bool] = mapped_column(Boolean, default=False)
    sabqi_done: Mapped[bool] = mapped_column(Boolean, default=False)
    sabaq_done: Mapped[bool] = mapped_column(Boolean, default=False)


class CostLedger(Base):
    __tablename__ = "cost_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    vendor: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(80))
    units: Mapped[float] = mapped_column(Float)
    unit_type: Mapped[str] = mapped_column(String(30))
    eur: Mapped[float] = mapped_column(Float)
