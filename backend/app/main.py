from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, daily, health, items, review, sabaq, stats
from app.core.config import settings

app = FastAPI(title="Ustad")
for r in (health, auth, daily, review, sabaq, stats, items):
    app.include_router(r.router)


def _mount_frontend(dist: Path) -> None:
    """Production: serve the built PWA from the same origin (cookie + service worker scope)."""
    if not (dist / "index.html").exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (dist / path).resolve()
        if path and f.is_file() and f.is_relative_to(dist.resolve()):
            return FileResponse(f)
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})


_mount_frontend(settings.static_dir)
