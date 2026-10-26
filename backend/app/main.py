from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.api import (
    auth,
    daily,
    health,
    homework,
    items,
    mistakes,
    patterns,
    placement,
    recitation,
    review,
    sabaq,
    stats,
    voice,
)  # fmt: skip
from app.core.config import settings

app = FastAPI(title="Ustad")


@app.exception_handler(OperationalError)
def _db_error(request: Request, exc: OperationalError):
    """A DB from an older phase (e.g. Phase 3 pulled, `make migrate` not run) has no new tables yet.
    Say how to fix it instead of a bare 500."""
    if "no such table" in str(exc.orig) or "no such column" in str(exc.orig):
        return JSONResponse(
            {"detail": "The database is older than the app. Run: make migrate"}, status_code=503
        )
    raise exc


for r in (health, auth, daily, review, sabaq, stats, items, patterns, homework, mistakes,
          recitation, placement, voice):  # fmt: skip
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
