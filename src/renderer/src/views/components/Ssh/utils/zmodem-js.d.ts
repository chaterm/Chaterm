declare module 'zmodem.js' {
  export type U8 = Uint8Array<ArrayBufferLike>

  export interface Detection {
    confirm(): Session
  }
  export interface Session {
    type: 'send' | 'receive'
    start(): void
    on(event: string, cb: (...args: any[]) => void): void
    close?: () => void | Promise<void>
  }

  export interface SentryOpts {
    to_terminal: (octets: U8) => void
    sender: (octets: U8) => void
    on_retract: (octets: U8) => void
    on_detect: (detection: Detection) => void | Promise<void>
  }

  export class Sentry {
    constructor(cfg: SentryOpts)
    consume(octets: U8 | ArrayBuffer | number[]): void
  }

  export const Browser: any

  const Zmodem: {
    Sentry: typeof Sentry
    Browser: typeof Browser
    DEBUG: boolean
  }

  export default Zmodem
}
