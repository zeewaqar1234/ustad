import httpx
import pytest

from app.core import languagetool
from app.core.config import settings


def _lt_up() -> bool:
    try:
        return httpx.get(f"{settings.languagetool_url}/v2/languages", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.languagetool
@pytest.mark.skipif(not _lt_up(), reason="LanguageTool not running (make lt-up)")
def test_wrong_auxiliary_is_flagged():
    matches = languagetool.check("Ich habe gestern nach Hause gegangen.")
    assert matches, "expected at least one match for haben + gegangen"
    assert any(m["rule"]["id"] == "HILFSVERB_HABEN_SEIN" for m in matches)
