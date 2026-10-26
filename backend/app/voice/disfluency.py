"""Strip disfluencies from a transcript before grading (CLAUDE.md non-negotiable; docs/modules.md §5.4).

Feedback is about German, not about the stammer. Removed:
- fillers: äh, ähm, öh, hm, mhm, uh (only standalone tokens; "also", "na ja" stay, they are German)
- sound repeats inside a word: "ge-ge-gestern" -> "gestern", "w-weil" -> "weil"
- broken-off starts before the full word: "ge- gestern", "w w weil" -> "gestern" / "weil"
  (a start counts only if it ends with "-" or is one letter, so "in Indien" stays)
- whole-word repeats: "ich ich ich habe" -> "ich habe", "in der in der Stadt" -> "in der Stadt"
Kept as German, not stammer:
- a repeat with a comma between ("Ich mag das, das ist gut.", "die, die hier wohnen")
- relative pronoun + article after a comma ("Die Frau, die die Stelle hat")
- a comma before a subordinate clause around a filler ("Ich glaube, äh, dass" -> "Ich glaube, dass")
- numbers ("2 20-Cent-Stücke")
"""

import re

# "um" and "eh" are German words ("um acht", "eh schon"), so they are not fillers here.
FILLERS = {"äh", "ähm", "äähm", "öh", "öhm", "hm", "hmm", "mhm", "mm", "uh", "uhm", "ehm"}
_TOKEN = re.compile(r"\S+")
_EDGE = re.compile(r"^[\"'„“”‚‘(]+|[\"'„“”‚‘),.;:!?…]+$")
ARTICLES = {"der", "die", "das", "den", "dem", "des"}
# subordinators that need the comma before them (articles are left out: too ambiguous)
CLAUSE_OPENERS = {
    "dass", "weil", "ob", "wenn", "obwohl", "damit", "bevor", "nachdem", "während", "sondern",
    "aber", "denn", "deren", "dessen",
}  # fmt: skip
_INNER_REPEAT = re.compile(r"^(?:(\w{1,3})-)+(\w+)$")


def _core(tok: str) -> str:
    return _EDGE.sub("", tok).lower()


def _trail(tok: str) -> str:
    m = re.search(r"[,.;:!?…]+$", tok)
    return m.group(0) if m else ""


def clean(text: str) -> str:
    toks = _TOKEN.findall(text)
    # 1. fillers and in-word sound repeats
    out: list[str] = []
    for k, t in enumerate(toks):
        core = _core(t)
        if not core or core.strip("-") in FILLERS:
            end = _trail(t).strip(",")
            nxt = next((_core(x) for x in toks[k + 1 :] if _core(x).strip("-") not in FILLERS), "")
            keep = out and out[-1].endswith(",") and nxt in CLAUSE_OPENERS and not end
            if out and not (keep and _core(out[-1]) not in CLAUSE_OPENERS):
                # "ich, äh, bin" -> "ich bin"; "bin, äh." -> "bin."; "glaube, äh, dass" keeps its comma
                out[-1] = out[-1].rstrip(",") + end
            continue
        m = _INNER_REPEAT.match(_EDGE.sub("", t))
        if m and m.group(2).lower().startswith(m.group(1).lower()):
            t = t.replace(_EDGE.sub("", t), m.group(2))
        out.append(t)
    # 2. broken-off starts: "ge-" / "w" directly before a word that starts with it
    kept: list[str] = []
    for i, t in enumerate(out):
        core = _core(t).rstrip("-")
        nxt = _core(out[i + 1]) if i + 1 < len(out) else ""
        partial = t.endswith("-") or (len(core) == 1 and core.isalpha())
        if core and nxt and partial and nxt != core and nxt.startswith(core):
            continue
        kept.append(t)
    # 3. repeated words and repeated 2-3 word phrases
    changed = True
    while changed:
        changed = False
        for n in (3, 2, 1):
            i = 0
            while i + 2 * n <= len(kept):
                a = [_core(x) for x in kept[i : i + n]]
                b = [_core(x) for x in kept[i + n : i + 2 * n]]
                relative = (
                    n == 1 and a[0] in ARTICLES and i > 0 and kept[i - 1].endswith(",")
                    and not (i + 2 < len(kept) and _core(kept[i + 2]) == a[0])
                )  # fmt: skip
                if a == b and all(a) and not _trail(kept[i + n - 1]) and not relative:
                    # keep the first copy (its capital letter), carry the second copy's end mark
                    end = _trail(kept[i + 2 * n - 1])
                    del kept[i + n : i + 2 * n]
                    kept[i + n - 1] = kept[i + n - 1].rstrip(",") + end
                    changed = True
                else:
                    i += 1
    s = " ".join(kept)
    return re.sub(r"\s+([,.;:!?])", r"\1", s).strip()
