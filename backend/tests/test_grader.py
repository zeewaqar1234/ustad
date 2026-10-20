"""Answer grader (Phase 1 acceptance): Strasse≈Straße and ae≈ä give Hard, wrong article gives Again."""

import pytest

from app.srs.grader import AGAIN, GOOD, HARD, grade


@pytest.mark.parametrize(
    "given,expected",
    [
        ("Straße", "Straße"),
        ("Mein Zug hat Verspätung", "Mein Zug hat Verspätung."),
        ("Kannst du das bitte wiederholen?", "Kannst du das bitte wiederholen?"),
        ("  Ich habe heute   Rufbereitschaft ", "Ich habe heute Rufbereitschaft"),
    ],
)
def test_exact_is_good(given, expected):
    assert grade(given, expected).rating == GOOD


@pytest.mark.parametrize(
    "given,expected",
    [
        ("Strasse", "Straße"),
        ("die Strasse", "die Straße"),
        ("Maedchen", "Mädchen"),
        ("Mein Zug hat Verspaetung", "Mein Zug hat Verspätung"),
        ("Mein Zug hat Verspatung", "Mein Zug hat Verspätung"),  # umlaut dropped
        ("ich gehe nach hause", "Ich gehe nach Hause"),  # capitals
        ("Ich habe heute Rufbereitschfat", "Ich habe heute Rufbereitschaft"),  # swapped letters
    ],
)
def test_umlaut_ss_case_and_small_typos_are_hard(given, expected):
    g = grade(given, expected)
    assert g.rating == HARD, g
    assert g.verdict == "close"
    assert g.diff, "a diff must be shown for Hard"


@pytest.mark.parametrize(
    "given,expected",
    [
        ("der Rechnung", "die Rechnung"),
        ("die Tisch", "der Tisch"),
        ("das Termin", "der Termin"),
        ("Ich habe einen Frage", "Ich habe eine Frage"),
        ("Ich sehe der Mann", "Ich sehe den Mann"),
    ],
)
def test_wrong_article_is_again(given, expected):
    g = grade(given, expected)
    assert g.rating == AGAIN, g
    assert any("should be" in n for n in g.notes)


@pytest.mark.parametrize(
    "given,expected",
    [
        ("Ich geht nach Hause", "Ich gehe nach Hause"),  # wrong ending is grammar, not a typo
        ("Zug Verspätung", "Mein Zug hat Verspätung"),  # words missing
        ("", "Mein Zug hat Verspätung"),
        ("Ich bin krank", "Ich habe Rufbereitschaft"),
    ],
)
def test_wrong_is_again(given, expected):
    assert grade(given, expected).rating == AGAIN


def test_alternatives_accepted():
    g = grade("Bin gleich da", "Ich bin gleich da", ["Bin gleich da"])
    assert g.rating == GOOD


def test_diff_marks_the_change():
    g = grade("die Strasse", "die Straße")
    assert ("insert", "ß") in g.diff
