import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./consolidacao.db")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
# Chave HMAC compartilhada com o Prisma; só reclassificações assinadas com ela são aceitas.
PRISMA_CHAVE = os.environ.get("PRISMA_CHAVE", "prisma-chave-local-de-desenvolvimento")
