import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export type OpcaoGrafico = echarts.EChartsCoreOption

export const EIXO = {
  axisLine: { lineStyle: { color: '#27272a' } },
  axisTick: { show: false },
  axisLabel: { color: '#71717a', fontSize: 10, fontFamily: 'Geist Mono Variable, monospace' },
  splitLine: { lineStyle: { color: '#18181b' } },
}

export const DICA = {
  backgroundColor: '#09090b',
  borderColor: '#27272a',
  textStyle: { color: '#e4e4e7', fontSize: 11 },
}

export function Grafico({ opcao, className }: { opcao: OpcaoGrafico; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const instancia = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const grafico = echarts.init(ref.current!, null, { renderer: 'canvas' })
    instancia.current = grafico
    const observador = new ResizeObserver(() => grafico.resize())
    observador.observe(ref.current!)
    return () => {
      observador.disconnect()
      grafico.dispose()
      instancia.current = null
    }
  }, [])

  useEffect(() => {
    instancia.current?.setOption(opcao, { lazyUpdate: true })
  }, [opcao])

  return <div ref={ref} className={className} />
}
