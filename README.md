# Nexo

Uma operação corporativa em tempo real: 10 unidades registram em 5 itens da central e só
depois distribuem seus extratos, em pacotes, por tubulações individuais até a consolidação
central. O objetivo didático é deixar visível a separação entre **quem coleta** (as
unidades) e **quem totaliza** (a central).

```
 painel (React + PixiJS) ── só comanda e observa (HTTP + WebSocket) ──┐
                                                                       │
 ┌───────────────┐     ┌─────────────────┐     ┌────────────────┐      │
 │ coleta       │────▶│ rede simulada   │────▶│ consolidação       │◀─────┘
 │ (unidades)     │◀────│ latência, perda,│◀────│ (central)       │
 │ PostgreSQL A  │ ACK │ corrupção, queda│ ACK │ PostgreSQL B   │
 └───────────────┘     └─────────────────┘     └────────────────┘
```

## Como rodar

### Com Docker (recomendado)

```bash
docker compose up --build
```

Abra http://localhost:8090. As APIs ficam em `:8091` (coleta), `:8092` (transporte) e `:8093` (consolidação), com documentação em `/docs`. As portas podem ser trocadas com `PAINEL_PORTA`, `COLETA_PORTA`, `TRANSPORTE_PORTA` e `CONSOLIDACAO_PORTA`.

### Sem Docker (desenvolvimento)

Os serviços usam SQLite automaticamente quando `DATABASE_URL` não é definido.

```bash
python -m venv .venv
.venv/Scripts/pip install -r services/coleta/requirements-dev.txt   # Linux/macOS: .venv/bin/pip
```

Em quatro terminais, a partir da raiz:

```bash
.venv/Scripts/python -m uvicorn app.main:app --app-dir services/coleta --port 8001
```

```bash
.venv/Scripts/python -m uvicorn app.main:app --app-dir services/transporte --port 8002
```

```bash
.venv/Scripts/python -m uvicorn app.main:app --app-dir services/consolidacao --port 8003
```

```bash
npm --prefix painel install && npm --prefix painel run dev
```

Painel em http://localhost:5173 (o Vite faz proxy de `/api/<serviço>` para cada porta).

## Fases

| # | Fase | Coleta (unidades) | Consolidação (central) |
|---|------|-------------------|-------------------|
| 1 | Configuração | `configuracao` → `pronta` | `configuracao` → `pronta` |
| 2 | Coleta | `coleta`: registra registros a cada segundo | `aguardando`: recusa tudo (503) |
| 3 | Fechamento | `fechada`: terminais travados, extrato e pacotes gerados do banco | `aguardando` |
| 4 | Distribuição e consolidação | `distribuindo`: manifesto + pacotes com ACK | `habilitada`: valida, soma, verifica |
| 5 | Consolidação final | `distribuida` | `consolidacao_final`: maior contagem + equivalência |

Cada sistema guarda a própria fase e recusa (HTTP 409) comandos fora de hora. Exemplo: o
botão *Habilitar consolidação* fica disponível durante a coleta justamente para mostrar a
recusa — a consolidação sabe o horário de fechamento pelo seu próprio relógio, sem
perguntar nada à coleta.

O modo **Automático** do painel avança sozinho do fechamento à distribuição e
redistribui falhas.

## Decisões de projeto

- **Contrato, não código compartilhado.** [`contracts/`](contracts/README.md) define
  manifesto, pacote e ACK/NACK em Pydantic e publica JSON Schemas versionados. Cada
  serviço tem seus próprios modelos e um teste que os compara ao esquema publicado.
- **A rede é que é lenta.** Nem a unidade nem a central fingem atrasos: o serviço `transporte`
  aplica a latência da tubulação (3 s na unidade mais próxima, 10 s na mais distante,
  mais variação), perda, corrupção (troca um dígito do corpo), atraso extremo e quedas de
  link. Um pacote perdido deixa a conexão pendurada; a unidade só descobre pelo timeout.
- **Entrega garantida.** Timeout de ACK, reenvio com backoff exponencial e limite
  de tentativas. Queda de link não consome tentativas (a unidade espera reconectar). Ids
  de pacote são estáveis (UUIDv5 de operação/unidade/lote), então a central descarta
  duplicados e reenvios nunca somam duas vezes.
- **Validação.** Checksum SHA-256 e assinatura HMAC por unidade em cada pacote;
  manifesto assinado com o hash do extrato. Ao receber o último lote, a central recalcula
  o hash e verifica os totais antes de marcar a unidade como processada.
- **Relógios independentes.** Cada serviço tem seu relógio de simulação; pausar e
  acelerar (1x, 2x, 5x) é o mesmo comando enviado aos três e ao relógio de animação do
  painel. Timeouts e latências são medidos em tempo simulado.
- **Painel só observa.** Pontos e pacotes animados são desenhados a partir de eventos
  (`andamento`, `transito`, `perdido`, `corrompido`, `retorno`...), nunca carregam registros.
- **Extrato do banco.** O extrato de terminal é calculado a partir dos registros gravados (e
  validado contra uma agregação SQL), não dos contadores em memória.

## Regras de consolidação

Vazios e inválidos são contados e exibidos, mas o predominante sai só dos registros válidos, pela
maior contagem, em uma única etapa. Em caso de equivalência: (1) prevalece o item que predomina em mais unidades;
(2) persistindo, seleção reprodutível a partir da seed e do id da operação, registrado no
log da consolidação.

## Testes

```bash
cd services/coleta && ../../.venv/Scripts/python -m pytest
cd services/consolidacao && ../../.venv/Scripts/python -m pytest
cd services/transporte && ../../.venv/Scripts/python -m pytest
.venv/Scripts/python scripts/e2e.py
```

`scripts/e2e.py` sobe os três serviços em processos separados, roda uma operação curta e
acelerada com 10% de perda, 5% de corrupção, atraso extremo e uma queda de link, e
verifica que a consolidação final da central bate registro a registro com os extratos dos terminais.

Para regenerar os esquemas do contrato: `python contracts/gerar_schemas.py`.

## Estrutura

```
contracts/          contrato v1 (fonte Pydantic + JSON Schemas)
services/coleta/   terminais, extrato, distribuidor (FastAPI, SQLAlchemy async, Alembic)
services/transporte/      proxy com latência e falhas
services/consolidacao/  recepção, validação, verificação e consolidacao_final
painel/             React + TypeScript + Vite, Tailwind, PixiJS, ECharts, Zustand, Motion
scripts/e2e.py      operação ponta a ponta
```
