"""Turn the Goethe-Zertifikat B1 Wortliste PDF into data/private/goethe_b1_wortliste.txt (one lemma per line).

Usage: python -m scripts.build_wortliste [pdf] [out]
Default pdf: data/private/Goethe-Zertifikat_B1_Wortliste.pdf. Needs `pdftohtml` (poppler) on the PATH.
The PDF restricts storing it in a network (docs/USTAD_V2_CODEX_BRIEF.md 4.4): keep both files in
data/private/ (gitignored) on your Mac. This PDF has no bold headwords, so entries are found by page
position: the alphabetical part (from page 16) has two columns, each with a headword cell on the left and
example sentences on the right. Review the output by eye: continuation lines are skipped by heuristic.
"""

import re
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

from app.core.config import REPO_ROOT

FIRST_PAGE = (
    16  # "2 Alphabetischer Wortschatz" starts here; page 1 to 15 are the intro and the word groups
)
ZONES = ((0, 185), (460, 605))  # left edge of the headword cell in the two columns (page width 892)
LINE_HEIGHT = "11"  # text of the entries; headers, letters and footers use other sizes
CONTINUED = (",", ":", "/", "-")
_ARTICLES = re.compile(r"^(?:(?:der|die|das|ein|eine|sich)\b|\([^)]*\)|/)\s*", re.IGNORECASE)
_PAREN = re.compile(r"\s*\([^)]*\)")


_NOTE = re.compile(r"^(?:\(|(?:A|D|CH)\b[,:;/ ]|(?:hat|ist|haben|sind)\s)")


def lemmas(cell: str) -> list[str]:
    """Headword cell text ('die Dame, -n', 'o.k./O.K./okay', 'das Dessert, -s -> D, A:') to lemmas."""
    if _NOTE.search(cell) or cell.count("(") != cell.count(
        ")"
    ):  # regional notes ('A: Marille') and perfect-tense continuations
        return []
    head = _PAREN.sub("", cell.split("→")[0]).split(";")[0].split(",")[0].strip()
    prev = None
    while prev != head:
        prev, head = head, _ARTICLES.sub("", head).strip()
    head = _PAREN.sub("", head).strip()
    out = []
    for alt in head.split("/"):
        alt = alt.strip(" .-")
        if len(alt) > 1 and not alt.isnumeric() and re.search(r"[A-Za-zÄÖÜäöüß]", alt):
            out.append(alt)
    return out


def extract(xml: str) -> list[str]:
    words: set[str] = set()
    pages = ET.fromstring(xml).findall("page")
    for pg in pages[FIRST_PAGE - 1 :]:
        for lo, hi in ZONES:
            cells = sorted(
                (int(e.get("top")), "".join(e.itertext()).strip())
                for e in pg.findall("text")
                if e.get("height") == LINE_HEIGHT and lo <= int(e.get("left")) < hi
            )
            prev_top, prev_text = None, ""
            for top, text in cells:
                if not text:
                    continue
                continuing = (
                    prev_top is not None and top - prev_top <= 20 and prev_text.endswith(CONTINUED)
                )
                if not continuing:
                    words.update(lemmas(text))
                prev_top, prev_text = top, text
    return sorted(words, key=str.lower)


def main() -> None:
    pdf = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else REPO_ROOT / "data/private/Goethe-Zertifikat_B1_Wortliste.pdf"
    )
    out = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else REPO_ROOT / "data/private/goethe_b1_wortliste.txt"
    )
    xml = subprocess.run(
        ["pdftohtml", "-xml", "-i", "-stdout", str(pdf)], capture_output=True, check=True
    ).stdout
    words = extract(xml.decode("utf-8", errors="replace"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(words) + "\n", encoding="utf-8")
    print(f"{len(words)} lemmas -> {out}")


if __name__ == "__main__":
    main()
