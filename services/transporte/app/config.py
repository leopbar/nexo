import os

CONSOLIDACAO_URL = os.environ.get("CONSOLIDACAO_URL", "http://localhost:8003").rstrip("/")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
# Prisma (opcional): com o endereço definido, todo pacote passa por ele antes de seguir para a central.
PRISMA_URL = os.environ.get("PRISMA_URL", "").rstrip("/") or None
