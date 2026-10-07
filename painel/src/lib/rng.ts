/** Gerador pseudoaleatório determinístico (mulberry32) para o mapa. */
export class Rng {
  private estado: number

  constructor(semente: number) {
    this.estado = semente >>> 0
  }

  proximo(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0
    let t = this.estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  entre(min: number, max: number): number {
    return min + (max - min) * this.proximo()
  }

  inteiro(min: number, max: number): number {
    return Math.floor(this.entre(min, max + 1))
  }
}

export function sementeAleatoria(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
