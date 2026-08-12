import pytest
from fastapi.testclient import TestClient

from app import config, main
from app.main import app


@pytest.fixture(autouse=True)
def _clear_cache():
    # the in-memory cache is module-global: isolate it between tests
    main._cache.clear()
    yield
    main._cache.clear()


@pytest.fixture()
def token() -> str:
    return config.expected_token()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
