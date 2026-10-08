"""Gera os JSON Schemas versionados a partir de contrato_v1.py.

Uso: python contracts/gerar_schemas.py
"""

import json
from pathlib import Path

from contrato_v1 import MODELOS

DESTINO = Path(__file__).parent / "v1"


def main() -> None:
    DESTINO.mkdir(exist_ok=True)
    for nome, modelo in MODELOS.items():
        caminho = DESTINO / f"{nome}.schema.json"
        esquema = modelo.model_json_schema()
        caminho.write_text(json.dumps(esquema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"gerado {caminho.relative_to(Path.cwd()) if caminho.is_relative_to(Path.cwd()) else caminho}")


if __name__ == "__main__":
    main()
