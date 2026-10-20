import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import db as dbmod
from app.core import auth
from app.db import Base, make_engine
from app.main import app
from app.models import Profile


@pytest.fixture
def session_factory(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def db(session_factory):
    s = session_factory()
    yield s
    s.close()


@pytest.fixture
def client(session_factory):
    def _get_db():
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    s = session_factory()
    s.add(Profile(id=1, name="Zee", password_hash=auth.hash_password("richtig-lang-123")))
    s.commit()
    s.close()
    auth.reset_failures()
    app.dependency_overrides[dbmod.get_db] = _get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
