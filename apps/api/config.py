"""
AquaSentinel FastAPI Backend
Application configuration using pydantic-settings.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Database ---
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aquasentinel"
    database_url_sync: str = "postgresql+psycopg://postgres:postgres@localhost:5432/aquasentinel"

    # --- Security ---
    secret_key: str = "dev_secret_change_in_production"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # --- CORS ---
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # --- App ---
    app_env: Literal["development", "staging", "production"] = "development"
    app_version: str = "1.0.0"

    # --- MQTT ---
    mqtt_broker_host: str = "localhost"
    mqtt_broker_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_topic_prefix: str = "aquasentinel"

    # --- ML ---
    model_registry_dir: str = "apps/api/models/registry"

    # --- Logging ---
    log_level: str = "INFO"
    log_format: Literal["json", "text"] = "json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
