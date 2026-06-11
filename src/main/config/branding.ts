import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { getEdition, getEditionConfig, type Edition } from './edition'

export interface EditionBrandingOptions {
  enterpriseBrandingEnabled?: boolean
  productNameZh?: string
  productNameEn?: string
}

export interface BrandingConfig {
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

const getBrandingResourceRoot = (): string => {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources')
  return path.join(resourceRoot, 'branding')
}

const resolveOptionalResourcePath = (fileName: string): string | undefined => {
  const targetPath = path.join(getBrandingResourceRoot(), fileName)
  return fs.existsSync(targetPath) ? targetPath : undefined
}

const resolveOptionalResourceUrl = (fileName: string): string | undefined => {
  const resourcePath = resolveOptionalResourcePath(fileName)
  return resourcePath ? pathToFileURL(resourcePath).toString() : undefined
}

const resolveDisplayName = (edition: Edition, defaultDisplayName: string, branding?: EditionBrandingOptions): string => {
  if (!branding?.enterpriseBrandingEnabled) {
    return defaultDisplayName
  }

  if (edition === 'cn') {
    return branding.productNameZh?.trim() || branding.productNameEn?.trim() || defaultDisplayName
  }

  return branding.productNameEn?.trim() || branding.productNameZh?.trim() || defaultDisplayName
}

export function getBrandingConfig(): BrandingConfig {
  const edition = getEdition()
  const editionConfig = getEditionConfig()
  const branding = editionConfig.branding
  const enabled = branding?.enterpriseBrandingEnabled === true

  return {
    enabled,
    displayName: resolveDisplayName(edition, editionConfig.displayName, branding),
    productNameZh: branding?.productNameZh?.trim() || undefined,
    productNameEn: branding?.productNameEn?.trim() || undefined,
    logoUrl: enabled ? resolveOptionalResourceUrl('logo.svg') : undefined,
    logoLightUrl: enabled ? resolveOptionalResourceUrl('logo-light.svg') : undefined,
    logoDarkUrl: enabled ? resolveOptionalResourceUrl('logo-dark.svg') : undefined,
    iconPngPath: enabled ? resolveOptionalResourcePath('icon.png') : undefined,
    iconIcoPath: enabled ? resolveOptionalResourcePath('icon.ico') : undefined,
    iconIcnsPath: enabled ? resolveOptionalResourcePath('icon.icns') : undefined
  }
}
