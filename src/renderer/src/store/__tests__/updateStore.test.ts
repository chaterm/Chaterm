import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const isEnterpriseDeployEnabled = vi.fn()
vi.mock('@/utils/edition', () => ({
  isEnterpriseDeployEnabled: () => isEnterpriseDeployEnabled()
}))

import { useUpdateStore } from '../updateStore'

const mockApi = {
  autoUpdate: vi.fn(),
  checkUpdate: vi.fn(),
  download: vi.fn(),
  quitAndInstall: vi.fn()
}

describe('updateStore', () => {
  let store: ReturnType<typeof useUpdateStore>
  let emit: (params: { status?: number; version?: string }) => void
  let removeListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    ;(globalThis as any).createRendererLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
    ;(window as any).api = mockApi
    isEnterpriseDeployEnabled.mockReturnValue(false)
    removeListener = vi.fn()
    mockApi.autoUpdate.mockImplementation((cb) => {
      emit = cb
      return removeListener
    })
    mockApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: false, updateInfo: { version: '0.12.6' } })
    mockApi.download.mockResolvedValue([])
    setActivePinia(createPinia())
    store = useUpdateStore()
  })

  afterEach(() => {
    store.stop()
    vi.useRealTimers()
  })

  it('does nothing for enterprise deployments', async () => {
    isEnterpriseDeployEnabled.mockReturnValue(true)
    store.start()
    expect(mockApi.autoUpdate).not.toHaveBeenCalled()
    expect(mockApi.checkUpdate).not.toHaveBeenCalled()

    store.phase = 'ready'
    store.install()
    expect(mockApi.quitAndInstall).not.toHaveBeenCalled()
  })

  it('registers the listener once and ignores repeated start calls', async () => {
    store.start()
    store.start()
    expect(mockApi.autoUpdate).toHaveBeenCalledTimes(1)
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not download when no update is available', async () => {
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.download).not.toHaveBeenCalled()
    expect(store.phase).toBe('idle')
  })

  it('downloads when an update is available and shows the card once downloaded', async () => {
    mockApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '1.2.3' } })
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.download).toHaveBeenCalledTimes(1)
    expect(store.phase).toBe('downloading')
    expect(store.cardVisible).toBe(false)

    emit({ status: 4, version: '1.2.3' })
    expect(store.phase).toBe('ready')
    expect(store.version).toBe('1.2.3')
    expect(store.cardVisible).toBe(true)
  })

  it('keeps the known version when the downloaded event carries none', async () => {
    mockApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '1.2.3' } })
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    emit({ status: 4 })
    expect(store.version).toBe('1.2.3')
  })

  it('falls back to idle when the download fails', async () => {
    mockApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '1.2.3' } })
    mockApi.download.mockRejectedValue(new Error('network'))
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.phase).toBe('idle')
  })

  it('returns to idle on an updater error while downloading, and ignores it otherwise', async () => {
    mockApi.checkUpdate.mockResolvedValue({ isUpdateAvailable: true })
    mockApi.download.mockReturnValue(new Promise(() => {}))
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.phase).toBe('downloading')
    expect(store.version).toBe('')

    emit({ status: -1 })
    expect(store.phase).toBe('idle')

    store.phase = 'ready'
    emit({ status: -1 })
    expect(store.phase).toBe('ready')
  })

  it('ignores progress events', async () => {
    store.start()
    emit({ status: 3 })
    expect(store.phase).toBe('idle')
    expect(store.cardVisible).toBe(false)
  })

  it('skips the check while a download is in flight or ready', async () => {
    store.phase = 'downloading'
    await store.check()
    store.phase = 'ready'
    await store.check()
    expect(mockApi.checkUpdate).not.toHaveBeenCalled()
  })

  it('treats a null check result as no update', async () => {
    mockApi.checkUpdate.mockResolvedValue(null)
    await store.check()
    expect(mockApi.download).not.toHaveBeenCalled()
    expect(store.phase).toBe('idle')
  })

  it('rechecks periodically while idle', async () => {
    store.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(2)
  })

  it('stop clears the timer and allows start to register again', async () => {
    store.start()
    store.stop()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(mockApi.checkUpdate).toHaveBeenCalledTimes(1)

    store.start()
    expect(mockApi.autoUpdate).toHaveBeenCalledTimes(2)
  })

  it('stop removes the update listener so a stopped store ignores later events', () => {
    store.start()
    expect(removeListener).not.toHaveBeenCalled()

    store.stop()
    expect(removeListener).toHaveBeenCalledTimes(1)

    store.stop()
    expect(removeListener).toHaveBeenCalledTimes(1)
  })

  it('stop is safe when never started', () => {
    expect(() => store.stop()).not.toThrow()
  })

  it('install calls quitAndInstall only when ready', () => {
    store.install()
    expect(mockApi.quitAndInstall).not.toHaveBeenCalled()

    store.phase = 'ready'
    store.install()
    expect(mockApi.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('dismissCard hides the card, keeps the ready phase and remembers the version', () => {
    store.phase = 'ready'
    store.version = '1.2.3'
    store.cardVisible = true
    store.dismissCard()
    expect(store.cardVisible).toBe(false)
    expect(store.phase).toBe('ready')
    expect(localStorage.getItem('update-card-dismissed-version')).toBe('1.2.3')
  })

  it('does not show the card again for a version dismissed in an earlier run', () => {
    localStorage.setItem('update-card-dismissed-version', '1.2.3')
    setActivePinia(createPinia())
    const restarted = useUpdateStore()
    restarted.start()

    emit({ status: 4, version: '1.2.3' })
    expect(restarted.phase).toBe('ready')
    expect(restarted.cardVisible).toBe(false)
  })

  it('shows the card for a newer version than the dismissed one', () => {
    localStorage.setItem('update-card-dismissed-version', '1.2.3')
    setActivePinia(createPinia())
    const restarted = useUpdateStore()
    restarted.start()

    emit({ status: 4, version: '1.2.4' })
    expect(restarted.cardVisible).toBe(true)
  })
})
