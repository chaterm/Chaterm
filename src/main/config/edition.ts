/**
 * Edition configuration module for main process
 * Loads and manages edition-specific configuration (CN/Global)
 *
 * IMPORTANT: All edition-specific URLs are defined in build/edition-config/*.json
 * This is the single source of truth - do NOT hardcode URLs elsewhere
 */
import * as path from 'path'
import * as fs from 'fs'

export type Edition = 'cn' | 'global'

export interface EditionConfig {
  edition: Edition
  displayName: string
  api: {
    baseUrl: string
    kmsUrl: string
    syncUrl: string
  }
  update: {
    serverUrl: string
    releaseNotesUrl: string
  }
  auth: {
    loginBaseUrl: string
  }
  defaults: {
    language: string
  }
  legal: {
    privacyPolicyUrl: string
    termsOfServiceUrl: string
  }
  speech: {
    wsUrl: string
  }
  docs: {
    baseUrl: string
  }
}

let cachedConfig: EditionConfig | null = null

/**
 * Get current edition from environment variable
 * Default to 'cn' per spec 3.6
 */
export function getEdition(): Edition {
  return (process.env.APP_EDITION as Edition) || 'cn'
}

/**
 * Check if current edition is Chinese edition
 */
export function isChineseEdition(): boolean {
  return getEdition() === 'cn'
}

/**
 * Check if current edition is Global edition
 */
export function isGlobalEdition(): boolean {
  return getEdition() === 'global'
}

/**
 * Get protocol prefix based on edition
 * Returns 'chaterm-cn://' for Chinese edition, 'chaterm://' for others
 */
export function getProtocolPrefix(): string {
  return isChineseEdition() ? 'chaterm-cn://' : 'chaterm://'
}

/**
 * Get protocol name (without ://) based on edition
 * Returns 'chaterm-cn' for Chinese edition, 'chaterm' for others
 */
export function getProtocolName(): string {
  return isChineseEdition() ? 'chaterm-cn' : 'chaterm'
}

/**
 * Load edition configuration from JSON file
 * This is the single source of truth for all edition-specific URLs
 */
export function loadEditionConfig(): EditionConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const edition = getEdition()

  // Try to load from packaged resources first, then from dev path
  const packagedConfigPath = path.join(process.resourcesPath || '', `edition-config/${edition}.json`)
  const devConfigPath = path.join(process.cwd(), `build/edition-config/${edition}.json`)

  let configPath: string | null = null

  if (fs.existsSync(packagedConfigPath)) {
    configPath = packagedConfigPath
  } else if (fs.existsSync(devConfigPath)) {
    configPath = devConfigPath
  }

  if (!configPath) {
    // This should never happen in production - config files must exist
    throw new Error(`[Edition] Config file not found for edition: ${edition}. ` + `Checked paths: ${packagedConfigPath}, ${devConfigPath}`)
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    cachedConfig = JSON.parse(configContent) as EditionConfig
    console.log(`[Edition] Loaded configuration for edition: ${edition} from ${configPath}`)
    return cachedConfig
  } catch (error) {
    throw new Error(`[Edition] Failed to parse config file: ${configPath}, error: ${error}`)
  }
}

/**
 * Clear cached config (useful for testing or hot reload)
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

/**
 * Get the full edition configuration object
 */
export function getEditionConfig(): EditionConfig {
  return loadEditionConfig()
}

/**
 * Get API base URL for current edition
 */
export function getApiBaseUrl(): string {
  return loadEditionConfig().api.baseUrl
}

/**
 * Get KMS URL for current edition
 */
export function getKmsUrl(): string {
  return loadEditionConfig().api.kmsUrl
}

/**
 * Get sync URL for current edition
 */
export function getSyncUrl(): string {
  return loadEditionConfig().api.syncUrl
}

/**
 * Get update server URL for current edition
 */
export function getUpdateServerUrl(): string {
  return loadEditionConfig().update.serverUrl
}

/**
 * Get login base URL for current edition
 */
export function getLoginBaseUrl(): string {
  return loadEditionConfig().auth.loginBaseUrl
}

/**
 * Get default language for current edition
 */
export function getDefaultLanguage(): string {
  return loadEditionConfig().defaults.language
}

/**
 * Get privacy policy URL for current edition
 */
export function getPrivacyPolicyUrl(): string {
  return loadEditionConfig().legal.privacyPolicyUrl
}

/**
 * Get terms of service URL for current edition
 */
export function getTermsOfServiceUrl(): string {
  return loadEditionConfig().legal.termsOfServiceUrl
}

/**
 * Get docs base URL for current edition
 */
export function getDocsBaseUrl(): string {
  return loadEditionConfig().docs.baseUrl
}

/**
 * Get speech WebSocket URL for current edition
 */
export function getSpeechWsUrl(): string {
  return loadEditionConfig().speech.wsUrl
}
