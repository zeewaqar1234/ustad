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


class Chunk(BaseModel):
    de: str = Field(min_length=2)
    en: str = Field(min_length=2)


class Scenario(BaseModel):
    """Voice roleplay card (docs/modules.md §5.4): goal + 5 useful chunks shown before starting."""

    code: str = Field(pattern=r"^[A-Z0-9_]+$")
    kind: Literal["roleplay", "free"]
    title: str
    level: Literal["A2", "A2/B1", "B1"]
    tutor_role_en: str = Field(description="who the tutor plays, for the system prompt")
    setting_en: str
    goal_en: str
    address: Literal["du", "Sie"]
    chunks: list[Chunk] = Field(min_length=5, max_length=5)
    opening_de: str = Field(
        min_length=5, description="tutor's first line, spoken before Zee starts"
    )

    @model_validator(mode="after")
    def _rules(self):
        _no_dashes(self.title, self.goal_en, self.opening_de, *(c.de for c in self.chunks))
        return self

    def correct_german(self) -> list[str]:
        return [self.opening_de, *(c.de for c in self.chunks)]


class Scenarios(BaseModel):
    scenarios: list[Scenario]

    @model_validator(mode="after")
    def _unique(self):
        codes = [s.code for s in self.scenarios]
        if len(codes) != len(set(codes)):
            raise ValueError("duplicate scenario code")
        return self


# --- Phase 4: graded reading texts (docs/modules.md §5.3). Same shape for seed texts and Author output.

Topic = Literal["serial", "markets", "crypto", "history", "pk_de", "life", "work"]


class TextSentence(BaseModel):
    de: str = Field(min_length=2)
    en: str = Field(min_length=2)


class GlossEntry(BaseModel):
    """A word in the text Zee probably does not know yet: shown on tap, can be added to SRS."""

    word: str  # as it appears in the text
    lemma: str  # dictionary form
    en: str
    gender: Literal["m", "f", "n"] | None = None
    plural: str | None = None


class TextQuestion(BaseModel):
    """Goethe B1 Lesen style. rf: options ["richtig", "falsch"]. mc: 3 options, one answer.
    match: `left` holds 2-3 statements, `answer[i]` is the option index for left[i]."""

    id: str
    kind: Literal["rf", "mc", "match"]
    prompt: str
    left: list[str] = Field(default_factory=list)
    options: list[str] = Field(min_length=2, max_length=5)
    answer: list[int] = Field(min_length=1)

    @model_validator(mode="after")
    def _shape(self):
        if any(not 0 <= a < len(self.options) for a in self.answer):
            raise ValueError(f"{self.id}: answer index out of range")
        if self.kind == "rf" and self.options != ["richtig", "falsch"]:
            raise ValueError(f"{self.id}: rf options must be ['richtig', 'falsch']")
        if self.kind == "match":
            if not 2 <= len(self.left) <= 3 or len(self.answer) != len(self.left):
                raise ValueError(f"{self.id}: match needs 2-3 left items and one answer each")
        elif self.left or len(self.answer) != 1:
            raise ValueError(f"{self.id}: {self.kind} has no left items and exactly one answer")
        return self


class GradedText(BaseModel):
    title: str
    topic: Topic
    level: str = "B1.1"
    series_episode: int | None = None
    sentences: list[TextSentence] = Field(min_length=4)
    glossary: list[GlossEntry] = Field(default_factory=list)
    questions: list[TextQuestion] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def _plain(self):
        _no_dashes(self.title, *(s.de for s in self.sentences), *(s.en for s in self.sentences))
        return self

    def words(self) -> int:
        return sum(len(s.de.split()) for s in self.sentences)

    def correct_german(self) -> list[str]:
        """German checked by LanguageTool: the body sentence by sentence and the question texts."""
        qs = [
            t for q in self.questions for t in (q.prompt, *q.left, *q.options) if len(t.split()) > 1
        ]
        return [" ".join(s.de for s in self.sentences), *qs]


class SeedText(GradedText):
    code: str
    credit: str = "Ustad (own text)"
    licence: str = "own"
    source_url: str | None = None


class SeedTexts(BaseModel):
    texts: list[SeedText]
