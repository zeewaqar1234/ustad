"""Drill generators and checker for grammar patterns (docs/modules.md §5.2).

Six types: surgery (rebuild from shuffled words), transform, tense_shift, error_spot, fill (endings),
free (one sentence of free production, graded by the Grader). A drill sent to the client never contains
its answer (ask before tell); the answer comes back only after an attempt.
"""

import random
import re
from dataclasses import dataclass, field

from app.models import Pattern
from app.srs import grader

TYPES = ("surgery", "transform", "tense_shift", "error_spot", "fill", "free")

# Determiners whose ending can be blanked for an auto fill drill: stem + ending.
_DET = re.compile(
    r"\b(d)(er|en|em|es|ie|as)\b|\b((?:k|m|d|s)?ein|ihr|unser|dies)(e|en|em|er|es)\b", re.IGNORECASE
)


@dataclass
class Drill:
    id: str
    type: str
    instruction: str
    prompt: str
    mode: str  # tokens / type / blanks
    tokens: list[str] = field(default_factory=list)
    blanks: int = 0
    hint: str | None = None

    def public(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class Expected:
    answer: str
    alts: list[str]
    tag: str
    answers: list[str] = field(default_factory=list)  # fill: one per blank
    must_include: list[str] = field(default_factory=list)  # free
    explain: str = ""


def _shuffle(words: list[str], seed: str) -> list[str]:
    rng = random.Random(seed)
    out = words[:]
    for _ in range(10):
        rng.shuffle(out)
        if out != words:
            break
    return out


def auto_fill(sentence: str) -> dict | None:
    """Blank the ending of the first article/possessive in a sentence: 'mit dem Zug' -> 'mit d___ Zug'."""
    m = _DET.search(sentence)
    if not m:
        return None
    stem, ending = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
    start = m.start()
    text = sentence[:start] + stem + "___" + sentence[start + len(stem) + len(ending) :]
    return {"text": text, "answers": [ending.lower()], "full": sentence}


def generate(p: Pattern) -> list[Drill]:
    d, code, tag = p.drills_json, p.code, p.tags[0]
    out: list[Drill] = []
    for i, s in enumerate(d["surgery"]):
        words = s["de"].split()
        out.append(Drill(f"{code}:surgery:{i}", "surgery", "Build the sentence.", s["en"],
                         "tokens", tokens=_shuffle(words, f"{code}{i}")))  # fmt: skip
    # fill comes before transform/tense_shift: an auto fill uses their answers, which are not shown yet
    for i, f in enumerate(fills(p)):
        out.append(Drill(f"{code}:fill:{i}", "fill", "Fill the gaps.", f["text"], "blanks",
                         blanks=len(f["answers"])))  # fmt: skip
    for kind in ("transform", "tense_shift"):
        for i, t in enumerate(d.get(kind, [])):
            given = t["given"] if isinstance(t["given"], str) else " ".join(t["given"])
            out.append(Drill(f"{code}:{kind}:{i}", kind, t["instruction"], given, "type"))
    for i, e in enumerate(d["error_spot"]):
        out.append(Drill(f"{code}:error_spot:{i}", "error_spot",
                         "One error. Type the whole sentence correctly.", e["wrong"], "type"))  # fmt: skip
    fr = d["free"]
    hint = ("Use: " + ", ".join(fr["must_include"])) if fr.get("must_include") else None
    out.append(Drill(f"{code}:free:0", "free", fr["prompt_en"], "", "type", hint=hint))
    assert tag  # every pattern trains at least one tag
    return out


def fills(p: Pattern) -> list[dict]:
    authored = p.drills_json.get("fill", [])
    if authored:
        return authored
    # Not the card examples: Zee just read those. Transform/tense answers are revealed only later.
    shown = {e["de"] for e in p.examples_json} | {p.common_error.get("right", "")}
    shown |= {s["de"] for s in p.drills_json.get("surgery", [])}  # revealed earlier in the round
    for t in [*p.drills_json.get("transform", []), *p.drills_json.get("tense_shift", [])]:
        if t["answer"] in shown:
            continue
        f = auto_fill(t["answer"])
        if f:
            return [f]
    return []


def expected(p: Pattern, drill_id: str) -> Expected:
    code, kind, idx = drill_id.split(":")
    if code != p.code or kind not in TYPES:
        raise KeyError(drill_id)
    i, d, tag = int(idx), p.drills_json, p.tags[0]
    if kind == "surgery":
        s = d["surgery"][i]
        return Expected(s["de"], s.get("alt", []), tag)
    if kind in ("transform", "tense_shift"):
        t = d[kind][i]
        return Expected(t["answer"], t.get("alt", []), tag)
    if kind == "error_spot":
        e = d["error_spot"][i]
        return Expected(e["right"], [], e["tag"], explain=e["note_en"])
    if kind == "fill":
        f = fills(p)[i]
        return Expected(f["full"], [], tag, answers=f["answers"])
    fr = d["free"]
    return Expected("", [], tag, must_include=fr.get("must_include", []))


def _words(s: str) -> list[str]:
    return sorted(w.lower().strip(".,!?") for w in s.split())


def check(p: Pattern, drill_id: str, answer: str = "", answers: list[str] | None = None) -> dict:
    """Grade a non-free drill. Returns correct, the expected answer and a diff."""
    exp = expected(p, drill_id)
    kind = drill_id.split(":")[1]
    if kind == "fill":
        given = answers or []
        results = []
        for n, want in enumerate(exp.answers):
            got = given[n] if n < len(given) else ""
            g = grader.grade(got, want)
            results.append({"given": got, "expected": want, "ok": g.rating >= grader.HARD})
        ok = all(r["ok"] for r in results)
        return {"correct": ok, "expected": exp.answer, "blanks": results, "notes": [],
                "diff": [], "tag": exp.tag, "explain": exp.explain}  # fmt: skip
    g = grader.grade(answer, exp.answer, exp.alts)
    notes = list(g.notes)
    ok = g.rating >= grader.HARD
    if kind == "surgery" and not ok and _words(answer) == _words(exp.answer):
        # token-by-token notes compare the wrong positions; only the order matters here
        notes = ["Same words, different order. If your order is also correct German, fine."]
    return {"correct": ok, "expected": g.expected, "verdict": g.verdict, "notes": notes,
            "diff": g.diff, "tag": exp.tag, "explain": exp.explain}  # fmt: skip


def missing_words(text: str, must_include: list[str]) -> list[str]:
    low = text.lower()
    return [w for w in must_include if w.lower() not in low]


def pick(items: list[Drill], n: int, seed: int) -> list[Drill]:
    """n drills of mixed types for a review block. Same pick all day (seed = day), another one tomorrow.
    One drill of each type first (free production last), then the rest in a shuffled order."""
    rng = random.Random(seed)
    by_type: dict[str, list[Drill]] = {}
    for d in items:
        by_type.setdefault(d.type, []).append(d)
    firsts = [rng.choice(v) for t, v in by_type.items() if t != "free"]
    rng.shuffle(firsts)
    rest = [d for d in items if d not in firsts and d.type != "free"]
    rng.shuffle(rest)
    return (firsts + rest)[:n]
