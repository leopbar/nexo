import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./coleta.db")
TRANSPORTE_URL = os.environ.get("TRANSPORTE_URL", "http://localhost:8002").rstrip("/")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") or None
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
