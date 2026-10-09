import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { copyImageToClipboard, formatTokenCount } from '../utils'

describe('formatTokenCount', () => {
  it('formats million-token context windows with M units', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
  })

  it('keeps smaller token counts in compact K units', () => {
    expect(formatTokenCount(1_000)).toBe('1K')
    expect(formatTokenCount(16_800)).toBe('16.8K')
    expect(formatTokenCount(999)).toBe('999')
  })
})

describe('copyImageToClipboard', () => {
  const write = vi.fn<(items: ClipboardItem[]) => Promise<void>>()
  let lastImage: { onload: (() => void) | null; onerror: (() => void) | null; src: string; naturalWidth: number; naturalHeight: number }

  beforeEach(() => {
    write.mockReset().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Promise<Blob>>) {}
      }
    )
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        naturalWidth = 2
        naturalHeight = 3
        private _src = ''
        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          lastImage = this
        }
        get src() {
          return this._src
        }
        set src(value: string) {
          this._src = value
        }
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const writtenBlob = () => (write.mock.calls[0][0][0] as unknown as { items: Record<string, Promise<Blob>> }).items['image/png']

  it('writes PNG data straight to the clipboard', async () => {
    await copyImageToClipboard('image/png', btoa('png-bytes'))

    const blob = await writtenBlob()
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe('png-bytes'.length)
  })

  it('re-encodes other formats to PNG through a canvas', async () => {
    const pngBlob = new Blob(['x'], { type: 'image/png' })
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void) => cb(pngBlob)
    }
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvas : realCreate(tag)) as typeof document.createElement)

    const pending = copyImageToClipboard('image/jpeg', 'abc')
    expect(lastImage.src).toBe('data:image/jpeg;base64,abc')
    lastImage.onload?.()
    await pending

    await expect(writtenBlob()).resolves.toBe(pngBlob)
    expect(canvas.width).toBe(2)
    expect(canvas.height).toBe(3)
    expect(drawImage).toHaveBeenCalled()
  })

  it('rejects when the image cannot be decoded', async () => {
    const pending = copyImageToClipboard('image/webp', 'bad')
    const assertion = expect(writtenBlob()).rejects.toThrow('Image decode failed')
    lastImage.onerror?.()
    await assertion
    await pending
  })

  it('rejects when no 2D context is available', async () => {
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? { getContext: () => null } : realCreate(tag)) as typeof document.createElement)

    const pending = copyImageToClipboard('image/gif', 'abc')
    const assertion = expect(writtenBlob()).rejects.toThrow('Canvas 2D context unavailable')
    lastImage.onload?.()
    await assertion
    await pending
  })

  it('rejects when PNG encoding yields no blob', async () => {
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas'
        ? { getContext: () => ({ drawImage: vi.fn() }), toBlob: (cb: (b: Blob | null) => void) => cb(null) }
        : realCreate(tag)) as typeof document.createElement)

    const pending = copyImageToClipboard('image/gif', 'abc')
    const assertion = expect(writtenBlob()).rejects.toThrow('PNG encoding failed')
    lastImage.onload?.()
    await assertion
    await pending
  })
})
