export class BrownEventEmitter<T extends Record<string, any[]>> {
  private listeners: { [K in keyof T]?: Array<(...args: T[K]) => void> } = {}

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event]!.push(listener)
    return this
  }

  once<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    const onceWrapper = (...args: T[K]) => {
      this.off(event, onceWrapper)
      listener(...args)
    }
    return this.on(event, onceWrapper)
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    const eventListeners = this.listeners[event]
    if (eventListeners) {
      const index = eventListeners.indexOf(listener)
      if (index !== -1) {
        eventListeners.splice(index, 1)
      }
    }
    return this
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
    const eventListeners = this.listeners[event]
    if (eventListeners && eventListeners.length > 0) {
      eventListeners.forEach((listener) => {
        try {
          listener(...args)
        } catch (error) {
          console.error('Event listener error:', error)
        }
      })
      return true
    }
    return false
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      delete this.listeners[event]
    } else {
      this.listeners = {}
    }
    return this
  }
}
