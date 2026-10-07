/**
 * Cena WebGL do mapa (PixiJS): território, tubulações, participantes chegando às unidades
 * e pacotes trafegando até a central.
 *
 * Nada aqui transporta registros. Tudo é desenhado a partir de eventos: "enviado"
 * e "timeout" (coleta), "em trânsito", "perdido", "corrompido" e "retorno"
 * (transporte), e o estado de cada unidade na consolidação. O tempo é o do relógio de
 * simulação do painel, então pausar ou acelerar afeta a animação por igual.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'

import { barramento } from '../lib/barramento'
import { COR_ACK, COR_DUPLICADO, COR_NACK, COR_RECUSADO, corClasse, corItem, hexParaNumero } from '../lib/cores'
import { relogio } from '../lib/relogio'
import type { Mensagem } from '../lib/tipos'
import { pontoNoTubo, type UnidadeTopo, type Ponto, type Topologia } from '../lib/topologia'
import { useOperacao } from '../store/operacao'

interface Particula {
  sprite: Sprite
  x0: number
  y0: number
  cx: number
  cy: number
  x1: number
  y1: number
  t0: number
  dur: number
  unidadeId: number
}

interface PacoteAnim {
  unidade: UnidadeTopo
  t0: number
  dur: number
  estado: 'ida' | 'chegou' | 'perdido'
  tEstado: number
  corpo: Container
  escalaBase: number
}

interface Pulso {
  unidade: UnidadeTopo
  t0: number
  dur: number
  cor: number
}

interface Clarao {
  x: number
  y: number
  t0: number
  dur: number
  cor: number
  raio: number
}

type EstadoTubo = 'apagada' | 'acesa' | 'offline' | 'validada' | 'falha'

const MAX_PARTICULAS = 6000
const COR_RETORNO: Record<string, string> = { ACK: COR_ACK, duplicado: COR_DUPLICADO, NACK: COR_NACK, recusado: COR_RECUSADO }

function linha(g: Graphics, pts: Ponto[]) {
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
}

/** Traceja uma polilinha; a fase desloca o padrão ao longo do caminho. */
function tracejar(g: Graphics, pts: Ponto[], ligado: number, desligado: number, fase = 0) {
  const periodo = ligado + desligado
  let pos = ((fase % periodo) + periodo) % periodo
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const comp = Math.hypot(b.x - a.x, b.y - a.y)
    if (comp === 0) continue
    let feito = 0
    while (feito < comp - 1e-6) {
      const aceso = pos < ligado
      const passo = Math.min(aceso ? ligado - pos : periodo - pos, comp - feito)
      if (aceso) {
        const t0 = feito / comp
        const t1 = (feito + passo) / comp
        g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1)
      }
      feito += passo
      pos = (pos + passo) % periodo
    }
  }
}

function suavizar(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
}

export class CenaMapa {
  private app = new Application()
  private iniciada = false
  private destruida = false
  private host: HTMLElement | null = null
  private observador: ResizeObserver | null = null
  private desligar: (() => void) | null = null

  private mundo = new Container()
  private fundo = new Graphics()
  private tubos = new Graphics()
  private camadaParticulas = new Container()
  private camadaPacotes = new Container()
  private efeitos = new Graphics()
  private nos = new Graphics()
  private nomeTerritorio: Text | null = null

  private texPonto!: Texture
  private texPacote!: Texture
  private texContorno!: Texture
  private texManifesto!: Texture

  private topo: Topologia | null = null
  private unidadesPorId = new Map<number, UnidadeTopo>()
  private particulas: Particula[] = []
  private livres: Sprite[] = []
  private pacotes = new Map<string, PacoteAnim>()
  private pulsos: Pulso[] = []
  private claroes: Clarao[] = []
  private resto = new Map<number, number[]>()
  private ultimoToque = new Map<number, number>()
  private vista = { x0: 0, y0: 0, x1: 1600, y1: 1000 }

  async montar(host: HTMLElement) {
    this.host = host
    await this.app.init({
      background: '#000000',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      width: Math.max(host.clientWidth, 1),
      height: Math.max(host.clientHeight, 1),
    })
    if (this.destruida) {
      this.app.destroy(true, { children: true, texture: true })
      return
    }
    this.iniciada = true
    this.app.canvas.style.position = 'absolute'
    this.app.canvas.style.inset = '0'
    host.appendChild(this.app.canvas)
    this.criarTexturas()
    this.mundo.addChild(this.fundo, this.tubos, this.camadaParticulas, this.camadaPacotes, this.efeitos, this.nos)
    this.app.stage.addChild(this.mundo)
    this.app.ticker.add(() => this.quadro())
    this.observador = new ResizeObserver(() => this.ajustar())
    this.observador.observe(host)
    this.desligar = barramento.ouvir((m) => this.aoEvento(m))
    if (this.topo) this.desenharFundo()
    this.ajustar()
  }

  destruir() {
    this.destruida = true
    this.desligar?.()
    this.observador?.disconnect()
    if (this.iniciada) this.app.destroy(true, { children: true, texture: true })
  }

  definirTopologia(topo: Topologia) {
    this.topo = topo
    this.unidadesPorId = new Map(topo.unidades.map((f) => [f.id, f]))
    this.limparAnimacoes()
    if (this.iniciada) {
      this.desenharFundo()
      this.ajustar()
    }
  }

  // ------------------------------------------------------------ preparação

  private criarTexturas() {
    const gerar = (g: Graphics) => {
      const tex = this.app.renderer.generateTexture({ target: g, resolution: 3, antialias: true })
      g.destroy()
      return tex
    }
    this.texPonto = gerar(new Graphics().circle(0, 0, 8).fill(0xffffff))
    this.texPacote = gerar(new Graphics().roundRect(-8, -5, 16, 10, 3).fill(0xffffff))
    this.texContorno = gerar(new Graphics().roundRect(-11.5, -8.5, 23, 17, 5).stroke({ width: 2, color: 0xffffff }))
    this.texManifesto = gerar(new Graphics().poly([0, -8, 8, 0, 0, 8, -8, 0], true).fill(0xffffff))
  }

  private ajustar() {
    if (!this.iniciada || !this.host || !this.topo) return
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (w === 0 || h === 0) return
    this.app.renderer.resize(w, h)
    const { largura, altura } = this.topo
    const escala = Math.min(w / largura, h / altura) * 0.97
    const dx = (w - largura * escala) / 2
    const dy = (h - altura * escala) / 2
    this.mundo.scale.set(escala)
    this.mundo.position.set(dx, dy)
    this.vista = { x0: -dx / escala, y0: -dy / escala, x1: (w - dx) / escala, y1: (h - dy) / escala }
    useOperacao.getState().definirViewport({ escala, dx, dy })
  }

  private desenharFundo() {
    const topo = this.topo
    if (!topo) return
    const g = this.fundo
    g.clear()

    for (let x = 16; x < topo.largura; x += 32) for (let y = 16; y < topo.altura; y += 32) g.circle(x, y, 1.1)
    g.fill({ color: 0x27272a, alpha: 0.55 })

    const contorno = topo.contorno.flatMap((p) => [p.x, p.y])
    g.poly(contorno, true).stroke({ width: 22, color: 0x52525b, alpha: 0.05 })
    g.poly(contorno, true).fill({ color: 0x0b0b0e })
    g.poly(contorno, true).stroke({ width: 1.6, color: 0x52525b, alpha: 0.9 })

    for (const regiao of topo.regioes) tracejar(g, regiao, 7, 6)
    g.stroke({ width: 1.2, color: 0x3f3f46, alpha: 0.6 })

    for (const rio of topo.rios) {
      linha(g, rio)
      g.stroke({ width: 2.4, color: 0x1d4ed8, alpha: 0.4, cap: 'round', join: 'round' })
    }

    for (const v of topo.vilas) g.circle(v.x, v.y, 2.2)
    g.fill({ color: 0x3f3f46, alpha: 0.9 })

    if (!this.nomeTerritorio) {
      this.nomeTerritorio = new Text({
        text: '',
        resolution: 2,
        style: { fontFamily: 'Geist Variable, Inter, sans-serif', fontSize: 22, fill: 0x71717a, letterSpacing: 9, fontWeight: '500' },
      })
      this.nomeTerritorio.alpha = 0.55
      this.mundo.addChildAt(this.nomeTerritorio, 1)
    }
    this.nomeTerritorio.text = topo.nomeTerritorio.toUpperCase()
    this.nomeTerritorio.position.set(28, 18)
  }

  private limparAnimacoes() {
    for (const p of this.particulas) {
      p.sprite.visible = false
      this.livres.push(p.sprite)
    }
    this.particulas = []
    for (const p of this.pacotes.values()) p.corpo.destroy({ children: true })
    this.pacotes.clear()
    this.pulsos = []
    this.claroes = []
    this.resto.clear()
  }

  // ---------------------------------------------------------------- eventos

  private aoEvento(m: Mensagem) {
    if (!this.topo) return
    const d = m.dados
    const agora = relogio.agora()

    if (m.tipo === 'reiniciado' || (m.origem === 'coleta' && m.tipo === 'configurada')) {
      this.limparAnimacoes()
      return
    }

    if (m.origem === 'coleta') {
      if (m.tipo === 'andamento') this.soltarParticipantes(d)
      else if (m.tipo === 'timeout') {
        const f = this.unidadesPorId.get(d.unidade_id)
        if (f) this.clarao(f.pos, COR_RECUSADO, 18, 0.8)
      }
      return
    }

    if (m.origem !== 'transporte') return
    const f = this.unidadesPorId.get(d.unidade_id)
    if (!f) return
    const central = this.topo.central.pos

    switch (m.tipo) {
      case 'transito': {
        const manifesto = d.tipo === 'manifesto'
        const corpo = new Container()
        const base = new Sprite(manifesto ? this.texManifesto : this.texPacote)
        base.anchor.set(0.5)
        base.tint = manifesto ? 0xffffff : hexParaNumero(f.cor)
        corpo.addChild(base)
        if (d.reenvio) {
          const contorno = new Sprite(this.texContorno)
          contorno.anchor.set(0.5)
          contorno.tint = 0xffffff
          corpo.addChild(contorno)
        }
        const escalaBase = manifesto ? 1.05 : 0.85
        corpo.scale.set(escalaBase)
        corpo.position.set(f.pos.x, f.pos.y)
        this.camadaPacotes.addChild(corpo)
        this.pacotes.get(d.envio_id)?.corpo.destroy({ children: true })
        this.pacotes.set(d.envio_id, { unidade: f, t0: agora, dur: Math.max(d.latencia, 0.1), estado: 'ida', tEstado: agora, corpo, escalaBase })
        this.clarao(f.pos, f.cor, 16, 0.5)
        break
      }
      case 'perdido': {
        const p = this.pacotes.get(d.envio_id)
        if (p && p.estado !== 'perdido') {
          p.estado = 'perdido'
          p.tEstado = agora
          for (const filho of p.corpo.children) (filho as Sprite).tint = hexParaNumero(COR_NACK)
          this.clarao(p.corpo.position, COR_NACK, 14, 0.9)
        }
        break
      }
      case 'corrompido': {
        const p = this.pacotes.get(d.envio_id)
        if (p) for (const filho of p.corpo.children) (filho as Sprite).tint = hexParaNumero(COR_NACK)
        this.clarao(central, COR_NACK, 40, 0.9)
        break
      }
      case 'retorno': {
        const p = this.pacotes.get(d.envio_id)
        if (p) {
          p.corpo.destroy({ children: true })
          this.pacotes.delete(d.envio_id)
        }
        const cor = COR_RETORNO[d.consolidacao_final] ?? COR_DUPLICADO
        this.pulsos.push({ unidade: f, t0: agora, dur: Math.max(d.latencia, 0.25), cor: hexParaNumero(cor) })
        if (d.consolidacao_final !== 'ACK') this.clarao(central, cor, 46, 1)
        break
      }
      case 'recusado':
        this.clarao(f.pos, COR_NACK, 20, 0.7)
        break
    }
  }

  private clarao(p: Ponto, cor: string | number, raio: number, dur: number) {
    this.claroes.push({ x: p.x, y: p.y, t0: relogio.agora(), dur, cor: typeof cor === 'string' ? hexParaNumero(cor) : cor, raio })
  }

  private soltarParticipantes(d: any) {
    const { participantesPorPonto } = useOperacao.getState().config
    const porPonto = Math.max(1, participantesPorPonto)
    for (const andamento of d.unidades) {
      const f = this.unidadesPorId.get(andamento.id)
      if (!f) continue
      const novos = andamento.novos
      const n = novos.itens.length
      const valores: number[] = [...novos.itens, novos.vazios, novos.invalidos]
      const resto = this.resto.get(f.id) ?? new Array(valores.length).fill(0)
      valores.forEach((v, i) => {
        resto[i] += v
        const k = Math.floor(resto[i] / porPonto)
        resto[i] -= k * porPonto
        const cor = hexParaNumero(corClasse(i, n))
        for (let j = 0; j < k; j++) this.soltarPonto(f, cor, Math.random() * d.intervalo)
      })
      this.resto.set(f.id, resto)
    }
  }

  private soltarPonto(f: UnidadeTopo, cor: number, atraso: number) {
    if (this.particulas.length >= MAX_PARTICULAS || !this.topo) return
    let sprite = this.livres.pop()
    if (!sprite) {
      sprite = new Sprite(this.texPonto)
      sprite.anchor.set(0.5)
      sprite.scale.set(0.5)
      this.camadaParticulas.addChild(sprite)
    }
    sprite.tint = cor
    sprite.visible = false
    const origem = this.origemNaBorda(f)
    const comp = Math.hypot(f.pos.x - origem.x, f.pos.y - origem.y) || 1
    const curva = (Math.random() - 0.5) * 0.5
    const cx = (origem.x + f.pos.x) / 2 - ((f.pos.y - origem.y) / comp) * comp * curva
    const cy = (origem.y + f.pos.y) / 2 + ((f.pos.x - origem.x) / comp) * comp * curva
    this.particulas.push({ sprite, x0: origem.x, y0: origem.y, cx, cy, x1: f.pos.x, y1: f.pos.y, t0: relogio.agora() + atraso, dur: 1.6 + Math.random() * 1.1, unidadeId: f.id })
  }

  /** Ponto na borda da tela, no lado de fora da unidade (vindo de longe, na direção oposta à central). */
  private origemNaBorda(f: UnidadeTopo): Ponto {
    const central = this.topo!.central.pos
    let ang = Math.atan2(f.pos.y - central.y, f.pos.x - central.x)
    if (!Number.isFinite(ang)) ang = Math.random() * Math.PI * 2
    ang += (Math.random() - 0.5) * 1.5
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const { x0, y0, x1, y1 } = this.vista
    const tx = dx > 0 ? (x1 - f.pos.x) / dx : dx < 0 ? (x0 - f.pos.x) / dx : Infinity
    const ty = dy > 0 ? (y1 - f.pos.y) / dy : dy < 0 ? (y0 - f.pos.y) / dy : Infinity
    const t = Math.max(0, Math.min(tx, ty)) + 10
    return { x: f.pos.x + dx * t, y: f.pos.y + dy * t }
  }

  // ------------------------------------------------------------------ quadro

  private quadro() {
    if (!this.topo) return
    const t = relogio.agora()
    this.desenharTubos(t)
    this.atualizarParticulas(t)
    this.atualizarPacotes(t)
    this.desenharEfeitos(t)
    this.desenharNos(t)
  }

  private estadoTubo(f: UnidadeTopo): EstadoTubo {
    const s = useOperacao.getState()
    const link = s.links[f.id]
    const terminal = s.unidades[f.id]
    const consolidacao = s.unidadesConsolidacao[f.id]
    if (link && !link.online) return 'offline'
    if (consolidacao?.status === 'validada') return 'validada'
    if (consolidacao?.status === 'falha' || terminal?.distribuicao === 'falha') return 'falha'
    if (terminal?.distribuicao === 'distribuindo' || terminal?.distribuicao === 'entregue') return 'acesa'
    return 'apagada'
  }

  private desenharTubos(t: number) {
    const g = this.tubos
    g.clear()
    for (const f of this.topo!.unidades) {
      const pts = f.amostras
      if (pts.length < 2) continue
      const estado = this.estadoTubo(f)
      linha(g, pts)
      g.stroke({ width: 8, color: 0x111114, cap: 'round', join: 'round' })
      linha(g, pts)
      g.stroke({ width: 3.2, color: estado === 'validada' ? 0x34343c : 0x232328, cap: 'round', join: 'round' })

      if (estado === 'acesa') {
        const cor = hexParaNumero(f.cor)
        const pulso = 0.5 + 0.5 * Math.sin(t * 3 + f.id)
        linha(g, pts)
        g.stroke({ width: 18, color: cor, alpha: 0.05 + 0.05 * pulso, cap: 'round', join: 'round' })
        linha(g, pts)
        g.stroke({ width: 7, color: cor, alpha: 0.22, cap: 'round', join: 'round' })
        linha(g, pts)
        g.stroke({ width: 2.4, color: cor, alpha: 0.95, cap: 'round', join: 'round' })
        tracejar(g, pts, 5, 24, -t * 42)
        g.stroke({ width: 2.4, color: 0xffffff, alpha: 0.45, cap: 'round' })
      } else if (estado === 'offline') {
        const pisca = 0.5 + 0.5 * Math.sin(t * 7)
        linha(g, pts)
        g.stroke({ width: 14, color: 0xef4444, alpha: 0.07 + 0.05 * pisca, cap: 'round', join: 'round' })
        tracejar(g, pts, 9, 8)
        g.stroke({ width: 3, color: 0xef4444, alpha: 0.6 + 0.35 * pisca })
      } else if (estado === 'falha') {
        linha(g, pts)
        g.stroke({ width: 3, color: 0x991b1b, alpha: 0.9, cap: 'round', join: 'round' })
      }
    }
  }

  private atualizarParticulas(t: number) {
    const lista = this.particulas
    for (let i = lista.length - 1; i >= 0; i--) {
      const p = lista[i]
      const k = (t - p.t0) / p.dur
      if (k < 0) {
        p.sprite.visible = false
        continue
      }
      if (k >= 1) {
        p.sprite.visible = false
        this.livres.push(p.sprite)
        lista[i] = lista[lista.length - 1]
        lista.pop()
        this.ultimoToque.set(p.unidadeId, t)
        continue
      }
      const e = suavizar(k)
      const u = 1 - e
      p.sprite.position.set(u * u * p.x0 + 2 * u * e * p.cx + e * e * p.x1, u * u * p.y0 + 2 * u * e * p.cy + e * e * p.y1)
      p.sprite.alpha = Math.min(1, k * 5) * (k > 0.88 ? (1 - k) / 0.12 : 1)
      p.sprite.visible = true
    }
  }

  private atualizarPacotes(t: number) {
    for (const [id, p] of this.pacotes) {
      if (p.estado === 'ida') {
        const k = (t - p.t0) / p.dur
        const pos = pontoNoTubo(p.unidade, Math.min(k, 1))
        p.corpo.position.set(pos.x, pos.y)
        p.corpo.rotation = pos.angulo
        if (k >= 1) {
          p.estado = 'chegou'
          p.tEstado = t
        }
      } else if (p.estado === 'chegou') {
        p.corpo.alpha = Math.max(0, 1 - (t - p.tEstado) / 1.2)
        if (t - p.tEstado > 30) this.removerPacote(id, p)
      } else {
        const k = (t - p.tEstado) / 1.3
        p.corpo.alpha = Math.max(0, 1 - k) * (0.6 + 0.4 * Math.sin(k * 30))
        p.corpo.scale.set(p.escalaBase * (1 + k * 0.9))
        if (k >= 1) this.removerPacote(id, p)
      }
    }
  }

  private removerPacote(id: string, p: PacoteAnim) {
    p.corpo.destroy({ children: true })
    this.pacotes.delete(id)
  }

  private desenharEfeitos(t: number) {
    const g = this.efeitos
    g.clear()
    this.pulsos = this.pulsos.filter((p) => {
      const k = (t - p.t0) / p.dur
      if (k >= 1) {
        this.clarao(p.unidade.pos, p.cor, 14, 0.5)
        return false
      }
      const pos = pontoNoTubo(p.unidade, 1 - Math.max(k, 0))
      g.circle(pos.x, pos.y, 9).fill({ color: p.cor, alpha: 0.18 })
      g.circle(pos.x, pos.y, 3.6).fill({ color: p.cor, alpha: 0.95 })
      return true
    })
    this.claroes = this.claroes.filter((c) => {
      const k = (t - c.t0) / c.dur
      if (k >= 1 || k < 0) return k < 0
      g.circle(c.x, c.y, c.raio * (0.45 + 0.85 * k)).stroke({ width: 2.2, color: c.cor, alpha: (1 - k) * 0.9 })
      return true
    })
  }

  private desenharNos(t: number) {
    const g = this.nos
    const topo = this.topo!
    const s = useOperacao.getState()
    g.clear()

    const c = topo.central.pos
    let anel = 0x71717a
    if (s.faseConsolidacao === 'aguardando' || s.faseConsolidacao === 'pronta') anel = 0xf59e0b
    else if (s.faseConsolidacao === 'habilitada') anel = 0x4ade80
    else if (s.faseConsolidacao === 'consolidacao_final' && s.consolidacao_final) anel = hexParaNumero(corItem(s.consolidacao_final.predominante - 1))
    const ritmo = s.faseConsolidacao === 'habilitada' ? 4 : 1.6
    const pulso = 0.5 + 0.5 * Math.sin(t * ritmo)
    g.circle(c.x, c.y, 46 + 6 * pulso).fill({ color: anel, alpha: 0.05 + 0.04 * pulso })
    g.circle(c.x, c.y, 30).fill({ color: 0x050506 })
    g.circle(c.x, c.y, 30).stroke({ width: 2, color: anel, alpha: 0.95 })
    g.circle(c.x, c.y, 22).stroke({ width: 1, color: 0xffffff, alpha: 0.15 })
    const lados = 6
    const hex: number[] = []
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2 - Math.PI / 2
      hex.push(c.x + Math.cos(a) * 10, c.y + Math.sin(a) * 10)
    }
    g.poly(hex, true).fill({ color: 0xffffff, alpha: 0.92 })

    for (const f of topo.unidades) {
      const cor = hexParaNumero(f.cor)
      const terminal = s.unidades[f.id]
      const desde = t - (this.ultimoToque.get(f.id) ?? -99)
      const brilho = Math.max(0, 1 - desde / 0.6)
      g.circle(f.pos.x, f.pos.y, 15 + 7 * brilho).fill({ color: cor, alpha: 0.07 + 0.2 * brilho })
      g.circle(f.pos.x, f.pos.y, 9.5).fill({ color: 0x050506 })
      g.circle(f.pos.x, f.pos.y, 9.5).stroke({ width: 2.4, color: cor, alpha: 0.95 })
      if (terminal?.aberta) g.circle(f.pos.x, f.pos.y, 3.6).fill({ color: cor })
      else if (terminal) g.rect(f.pos.x - 3, f.pos.y - 3, 6, 6).fill({ color: cor, alpha: 0.7 })
    }
  }
}
