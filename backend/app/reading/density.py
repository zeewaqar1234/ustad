"""Known-word density (docs/llm.md "Level control", docs/pedagogy.md P8): share of running words in a
text whose lemma Zee knows. Lemmas come from spaCy `de_core_news_sm` (MIT).

Counted: every word token except names (PROPN), numbers and punctuation. Closed-class words
(articles, pronouns, prepositions, conjunctions, auxiliaries, particles) count as known: a B1 learner
knows them and they are not in the SRS decks as single words. Compounds are not split, so a new
compound of two known words counts as unknown (the measure errs on the hard side).
"""

import re
from dataclasses import dataclass, field
from functools import cache

KNOWN_POS = {"DET", "PRON", "ADP", "CCONJ", "SCONJ", "AUX", "PART"}
SKIP_POS = {"PROPN", "NUM", "PUNCT", "SPACE", "SYM", "X"}
_WORD = re.compile(r"[A-Za-zÄÖÜäöüß]")


@dataclass(frozen=True)
class Tok:
    surface: str
    lemma: str
    pos: str
    gender: str | None = None  # m / f / n for nouns (spaCy morphology, in context)


@dataclass
class Density:
    words: int  # counted tokens
    known: int
    unknown: list[str] = field(default_factory=list)  # unknown lemmas, first-seen order, no repeats

    @property
    def ratio(self) -> float:
        return self.known / self.words if self.words else 1.0

    @property
    def pct(self) -> float:
        return round(100 * self.ratio, 1)


@cache
def _nlp():
    import spacy

    return spacy.load("de_core_news_sm", disable=["parser", "ner"])


_GENDER = {"Masc": "m", "Fem": "f", "Neut": "n"}


def tokens(text: str) -> list[Tok]:
    return [
        Tok(t.text, t.lemma_, t.pos_, _GENDER.get(next(iter(t.morph.get("Gender")), "")))
        for t in _nlp()(text)
    ]


def lemmas_of(texts: list[str]) -> set[str]:
    """Lower-case lemmas (and surface forms) of every word in `texts`: builds the known-word set."""
    out: set[str] = set()
    for doc in _nlp().pipe(texts, batch_size=256):
        for t in doc:
            if _WORD.search(t.text):
                out.add(t.lemma_.lower())
                out.add(t.text.lower())
    return out


def measure(toks: list[Tok], known: set[str]) -> Density:
    """`known` holds lower-case lemmas or forms. Pure function: unit-tested without spaCy."""
    d = Density(words=0, known=0)
    seen: set[str] = set()
    for t in toks:
        if t.pos in SKIP_POS or not _WORD.search(t.surface) or any(c.isdigit() for c in t.surface):
            continue
        d.words += 1
        lemma = t.lemma.lower()
        if t.pos in KNOWN_POS or lemma in known or t.surface.lower() in known:
            d.known += 1
        elif lemma not in seen:
            seen.add(lemma)
            d.unknown.append(t.lemma)
    return d


def text_density(text: str, known: set[str]) -> Density:
    return measure(tokens(text), known)
