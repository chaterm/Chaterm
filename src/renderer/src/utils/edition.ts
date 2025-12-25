/**
 * Edition utilities for renderer process
 * Uses configuration injected at build time from build/edition-config/*.json
 * This ensures single source of truth for all edition-specific URLs
 */

export type Edition = 'cn' | 'global'

// Edition configuration interface (matches build/edition-config/*.json structure)
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

// Declare the global variable injected by Vite at build time
declare const __EDITION_CONFIG__: EditionConfig

/**
 * Get the full edition configuration object
 * Injected at build time from build/edition-config/*.json
 */
export const getEditionConfig = (): EditionConfig => __EDITION_CONFIG__

/**
 * Get current app edition
 */
export const APP_EDITION: Edition = __EDITION_CONFIG__.edition

/**
 * Check if current edition is Chinese edition
 */
export const isChineseEdition = (): boolean => APP_EDITION === 'cn'

/**
 * Check if current edition is Global edition
 */
export const isGlobalEdition = (): boolean => APP_EDITION === 'global'

/**
 * Get default language based on edition
 */
export const getDefaultLanguage = (): string => import.meta.env.RENDERER_DEFAULT_LANGUAGE || __EDITION_CONFIG__.defaults.language

/**
 * Get API base URL for current edition
 */
export const getApiBaseUrl = (): string => import.meta.env.RENDERER_VUE_APP_API_BASEURL || __EDITION_CONFIG__.api.baseUrl

/**
 * Get KMS server URL for current edition
 */
export const getKmsServerUrl = (): string => import.meta.env.RENDERER_KMS_SERVER_URL || __EDITION_CONFIG__.api.kmsUrl

/**
 * Get sync server URL for current edition
 */
export const getSyncServerUrl = (): string => import.meta.env.RENDERER_SYNC_SERVER_URL || __EDITION_CONFIG__.api.syncUrl

/**
 * Get speech WebSocket URL for current edition
 */
export const getSpeechWsUrl = (): string => import.meta.env.RENDERER_SPEECH_WS_URL || __EDITION_CONFIG__.speech.wsUrl

/**
 * Get docs base URL for current edition
 */
export const getDocsBaseUrl = (): string => import.meta.env.RENDERER_DOCS_BASE_URL || __EDITION_CONFIG__.docs.baseUrl

/**
 * Get SSO/login base URL for current edition
 */
export const getSsoBaseUrl = (): string => import.meta.env.RENDERER_SSO || __EDITION_CONFIG__.auth.loginBaseUrl

/**
 * Get privacy policy URL for current edition
 */
export const getPrivacyPolicyUrl = (): string => __EDITION_CONFIG__.legal.privacyPolicyUrl

/**
 * Get terms of service URL for current edition
 */
export const getTermsOfServiceUrl = (): string => __EDITION_CONFIG__.legal.termsOfServiceUrl

/**
 * Get documentation URL based on edition
 */
export const getDocumentationUrl = (): string => {
  const baseUrl = getDocsBaseUrl()
  return `${baseUrl}/`
}
