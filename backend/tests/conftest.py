import pytest

from tests.support import memory_db


@pytest.fixture
def db():
    """In-memory SQLite database, isolated per test."""
    conn = memory_db()
    try:
        yield conn
    finally:
        conn.close()
