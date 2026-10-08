# Contrato v1 — unidades ⇄ central

O contrato é a única coisa que os dois sistemas compartilham. Não há código em
comum: `contrato_v1.py` é a fonte, `v1/*.schema.json` são os esquemas gerados
(`python contracts/gerar_schemas.py`), e cada serviço tem seus próprios modelos
Pydantic, verificados em teste contra estes esquemas.

## Mensagens

| Mensagem    | Quem envia                | Rota no transporte simulado  | Rota na consolidação      |
|-------------|---------------------------|------------------------------|---------------------------|
| `Manifesto` | distribuidor da unidade   | `POST /encaminhar/manifesto` | `POST /entrada/manifesto` |
| `Pacote`    | distribuidor da unidade   | `POST /encaminhar/pacote`    | `POST /entrada/pacote`    |
| `Resposta`  | consolidação (ACK / NACK) | volta pela mesma conexão     | —                         |

A consolidação responde `503` enquanto não estiver habilitada (a coleta ainda está
aberta). Qualquer outra resposta é um `Resposta` com HTTP 200.

## Forma canônica e verificação de integridade dos dados

`canonico(x)` = JSON UTF-8 com chaves ordenadas e separadores `,` e `:` sem espaços
(`json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`).

- **checksum do pacote** = `sha256(canonico(pacote sem "checksum", "assinatura" e "transformacao"))`
- **assinatura do pacote** = `hmac_sha256(chave_da_unidade, checksum)`
- **assinatura do manifesto** = `hmac_sha256(chave_da_unidade, sha256(canonico(manifesto sem "assinatura")))`
- **hash do extrato** = `sha256(canonico({"operacao_id", "unidade_id", "lotes": [contagens do lote 1, 2, ...]}))`

Todos em hexadecimal minúsculo. A chave HMAC de cada unidade é distribuída aos dois
sistemas na configuração da operação.

## Reclassificação pelo Prisma

Quando o Prisma reclassifica um lote, o pacote mantém `contagens`, `checksum` e
`assinatura` da unidade e ganha o campo opcional `transformacao`
(`v1/transformacao.schema.json`):

- `pacote_id` e `checksum_original` amarram o bloco ao pacote original;
- `item_alvo` e `percentual` registram a regra aplicada;
- `contagens` são as contagens efetivas, que a central consolida;
- **assinatura do Prisma** = `hmac_sha256(chave_do_prisma, sha256(canonico(transformacao sem "assinatura")))`.

A central só aceita o bloco se a assinatura conferir e se ele apenas mover registros dos
demais itens para o item alvo: mesmo total, mesmos vazios e inválidos, nenhum item além do
alvo ganhando registros. A verificação contra o manifesto continua usando as contagens
originais da unidade.

## Referência da resposta

`Resposta.referencia` é o `id` do pacote ou, para manifestos, o `hash_extrato`.

## Cabeçalhos de transporte

O distribuidor envia, além do corpo, os cabeçalhos `X-Envio-Id`, `X-Pacote-Id`,
`X-Unidade`, `X-Tipo`, `X-Lote` e `X-Tentativa`. Eles servem só ao transporte
simulado e à observação; a consolidação confia apenas no corpo assinado.
