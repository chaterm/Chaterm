import { parentPort } from 'node:worker_threads'
import { chunkDocument } from './chunker'
import type { ChunkedDocument } from './types'

interface ChunkerWorkerRequest {
  id: number
  content: string
  relPath: string
}

interface ChunkerWorkerResponse {
  id: number
  ok: boolean
  result?: ChunkedDocument
  error?: { name: string; message: string }
}

if (!parentPort) throw new Error('Knowledge base chunker worker requires a parent port')
const port = parentPort

port.on('message', (request: ChunkerWorkerRequest) => {
  let response: ChunkerWorkerResponse
  try {
    response = {
      id: request.id,
      ok: true,
      result: chunkDocument(request.content, request.relPath)
    }
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : 'Knowledge base chunking failed'
      }
    }
  }
  port.postMessage(response)
})
