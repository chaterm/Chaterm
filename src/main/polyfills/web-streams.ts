const globalAny = globalThis as any

if (
  typeof globalAny.ReadableStream === 'undefined' ||
  typeof globalAny.WritableStream === 'undefined' ||
  typeof globalAny.TransformStream === 'undefined'
) {
  try {
    // Node 16 in Electron 22 exposes Web Streams via stream/web,
    // but not always on globalThis.

    const webStreams = require('stream/web')

    if (typeof globalAny.ReadableStream === 'undefined' && webStreams.ReadableStream) {
      globalAny.ReadableStream = webStreams.ReadableStream
    }
    if (typeof globalAny.WritableStream === 'undefined' && webStreams.WritableStream) {
      globalAny.WritableStream = webStreams.WritableStream
    }
    if (typeof globalAny.TransformStream === 'undefined' && webStreams.TransformStream) {
      globalAny.TransformStream = webStreams.TransformStream
    }
  } catch {
    // Keep startup resilient on platforms/environments where stream/web is unavailable.
  }
}
