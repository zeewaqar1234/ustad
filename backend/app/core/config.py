from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./ustad.db"
    languagetool_url: str = "http://localhost:8010"
    # Local Ollama server for the Tutor/Grader/Author roles (docs/llm.md). Free, nothing leaves the machine.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_timeout: float = 120.0
    timezone: str = "Europe/Berlin"
    seed_dir: Path = REPO_ROOT / "data" / "seed"
    # Built frontend (served by FastAPI in production). Ignored if the folder does not exist.
    static_dir: Path = REPO_ROOT / "frontend" / "dist"
    session_days: int = 30
    # Set to bootstrap the login password without the CLI: an argon2 hash, never the plain password.
    password_hash: str = ""

    @property
    def cookie_secure(self) -> bool:
        return self.app_env != "dev"


settings = Settings()
