"""Source schemas for grammar patterns, placement test and recitation tables (data/seed/source/)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.llm.schemas import ErrorTag

Group = Literal[
    "word_order", "connectors", "tenses", "modals", "cases", "verbs", "clauses", "konjunktiv",
    "passive", "future",
]  # fmt: skip


def _no_dashes(*texts: str) -> None:
    for t in texts:
        if "—" in t or "–" in t:
            raise ValueError(f"no em/en dashes: {t}")


class SlotDiagram(BaseModel):
    labels: list[str] = Field(min_length=2)
    rows: list[list[str]] = Field(min_length=1)

    @model_validator(mode="after")
    def _shape(self):
        for r in self.rows:
            if len(r) != len(self.labels):
                raise ValueError(f"slot row has {len(r)} cells, labels {len(self.labels)}")
        return self


class Example(BaseModel):
    context: Literal["work", "life", "finance_history"]
    de: str
    en: str


class ErrorItem(BaseModel):
    wrong: str
    right: str
    tag: ErrorTag
    note_en: str

    @model_validator(mode="after")
    def _differs(self):
        if self.wrong.strip() == self.right.strip():
            raise ValueError(f"wrong == right: {self.wrong}")
        return self


class Surgery(BaseModel):
    de: str
    en: str
    alt: list[str] = []

    @field_validator("de")
    @classmethod
    def _length(cls, v: str) -> str:
        if not 4 <= len(v.split()) <= 12:
            raise ValueError(f"surgery sentence should be 4-12 words: {v}")
        return v


class Transform(BaseModel):
    instruction: str
    given: str | list[str]
    answer: str
    alt: list[str] = []

    @property
    def given_list(self) -> list[str]:
        return [self.given] if isinstance(self.given, str) else self.given


class Fill(BaseModel):
    text: str
    answers: list[str] = Field(min_length=1)
    full: str

    @model_validator(mode="after")
    def _consistent(self):
        if self.text.count("___") != len(self.answers):
            raise ValueError(f"blank count != answers: {self.text}")
        filled = self.text
        for a in self.answers:
            filled = filled.replace("___", a, 1)
        if filled != self.full:
            raise ValueError(f"fill full mismatch: {filled!r} != {self.full!r}")
        return self


class Free(BaseModel):
    prompt_en: str
    must_include: list[str] = []


class Drills(BaseModel):
    surgery: list[Surgery] = Field(min_length=2, max_length=2)
    transform: list[Transform] = Field(min_length=2, max_length=2)
    tense_shift: list[Transform] = Field(default_factory=list, max_length=2)
    error_spot: list[ErrorItem] = Field(min_length=2, max_length=2)
    fill: list[Fill] = Field(default_factory=list, max_length=3)
    free: Free


class PatternSource(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9_]+$")
    order: int = Field(ge=1, le=40)
    group: Group
    title: str
    rule_en: str
    slot_diagram: SlotDiagram
    examples: list[Example] = Field(min_length=3, max_length=3)
    common_error: ErrorItem
    tags: list[ErrorTag] = Field(min_length=1, max_length=3)
    drills: Drills
    homework: str

    @model_validator(mode="after")
    def _rules(self):
        if {e.context for e in self.examples} != {"work", "life", "finance_history"}:
            raise ValueError(f"{self.code}: need one work, one life, one finance_history example")
        if (
            self.group in ("tenses", "passive", "future", "modals")
            and len(self.drills.tense_shift) < 2
        ):
            raise ValueError(f"{self.code}: group {self.group} needs 2 tense_shift drills")
        if self.group == "cases" and len(self.drills.fill) < 3:
            raise ValueError(f"{self.code}: group cases needs 3 fill drills")
        _no_dashes(self.model_dump_json())
        return self

    def correct_german(self) -> list[str]:
        """Every German string that must be correct (wrong sentences are excluded on purpose)."""
        d = self.drills
        out = [e.de for e in self.examples] + [self.common_error.right]
        out += [s.de for s in d.surgery] + [a for s in d.surgery for a in s.alt]
        for t in [*d.transform, *d.tense_shift]:
            out += [*t.given_list, t.answer, *t.alt]
        out += [e.right for e in d.error_spot] + [f.full for f in d.fill]
        return out


class PatternBatch(BaseModel):
    batch: int = Field(ge=1, le=8)
    patterns: list[PatternSource] = Field(min_length=5, max_length=5)


class Mark(BaseModel):
    deck: Literal["connector", "work", "life"]
    de: str


class PlacementItem(BaseModel):
    id: str = Field(pattern=r"^p\d\d$")
    band: Literal["A2", "B1.1", "B1.2", "B2"]
    skill: Literal["grammar", "vocab"]
    mode: Literal["choice", "type"]
    prompt: str
    choices: list[str] = []
    answer: str
    alt: list[str] = []
    pattern: str | None = None
    marks: list[Mark] = []

    @model_validator(mode="after")
    def _choice(self):
        if self.mode == "choice" and self.answer not in self.choices:
            raise ValueError(f"{self.id}: answer not in choices")
        _no_dashes(self.model_dump_json())
        return self


class PlacementWriting(BaseModel):
    prompt_en: str
    min_sentences: int = 5


class Placement(BaseModel):
    items: list[PlacementItem] = Field(min_length=30, max_length=40)
    writing: PlacementWriting


class RecitationTable(BaseModel):
    code: str
    title: str
    group: Literal["verbs", "articles", "pronouns", "connectors"]
    columns: list[str] = Field(min_length=2)
    rows: list[list[str]] = Field(min_length=2)

    @model_validator(mode="after")
    def _shape(self):
        for r in self.rows:
            if len(r) != len(self.columns):
                raise ValueError(f"{self.code}: row {r} has wrong length")
        return self


class Recitation(BaseModel):
    tables: list[RecitationTable] = Field(min_length=1)
