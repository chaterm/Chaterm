import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExistsSync = vi.fn()
const mockGetEdition = vi.fn()
const mockGetEditionConfig = vi.fn()

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: mockExistsSync
  }
})

vi.mock('../edition', () => ({
  getEdition: mockGetEdition,
  getEditionConfig: mockGetEditionConfig
}))

describe('main branding config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetEdition.mockReturnValue('cn')
    mockExistsSync.mockReturnValue(false)
  })

  it('keeps default display name and disables overrides when switch is off', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: false,
        productNameZh: '你好 Shell',
        productNameEn: 'Hello AI Shell'
      }
    })

    const { getBrandingConfig } = await import('../branding')
    const config = getBrandingConfig()

    expect(config.enabled).toBe(false)
    expect(config.displayName).toBe('Chaterm CN')
    expect(config.logoUrl).toBeUndefined()
    expect(config.iconPngPath).toBeUndefined()
  })

  it('uses zh product name and resolves only existing branding resources when switch is on', async () => {
    mockGetEdition.mockReturnValue('cn')
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: true,
        productNameZh: '你好 Shell',
        productNameEn: 'Hello AI Shell'
      }
    })
    mockExistsSync.mockImplementation((targetPath: string) => targetPath.endsWith('logo.svg') || targetPath.endsWith('icon.png'))

    const { getBrandingConfig } = await import('../branding')
    const config = getBrandingConfig()

    expect(config.enabled).toBe(true)
    expect(config.displayName).toBe('你好 Shell')
    expect(config.logoUrl).toContain('logo.svg')
    expect(config.iconPngPath).toContain('icon.png')
    expect(config.logoLightUrl).toBeUndefined()
    expect(config.iconIcoPath).toBeUndefined()
  })

  it('uses en product name for global edition when switch is on', async () => {
    mockGetEdition.mockReturnValue('global')
    mockGetEditionConfig.mockReturnValue({
      edition: 'global',
      displayName: 'Chaterm',
      branding: {
        enterpriseBrandingEnabled: true,
        productNameZh: '你好 Shell',
        productNameEn: 'Hello AI Shell'
      }
    })

    const { getBrandingConfig } = await import('../branding')
    const config = getBrandingConfig()

    expect(config.enabled).toBe(true)
    expect(config.displayName).toBe('Hello AI Shell')
  })
})
