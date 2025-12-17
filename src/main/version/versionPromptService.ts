import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs/promises'
import { ChatermDatabaseService } from '../storage/database'
import { getCurrentUserId, getGuestUserId } from '../storage/db/connection'
import { safeParse, safeStringify } from '../storage/db/json-serializer'
import { getUserConfig } from '../agent/core/storage/state'

const VERSION_PROMPT_KEY = 'versionPrompt'

// State management
export interface VersionPromptState {
  lastKnownVersion?: string
  lastShownVersion?: string
}

function shouldShowPrompt(state: VersionPromptState, currentVersion: string): boolean {
  // Don't show update prompt on first install
  if (!state.lastKnownVersion) {
    return false
  }

  // Don't show if current version has already been shown
  return state.lastShownVersion !== currentVersion
}

async function getUserLanguage(): Promise<string> {
  try {
    const userConfig = await getUserConfig()
    return userConfig?.language || 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

function getLocalizedHighlights(highlights: Record<string, string[]> | string[] | undefined, language: string): string[] {
  if (!highlights) return []

  // If it's old format (array), return directly
  if (Array.isArray(highlights)) {
    return highlights
  }

  // New format (multi-language object)
  // Try to use current language, fallback to Chinese if not available, finally return first available language
  return highlights[language] || highlights['zh-CN'] || highlights['en-US'] || Object.values(highlights)[0] || []
}

export interface VersionReleaseNote {
  version: string
  date?: string
  highlights?: Record<string, string[]> | string[] // Support multi-language object or old format array
}

export interface VersionPromptPayload {
  shouldShow: boolean
  version: string
  releaseDate?: string
  highlights: string[]
  releaseNotesUrl?: string
  isFirstInstall: boolean
}

async function getDbService(): Promise<ChatermDatabaseService> {
  let userId = getCurrentUserId()
  if (!userId) {
    userId = getGuestUserId()
  }

  return await ChatermDatabaseService.getInstance(userId)
}

export class VersionPromptService {
  private baseReleaseNotesUrl?: string

  async getVersionPrompt(): Promise<VersionPromptPayload> {
    const currentVersion = app.getVersion()
    const state = await this.loadState()
    const releaseNote = await this.getReleaseNotes(currentVersion)
    const shouldShow = shouldShowPrompt(state, currentVersion)
    const language = await getUserLanguage()
    const isFirstInstall = !state.lastKnownVersion

    const nextState: VersionPromptState = {
      ...state,
      lastKnownVersion: currentVersion,
      lastShownVersion: isFirstInstall ? currentVersion : state.lastShownVersion
    }

    await this.saveState(nextState)

    return {
      shouldShow,
      version: currentVersion,
      releaseDate: releaseNote?.date,
      highlights: getLocalizedHighlights(releaseNote?.highlights, language),
      releaseNotesUrl: this.baseReleaseNotesUrl ? `${this.baseReleaseNotesUrl}${currentVersion}` : undefined,
      isFirstInstall
    }
  }

  async dismissPrompt(): Promise<void> {
    const currentVersion = app.getVersion()
    const state = await this.loadState()

    await this.saveState({
      ...state,
      lastKnownVersion: currentVersion,
      lastShownVersion: currentVersion
    })
  }

  async getReleaseNotes(targetVersion?: string): Promise<VersionReleaseNote | null> {
    try {
      const notes = await this.readReleaseNotesFile()
      if (!notes?.length) {
        return null
      }

      const version = targetVersion || app.getVersion()
      return notes.find((item) => item.version === version) || null
    } catch (error) {
      console.warn('[VersionPrompt] Failed to read release notes:', error)
      return null
    }
  }

  private async loadState(): Promise<VersionPromptState> {
    try {
      const db = await getDbService()
      const record = db.getKeyValue(VERSION_PROMPT_KEY)
      if (record?.value) {
        const parsed = await safeParse<VersionPromptState>(record.value)
        if (parsed) {
          return parsed
        }
      }
    } catch (error) {
      console.warn('[VersionPrompt] Failed to load state:', error)
    }
    return {}
  }

  private async saveState(state: VersionPromptState): Promise<void> {
    try {
      const db = await getDbService()
      const serialized = await safeStringify(state)
      if (!serialized.success || !serialized.data) {
        throw new Error(serialized.error || 'Failed to serialize version prompt state')
      }

      db.setKeyValue({
        key: VERSION_PROMPT_KEY,
        value: serialized.data,
        updated_at: Date.now()
      })
    } catch (error) {
      console.warn('[VersionPrompt] Failed to save state:', error)
    }
  }

  private resolveReleaseNotesPath(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'update-notes.json')
    }

    return join(__dirname, '../../resources/update-notes.json')
  }

  private async readReleaseNotesFile(): Promise<VersionReleaseNote[] | null> {
    try {
      const filePath = this.resolveReleaseNotesPath()
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content) as {
        releaseNotesUrl?: string
        versions?: VersionReleaseNote[]
      }

      if (parsed?.releaseNotesUrl) {
        this.baseReleaseNotesUrl = parsed.releaseNotesUrl
      }

      if (parsed?.versions && Array.isArray(parsed.versions)) {
        return parsed.versions
      }
    } catch (error) {
      console.warn('[VersionPrompt] Failed to read release notes:', error)
    }
    return null
  }
}

export const versionPromptService = new VersionPromptService()
