import type { Worker } from 'node:worker_threads'
import createChunkerWorker from './chunker-worker?nodeWorker'
import type { ChunkedDocument, DocumentChunker } from './types'

interface ChunkerWorkerResponse {
  id: number
  ok: boolean
  result?: ChunkedDocument
  error?: { name: string; message: string }
}

interface PendingRequest {
  resolve: (result: ChunkedDocument) => void
  reject: (error: Error) => void
}

export class ChunkerWorkerClient implements DocumentChunker {
  private readonly worker: Worker
  private readonly pending = new Map<number, PendingRequest>()
  private sequence = 0
  private closed = false

  constructor() {
    this.worker = createChunkerWorker({ name: 'kb-chunker' })
    this.worker.on('message', (response: ChunkerWorkerResponse) => this.handleResponse(response))
    this.worker.on('error', (error) => this.fail(error instanceof Error ? error : new Error(String(error))))
    this.worker.on('exit', (code) => {
      if (!this.closed) this.fail(new Error(`Knowledge base chunker worker exited with code ${code}`))
    })
    this.worker.unref()
  }

  chunkDocument(content: string, relPath: string): Promise<ChunkedDocument> {
    if (this.closed) return Promise.reject(new Error('Knowledge base chunker worker is closed'))

    const id = ++this.sequence
    return new Promise<ChunkedDocument>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, content, relPath })
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.rejectAll(new Error('Knowledge base chunker worker was closed'))
    void this.worker.terminate()
  }

  private handleResponse(response: ChunkerWorkerResponse): void {
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)

    if (response.ok && response.result) {
      pending.resolve(response.result)
      return
    }

    const error = new Error(response.error?.message ?? 'Knowledge base chunking failed')
    error.name = response.error?.name ?? 'Error'
    pending.reject(error)
  }

  private fail(error: Error): void {
    this.closed = true
    this.rejectAll(error)
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }
}
