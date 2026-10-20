from fastapi import FastAPI

from app.api import health

app = FastAPI(title="Ustad")
app.include_router(health.router)
