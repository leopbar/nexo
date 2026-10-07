# Contrato v1 — unidades ⇄ central

O contrato é a única coisa que os dois sistemas compartilham. Não há código em
comum: `contrato_v1.py` é a fonte, `v1/*.schema.json` são os esquemas gerados
(`python contracts/gerar_schemas.py`), e cada serviço tem seus próprios modelos
Pydantic, verificados em teste contra estes esquemas.

## Mensagens

| Mensagem    | Quem envia             | Rota na rede simulada        | Rota na consolidação      |
|-------------|------------------------|------------------------------|-----------------------|
| `Manifesto` | distribuidor da unidade  | `POST /encaminhar/manifesto` | `POST /entrada/manifesto` |
| `Pacote`    | distribuidor da unidade  | `POST /encaminhar/pacote`    | `POST /entrada/pacote`    |
| `Resposta`  | consolidação (ACK / NACK)  | volta pela mesma conexão     | —                     |

A consolidação responde `503` enquanto não estiver habilitada (a coleta ainda está
aberta). Qualquer outra resposta é um `Resposta` com HTTP 200.

## Forma canônica e validação

`canonico(x)` = JSON UTF-8 com chaves ordenadas e separadores `,` e `:` sem espaços
(`json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`).

- **checksum do pacote** = `sha256(canonico(pacote sem "checksum" e "assinatura"))`
- **assinatura do pacote** = `hmac_sha256(chave_da_unidade, checksum)`
- **assinatura do manifesto** = `hmac_sha256(chave_da_unidade, sha256(canonico(manifesto sem "assinatura")))`
- **hash do extrato** = `sha256(canonico({"operacao_id", "unidade_id", "lotes": [contagens do lote 1, 2, ...]}))`

Todos em hexadecimal minúsculo. A chave HMAC de cada unidade é distribuída aos dois
sistemas na configuração da operação.

## Referência da resposta

`Resposta.referencia` é o `id` do pacote ou, para manifestos, o `hash_extrato`.

## Cabeçalhos de transporte

O distribuidor envia, além do corpo, os cabeçalhos `X-Envio-Id`, `X-Pacote-Id`,
`X-Unidade`, `X-Tipo`, `X-Lote` e `X-Tentativa`. Eles servem só à rede simulada
e à observação; a consolidação confia apenas no corpo assinado.
