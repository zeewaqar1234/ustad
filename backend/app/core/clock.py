"""Day boundaries are Europe/Berlin calendar days; storage is UTC."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

TZ = ZoneInfo(settings.timezone)


def local_date(ts: datetime) -> date:
    return ts.astimezone(TZ).date()


def day_bounds(d: date) -> tuple[datetime, datetime]:
    """UTC start/end of a local calendar day."""
    start = datetime.combine(d, time.min, tzinfo=TZ)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)
