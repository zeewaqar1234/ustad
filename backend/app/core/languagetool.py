"""Client for the self-hosted LanguageTool server. Never point this at the public API."""

import httpx

from app.core.config import settings


def check(text: str, language: str = "de-DE", timeout: float = 30.0) -> list[dict]:
    """Return LanguageTool matches for `text` (empty list = no issues found)."""
    resp = httpx.post(
        f"{settings.languagetool_url}/v2/check",
        data={"text": text, "language": language},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()["matches"]
