"""
AquaSentinel — pytest configuration and shared fixtures.
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from apps.api.database import Base, get_db_session
from apps.api.main import app


# ---------------------------------------------------------------------------
# In-memory SQLite engine for testing
# ---------------------------------------------------------------------------

TEST_DB_URL = "postgresql+asyncpg://postgres:Akilaarasu1!@localhost:5432/aquasentinel_test"


@pytest.fixture(scope="session")
def event_loop():
    """Create single event loop for all async tests in session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db():
    """Create a clean in-memory SQLite database for each test."""
    engine = create_async_engine(
        TEST_DB_URL,
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def async_client(test_db: AsyncSession):
    """HTTP test client with DB dependency override."""
    async def override_db():
        yield test_db

    app.dependency_overrides[get_db_session] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def sync_client(test_db: AsyncSession):
    """Synchronous test client for simple tests."""
    def override_db():
        yield test_db

    app.dependency_overrides[get_db_session] = override_db

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client

    app.dependency_overrides.clear()
