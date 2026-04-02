from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import os

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')

class Settings(BaseSettings):
    DATABASE_URL: str
    EXCHANGE: str = "binance"
    API_KEY: str = ""
    API_SECRET: str = ""
    RISK_PER_TRADE: float = 0.02
    MAX_POSITIONS: int = 5
    PARTIAL_TP: bool = True
    PARTIAL_TP_PCT: float = 0.5
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    WEBHOOK_SECRET: str = "change_me"
    
    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_postgres_driver(cls, v: str) -> str:
        if v and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v
    
    model_config = SettingsConfigDict(env_file=env_path)

settings = Settings()
