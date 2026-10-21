"""LLM provider interface (docs/llm.md). Default: a local Ollama server, so every call is free.

`complete_json` is the only way the app talks to a model: it sends a JSON schema as the output format,
validates the reply with Pydantic, retries once with the validation error, and writes one cost_ledger
row per call (eur 0 for local models, so the ledger still shows volume and the rule holds).
"""

import json
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import utcnow
from app.models import CostLedger


class LLMUnavailable(Exception):
    """The model server could not be reached or returned an HTTP error."""


class LLMInvalid(Exception):
    """The model answered twice with output that failed validation."""


@dataclass
class Usage:
    prompt_tokens: int = 0
    output_tokens: int = 0


class Provider(Protocol):
    vendor: str
    model: str

    def chat(self, messages: list[dict], schema: dict) -> tuple[str, Usage]: ...


def inline_schema(model: type[BaseModel]) -> dict:
    """Pydantic JSON schema with $defs resolved in place (simpler for grammar-constrained decoding)."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(defs[node["$ref"].split("/")[-1]])
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


class OllamaProvider:
    vendor = "ollama"

    def __init__(self, url: str | None = None, model: str | None = None):
        self.url = (url or settings.ollama_url).rstrip("/")
        self.model = model or settings.ollama_model

    def chat(self, messages: list[dict], schema: dict) -> tuple[str, Usage]:
        body = {
            "model": self.model,
            "messages": messages,
            "format": schema,
            "stream": False,
            "options": {"temperature": 0},
        }
        try:
            resp = httpx.post(f"{self.url}/api/chat", json=body, timeout=settings.ollama_timeout)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMUnavailable(str(e)) from e
        data = resp.json()
        usage = Usage(data.get("prompt_eval_count", 0), data.get("eval_count", 0))
        return data["message"]["content"], usage


def get_provider() -> Provider:
    """FastAPI dependency; tests override it with a fake."""
    return OllamaProvider()


def _ledger(db: Session, provider: Provider, role: str, usage: Usage) -> None:
    db.add(
        CostLedger(
            ts=utcnow(), vendor=provider.vendor, model=f"{provider.model} ({role})",
            units=usage.prompt_tokens + usage.output_tokens, unit_type="tokens", eur=0.0,
        )
    )  # fmt: skip
    db.flush()


def complete_json[T: BaseModel](
    db: Session, provider: Provider, role: str, system: str, user: str, out: type[T]
) -> T:
    schema = inline_schema(out)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    for attempt in range(2):
        raw, usage = provider.chat(messages, schema)
        _ledger(db, provider, role, usage)
        try:
            return out.model_validate(json.loads(raw))
        except (ValidationError, json.JSONDecodeError) as e:
            if attempt == 1:
                raise LLMInvalid(str(e)) from e
            messages += [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": f"That JSON failed validation:\n{e}\nReturn the corrected JSON only.",
                },
            ]
    raise AssertionError("unreachable")
