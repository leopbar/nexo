import os

CONSOLIDACAO_URL = os.environ.get("CONSOLIDACAO_URL", "http://localhost:8003").rstrip("/")
LOG_JSON = os.environ.get("LOG_JSON", "0") == "1"
