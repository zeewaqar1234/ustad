"""Auto-grader for typed answers (docs/modules.md §5.1).

exact = Good · only umlaut/ß/case differences or one small typo = Hard (diff shown) · anything else = Again.
A different article or determiner is grammar, not a typo: always Again. So is a changed word ending.
"""

import difflib
import re
import unicodedata
from dataclasses import dataclass, field

AGAIN, HARD, GOOD = 1, 2, 3

# Closed-class words where a one-letter difference is a grammar error (case/gender), never a typo.
DETERMINERS = {
    "der", "die", "das", "den", "dem", "des",
    "ein", "eine", "einen", "einem", "einer", "eines",
    "kein", "keine", "keinen", "keinem", "keiner", "keines",
    "mein", "meine", "meinen", "meinem", "meiner", "meines",
    "dein", "deine", "deinen", "deinem", "deiner", "deines",
    "sein", "seine", "seinen", "seinem", "seiner", "seines",
    "ihr", "ihre", "ihren", "ihrem", "ihrer", "ihres",
    "unser", "unsere", "unseren", "unserem", "unserer", "unseres",
    "euer", "eure", "euren", "eurem", "eurer", "eures",
    "dieser", "diese", "diesen", "diesem", "dieses",
    "ich", "mich", "mir", "du", "dich", "dir", "er", "ihn", "ihm", "sie", "es",
    "wir", "uns", "ihnen", "euch",
}  # fmt: skip

_UMLAUT_DIGRAPHS = (("ae", "ä"), ("oe", "ö"), ("ue", "ü"))


@dataclass
class Grade:
    rating: int
    verdict: str  # exact / close / wrong
    expected: str
    notes: list[str] = field(default_factory=list)
    diff: list[tuple[str, str]] = field(default_factory=list)  # (op, text): equal / insert / delete


def _clean(s: str) -> str:
    s = unicodedata.normalize("NFC", s).strip()
    s = s.replace("’", "'").replace("„", '"').replace("“", '"')
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s*([,.!?;:])", r"\1", s)
    return s.rstrip(".!?;: ")


def _tokens(s: str) -> list[str]:
    return re.findall(r"[\wäöüÄÖÜß'-]+", s)


def _fold(word: str) -> str:
    """Fold case, ß and umlauts so 'Strasse' == 'Straße' and 'Maedchen' == 'Mädchen'."""
    w = word.lower().replace("ß", "ss")
    for digraph, uml in _UMLAUT_DIGRAPHS:
        w = w.replace(digraph, uml)
    return w


def _strip_umlauts(word: str) -> str:
    return word.translate(str.maketrans("äöü", "aou"))


def _osa_distance(a: str, b: str) -> int:
    """Damerau-Levenshtein (optimal string alignment): swaps of two letters count as one edit."""
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = a[i - 1] != b[j - 1]
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def _is_ending_change(given: str, exp: str) -> bool:
    """True if the words share a stem and differ only in the last 2 letters (gehe/geht, guten/gutes)."""
    common = 0
    for x, y in zip(given, exp, strict=False):
        if x != y:
            break
        common += 1
    return common >= len(exp) - 2 and common >= len(given) - 2


def _token_verdict(given: str, exp: str) -> tuple[int, str | None]:
    if given == exp:
        return GOOD, None
    if given.lower() in DETERMINERS or exp.lower() in DETERMINERS:
        if given.lower() == exp.lower():
            return HARD, f"Capital letter: {exp}"
        return AGAIN, f"Wrong word form: '{given}' should be '{exp}'"
    fg, fe = _fold(given), _fold(exp)
    if fg == fe:
        if given.lower() == exp.lower():
            return HARD, f"Capital letter: {exp}"
        if "ß" in exp and "ß" not in given:
            return HARD, f"Spelling: {exp} is written with ß"
        return HARD, f"Umlaut: {exp}"
    if _strip_umlauts(fg) == _strip_umlauts(fe):
        return HARD, f"Missing umlaut: {exp}"
    lg, le = given.lower(), exp.lower()
    if len(le) >= 4 and _osa_distance(lg, le) == 1 and not _is_ending_change(lg, le):
        return HARD, f"Typo: {exp}"
    if _is_ending_change(lg, le):
        return AGAIN, f"Ending: '{given}' should be '{exp}'"
    return AGAIN, None


def _char_diff(given: str, expected: str) -> list[tuple[str, str]]:
    sm = difflib.SequenceMatcher(a=given, b=expected, autojunk=False)
    out: list[tuple[str, str]] = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out.append(("equal", given[i1:i2]))
        else:
            if i2 > i1:
                out.append(("delete", given[i1:i2]))
            if j2 > j1:
                out.append(("insert", expected[j1:j2]))
    return out


def _grade_one(given: str, expected: str) -> Grade:
    g, e = _clean(given), _clean(expected)
    if not g:
        return Grade(AGAIN, "wrong", expected, ["No answer"], [("insert", e)])
    if g == e:
        return Grade(GOOD, "exact", expected)
    diff = _char_diff(g, e)
    gt, et = _tokens(g), _tokens(e)
    if len(gt) != len(et):
        return Grade(AGAIN, "wrong", expected, ["Words missing or extra"], diff)
    worst, notes, typos = GOOD, [], 0
    for a, b in zip(gt, et, strict=True):
        r, note = _token_verdict(a, b)
        worst = min(worst, r)
        if note:
            notes.append(note)
        if note and note.startswith("Typo"):
            typos += 1
    if worst == GOOD:  # tokens equal, only punctuation differs
        return Grade(GOOD, "exact", expected, ["Check punctuation"], diff)
    if worst == HARD and typos > max(1, len(et) // 5):
        return Grade(AGAIN, "wrong", expected, ["Too many typos", *notes], diff)
    return Grade(worst, "close" if worst == HARD else "wrong", expected, notes, diff)


def grade(given: str, expected: str, alternatives: list[str] | None = None) -> Grade:
    """Grade against the expected answer and its alternatives; the best match wins."""
    results = [_grade_one(given, ans) for ans in [expected, *(alternatives or [])]]
    return max(results, key=lambda r: (r.rating, r.verdict == "exact"))
