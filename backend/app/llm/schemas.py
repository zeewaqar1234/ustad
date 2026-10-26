"""Pydantic schemas for every LLM output (docs/llm.md). No free-text parsing anywhere."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ErrorTag(StrEnum):
    """Error taxonomy (docs/architecture.md §10)."""

    V2_POSITION = "V2_POSITION"
    VERB_FINAL = "VERB_FINAL"
    SEP_PREFIX = "SEP_PREFIX"
    AUX_HABEN_SEIN = "AUX_HABEN_SEIN"
    PARTIZIP = "PARTIZIP"
    TENSE_CHOICE = "TENSE_CHOICE"
    CASE_AKK = "CASE_AKK"
    CASE_DAT = "CASE_DAT"
    PREP_CASE = "PREP_CASE"
    GENDER = "GENDER"
    ADJ_ENDING = "ADJ_ENDING"
    PLURAL = "PLURAL"
    CONNECTOR_CHOICE = "CONNECTOR_CHOICE"
    MIDDLE_FIELD_ORDER = "MIDDLE_FIELD_ORDER"
    WORD_CHOICE = "WORD_CHOICE"
    FALSE_FRIEND = "FALSE_FRIEND"
    REGISTER_DU_SIE = "REGISTER_DU_SIE"
    SPELLING = "SPELLING"
    UMLAUT = "UMLAUT"
    CAPITALISATION = "CAPITALISATION"
    PRONUNCIATION = "PRONUNCIATION"
    OTHER = "OTHER"


class GradeError(BaseModel):
    span: str = Field(
        min_length=1, description="exact substring of the original text that is wrong"
    )
    fix: str = Field(description="replacement for span")
    tag: ErrorTag
    reason_en: str = Field(min_length=1, description="one line, English")
    severity: Literal[1, 2, 3]


class CorrectUse(BaseModel):
    """A place where Zee used a target structure correctly (V1 evidence ledger)."""

    span: str = Field(min_length=1, description="exact substring of the text that is correct")
    tag: ErrorTag


class GradeResult(BaseModel):
    """Grader output for writing (docs/llm.md, Grader output schema)."""

    score_10: int = Field(ge=0, le=10)
    corrected_text: str
    errors: list[GradeError]
    correct_uses: list[CorrectUse] = Field(default_factory=list, max_length=12)
    teaching_points: list[str] = Field(max_length=3)
    model_sentence_for_srs: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("teaching_points", "model_sentence_for_srs")
    @classmethod
    def _no_blank(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s.strip()]


class TutorReply(BaseModel):
    """Tutor output for one voice turn: the conversational reply only. No grading here: the turn must
    come back fast on a local model, and corrections would break the speaking flow. All grading
    happens once, in the end-of-session review (SessionReview)."""

    reply_de: str = Field(
        min_length=1, max_length=400, description="max 2 sentences, then a question"
    )
    reply_en_gloss: str


class BetterError(BaseModel):
    span: str = Field(min_length=1, description="exact substring of what Zee said")
    fix: str
    tag: ErrorTag
    reason_en: str = Field(min_length=1)


class BetterLine(BaseModel):
    turn: int = Field(ge=1, description="turn number as given in the transcript")
    better: str = Field(min_length=1, description="corrected, more natural version of the line")
    errors: list[BetterError] = Field(default_factory=list)
    correct_uses: list[CorrectUse] = Field(default_factory=list, max_length=12)


class SessionReview(BaseModel):
    """End-of-session "Say it better" review (docs/modules.md §5.4 mode 5), Grader role."""

    lines: list[BetterLine]
    teaching_points: list[str] = Field(max_length=3)

    @field_validator("teaching_points")
    @classmethod
    def _no_blank(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s.strip()]
