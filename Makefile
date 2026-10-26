.PHONY: dev backend frontend install test lint migrate seed-build seed-build-fast grammar-build seed-load password lt-up lt-down lt-check test-ollama voice-build

install:
	cd backend && uv sync
	cd frontend && npm install

# Backend :8000 + frontend :5173 in one command. Ctrl+C stops both.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && uv run uvicorn app.main:app --reload --port 8000) & \
	(cd frontend && npm run dev -- --port 5173 --strictPort) & \
	wait

backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev -- --port 5173 --strictPort

test:
	cd backend && uv run pytest -q
	cd frontend && npm run test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run typecheck

migrate:
	cd backend && uv run alembic upgrade head

# Seed decks: build (LanguageTool check -> data/seed/*.json) needs `make lt-up`; load is idempotent.
seed-build:
	cd backend && uv run python -m scripts.build_seed

# No LanguageTool: unchanged items keep their earlier result, new/changed items are marked needs_review.
seed-build-fast:
	cd backend && uv run python -m scripts.build_seed --skip-lt

# Voice roleplay scenario cards (6 roleplays + free talk). Needs `make lt-up`.
voice-build:
	cd backend && uv run python -m scripts.build_voice

# Grammar content: 40 patterns (8 batches of 5), placement test, recitation tables. Needs `make lt-up`.
grammar-build:
	cd backend && uv run python -m scripts.build_grammar

seed-load: migrate
	cd backend && uv run python -m scripts.load_seed

password:
	cd backend && uv run python -m scripts.set_password

# Real local-model check of the 5 grader fixtures (needs Ollama + `ollama pull llama3.1:8b`).
test-ollama:
	cd backend && RUN_OLLAMA=1 uv run pytest tests/test_grader_llm.py tests/test_voice_llm.py -v

lt-up:
	docker compose up -d languagetool

lt-down:
	docker compose stop languagetool

lt-check:
	@curl -s --noproxy localhost -X POST http://localhost:8010/v2/check \
		--data-urlencode "text=Ich habe gestern nach Hause gegangen." -d language=de-DE
