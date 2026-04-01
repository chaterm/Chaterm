import { Blob, File } from 'node:buffer'
import { fetch, Headers, Request, Response, FormData } from 'undici'

const globalAny = globalThis as any

export function ensureHttpGlobals(force = false): void {
  if (force || typeof globalAny.fetch === 'undefined') {
    globalAny.fetch = fetch
  }

  if (force || typeof globalAny.Headers === 'undefined') {
    globalAny.Headers = Headers
  }

  if (force || typeof globalAny.Request === 'undefined') {
    globalAny.Request = Request
  }

  if (force || typeof globalAny.Response === 'undefined') {
    globalAny.Response = Response
  }

  if (force || typeof globalAny.FormData === 'undefined') {
    globalAny.FormData = FormData
  }

  if (force || typeof globalAny.Blob === 'undefined') {
    globalAny.Blob = Blob
  }

  if (force || typeof globalAny.File === 'undefined') {
    globalAny.File = File
  }
}

ensureHttpGlobals()
