import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./prisma.db")
COLETA_URL = os.environ.get("COLETA_URL", "http://localhost:8001").rstrip("/")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
# Chave HMAC compartilhada com a central: assina cada reclassificação.
PRISMA_CHAVE = os.environ.get("PRISMA_CHAVE", "prisma-chave-local-de-desenvolvimento")
