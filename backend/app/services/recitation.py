"""Pahara recitation, typed mode (docs/modules.md §5.2).

Stage 0: the full table is shown and Zee types it row by row. Stage 1: the same table with gaps.
Stage 2: blank (only the cue column). A clean recital unlocks the next stage from the next day on.
Grading is lenient (case, umlaut spelling and small typos pass), content only.
"""

from datetime import date

from sqlalchemy.orm import Session

from app import content
from app.models import RecitationProgress
from app.srs import grader

STAGES = ("full", "gaps", "blank")


def tables() -> list[dict]:
    return content.load("recitation")["tables"]


def table(code: str) -> dict:
    for t in tables():
        if t["code"] == code:
            return t
    raise KeyError(code)


def progress(db: Session, code: str) -> RecitationProgress:
    p = db.get(RecitationProgress, code)
    if p is None:
        p = RecitationProgress(code=code, stage=-1, passes=0)
        db.add(p)
        db.flush()
    return p


def shown_stage(p: RecitationProgress, today: date) -> int:
    """`p.stage` is the highest stage passed (-1 = none). The next stage opens the day after a pass."""
    if p.stage < 0:
        return 0
    if p.last_passed is not None and p.last_passed >= today:
        return p.stage  # passed today: repeat the same stage for practice
    return min(p.stage + 1, 2)


def hidden(stage: int, r: int, c: int) -> bool:
    """Which cells the stage hides. Column 0 is the cue and always shown."""
    if c == 0 or stage == 0:
        return False
    return stage == 2 or (r + c) % 2 == 0


def view(t: dict, stage: int) -> dict:
    rows = [
        [None if hidden(stage, r, c) else cell for c, cell in enumerate(row)]
        for r, row in enumerate(t["rows"])
    ]
    return {"code": t["code"], "title": t["title"], "group": t["group"], "columns": t["columns"],
            "stage": stage, "stage_name": STAGES[stage], "rows": rows}  # fmt: skip


def check(db: Session, code: str, typed: list[list[str]], today: date) -> dict:
    t = table(code)
    p = progress(db, code)
    stage = shown_stage(p, today)
    cells, wrong = [], 0
    for r, row in enumerate(t["rows"]):
        out_row = []
        for c, want in enumerate(row):
            if c == 0:
                out_row.append({"expected": want, "ok": True, "cue": True})
                continue
            got = typed[r][c] if r < len(typed) and c < len(typed[r]) else ""
            ok = grader.grade(got or "", want).rating >= grader.HARD
            wrong += not ok
            out_row.append({"given": got, "expected": want, "ok": ok})
        cells.append(out_row)
    passed = wrong == 0
    if passed:
        p.passes += 1
        p.stage = max(p.stage, stage)
        p.last_passed = today
    next_stage = min(stage + 1, 2) if passed else stage
    return {"passed": passed, "wrong": wrong, "cells": cells, "stage": stage,
            "next_stage": next_stage, "next_from": "tomorrow" if passed else "now"}  # fmt: skip
