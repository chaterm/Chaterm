//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import {
  Skill,
  SkillMetadata,
  SkillParseResult,
  SkillState,
  SkillDirectory,
  SkillValidationResult,
  SkillResource,
  SkillImportResult,
  SKILL_FILE_NAME,
  SKILLS_DIR_NAME,
  REQUIRED_SKILL_FIELDS,
  DEFAULT_SKILL_METADATA,
  RESOURCE_TYPE_MAP,
  IGNORED_RESOURCE_FILES,
  MAX_RESOURCE_AUTO_LOAD_SIZE
} from '@shared/skills'
import { ChatermDatabaseService } from '../../../storage/db/chaterm.service'
import { getUserDataPath } from '../../../config/edition'
const logger = createLogger('agent')

// Dynamic import type for chokidar (ESM module)
type ChokidarModule = typeof import('chokidar')
type FSWatcher = Awaited<ReturnType<ChokidarModule['watch']>>

/**
 * SkillsManager handles loading, parsing, and managing agent skills.
 * Skills are defined in SKILL.md files and provide reusable instruction sets.
 */
export class SkillsManager {
  private skills: Map<string, Skill> = new Map()
  private skillStates: Map<string, SkillState> = new Map()
  private watchers: FSWatcher[] = []
  private postMessageToWebview?: (message: any) => Promise<void>
  private initialized = false

  constructor(postMessageToWebview?: (message: any) => Promise<void>) {
    this.postMessageToWebview = postMessageToWebview
  }

  /**
   * Initialize the skills manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Try to load skill states first (may fail if user not logged in)
      await this.loadSkillStates()

      // Load skills from all directories
      await this.loadAllSkills()

      // Setup file watchers for skill directories
      await this.setupFileWatchers()

      this.initialized = true
      logger.info(`[SkillsManager] Initialized with ${this.skills.size} skills`)
    } catch (error) {
      logger.error('[SkillsManager] Initialization failed', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Reload skill states from database (call after user login)
   */
  async reloadSkillStates(): Promise<void> {
    await this.loadSkillStates()
    // Update enabled state for all loaded skills
    for (const [skillId, skill] of this.skills) {
      const state = this.skillStates.get(skillId)
      if (state) {
        skill.enabled = state.enabled
      }
    }
    await this.notifySkillsUpdate()
    logger.info(`[SkillsManager] Reloaded skill states for ${this.skillStates.size} skills`)
  }

  /**
   * Get all skill directories
   */
  async getSkillDirectories(): Promise<SkillDirectory[]> {
    const directories: SkillDirectory[] = []

    // Built-in skills directory (in app resources)
    const builtinPath = app.isPackaged
      ? path.join(process.resourcesPath, SKILLS_DIR_NAME)
      : path.join(__dirname, '../../../../resources', SKILLS_DIR_NAME)

    directories.push({
      path: builtinPath,
      exists: await this.directoryExists(builtinPath)
    })

    // User skills directory
    const userPath = path.join(getUserDataPath(), SKILLS_DIR_NAME)
    directories.push({
      path: userPath,
      exists: await this.directoryExists(userPath)
    })

    // Marketplace skills directory
    const marketplacePath = path.join(getUserDataPath(), 'marketplace-skills')
    directories.push({
      path: marketplacePath,
      exists: await this.directoryExists(marketplacePath)
    })

    return directories
  }

  /**
   * Get user skills directory path
   */
  getUserSkillsPath(): string {
    return path.join(getUserDataPath(), SKILLS_DIR_NAME)
  }

  /**
   * Load all skills from all directories
   */
  async loadAllSkills(): Promise<void> {
    this.skills.clear()
    const directories = await this.getSkillDirectories()

    for (const dir of directories) {
      if (dir.exists) {
        await this.loadSkillsFromDirectory(dir.path)
      }
    }

    // Notify webview of updated skills
    await this.notifySkillsUpdate()
  }

  /**
   * Load skills from a specific directory
   */
  private async loadSkillsFromDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dirPath, entry.name, SKILL_FILE_NAME)
          const result = await this.parseSkillFile(skillPath)

          if (result.success && result.skill) {
            // Apply saved state
            const state = this.skillStates.get(result.skill.metadata.name)
            if (state) {
              result.skill.enabled = state.enabled
            }
            this.skills.set(result.skill.metadata.name, result.skill)
          }
        } else if (entry.name === SKILL_FILE_NAME) {
          // Single SKILL.md file in directory root
          const skillPath = path.join(dirPath, entry.name)
          const result = await this.parseSkillFile(skillPath)

          if (result.success && result.skill) {
            const state = this.skillStates.get(result.skill.metadata.name)
            if (state) {
              result.skill.enabled = state.enabled
            }
            this.skills.set(result.skill.metadata.name, result.skill)
          }
        }
      }
    } catch (error) {
      logger.error(`[SkillsManager] Failed to load skills from ${dirPath}`, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Parse a SKILL.md file
   */
  async parseSkillFile(filePath: string): Promise<SkillParseResult> {
    logger.info(`[SkillsManager] parseSkillFile - parsing: ${filePath}`)
    try {
      const exists = await this.fileExists(filePath)
      if (!exists) {
        return { success: false, error: `File not found: ${filePath}` }
      }

      const content = await fs.readFile(filePath, 'utf-8')
      const stat = await fs.stat(filePath)
      const directory = path.dirname(filePath)

      // Parse frontmatter and content
      const { metadata, body } = this.parseFrontmatter(content)
      logger.info('[SkillsManager] parseSkillFile - parsed metadata', { value: JSON.stringify(metadata) })

      // Validate metadata
      const validation = this.validateMetadata(metadata)
      if (!validation.valid) {
        return { success: false, error: `Invalid skill metadata: ${validation.errors.join(', ')}` }
      }

      // Scan for resource files in the skill directory
      const resources = await this.scanSkillResources(directory)

      const skill: Skill = {
        metadata: {
          ...DEFAULT_SKILL_METADATA,
          ...metadata
        } as SkillMetadata,
        content: body,
        path: filePath,
        directory,
        enabled: true, // Default enabled, will be overridden by saved state
        lastModified: stat.mtimeMs,
        resources: resources.length > 0 ? resources : undefined
      }

      return { success: true, skill }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: `Failed to parse skill file: ${errorMessage}` }
    }
  }

  /**
   * Scan skill directory for resource files
   */
  private async scanSkillResources(directory: string): Promise<SkillResource[]> {
    const resources: SkillResource[] = []

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true })

      for (const entry of entries) {
        // Skip ignored files and directories
        if (IGNORED_RESOURCE_FILES.includes(entry.name)) {
          continue
        }

        // Skip directories for now (could be extended to support nested resources)
        if (entry.isDirectory()) {
          continue
        }

        const filePath = path.join(directory, entry.name)
        const stat = await fs.stat(filePath)
        const ext = path.extname(entry.name).toLowerCase()

        // Determine resource type
        const type = RESOURCE_TYPE_MAP[ext] || 'other'

        const resource: SkillResource = {
          name: entry.name,
          path: filePath,
          type,
          size: stat.size
        }

        // Auto-load content for small text files
        if (stat.size <= MAX_RESOURCE_AUTO_LOAD_SIZE && this.isTextFile(ext)) {
          try {
            resource.content = await fs.readFile(filePath, 'utf-8')
          } catch {
            // Ignore read errors, content will be undefined
          }
        }

        resources.push(resource)
      }

      if (resources.length > 0) {
        logger.info(`[SkillsManager] Found ${resources.length} resource files in ${directory}`)
      }
    } catch (error) {
      logger.error(`[SkillsManager] Failed to scan resources in ${directory}`, { error: error instanceof Error ? error.message : String(error) })
    }

    return resources
  }

  /**
   * Check if a file extension indicates a text file
   */
  private isTextFile(ext: string): boolean {
    const textExtensions = [
      '.txt',
      '.md',
      '.markdown',
      '.rst',
      '.sh',
      '.bash',
      '.zsh',
      '.py',
      '.js',
      '.ts',
      '.rb',
      '.pl',
      '.ps1',
      '.bat',
      '.cmd',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.ini',
      '.conf',
      '.env',
      '.xml',
      '.html',
      '.htm',
      '.css',
      '.sql',
      '.tmpl',
      '.tpl',
      '.hbs',
      '.ejs',
      '.jinja',
      '.jinja2',
      '.mustache',
      '.csv',
      '.tsv'
    ]
    return textExtensions.includes(ext.toLowerCase())
  }

  /**
   * Get resource content by name for a skill
   */
  async getSkillResourceContent(skillId: string, resourceName: string): Promise<string | null> {
    const skill = this.skills.get(skillId)
    if (!skill || !skill.resources) {
      return null
    }

    const resource = skill.resources.find((r) => r.name === resourceName)
    if (!resource) {
      return null
    }

    // Return cached content if available
    if (resource.content !== undefined) {
      return resource.content
    }

    // Load content on demand
    try {
      const content = await fs.readFile(resource.path, 'utf-8')
      resource.content = content
      return content
    } catch {
      return null
    }
  }

  /**
   * Parse YAML frontmatter from content
   */
  private parseFrontmatter(content: string): { metadata: Partial<SkillMetadata>; body: string } {
    // Normalize line endings to \n
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Match frontmatter with flexible whitespace handling
    const frontmatterRegex = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n([\s\S]*)$/
    const match = normalizedContent.match(frontmatterRegex)

    if (!match) {
      // No frontmatter, try to extract metadata from first heading
      return this.parseMetadataFromContent(normalizedContent)
    }

    const [, frontmatter, body] = match
    const metadata = this.parseYaml(frontmatter)

    return { metadata, body: body.trim() }
  }

  /**
   * Simple YAML parser for frontmatter
   */
  private parseYaml(yaml: string): Partial<SkillMetadata> {
    const metadata: Record<string, unknown> = {}
    const lines = yaml.split('\n')

    logger.info(`[SkillsManager] parseYaml - parsing ${lines.length} lines`)

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()

      logger.info(`[SkillsManager] parseYaml - key: "${key}", raw value: "${value}"`)

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // Handle arrays (simple format: [item1, item2])
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1)
        const items = arrayContent.split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''))
        metadata[key] = items
        logger.info(`[SkillsManager] parseYaml - parsed array for "${key}"`, { value: items })
      } else if (value === 'true') {
        metadata[key] = true
      } else if (value === 'false') {
        metadata[key] = false
      } else if (!isNaN(Number(value)) && value !== '') {
        metadata[key] = Number(value)
      } else {
        metadata[key] = value
      }
    }

    logger.info('[SkillsManager] parseYaml - final metadata', { value: JSON.stringify(metadata) })
    return metadata as Partial<SkillMetadata>
  }

  /**
   * Parse metadata from content when no frontmatter exists
   */
  private parseMetadataFromContent(content: string): { metadata: Partial<SkillMetadata>; body: string } {
    const metadata: Partial<SkillMetadata> = {}

    // Try to extract name from first heading
    const headingMatch = content.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      metadata.name = headingMatch[1].trim()
    }

    // Try to extract description from first paragraph
    const paragraphMatch = content.match(/^#.+\n+([^#\n][^\n]+)/m)
    if (paragraphMatch) {
      metadata.description = paragraphMatch[1].trim()
    }

    return { metadata, body: content }
  }

  /**
   * Validate skill metadata
   */
  validateMetadata(metadata: Partial<SkillMetadata>): SkillValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    for (const field of REQUIRED_SKILL_FIELDS) {
      if (!metadata[field]) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Get all loaded skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * Get enabled skills
   */
  getEnabledSkills(): Skill[] {
    return this.getAllSkills().filter((skill) => skill.enabled)
  }

  /**
   * Get a skill by name
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  /**
   * Enable or disable a skill
   */
  async setSkillEnabled(name: string, enabled: boolean): Promise<void> {
    const skill = this.skills.get(name)
    if (!skill) {
      throw new Error(`Skill not found: ${name}`)
    }

    skill.enabled = enabled

    // Save state to database
    await this.saveSkillState(name, { skillId: name, enabled })

    // Notify webview
    await this.notifySkillsUpdate()
  }

  /**
   * Load skill states from database
   */
  private async loadSkillStates(): Promise<void> {
    try {
      // Check if ChatermDatabaseService can be instantiated (requires user login)
      const dbService = await ChatermDatabaseService.getInstance()
      if (!dbService) {
        logger.info('[SkillsManager] Database service not available, skipping skill states load')
        return
      }

      const states = await dbService.getSkillStates()

      this.skillStates.clear()
      for (const state of states) {
        this.skillStates.set(state.skillId, state)
      }

      // Update enabled state for all loaded skills
      for (const [skillName, skill] of this.skills) {
        const state = this.skillStates.get(skillName)
        if (state) {
          skill.enabled = state.enabled
        }
      }
    } catch (error) {
      // Gracefully handle the case when user is not logged in yet
      if (error instanceof Error && error.message.includes('User ID is required')) {
        logger.info('[SkillsManager] User not logged in yet, skill states will be loaded later')
      } else {
        logger.error('[SkillsManager] Failed to load skill states', { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  /**
   * Save skill state to database
   */
  private async saveSkillState(skillId: string, state: SkillState): Promise<void> {
    try {
      const dbService = await ChatermDatabaseService.getInstance()
      await dbService.setSkillState(skillId, state.enabled)
      this.skillStates.set(skillId, state)
    } catch (error) {
      logger.error('[SkillsManager] Failed to save skill state', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Setup file watchers for skill directories
   */
  private async setupFileWatchers(): Promise<void> {
    try {
      const chokidar = (await import('chokidar')) as ChokidarModule
      const directories = await this.getSkillDirectories()
      // const userSkillsPath = this.getUserSkillsPath()

      for (const dir of directories) {
        // Only watch non-builtin directories (user and marketplace)
        const isBuiltin = !dir.path.startsWith(getUserDataPath())
        if (dir.exists && !isBuiltin) {
          const watcher = chokidar.watch(path.join(dir.path, '**', SKILL_FILE_NAME), {
            persistent: true,
            ignoreInitial: true
          })

          watcher.on('add', () => this.handleSkillFileChange())
          watcher.on('change', () => this.handleSkillFileChange())
          watcher.on('unlink', () => this.handleSkillFileChange())

          this.watchers.push(watcher)
        }
      }
    } catch (error) {
      logger.error('[SkillsManager] Failed to setup file watchers', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Handle skill file changes
   */
  private async handleSkillFileChange(): Promise<void> {
    logger.info(`[SkillsManager] Skill file changed, reloading...`)
    await this.loadAllSkills()
  }

  /**
   * Notify webview of skills update
   */
  private async notifySkillsUpdate(): Promise<void> {
    if (this.postMessageToWebview) {
      await this.postMessageToWebview({
        type: 'skillsUpdate',
        skills: this.getAllSkills().map((skill) => ({
          name: skill.metadata.name,
          description: skill.metadata.description,
          enabled: skill.enabled
        }))
      })
    }
  }

  /**
   * Build skills instructions for system prompt
   */
  buildSkillsPrompt(): string {
    const enabledSkills = this.getEnabledSkills()

    logger.info(`[SkillsManager] buildSkillsPrompt called - enabled skills: ${enabledSkills.length}`)

    if (enabledSkills.length === 0) {
      logger.info(`[SkillsManager] No skills to include in prompt`)
      return ''
    }

    let prompt = '\n====\n\n'
    prompt += 'AVAILABLE SKILLS\n\n'
    prompt += 'The following skills are available. Use the Skill tool to invoke a skill when needed:\n\n'

    for (const skill of enabledSkills) {
      prompt += `- **${skill.metadata.name}**: ${skill.metadata.description}\n`
    }
    prompt += '\n'

    logger.info(`[SkillsManager] Built prompt with ${enabledSkills.length} skills`)

    return prompt
  }

  /**
   * Create a new user skill
   */
  async createUserSkill(metadata: SkillMetadata, content: string): Promise<Skill> {
    const userSkillsPath = this.getUserSkillsPath()

    // Ensure user skills directory exists
    await fs.mkdir(userSkillsPath, { recursive: true })

    // Generate directory name from skill name
    const skillDirName = metadata.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const skillDir = path.join(userSkillsPath, skillDirName)
    await fs.mkdir(skillDir, { recursive: true })

    // Build SKILL.md content
    const skillContent = this.buildSkillFile(metadata, content)

    // Write SKILL.md file
    const skillPath = path.join(skillDir, SKILL_FILE_NAME)
    await fs.writeFile(skillPath, skillContent, 'utf-8')

    // Reload skills
    await this.loadAllSkills()

    const skill = this.skills.get(metadata.name)
    if (!skill) {
      throw new Error('Failed to create skill')
    }

    return skill
  }

  /**
   * Delete a user skill
   */
  async deleteUserSkill(name: string): Promise<void> {
    const skill = this.skills.get(name)
    if (!skill) {
      throw new Error(`Skill not found: ${name}`)
    }

    // Check if skill is in user skills directory
    const userSkillsPath = this.getUserSkillsPath()
    if (!skill.path.startsWith(userSkillsPath)) {
      throw new Error('Can only delete user-created skills')
    }

    // Delete skill directory
    const skillDir = path.dirname(skill.path)
    await fs.rm(skillDir, { recursive: true, force: true })

    // Remove from memory
    this.skills.delete(name)
    this.skillStates.delete(name)

    // Notify webview
    await this.notifySkillsUpdate()
  }

  /**
   * Import a skill from a ZIP file
   * Supports two ZIP structures:
   * - Structure A: SKILL.md at root (extracts to folder named after skill name)
   * - Structure B: SKILL.md in subdirectory (extracts the subdirectory)
   */
  async importSkillFromZip(zipPath: string, overwrite?: boolean): Promise<SkillImportResult> {
    logger.info(`[SkillsManager] Importing skill from ZIP: ${zipPath}`)

    let zip: AdmZip
    try {
      zip = new AdmZip(zipPath)
    } catch (error) {
      logger.error('[SkillsManager] Failed to open ZIP file', { error: error instanceof Error ? error.message : String(error) })
      return {
        success: false,
        error: 'Invalid or corrupted ZIP file',
        errorCode: 'INVALID_ZIP'
      }
    }

    const entries = zip.getEntries()
    if (entries.length === 0) {
      return {
        success: false,
        error: 'ZIP file is empty',
        errorCode: 'INVALID_ZIP'
      }
    }

    // Find SKILL.md file and determine structure
    let skillMdEntry: AdmZip.IZipEntry | null = null
    let skillMdBasePath = '' // The path prefix to use when extracting

    for (const entry of entries) {
      const entryName = entry.entryName.replace(/\\/g, '/')

      const isAbsolute = path.posix.isAbsolute(entryName) || /^[a-zA-Z]:/.test(entryName)
      const hasTraversal = entryName.split('/').includes('..')
      if (isAbsolute || hasTraversal) {
        logger.error('[SkillsManager] Potential path traversal detected', {
          error: entryName instanceof Error ? entryName.message : String(entryName)
        })
        return {
          success: false,
          error: 'ZIP file contains invalid paths',
          errorCode: 'INVALID_ZIP'
        }
      }

      // Check if this is a SKILL.md file
      if (entryName === SKILL_FILE_NAME) {
        // Structure A: SKILL.md at root
        skillMdEntry = entry
        skillMdBasePath = ''
        break
      } else if (entryName.endsWith(`/${SKILL_FILE_NAME}`)) {
        // Structure B: SKILL.md in subdirectory
        // Only accept if it's exactly one level deep
        const parts = entryName.split('/')
        if (parts.length === 2) {
          skillMdEntry = entry
          skillMdBasePath = parts[0] + '/'
          break
        }
      }
    }

    if (!skillMdEntry) {
      return {
        success: false,
        error: `No ${SKILL_FILE_NAME} file found in ZIP`,
        errorCode: 'NO_SKILL_MD'
      }
    }

    // Parse SKILL.md content to validate and get metadata
    const skillMdContent = skillMdEntry.getData().toString('utf-8')
    const { metadata } = this.parseFrontmatter(skillMdContent)

    // Validate metadata
    const validation = this.validateMetadata(metadata)
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid SKILL.md: ${validation.errors.join(', ')}`,
        errorCode: 'INVALID_METADATA'
      }
    }

    const skillName = metadata.name as string

    // Generate directory name from skill name
    const skillDirName = skillName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if skill already exists
    const userSkillsPath = this.getUserSkillsPath()
    const targetDir = path.join(userSkillsPath, skillDirName)

    if (await this.directoryExists(targetDir)) {
      if (!overwrite) {
        return {
          success: false,
          skillName,
          error: `Skill "${skillName}" already exists`,
          errorCode: 'DIR_EXISTS'
        }
      }
      // Remove existing directory for overwrite
      logger.info(`[SkillsManager] Overwriting existing skill: ${skillName}`)
      await fs.rm(targetDir, { recursive: true, force: true })
    }

    // Ensure user skills directory exists
    await fs.mkdir(userSkillsPath, { recursive: true })

    try {
      // Create target directory
      await fs.mkdir(targetDir, { recursive: true })

      // Extract relevant files
      for (const entry of entries) {
        const entryName = entry.entryName.replace(/\\/g, '/')

        // Skip if entry doesn't match our base path
        if (skillMdBasePath && !entryName.startsWith(skillMdBasePath)) {
          continue
        }

        // Skip directories (they're created implicitly)
        if (entry.isDirectory) {
          continue
        }

        // Calculate relative path within skill directory
        let relativePath = entryName
        if (skillMdBasePath) {
          relativePath = entryName.slice(skillMdBasePath.length)
        }

        // Skip empty relative paths
        if (!relativePath) {
          continue
        }

        // Resolve and validate target path to prevent path traversal
        const targetPath = path.resolve(targetDir, relativePath)
        const targetRoot = path.resolve(targetDir) + path.sep
        if (!targetPath.startsWith(targetRoot)) {
          throw new Error(`Invalid ZIP entry path: ${entryName}`)
        }
        const targetParent = path.dirname(targetPath)

        // Ensure parent directory exists
        await fs.mkdir(targetParent, { recursive: true })

        // Write file
        const content = entry.getData()
        await fs.writeFile(targetPath, content)
        logger.info(`[SkillsManager] Extracted: ${relativePath}`)
      }

      // Reload skills to pick up the new skill
      await this.loadAllSkills()

      logger.info(`[SkillsManager] Successfully imported skill: ${skillName}`)
      return {
        success: true,
        skillName
      }
    } catch (error) {
      logger.error('[SkillsManager] Failed to extract skill', { error: error instanceof Error ? error.message : String(error) })

      // Cleanup on failure
      try {
        await fs.rm(targetDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        skillName,
        error: 'Failed to extract skill files',
        errorCode: 'EXTRACT_FAILED'
      }
    }
  }

  /**
   * Build SKILL.md file content
   */
  private buildSkillFile(metadata: SkillMetadata, content: string): string {
    let file = '---\n'
    file += `name: ${metadata.name}\n`
    file += `description: ${metadata.description}\n`
    file += '---\n\n'
    file += content
    return file
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Cleanup watchers on dispose
   */
  async dispose(): Promise<void> {
    for (const watcher of this.watchers) {
      await watcher.close()
    }
    this.watchers = []
    this.skills.clear()
    this.skillStates.clear()
    this.initialized = false
  }
}
