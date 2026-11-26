"""Configuration management for Odysseus API."""

from pathlib import Path
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _read_secret_file(path_value: str, label: str) -> str:
    secret_path = Path(path_value)
    if not secret_path.is_file():
        raise ValueError(f"{label} file not found: {path_value}")
    secret_value = secret_path.read_text(encoding="utf-8").strip()
    if not secret_value:
        raise ValueError(f"{label} file is empty: {path_value}")
    return secret_value


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables and Swarm secret files."""

    database_url: str = "postgresql+psycopg://odysseus:odysseus@localhost:5432/odysseus"
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "odysseus"
    db_user: str = "odysseus"
    db_password: str = ""
    db_password_file: str = ""
    environment: str = "development"
    timezone: str = Field(
        default="Pacific/Auckland",
        validation_alias=AliasChoices("ODYSSEUS_TIMEZONE", "TZ"),
    )
    domain_name: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_DOMAIN_NAME", "DOMAIN_NAME"),
    )
    mappacks_dir: str = Field(
        default="/var/cache/odysseus/mappacks",
        validation_alias=AliasChoices("ODYSSEUS_MAPPACKS_DIR", "MAPPACKS_DIR"),
    )
    mcp_token: str = ""
    mcp_token_file: str = ""
    integration_token: str = ""
    integration_token_file: str = ""
    immich_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_IMMICH_API_KEY", "IMMICH_API_KEY"),
    )
    immich_api_key_file: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_IMMICH_API_KEY_FILE", "IMMICH_API_KEY_FILE"),
    )
    plutus_api_url: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_PLUTUS_API_URL", "PLUTUS_API_URL"),
    )
    chronos_api_url: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_CHRONOS_API_URL", "CHRONOS_API_URL"),
    )
    immich_api_url: str = Field(
        default="",
        validation_alias=AliasChoices("ODYSSEUS_IMMICH_API_URL", "IMMICH_API_URL"),
    )

    model_config = SettingsConfigDict(
        env_prefix="ODYSSEUS_",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def _load_and_validate(self) -> "Settings":
        """Resolve Swarm secret files and validate production configuration."""
        self._load_secret_files()
        if self.environment.strip().lower() == "production":
            self._validate_production_requirements()
        if "database_url" not in self.model_fields_set and self.db_password:
            self.database_url = (
                f"postgresql+psycopg://{quote_plus(self.db_user)}:{quote_plus(self.db_password)}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        return self

    def _load_secret_files(self) -> None:
        bindings = (
            ("db_password", "db_password_file", "Database password"),
            ("mcp_token", "mcp_token_file", "MCP token"),
            ("integration_token", "integration_token_file", "Integration token"),
            ("immich_api_key", "immich_api_key_file", "Immich API key"),
        )
        for value_attr, file_attr, label in bindings:
            file_path = getattr(self, file_attr)
            if file_path:
                loaded = _read_secret_file(file_path, label)
                if not getattr(self, value_attr):
                    setattr(self, value_attr, loaded)

    def _validate_production_requirements(self) -> None:
        required = (
            ("db_password", "ODYSSEUS_DB_PASSWORD (or ODYSSEUS_DB_PASSWORD_FILE)"),
            ("mcp_token", "ODYSSEUS_MCP_TOKEN (or ODYSSEUS_MCP_TOKEN_FILE)"),
            ("integration_token", "ODYSSEUS_INTEGRATION_TOKEN (or ODYSSEUS_INTEGRATION_TOKEN_FILE)"),
            ("immich_api_key", "IMMICH_API_KEY (or IMMICH_API_KEY_FILE)"),
            ("plutus_api_url", "PLUTUS_API_URL"),
            ("chronos_api_url", "CHRONOS_API_URL"),
            ("immich_api_url", "IMMICH_API_URL"),
            ("domain_name", "DOMAIN_NAME"),
        )
        missing = [label for attr, label in required if not getattr(self, attr).strip()]
        if missing:
            raise ValueError(f"Missing required production configuration: {', '.join(missing)}")


settings = Settings()
