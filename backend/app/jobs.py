"""Background jobs (docs/architecture.md §8: APScheduler inside the app). Phase 4: the nightly Author
job makes 2 graded texts per day for today and tomorrow. Ollama down = logged and tried next night;
`POST /api/texts/generate` or `make author` runs it by hand."""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.clock import local_date
from app.core.config import settings
from app.db import SessionLocal, utcnow
from app.llm.provider import LLMInvalid, LLMUnavailable, OllamaProvider
from app.reading import author

log = logging.getLogger(__name__)
DAYS_AHEAD = 2


def nightly_author() -> int:
    db = SessionLocal()
    try:
        made = author.ensure(db, OllamaProvider(), local_date(utcnow()), days=DAYS_AHEAD)
        db.commit()
        log.info("Author job: %d texts made", len(made))
        return len(made)
    except (LLMUnavailable, LLMInvalid) as e:
        db.commit()
        log.warning("Author job: model offline or failed, retry next night: %s", e)
        return 0
    finally:
        db.close()


def start() -> BackgroundScheduler | None:
    if not settings.jobs_enabled:
        return None
    sched = BackgroundScheduler(timezone=settings.timezone)
    # minute 17: off the hour; one run at a time; a run missed while the app is up (busy) runs within 6 h
    sched.add_job(nightly_author, CronTrigger(hour=settings.author_hour, minute=17),
                  id="author", max_instances=1, coalesce=True, misfire_grace_time=6 * 3600)  # fmt: skip
    # The scheduler keeps no record while the app is down (laptop off at night): catch up once at
    # startup. It only calls the model for days that still miss texts.
    sched.add_job(nightly_author, id="author_catchup", max_instances=1)
    sched.start()
    return sched
