# Production image: built frontend served by FastAPI on one origin. Caddy in front does HTTPS.
FROM mirror.gcr.io/library/node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mirror.gcr.io/library/python:3.12-slim
RUN pip install --no-cache-dir uv==0.11.32
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY data/seed/ /app/data/seed/
COPY --from=web /web/dist /app/frontend/dist
ENV APP_ENV=prod DATABASE_URL=sqlite:////data/ustad.db LANGUAGETOOL_URL=http://languagetool:8010
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && uv run --no-sync python -m scripts.load_seed && exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
