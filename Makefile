.PHONY: dev backend frontend install test lint migrate seed-build seed-load password lt-up lt-down lt-check

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

seed-load: migrate
	cd backend && uv run python -m scripts.load_seed

password:
	cd backend && uv run python -m scripts.set_password

lt-up:
	docker compose up -d languagetool

lt-down:
	docker compose stop languagetool

lt-check:
	@curl -s --noproxy localhost -X POST http://localhost:8010/v2/check \
		--data-urlencode "text=Ich habe gestern nach Hause gegangen." -d language=de-DE
