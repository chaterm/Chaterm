import defaultLogoUrl from '@/assets/logo.svg'
import defaultLogoLightUrl from '@/assets/img/logo-light.svg'
import defaultLogoDarkUrl from '@/assets/img/logo-dark.svg'
import { getEditionConfig } from './edition'
import { convertFileLocalResourceSrc } from './convertFileLocalResourceSrc'

const enterpriseLogoUrl = '/branding/logo.svg'
const enterpriseLogoLightUrl = '/branding/logo-light.svg'
const enterpriseLogoDarkUrl = '/branding/logo-dark.svg'

interface ResolvedBrandingConfig {
  enabled: boolean
  displayName: string
  productNameZh?: string
  productNameEn?: string
  logoUrl?: string
  logoLightUrl?: string
  logoDarkUrl?: string
  iconPngPath?: string
  iconIcoPath?: string
  iconIcnsPath?: string
}

export interface BrandingConfig extends ResolvedBrandingConfig {
  logoUrl: string
  logoLightUrl: string
  logoDarkUrl: string
}

export const getDefaultBrandingConfig = (): BrandingConfig => {
  const editionConfig = getEditionConfig()
  const brandingEnabled = editionConfig.branding?.enterpriseBrandingEnabled === true

  return {
    enabled: brandingEnabled,
    displayName: editionConfig.displayName,
    productNameZh: editionConfig.branding?.productNameZh?.trim() || undefined,
    productNameEn: editionConfig.branding?.productNameEn?.trim() || undefined,
    logoUrl: brandingEnabled ? enterpriseLogoUrl : defaultLogoUrl,
    logoLightUrl: brandingEnabled ? enterpriseLogoLightUrl : defaultLogoLightUrl,
    logoDarkUrl: brandingEnabled ? enterpriseLogoDarkUrl : defaultLogoDarkUrl,
    iconPngPath: undefined,
    iconIcoPath: undefined,
    iconIcnsPath: undefined
  }
}

export const loadBrandingConfig = async (): Promise<BrandingConfig> => {
  const defaultConfig = getDefaultBrandingConfig()

  if (!window.api?.getBrandingConfig) {
    return defaultConfig
  }

  try {
    const resolved = (await window.api.getBrandingConfig()) as ResolvedBrandingConfig
    return {
      ...defaultConfig,
      ...resolved,
      displayName: resolved.displayName || defaultConfig.displayName,
      logoUrl: convertFileLocalResourceSrc(resolved.logoUrl || null) || defaultConfig.logoUrl,
      logoLightUrl: convertFileLocalResourceSrc(resolved.logoLightUrl || null) || defaultConfig.logoLightUrl,
      logoDarkUrl: convertFileLocalResourceSrc(resolved.logoDarkUrl || null) || defaultConfig.logoDarkUrl
    }
  } catch (error) {
    return defaultConfig
  }
}
