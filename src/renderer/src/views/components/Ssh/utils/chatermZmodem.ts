import { nextTick, ref } from 'vue'
import Zmodem from 'zmodem.js'

const api = window.api as any

interface MarkedResponse {
  data: string
  raw: Buffer[]
  marker?: string
}

type U8 = Uint8Array
type OutputHandler = (resp: any) => void

export function useZmodem() {
  const progressModalVisible = ref(false)
  const progressType = ref<'upload' | 'download'>('upload')
  const currentProgress = ref(0)
  const currentFileName = ref('')
  const isSzCanceling = ref(false)
  const totalSize = ref(0)
  const transferSize = ref(0)
  const transferSpeed = ref(0)
  const progressStatus = ref<'normal' | 'error'>('normal')

  let zsentry: any = null
  let isZmodemActive = false
  let activeZSession: any = null
  let lastProgress = -1
  let lastTime = Date.now()
  let lastReceived = 0
  let cancelWatchdog: any = null
  let decoder = new TextDecoder('utf-8', { fatal: false })

  const SZ_SESSION_END_WATCHDOG_MS = 2500

  const externalHandlers = {
    checkEditorMode: null as OutputHandler | null,
    handleServerOutput: null as OutputHandler | null,
    sendBinaryData: null as OutputHandler | null
  }

  const updateSpeed = (currentReceived: number) => {
    const now = Date.now()
    const timeDiff = (now - lastTime) / 1000
    if (timeDiff >= 1) {
      // Update the rate once per second
      const sizeDiff = currentReceived - lastReceived
      transferSpeed.value = sizeDiff / timeDiff
      lastTime = now
      lastReceived = currentReceived
    }
  }

  // Initialize progress
  const resetProgressState = () => {
    progressModalVisible.value = false
    currentProgress.value = 0
    currentFileName.value = ''
    progressStatus.value = 'normal'
    lastProgress = -1
    activeZSession = null
    transferSize.value = 0
    transferSpeed.value = 0
  }

  function ensureU8(x: any): Uint8Array {
    if (!x) return new Uint8Array()
    if (x instanceof Uint8Array) return x
    if (x instanceof ArrayBuffer) return new Uint8Array(x)
    if (Array.isArray(x)) return Uint8Array.from(x)
    if (x.buffer instanceof ArrayBuffer) {
      return new Uint8Array(x.buffer, x.byteOffset ?? 0, x.byteLength ?? x.length ?? 0)
    }
    return new Uint8Array()
  }

  function fixLrzszLineBreak(u8: Uint8Array): Uint8Array {
    if (!u8.length) return u8
    const out: number[] = []
    for (let i = 0; i < u8.length; i++) {
      const b = u8[i]
      // Only handle 0x8a that follows \r (0x0d)
      // Avoid 0x8a, which is mostly a component of Chinese characters
      if (b === 0x8a && i > 0 && u8[i - 1] === 0x0d) {
        out.push(0x0a)
        continue
      }
      out.push(b)
    }
    return Uint8Array.from(out)
  }

  function stripZmodemPreambleLine(u8: Uint8Array): Uint8Array {
    if (!u8.length) return u8
    const out: number[] = []
    let i = 0
    while (i < u8.length) {
      const isStarStar = u8[i] === 0x2a && u8[i + 1] === 0x2a
      if (isStarStar) {
        const isDirectB = u8[i + 2] === 0x42
        const isEscB = u8[i + 2] === 0x18 && u8[i + 3] === 0x42
        if (isDirectB || isEscB) {
          while (i < u8.length) {
            const b = u8[i]
            i++
            if (b === 0x0a) break
            if (b === 0x0d && i < u8.length && u8[i] === 0x0a) {
              i++
              break
            }
          }
          continue
        }
      }
      out.push(u8[i])
      i++
    }
    return Uint8Array.from(out)
  }

  function stripZmodemBinaryNoise(u8: Uint8Array): Uint8Array {
    if (!isZmodemActive || !u8.length) return u8
    const out: number[] = []
    let i = 0
    while (i < u8.length) {
      const b = u8[i]
      if (b === 0x18) {
        // Only multiple consecutive 0x18s are the true ZModem cancellation signals
        let j = i
        while (j < u8.length && u8[j] === 0x18) j++
        let count = j - i
        if (count >= 3) {
          // Only three or more consecutive occurrences are considered noise
          i = j
          continue
        }
      }

      out.push(u8[i])
      i++
    }
    return Uint8Array.from(out)
  }

  // Remove additional display information
  function stripZmodemText(text: string): string {
    if (!isZmodemActive) return text
    return text
      .replace(/waiting to receive\.[^\r\n]*[\r\n]*/gi, '')
      .replace(/Receiving: [^\r\n]*[\r\n]*/gi, '')
      .replace(/Bytes received:[^\r\n]*[\r\n]*/gi, '')
      .replace(/sz: skipped:[^\r\n]*[\r\n]*/gi, '')
      .replace(/^(rz|sz)\s*$/gm, '')
      .replace(/(rz|sz)\s*\r?\n\s*\[/g, '[')
      .replace(/\n{3,}/g, '\n\n')
  }

  // Sanitize raw data
  function sanitizeIncomingForDisplay(raw: any): Uint8Array {
    let u8 = ensureU8(raw)
    if (!u8.length) return u8

    u8 = fixLrzszLineBreak(u8)
    u8 = stripZmodemPreambleLine(u8)
    u8 = stripZmodemBinaryNoise(u8)

    return u8
  }

  function writeOctetsToTerminal(octetsLike: any, marker?: string) {
    const filtered = sanitizeIncomingForDisplay(octetsLike)
    if (!filtered.length) return

    let text = decoder.decode(filtered, { stream: true })
    text = stripZmodemText(text)
    if (!text) return

    const resp = {
      data: text,
      raw: filtered,
      marker: marker || ''
    } as any as MarkedResponse
    externalHandlers.checkEditorMode?.(resp)
    externalHandlers.handleServerOutput?.(resp)
  }

  // Close message occurred
  function abortRemoteZmodem() {
    const bytes = new Uint8Array([...Array(10).fill(0x18), ...Array(10).fill(0x08)])
    externalHandlers.sendBinaryData?.(bytes)
    // For more accuracy, please send it again
    externalHandlers.sendBinaryData?.(bytes)
  }

  function setUploadProgress(r: number) {
    const percent = Math.floor(r * 100)
    if (percent !== lastProgress || r >= 1) {
      if (!progressModalVisible.value) {
        progressModalVisible.value = true
        progressType.value = 'upload'
      }
      currentProgress.value = r
      lastProgress = percent
    }
  }

  function setDownloadProgress(r: number) {
    const percent = Math.floor(r * 100)
    if ((percent !== lastProgress || r >= 1) && r != 0) {
      if (!progressModalVisible.value) {
        progressModalVisible.value = true
        progressType.value = 'download'
      }
      currentProgress.value = r
      lastProgress = percent
    }
  }

  function startCancelWatchdog() {
    if (cancelWatchdog) clearTimeout(cancelWatchdog)
    cancelWatchdog = setTimeout(() => {
      if (activeZSession?.abort) {
        try {
          isSzCanceling.value = false
          activeZSession.abort()
        } catch (e) {}
      }
    }, 1000)
  }

  function createSessionEndWatchdog(zsession: any, cleanup: (tag?: string) => void) {
    let t: any = null
    const arm = (reason: string) => {
      clearTimeout(t)
      t = setTimeout(async () => {
        console.warn(` We have not received the session (possibly lost OO), and the session has been forcibly terminated：${reason}`)
        try {
          await zsession.close?.()
        } catch {}
        cleanup('watchdog_force_close')
      }, SZ_SESSION_END_WATCHDOG_MS)
    }
    const disarm = () => {
      clearTimeout(t)
      t = null
    }
    return { arm, disarm }
  }

  async function sendPickedWithProgress(zsession: any, picked: any[]) {
    const files = picked.map((f: any) => ({
      name: f.name,
      lastModified: f.lastModified ?? Date.now(),
      u8: ensureU8(f.data)
    }))
    const total = files.reduce((s, f) => s + f.u8.byteLength, 0) || 1
    totalSize.value = total
    if (files.length > 0) {
      currentFileName.value = files[0].name
      progressModalVisible.value = true
      progressType.value = 'upload'
      currentProgress.value = 0
      await nextTick()
    }
    try {
      for (const f of files) {
        const xfer = await zsession.send_offer({
          name: f.name,
          size: f.u8.byteLength,
          mtime: new Date(f.lastModified),
          mode: 0o100644
        })
        if (!xfer) continue
        const CHUNK = 128 * 1024
        for (let off = 0; off < f.u8.byteLength; off += CHUNK) {
          // Check if the user has clicked cancel
          if (!progressModalVisible.value) {
            throw new Error('User Aborted')
          }
          const slice = f.u8.subarray(off, Math.min(off + CHUNK, f.u8.byteLength))
          xfer.send(slice)
          transferSize.value += slice.byteLength
          updateSpeed(transferSize.value)
          setUploadProgress(transferSize.value / total)
          if ((off / CHUNK) % 5 === 0) await new Promise((r) => setTimeout(r, 0))
        }
        await xfer.end?.(new Uint8Array())
      }
      setUploadProgress(1)
    } catch (e: any) {
      if (e.message !== 'User Aborted') {
        progressStatus.value = 'error'
      }
      throw e
    }
  }

  const initZmodemHooks = (handlers: { checkEditorMode: OutputHandler; handleServerOutput: OutputHandler; sendBinaryData: OutputHandler }) => {
    externalHandlers.checkEditorMode = handlers.checkEditorMode
    externalHandlers.handleServerOutput = handlers.handleServerOutput
    externalHandlers.sendBinaryData = handlers.sendBinaryData
  }

  const initZmodem = () => {
    if (zsentry) return zsentry
    zsentry = new Zmodem.Sentry({
      to_terminal: (octets: Uint8Array) => {
        writeOctetsToTerminal(octets, '')
      },
      sender: (octets: U8) => externalHandlers.sendBinaryData?.(octets),
      on_retract: () => {},
      on_detect: async (detection: any) => {
        isZmodemActive = true
        const zsession = detection.confirm()
        activeZSession = zsession
        const cleanup = (tag?: string) => {
          isZmodemActive = false
          if (tag !== 'send_done' && tag !== 'xfer_complete') resetProgressState()
          if (tag === 'send_done') {
            setTimeout(() => {
              progressModalVisible.value = false
            }, 1000)
          }
          if (tag !== 'session_end') {
            if (isSzCanceling.value) {
              isSzCanceling.value = false
            }
          }
          externalHandlers.sendBinaryData?.(new Uint8Array([0x0d, 0x0a]))
        }
        try {
          if (zsession.type === 'receive') {
            if (typeof zsession.allow_missing_OO === 'function') zsession.allow_missing_OO(true)
            const watchdog = createSessionEndWatchdog(zsession, cleanup)
            let pendingTransfers = 0
            zsession.on('session_end', () => {
              watchdog.disarm()
              cleanup('session_end')
            })
            zsession.on('offer', async (xfer: any) => {
              setDownloadProgress(0)
              watchdog.disarm()
              pendingTransfers++
              const { name, size } = xfer.get_details()
              currentFileName.value = name
              totalSize.value = size || 0
              transferSize.value = 0
              const savePath = await api.pickSavePath(name)
              if (!savePath) {
                try {
                  xfer.skip()
                } finally {
                  pendingTransfers--
                  if (pendingTransfers <= 0)
                    setTimeout(() => {
                      if (pendingTransfers <= 0) watchdog.arm('user_skip_all')
                    }, 300)
                }
                return
              }
              const streamId = await api.openStream(savePath)
              let lastProgressUpdate = 0
              xfer.on('input', async (payload: any) => {
                if (isSzCanceling.value) {
                  startCancelWatchdog()
                  return
                }
                const u8 = ensureU8(payload)
                if (!u8.length) return
                api.writeChunk(streamId, u8)
                transferSize.value += u8.byteLength
                updateSpeed(transferSize.value)
                const now = Date.now()
                if (size && (now - lastProgressUpdate > 100 || transferSize.value >= size)) {
                  setDownloadProgress(transferSize.value / size)
                  lastProgressUpdate = now
                }
              })
              await xfer.accept()
              xfer.on('complete', async () => {
                try {
                  if (size) setDownloadProgress(1)
                  await api.closeStream(streamId)
                } finally {
                  pendingTransfers--
                  if (pendingTransfers <= 0) watchdog.arm('xfer_complete')
                }
              })
            })
            zsession.start?.()
          }
          if (zsession.type === 'send') {
            const picked = await api.pickUploadFiles()
            if (!picked || picked.length === 0) {
              abortRemoteZmodem()
              try {
                await zsession.close?.()
              } catch {}
              cleanup('send_cancel')
              await new Promise((resolve) => setTimeout(resolve, 100))
              return
            }
            if (!progressModalVisible.value) {
              progressType.value = 'upload'
              progressModalVisible.value = true
            }
            await sendPickedWithProgress(zsession, picked)
            try {
              await zsession.close?.()
            } catch {}
            cleanup('send_done')
            return
          }
        } catch (e) {
          try {
            await zsession.close?.()
          } catch {}
          cleanup('error')
        }
      }
    })
    return zsentry
  }

  const consumeZmodemIncoming = (response: MarkedResponse) => {
    const { raw, marker } = response
    const u8 = ensureU8(raw)
    if (!u8.length || !zsentry) return
    zsentry._to_terminal = (octets: Uint8Array) => {
      writeOctetsToTerminal(octets, marker)
    }
    // Each shard is 16KB
    const CHUNK_SIZE = 16384
    let offset = 0

    try {
      // Chunk processing
      while (offset < u8.length) {
        zsentry.consume(u8.subarray(offset, offset + CHUNK_SIZE))
        offset += CHUNK_SIZE
      }
    } catch (e: any) {
      const errorMsg = String(e?.message || e || '').toLowerCase()
      const isZmodemProtocolError =
        errorMsg.includes('peer aborted session') ||
        errorMsg.includes('zfin') ||
        errorMsg.includes('protocol') ||
        errorMsg.includes('should be "oo"') ||
        errorMsg.includes('should be oo') ||
        errorMsg.includes('unhandled header: zrqinit') ||
        errorMsg.includes('unhandled header: zack')

      if (isZmodemProtocolError) {
        if (errorMsg.includes('unhandled header: zack') && progressModalVisible.value) {
          progressStatus.value = 'error'
        }

        if (isZmodemActive) {
          isZmodemActive = false
          resetProgressState()
        }
        if (isSzCanceling.value) {
          isZmodemActive = false
          activeZSession = null
          resetProgressState()
          zsentry = null
          initZmodem()
          isSzCanceling.value = false
          externalHandlers.sendBinaryData?.(new Uint8Array([0x0d, 0x0a]))
          return
        }

        zsentry = null
        initZmodem()
        try {
          // Process the remaining data
          writeOctetsToTerminal(u8)
        } catch (e2) {}
        return
      }
      throw e
    }
  }

  const handleProgressCancel = async () => {
    if (activeZSession) {
      try {
        abortRemoteZmodem()
        isSzCanceling.value = true
        if (progressType.value === 'download') {
          startCancelWatchdog()
        }
      } catch (e) {
        if (isSzCanceling.value) isSzCanceling.value = false
      }
    }
    externalHandlers.sendBinaryData?.(new Uint8Array([0x0d, 0x0a]))
    if (progressType.value !== 'download') resetProgressState()
  }

  const handleProgressClose = async () => {
    resetProgressState()
    if (isSzCanceling.value) {
      isSzCanceling.value = false
    }
  }

  return {
    progressModalVisible,
    progressType,
    currentProgress,
    currentFileName,
    transferSpeed,
    totalSize,
    transferSize,
    progressStatus,
    isSzCanceling,
    initZmodemHooks,
    initZmodem,
    consumeZmodemIncoming,
    handleProgressCancel,
    handleProgressClose
  }
}
