export class HeartbeatManager {
  timers: Map<string, any>
  constructor() {
    this.timers = new Map()
  }

  start(heartbeatId, interval, webContents) {
    // 如果已有定时器，先取消
    this.stop(heartbeatId)

    const timerId = setInterval(() => {
      webContents.send('heartbeat-tick', heartbeatId)
    }, interval)

    this.timers.set(heartbeatId, timerId)
  }

  stop(heartbeatId) {
    const timerId = this.timers.get(heartbeatId)
    if (timerId) {
      clearInterval(timerId)
      this.timers.delete(heartbeatId)
    }
  }

  stopAll() {
    for (const [, timerId] of this.timers) {
      clearInterval(timerId)
    }
    this.timers.clear()
  }
}
