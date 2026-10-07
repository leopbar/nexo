/**
 * Relógio de simulação do painel. As animações (pontos, pacotes, pulsos) usam
 * este relógio, que recebe os mesmos comandos de pausa e escala enviados aos
 * serviços — assim o que se vê corresponde ao que acontece na rede.
 */
class RelogioPainel {
  private baseSim = 0
  private baseReal = performance.now()
  escala = 1
  pausado = false

  agora(): number {
    if (this.pausado) return this.baseSim
    return this.baseSim + ((performance.now() - this.baseReal) / 1000) * this.escala
  }

  private rebasear() {
    this.baseSim = this.agora()
    this.baseReal = performance.now()
  }

  pausar() {
    if (this.pausado) return
    this.rebasear()
    this.pausado = true
  }

  retomar() {
    if (!this.pausado) return
    this.baseReal = performance.now()
    this.pausado = false
  }

  definirEscala(escala: number) {
    this.rebasear()
    this.escala = escala
  }
}

export const relogio = new RelogioPainel()
