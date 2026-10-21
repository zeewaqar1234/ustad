"""LLM roles (Tutor, Grader, Author) behind one provider interface (docs/llm.md)."""

from pathlib import Path

PROMPTS = Path(__file__).parent / "prompts"


def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()
