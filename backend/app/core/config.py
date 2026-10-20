from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./ustad.db"
    languagetool_url: str = "http://localhost:8010"


settings = Settings()
