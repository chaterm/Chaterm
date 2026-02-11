// Log configuration store - persists logging config to {userData}/setting/logging.json

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { LoggingConfig } from './types'
import { DEFAULT_CONFIG, getDefaultLogLevelForEnvironment } from './types'

function buildEnvironmentDefaultConfig(): LoggingConfig {
  return {
    ...DEFAULT_CONFIG,
    level: getDefaultLogLevelForEnvironment(process.env.NODE_ENV),
    updatedAt: Date.now()
  }
}

let configRef: LoggingConfig = buildEnvironmentDefaultConfig()
let configPath: string = ''

function getConfigPath(): string {
  if (!configPath) {
    configPath = path.join(app.getPath('userData'), 'setting', 'logging.json')
  }
  return configPath
}

/**
 * Load config from disk on cold start. Falls back to defaults on any error.
 */
export function loadConfig(): LoggingConfig {
  try {
    const defaultConfig = buildEnvironmentDefaultConfig()
    const filePath = getConfigPath()
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<LoggingConfig>
      configRef = { ...defaultConfig, ...parsed }
    } else {
      configRef = defaultConfig
    }
  } catch {
    // Fall back to defaults silently - this runs before logging is ready
    configRef = buildEnvironmentDefaultConfig()
  }
  return configRef
}

/**
 * Get current in-memory config snapshot (no disk read).
 */
export function getConfig(): Readonly<LoggingConfig> {
  return configRef
}

/**
 * Update config partially and persist to disk asynchronously.
 */
export function updateConfig(partial: Partial<LoggingConfig>): LoggingConfig {
  configRef = { ...configRef, ...partial, updatedAt: Date.now() }
  saveConfigAsync()
  return configRef
}

/**
 * Async persist to disk. Errors are logged to raw console as logging may not be ready.
 */
function saveConfigAsync(): void {
  const filePath = getConfigPath()
  const dir = path.dirname(filePath)

  // Use setImmediate to avoid blocking hot path
  setImmediate(async () => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, JSON.stringify(configRef, null, 2), 'utf-8')
    } catch (err) {
      // Use raw console since logging system may depend on this module
      console.error('[logConfigStore] Failed to save config:', err)
    }
  })
}
