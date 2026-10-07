import { COR_ACK, COR_VAZIO, COR_DUPLICADO, COR_NACK, COR_INVALIDO, corItem } from '../lib/cores'
import { useOperacao, useFaseGeral } from '../store/operacao'

function Item({ cor, rotulo, forma = 'ponto' }: { cor: string; rotulo: string; forma?: 'ponto' | 'pacote' | 'contorno' | 'losango' | 'traco' }) {
  return (
    <span className="flex items-center gap-1.5">
      {forma === 'ponto' && <span className="h-2 w-2 rounded-full" style={{ background: cor }} />}
      {forma === 'pacote' && <span className="h-2 w-3 rounded-[2px]" style={{ background: cor }} />}
      {forma === 'contorno' && <span className="h-2.5 w-3.5 rounded-[3px] border" style={{ borderColor: cor }} />}
      {forma === 'losango' && <span className="h-2 w-2 rotate-45" style={{ background: cor }} />}
      {forma === 'traco' && <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: cor }} />}
      {rotulo}
    </span>
  )
}

export function Legenda() {
  const fase = useFaseGeral()
  const nomes = useOperacao((s) => s.config.nomesItens)
  const porPonto = useOperacao((s) => s.config.participantesPorPonto)
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 flex max-w-[60%] flex-wrap justify-end gap-x-3 gap-y-1 rounded-lg border border-zinc-900 bg-black/70 px-3 py-2 text-[10px] text-zinc-400 backdrop-blur">
      {fase === 'coleta' || fase === 'configuracao' ? (
        <>
          {nomes.map((n, i) => (
            <Item key={i} cor={corItem(i)} rotulo={n} />
          ))}
          <Item cor={COR_VAZIO} rotulo="vazio" />
          <Item cor={COR_INVALIDO} rotulo="invalido" />
          <span className="text-zinc-600">· cada ponto = {porPonto} participantes</span>
        </>
      ) : (
        <>
          <Item cor="#ffffff" rotulo="manifesto" forma="losango" />
          <Item cor="#60a5fa" rotulo="pacote (cor da unidade)" forma="pacote" />
          <Item cor="#ffffff" rotulo="reenvio" forma="contorno" />
          <Item cor={COR_ACK} rotulo="ACK" />
          <Item cor={COR_NACK} rotulo="NACK / perdido" />
          <Item cor={COR_DUPLICADO} rotulo="duplicado descartado" />
          <Item cor={COR_NACK} rotulo="link caído" forma="traco" />
        </>
      )}
    </div>
  )
}
