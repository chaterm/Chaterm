export class Semaphore {
  private maxConcurrency: number
  private current = 0
  private queue: Array<() => void> = []

  constructor(maxConcurrency: number) {
    this.maxConcurrency = Math.max(1, maxConcurrency)
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.current < this.maxConcurrency) {
          this.current += 1
          resolve(() => this.release())
        } else {
          this.queue.push(tryAcquire)
        }
      }
      tryAcquire()
    })
  }

  private release() {
    this.current -= 1
    const next = this.queue.shift()
    if (next) next()
  }
}
