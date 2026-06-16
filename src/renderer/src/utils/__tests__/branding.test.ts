import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetEditionConfig = vi.fn()
type BrandingApiMock = Pick<Window['api'], 'getBrandingConfig'>

const getMockWindow = (): { api?: BrandingApiMock } => window as unknown as { api?: BrandingApiMock }

vi.mock('../edition', () => ({
  getEditionConfig: mockGetEditionConfig
}))

describe('renderer branding utils', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getMockWindow().api = undefined
  })

  it('returns default asset logos when branding switch is disabled', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: false,
        productNameZh: ' 你好 Shell ',
        productNameEn: ' Hello AI Shell '
      }
    })

    const { getDefaultBrandingConfig } = await import('../branding')
    const config = getDefaultBrandingConfig()

    expect(config.enabled).toBe(false)
    expect(config.displayName).toBe('Chaterm CN')
    expect(config.productNameZh).toBe('你好 Shell')
    expect(config.productNameEn).toBe('Hello AI Shell')
    expect(config.logoUrl).not.toBe('/branding/logo.svg')
    expect(config.logoLightUrl).not.toBe('/branding/logo-light.svg')
    expect(config.logoDarkUrl).not.toBe('/branding/logo-dark.svg')
  })

  it('switches to branding asset paths when branding switch is enabled', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: true,
        productNameZh: '你好 Shell',
        productNameEn: 'Hello AI Shell'
      }
    })

    const { getDefaultBrandingConfig } = await import('../branding')
    const config = getDefaultBrandingConfig()

    expect(config.enabled).toBe(true)
    expect(config.logoUrl).toBe('/branding/logo.svg')
    expect(config.logoLightUrl).toBe('/branding/logo-light.svg')
    expect(config.logoDarkUrl).toBe('/branding/logo-dark.svg')
  })

  it('uses main-process display name and converts local branding file URLs for renderer usage', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'global',
      displayName: 'Chaterm',
      branding: {
        enterpriseBrandingEnabled: true,
        productNameZh: '你好 Shell',
        productNameEn: 'Hello AI Shell'
      }
    })
    getMockWindow().api = {
      getBrandingConfig: vi.fn().mockResolvedValue({
        enabled: true,
        displayName: 'Hello AI Shell',
        logoUrl: 'file:///broken/logo.svg',
        logoLightUrl: 'file:///broken/logo-light.svg',
        logoDarkUrl: 'file:///broken/logo-dark.svg'
      })
    }

    const { loadBrandingConfig } = await import('../branding')
    const config = await loadBrandingConfig()

    expect(config.displayName).toBe('Hello AI Shell')
    expect(config.logoUrl).toBe('local-resource:///broken/logo.svg')
    expect(config.logoLightUrl).toBe('local-resource:///broken/logo-light.svg')
    expect(config.logoDarkUrl).toBe('local-resource:///broken/logo-dark.svg')
  })

  it('falls back to default branding config when preload api is unavailable', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: false
      }
    })

    const { loadBrandingConfig } = await import('../branding')
    const config = await loadBrandingConfig()

    expect(config.displayName).toBe('Chaterm CN')
    expect(config.enabled).toBe(false)
  })

  it('falls back to default branding config when preload api throws', async () => {
    mockGetEditionConfig.mockReturnValue({
      edition: 'cn',
      displayName: 'Chaterm CN',
      branding: {
        enterpriseBrandingEnabled: true
      }
    })
    getMockWindow().api = {
      getBrandingConfig: vi.fn().mockRejectedValue(new Error('boom'))
    }

    const { loadBrandingConfig } = await import('../branding')
    const config = await loadBrandingConfig()

    expect(config.displayName).toBe('Chaterm CN')
    expect(config.logoUrl).toBe('/branding/logo.svg')
    expect(config.logoLightUrl).toBe('/branding/logo-light.svg')
    expect(config.logoDarkUrl).toBe('/branding/logo-dark.svg')
  })
})
