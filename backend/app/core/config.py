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
    # End-of-session voice review grades every line in one call: give the local model time and room.
    # Must stay >= 90 s (llama3.1:8b on a laptop CPU). num_ctx: Ollama's default context window is small
    # (2048 or 4096 tokens depending on the version), which would cut a long session's transcript.
    ollama_review_timeout: float = 180.0
    ollama_review_num_ctx: int = 8192
    timezone: str = "Europe/Berlin"
    seed_dir: Path = REPO_ROOT / "data" / "seed"
    # Built frontend (served by FastAPI in production). Ignored if the folder does not exist.
    static_dir: Path = REPO_ROOT / "frontend" / "dist"
    session_days: int = 30
    # Server-side TTS fallback (docs/architecture.md §8): Piper, only used when the browser has no
    # German speechSynthesis voice. Empty = off. Example: PIPER_BIN=piper PIPER_MODEL=/models/de_DE-thorsten-medium.onnx
    piper_bin: str = ""
    piper_model: str = ""
    # Commute Podcast (Phase 4): optional English Piper voice for the prompts (e.g. en_US-lessac-medium);
    # without it the episode is German only (listen, repeat in your head, hear it again).
    piper_model_en: str = ""
    # ffmpeg turns the episode WAV into mp3; if it is missing the episode stays WAV.
    ffmpeg_bin: str = "ffmpeg"
    # Nightly Author job (APScheduler inside the app): 2 graded texts per day, 2 days ahead.
    jobs_enabled: bool = True
    author_hour: int = 3  # Europe/Berlin
    audio_dir: Path = REPO_ROOT / "audio"
    # Set to bootstrap the login password without the CLI: an argon2 hash, never the plain password.
    password_hash: str = ""

    @property
    def cookie_secure(self) -> bool:
        return self.app_env != "dev"


settings = Settings()
