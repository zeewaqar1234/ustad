from scripts.build_wortliste import extract, lemmas


def test_lemmas_strip_articles_inflections_and_notes():
    assert lemmas("die Dame, -n") == ["Dame"]
    assert lemmas("dauern, dauert, dauerte,") == ["dauern"]
    assert lemmas("der Azubi, -s (D)") == ["Azubi"]
    assert lemmas("der/das Ketchup/Ketschup, -s") == ["Ketchup", "Ketschup"]
    assert lemmas("das Dessert, -s → D, A:") == ["Dessert"]
    assert lemmas("Familienstand (D, A)") == ["Familienstand"]
    assert lemmas("sich beeilen") == ["beeilen"]
    assert lemmas("A: Marille") == []
    assert lemmas("hat gedauert") == []
    assert lemmas("12") == []


def _xml(cells):
    body = "".join(f'<text top="{t}" left="{x}" height="11">{s}</text>' for t, x, s in cells)
    return f"<pdf2xml>{'<page/>' * 15}<page>{body}</page></pdf2xml>"


def test_extract_uses_headword_zones_and_skips_continuations():
    xml = _xml([
        (100, 53, "dauern, dauert, dauerte,"), (113, 53, "hat gedauert"),
        (100, 212, "Wie lange dauert die Pause?"),  # example column
        (150, 561, "die Dauer"), (150, 617, "1. Sie können das Buch"),
        (200, 472, "damit"),
    ])  # fmt: skip
    assert extract(xml) == ["damit", "dauern", "Dauer"] or sorted(extract(xml)) == [
        "Dauer",
        "damit",
        "dauern",
    ]
