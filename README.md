# Nexo

Plataforma de processamento distribuído de registros, capaz de coletar, transmitir,
consolidar e observar dados sob condições normais ou anômalas, preservando o histórico de
todas as transformações e ocorrências.

Em tempo real, 10 unidades coletam registros classificados em 5 itens e só depois
distribuem seus extratos, em pacotes, por tubulações individuais até a consolidação na
central. O objetivo é deixar visível a separação entre **quem coleta** (as unidades) e
**quem consolida** (a central), e o que acontece com os dados quando o caminho entre elas
falha.

```
 painel (React + PixiJS) ── só comanda e observa (HTTP + WebSocket) ──┐
                                                                       │
 ┌───────────────┐     ┌─────────────────┐     ┌────────────────┐      │
 │ coleta        │────▶│ transporte      │────▶│ consolidação   │◀─────┘
 │ (unidades)    │◀────│ latência, perda,│◀────│ (central)      │
 │ PostgreSQL A  │ ACK │ corrupção, queda│ ACK │ PostgreSQL B   │
 └───────────────┘     └───────┬─────────┘     └────────────────┘
                               │ cada pacote passa pela ponte
                       ┌───────▼─────────┐
                       │ Prisma          │◀── tela própria (React)
                       │ reclassificação │
                       │ PostgreSQL C    │
                       └─────────────────┘
```

## Como rodar

### Com Docker (recomendado)

```bash
docker compose up --build
```

Abra http://localhost:8090 (Nexo) e http://localhost:8094 (Prisma). As APIs ficam em `:8091` (coleta), `:8092` (transporte), `:8093` (consolidação) e `:8095` (Prisma), com documentação em `/docs`. As portas podem ser trocadas com `PAINEL_PORTA`, `COLETA_PORTA`, `TRANSPORTE_PORTA`, `CONSOLIDACAO_PORTA`, `PRISMA_PORTA` e `PRISMA_API_PORTA`.

### Sem Docker (desenvolvimento)

Os serviços usam SQLite automaticamente quando `DATABASE_URL` não é definido.

```bash
python -m venv .venv
.venv/Scripts/pip install -r services/coleta/requirements-dev.txt   # Linux/macOS: .venv/bin/pip
```

Em terminais separados, a partir da raiz:

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
.venv/Scripts/python -m uvicorn app.main:app --app-dir services/prisma --port 8004
```

```bash
npm --prefix painel install && npm --prefix painel run dev
```

```bash
npm --prefix painel-prisma install && npm --prefix painel-prisma run dev
```

Painel do Nexo em http://localhost:5173 e do Prisma em http://localhost:5174 (o Vite faz
proxy de `/api/<serviço>` para cada porta). Sem Docker, o transporte só passa os pacotes
pelo Prisma se `PRISMA_URL=http://localhost:8004` estiver definido.

## Fases

| # | Fase | Coleta (unidades) | Consolidação (central) |
|---|------|-------------------|------------------------|
| 1 | Configuração | `configuracao` → `pronta` | `configuracao` → `pronta` |
| 2 | Coleta | `coleta`: grava registros a cada segundo | `aguardando`: recusa tudo (503) |
| 3 | Fechamento | `fechada`: terminais travados, extrato e pacotes gerados do banco | `aguardando` |
| 4 | Distribuição e consolidação | `distribuindo`: manifesto + pacotes com ACK | `habilitada`: valida, soma, verifica |
| 5 | Consolidação final | `distribuida` | `consolidacao_final`: maior contagem + equivalência |

Cada sistema guarda a própria fase e recusa (HTTP 409) comandos fora de hora. Exemplo: o
botão *Habilitar consolidação* fica disponível durante a coleta justamente para mostrar a
recusa — a consolidação sabe o horário de fechamento pelo seu próprio relógio, sem
perguntar nada à coleta.

Todos os passos depois do fechamento (habilitar a consolidação, distribuir e reenviar)
são manuais: nada avança sem um clique no painel.

## Decisões de projeto

- **Contrato, não código compartilhado.** [`contracts/`](contracts/README.md) define
  manifesto, pacote e ACK/NACK em Pydantic e publica JSON Schemas versionados. Cada
  serviço tem seus próprios modelos e um teste que os compara ao esquema publicado.
- **Simulação de anomalias no transporte.** Nem a unidade nem a central fingem atrasos:
  o serviço `transporte` aplica a latência da tubulação (3 s na unidade mais próxima,
  10 s na mais distante, mais variação), perda, corrupção (troca um dígito do corpo),
  atraso extremo e quedas de link. Um pacote perdido deixa a conexão pendurada; a unidade
  só descobre pelo timeout.
- **Entrega garantida.** Timeout de ACK, reenvio com backoff exponencial e limite
  de tentativas. Queda de link não consome tentativas (a unidade espera reconectar). Ids
  de pacote são estáveis (UUIDv5 de operação/unidade/lote), então a central descarta
  duplicados e reenvios nunca somam duas vezes.
- **Validação.** Checksum SHA-256 e assinatura HMAC por unidade em cada pacote;
  manifesto assinado com o hash do extrato. Ao receber o último lote, a central recalcula
  o hash e verifica os totais antes de marcar a unidade como validada.
- **Rastreabilidade.** Tudo o que a central recebe, aceita, rejeita ou descarta como
  duplicado vira um evento gravado no log da consolidação, com o motivo.
- **Relógios independentes.** Cada serviço tem seu relógio de simulação; pausar e
  acelerar (1x, 2x, 5x) é o mesmo comando enviado aos três e ao relógio de animação do
  painel. Timeouts e latências são medidos em tempo simulado.
- **Painel só observa.** Pontos e pacotes animados são desenhados a partir de eventos
  (`andamento`, `transito`, `perdido`, `corrompido`, `retorno`...), nunca carregam registros.
- **Extrato do banco.** O extrato de cada terminal é calculado a partir dos registros
  gravados (e verificado contra uma agregação SQL), não dos contadores em memória.

## Agentes de IA

Com **Agentes de IA** ligado na configuração, os registros deixam de ser amostrados
localmente e passam a vir de modelos da OpenAI. O ritmo de chegada aos terminais continua
o mesmo; quem chega entra numa fila e, a cada lote de participantes (padrão 50), um
modelo sorteado entre os ligados recebe o catálogo de itens e devolve um código por
participante, inclusive vazio (`V`) e inválido (`I`). O prompt tem cerca de 100 tokens e
a resposta é só a lista de códigos.

- A chave e os modelos ficam no botão do robô no cabeçalho. A chave é guardada no banco
  da coleta (ou vem de `OPENAI_API_KEY`) e nunca volta inteira para o painel.
- O esforço de raciocínio é sempre o mínimo que cada modelo aceita (`none`, depois
  `minimal`, depois `low`).
- Desligar um modelo o tira da coleta na hora, mesmo com a operação em andamento.
- Se uma chamada falhar ou vier incompleta, os registros que faltam são gerados por
  amostragem, como no modo comum.
- Quando o tempo acaba a entrada fecha, mas quem já estava na fila ainda é atendido. O
  mapa mostra "Coleta fechada", o relógio e o card de cobertura mostram quantos
  participantes faltam, e os terminais só travam quando a última fila esvazia.
- A velocidade fica travada em 1x, porque a resposta dos modelos não acelera; para
  uma operação mais curta ou mais longa, ajuste a duração.
- Só a coleta muda: a consolidação recebe os mesmos extratos e não sabe como foram gerados.
- Os preços do catálogo de modelos ([`agentes.py`](services/coleta/app/agentes.py)) são os
  da página da OpenAI em outubro de 2026 e servem para a estimativa e o gasto exibidos.

## Prisma

O Prisma é um sistema à parte, com back-end, banco e tela próprios, que fica no caminho
entre o transporte e a central. Todo pacote passa por ele; desligado, ele só registra a
passagem e devolve o pacote sem alteração.

- Na tela do Prisma você escolhe o **item alvo** e ativa o sistema a qualquer momento,
  inclusive com a distribuição em andamento.
- Ligado, ele mantém os registros do item alvo e, dos registros de cada um dos demais
  itens, reclassifica o **percentual configurado** (padrão 50%) para o item alvo. Como os
  pacotes trazem contagens por lote, a fração é aplicada às contagens; o que não fecha um
  registro inteiro fica como resto para o lote seguinte da mesma unidade, então o total
  converge para o percentual exato.
- **Nada é criado nem apagado:** o total de cada pacote, os vazios e os inválidos não mudam.
- **Granularidade** nas configurações: todas as tubulações ou só as unidades selecionadas.
- **Transformador confiável:** o pacote segue com as contagens e a assinatura originais da
  unidade e ganha um bloco `transformacao` com as contagens efetivas, assinado com a chave
  do Prisma (`PRISMA_CHAVE`, compartilhada com a central). A central verifica o original
  contra o manifesto, verifica o bloco do Prisma (assinatura, total, vazios, inválidos e que
  só o item alvo recebeu registros) e consolida as contagens efetivas. Um bloco que não
  passa nessas regras é recusado com NACK.
- **Mesma saída para o mesmo pacote:** cada pacote é decidido uma vez por operação; um
  reenvio (por perda, corrupção ou queda de link) recebe exatamente o mesmo corpo.
- **Rastreabilidade:** cada passagem (reclassificada, intacta ou reenvio) fica no banco do
  Prisma com as contagens antes e depois, e aparece na tela; a central também guarda, por
  pacote, o original, o efetivo e o bloco do Prisma.
- Se o Prisma estiver fora do ar, o transporte segue com o pacote original.

## Regras de consolidação

Registros vazios e inválidos são contados e exibidos, mas o item predominante sai só dos
registros classificados, pela maior contagem. Em caso de equivalência: (1) prevalece o
item predominante em mais unidades; (2) persistindo, uma seleção determinística a partir
da seed e do id da operação, registrada no log da consolidação.

## Testes

```bash
cd services/coleta && ../../.venv/Scripts/python -m pytest
cd services/consolidacao && ../../.venv/Scripts/python -m pytest
cd services/transporte && ../../.venv/Scripts/python -m pytest
cd services/prisma && ../../.venv/Scripts/python -m pytest
.venv/Scripts/python scripts/e2e.py
```

`scripts/e2e.py` sobe os quatro serviços em processos separados e roda duas operações
curtas e aceleradas com 10% de perda, 5% de corrupção, atraso extremo e uma queda de link.
Na primeira, com o Prisma desligado, a consolidação final da central bate registro a
registro com os extratos dos terminais. Na segunda, o Prisma é ligado no meio da
distribuição, e a central tem que bater com os extratos menos o que o Prisma tirou de cada
item e mais o que ele pôs no item alvo, com o total intacto.

Para regenerar os esquemas do contrato: `python contracts/gerar_schemas.py`.

## Estrutura

```
contracts/              contrato v1 (fonte Pydantic + JSON Schemas)
services/coleta/        terminais, extrato, distribuidor (FastAPI, SQLAlchemy async, Alembic)
services/transporte/    proxy com latência e falhas
services/consolidacao/  recepção, validação, verificação e consolidação final
services/prisma/        reclassificação em trânsito e rastreabilidade (FastAPI, SQLAlchemy async, Alembic)
painel/                 React + TypeScript + Vite, Tailwind, PixiJS, ECharts, Zustand, Motion
painel-prisma/          tela do Prisma (React + TypeScript + Vite, Tailwind, Zustand)
scripts/e2e.py          operação ponta a ponta
```
