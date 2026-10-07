import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./consolidacao.db")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
