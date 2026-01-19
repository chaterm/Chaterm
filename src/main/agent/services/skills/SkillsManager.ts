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
      console.log(`[SkillsManager] Initialized with ${this.skills.size} skills`)
    } catch (error) {
      console.error('[SkillsManager] Initialization failed:', error)
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
    console.log(`[SkillsManager] Reloaded skill states for ${this.skillStates.size} skills`)
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
      type: 'builtin',
      exists: await this.directoryExists(builtinPath)
    })

    // User skills directory
    const userPath = path.join(getUserDataPath(), SKILLS_DIR_NAME)
    directories.push({
      path: userPath,
      type: 'user',
      exists: await this.directoryExists(userPath)
    })

    // Marketplace skills directory
    const marketplacePath = path.join(getUserDataPath(), 'marketplace-skills')
    directories.push({
      path: marketplacePath,
      type: 'marketplace',
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
        await this.loadSkillsFromDirectory(dir.path, dir.type)
      }
    }

    // Notify webview of updated skills
    await this.notifySkillsUpdate()
  }

  /**
   * Load skills from a specific directory
   */
  private async loadSkillsFromDirectory(dirPath: string, source: 'builtin' | 'user' | 'marketplace'): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dirPath, entry.name, SKILL_FILE_NAME)
          const result = await this.parseSkillFile(skillPath, source)

          if (result.success && result.skill) {
            // Apply saved state
            const state = this.skillStates.get(result.skill.metadata.id)
            if (state) {
              result.skill.enabled = state.enabled
            }
            this.skills.set(result.skill.metadata.id, result.skill)
          }
        } else if (entry.name === SKILL_FILE_NAME) {
          // Single SKILL.md file in directory root
          const skillPath = path.join(dirPath, entry.name)
          const result = await this.parseSkillFile(skillPath, source)

          if (result.success && result.skill) {
            const state = this.skillStates.get(result.skill.metadata.id)
            if (state) {
              result.skill.enabled = state.enabled
            }
            this.skills.set(result.skill.metadata.id, result.skill)
          }
        }
      }
    } catch (error) {
      console.error(`[SkillsManager] Failed to load skills from ${dirPath}:`, error)
    }
  }

  /**
   * Parse a SKILL.md file
   */
  async parseSkillFile(filePath: string, source: 'builtin' | 'user' | 'marketplace'): Promise<SkillParseResult> {
    console.log(`[SkillsManager] parseSkillFile - parsing: ${filePath}`)
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
      console.log(`[SkillsManager] parseSkillFile - parsed metadata:`, JSON.stringify(metadata))

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
        source,
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
        console.log(`[SkillsManager] Found ${resources.length} resource files in ${directory}`)
      }
    } catch (error) {
      console.error(`[SkillsManager] Failed to scan resources in ${directory}:`, error)
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

    console.log(`[SkillsManager] parseYaml - parsing ${lines.length} lines`)

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()

      console.log(`[SkillsManager] parseYaml - key: "${key}", raw value: "${value}"`)

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // Handle arrays (simple format: [item1, item2])
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1)
        const items = arrayContent.split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''))
        metadata[key] = items
        console.log(`[SkillsManager] parseYaml - parsed array for "${key}":`, items)
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

    console.log(`[SkillsManager] parseYaml - final metadata:`, JSON.stringify(metadata))
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
      // Generate ID from name
      metadata.id = metadata.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
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

    // Validate ID format
    if (metadata.id && !/^[a-z0-9-]+$/i.test(metadata.id)) {
      warnings.push('ID should only contain alphanumeric characters and hyphens')
    }

    // Validate version format
    if (metadata.version && !/^\d+\.\d+\.\d+/.test(metadata.version)) {
      warnings.push('Version should follow semver format (e.g., 1.0.0)')
    }

    // Validate activation type
    if (metadata.activation && !['always', 'on-demand', 'context-match'].includes(metadata.activation)) {
      warnings.push('Invalid activation type')
    }

    // Validate contextPatterns for context-match activation
    if (metadata.activation === 'context-match') {
      if (!metadata.contextPatterns || !Array.isArray(metadata.contextPatterns) || metadata.contextPatterns.length === 0) {
        errors.push('Context-match activation requires at least one context pattern')
      } else {
        // Validate each pattern for ReDoS vulnerabilities
        for (const pattern of metadata.contextPatterns) {
          if (typeof pattern !== 'string' || pattern.trim().length === 0) {
            errors.push('Context patterns must be non-empty strings')
            continue
          }

          // Check if pattern is a regex (wrapped in /pattern/)
          const regexMatch = pattern.match(/^\/(.+)\/$/)
          if (regexMatch) {
            const regexPattern = regexMatch[1]
            const validation = this.validateRegexPattern(regexPattern)
            if (!validation.valid) {
              errors.push(`Unsafe regex pattern "${pattern}": ${validation.error}`)
            }
          }
          // Substring patterns (default) are always safe, no validation needed
        }
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
   * Get skills by activation type
   */
  getSkillsByActivation(activation: 'always' | 'on-demand' | 'context-match'): Skill[] {
    return this.getEnabledSkills().filter((skill) => skill.metadata.activation === activation)
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  /**
   * Enable or disable a skill
   */
  async setSkillEnabled(id: string, enabled: boolean): Promise<void> {
    const skill = this.skills.get(id)
    if (!skill) {
      throw new Error(`Skill not found: ${id}`)
    }

    skill.enabled = enabled

    // Save state to database
    await this.saveSkillState(id, { skillId: id, enabled })

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
        console.log('[SkillsManager] Database service not available, skipping skill states load')
        return
      }

      const states = await dbService.getSkillStates()

      this.skillStates.clear()
      for (const state of states) {
        this.skillStates.set(state.skillId, state)
      }

      // Update enabled state for all loaded skills
      for (const [skillId, skill] of this.skills) {
        const state = this.skillStates.get(skillId)
        if (state) {
          skill.enabled = state.enabled
        }
      }
    } catch (error) {
      // Gracefully handle the case when user is not logged in yet
      if (error instanceof Error && error.message.includes('User ID is required')) {
        console.log('[SkillsManager] User not logged in yet, skill states will be loaded later')
      } else {
        console.error('[SkillsManager] Failed to load skill states:', error)
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
      console.error('[SkillsManager] Failed to save skill state:', error)
    }
  }

  /**
   * Setup file watchers for skill directories
   */
  private async setupFileWatchers(): Promise<void> {
    try {
      const chokidar = (await import('chokidar')) as ChokidarModule
      const directories = await this.getSkillDirectories()

      for (const dir of directories) {
        if (dir.exists && dir.type !== 'builtin') {
          // Only watch user and marketplace directories
          const watcher = chokidar.watch(path.join(dir.path, '**', SKILL_FILE_NAME), {
            persistent: true,
            ignoreInitial: true
          })

          const dirType = dir.type as 'user' | 'marketplace'
          watcher.on('add', () => this.handleSkillFileChange(dirType))
          watcher.on('change', () => this.handleSkillFileChange(dirType))
          watcher.on('unlink', () => this.handleSkillFileChange(dirType))

          this.watchers.push(watcher)
        }
      }
    } catch (error) {
      console.error('[SkillsManager] Failed to setup file watchers:', error)
    }
  }

  /**
   * Handle skill file changes
   */
  private async handleSkillFileChange(source: 'user' | 'marketplace'): Promise<void> {
    console.log(`[SkillsManager] Skill file changed in ${source} directory, reloading...`)
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
          id: skill.metadata.id,
          name: skill.metadata.name,
          description: skill.metadata.description,
          version: skill.metadata.version,
          author: skill.metadata.author,
          tags: skill.metadata.tags,
          icon: skill.metadata.icon,
          activation: skill.metadata.activation,
          contextPatterns: skill.metadata.contextPatterns,
          enabled: skill.enabled,
          source: skill.source
        }))
      })
    }
  }

  /**
   * Build skills instructions for system prompt
   * @param userMessage Optional user message for context-match skill activation
   */
  buildSkillsPrompt(userMessage?: string): string {
    const allSkills = this.getAllSkills()
    const enabledSkills = this.getEnabledSkills()

    console.log(`[SkillsManager] buildSkillsPrompt called - total skills: ${allSkills.length}, enabled: ${enabledSkills.length}`)
    console.log(
      `[SkillsManager] All skills:`,
      allSkills.map((s) => `${s.metadata.id}(enabled=${s.enabled}, activation=${s.metadata.activation})`).join(', ')
    )

    // Get always-active skills (full content loaded)
    const alwaysActiveSkills = enabledSkills.filter((s) => s.metadata.activation === 'always')
    console.log(`[SkillsManager] Always active skills: ${alwaysActiveSkills.length}`)

    // Get context-matching skills if user message is provided (full content loaded)
    let contextMatchedSkills: Skill[] = []
    if (userMessage) {
      const allContextMatchSkills = this.getSkillsByActivation('context-match')
      console.log(`[SkillsManager] Context-match skills available: ${allContextMatchSkills.length}`)

      contextMatchedSkills = this.getContextMatchingSkills(userMessage).filter((s) => s.enabled)
      console.log(
        `[SkillsManager] Context matched skills for message "${userMessage?.substring(0, 50)}...": ${contextMatchedSkills.map((s) => s.metadata.id).join(', ') || 'none'}`
      )
    }

    // Get on-demand skills (only show name and description, not full content)
    const onDemandSkills = enabledSkills.filter((s) => s.metadata.activation === 'on-demand')
    console.log(`[SkillsManager] On-demand skills available: ${onDemandSkills.length}`)

    // Combine active skills (deduplicate by id) - these get full content
    const activeSkillIds = new Set<string>()
    const activeSkills: Skill[] = []

    for (const skill of alwaysActiveSkills) {
      if (!activeSkillIds.has(skill.metadata.id)) {
        activeSkillIds.add(skill.metadata.id)
        activeSkills.push(skill)
      }
    }

    for (const skill of contextMatchedSkills) {
      if (!activeSkillIds.has(skill.metadata.id)) {
        activeSkillIds.add(skill.metadata.id)
        activeSkills.push(skill)
      }
    }

    // Check if we have any skills to display
    const hasActiveSkills = activeSkills.length > 0
    const hasOnDemandSkills = onDemandSkills.length > 0

    if (!hasActiveSkills && !hasOnDemandSkills) {
      console.log(`[SkillsManager] No skills to include in prompt`)
      return ''
    }

    let prompt = '\n====\n\n'

    // Section 1: Active skills with full content
    if (hasActiveSkills) {
      prompt += 'ACTIVE SKILLS\n\n'
      prompt += 'The following skills are active and their instructions should be followed:\n\n'

      for (const skill of activeSkills) {
        prompt += `## ${skill.metadata.name}\n\n`
        prompt += skill.content
        prompt += '\n\n'

        // Include resource files content if available
        if (skill.resources && skill.resources.length > 0) {
          const resourcesWithContent = skill.resources.filter((r) => r.content)
          if (resourcesWithContent.length > 0) {
            prompt += `### Available Resources\n\n`
            prompt += `The following resource files are available for this skill:\n\n`

            for (const resource of resourcesWithContent) {
              prompt += `#### ${resource.name} (${resource.type})\n\n`
              prompt += '```\n'
              prompt += resource.content
              prompt += '\n```\n\n'
            }
          }
        }
      }
    }

    // Section 2: On-demand skills (only name and description)
    if (hasOnDemandSkills) {
      prompt += 'AVAILABLE SKILLS\n\n'
      prompt += 'The following on-demand skills are available. Use the use_skill tool to activate a skill when needed. '
      prompt += 'Each skill has a name and description - use the description to determine when to activate it.\n\n'

      for (const skill of onDemandSkills) {
        prompt += `- **${skill.metadata.name}** (id: \`${skill.metadata.id}\`): ${skill.metadata.description}\n`
      }
      prompt += '\n'
    }

    console.log(`[SkillsManager] Built prompt with ${activeSkills.length} active skills and ${onDemandSkills.length} on-demand skills`)

    return prompt
  }

  /**
   * Validate regex pattern for ReDoS vulnerabilities
   * Checks for dangerous patterns like nested quantifiers, catastrophic backtracking
   */
  private validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
    // Check for nested quantifiers (common ReDoS pattern)
    // Patterns like (a+)+, (a*)*, (a?)?, etc.
    const nestedQuantifierPattern = /\([^)]*[+*?][^)]*\)[+*?]/
    if (nestedQuantifierPattern.test(pattern)) {
      return { valid: false, error: 'Nested quantifiers detected (potential ReDoS)' }
    }

    // Check for excessive nesting depth (more than 3 levels)
    let maxDepth = 0
    let currentDepth = 0
    for (const char of pattern) {
      if (char === '(') {
        currentDepth++
        maxDepth = Math.max(maxDepth, currentDepth)
      } else if (char === ')') {
        currentDepth--
      }
    }
    if (maxDepth > 3) {
      return { valid: false, error: 'Excessive nesting depth detected (potential ReDoS)' }
    }

    // Check for patterns with multiple quantifiers in sequence
    // Patterns like a+b+c+ that can cause backtracking
    const multipleQuantifiers = /[+*?]{2,}/
    if (multipleQuantifiers.test(pattern)) {
      return { valid: false, error: 'Multiple consecutive quantifiers detected (potential ReDoS)' }
    }

    // Check pattern length (very long patterns can be problematic)
    if (pattern.length > 200) {
      return { valid: false, error: 'Pattern too long (max 200 characters)' }
    }

    return { valid: true }
  }

  /**
   * Get skills for on-demand activation based on context
   */
  getContextMatchingSkills(context: string): Skill[] {
    const contextMatchSkills = this.getSkillsByActivation('context-match')

    console.log(`[SkillsManager] getContextMatchingSkills - checking ${contextMatchSkills.length} skills against context`)

    // Use synchronous matching for compatibility (with async-safe wrapper)
    return contextMatchSkills.filter((skill) => {
      console.log(`[SkillsManager] Skill ${skill.metadata.id} contextPatterns:`, skill.metadata.contextPatterns)

      if (!skill.metadata.contextPatterns || !Array.isArray(skill.metadata.contextPatterns)) {
        console.log(`[SkillsManager] Skill ${skill.metadata.id} has no valid contextPatterns`)
        return false
      }

      // Use synchronous safe matching (with timeout protection via worker-like approach)
      const matched = skill.metadata.contextPatterns.some((pattern) => {
        // Default to substring matching (safer)
        const regexMatch = pattern.match(/^\/(.+)\/$/)

        if (!regexMatch) {
          // Simple substring match (case-insensitive)
          const result = context.toLowerCase().includes(pattern.toLowerCase())
          console.log(`[SkillsManager] Pattern "${pattern}" (substring match) result: ${result}`)
          return result
        }

        // Extract regex pattern
        const regexPattern = regexMatch[1]

        // Validate regex pattern for ReDoS vulnerabilities
        const validation = this.validateRegexPattern(regexPattern)
        if (!validation.valid) {
          console.warn(`[SkillsManager] Unsafe regex pattern rejected: ${validation.error}`)
          // Fallback to substring matching
          return context.toLowerCase().includes(regexPattern.toLowerCase())
        }

        // Test regex with synchronous timeout protection
        try {
          const regex = new RegExp(regexPattern, 'i')

          // Use a simple heuristic: limit input length for regex matching
          // This prevents catastrophic backtracking on very long inputs
          const testContext = context.length > 1000 ? context.substring(0, 1000) : context

          // Measure execution time (approximate)
          const startTime = Date.now()
          const result = regex.test(testContext)
          const executionTime = Date.now() - startTime

          // If execution took too long (> 10ms), it might be a ReDoS attempt
          if (executionTime > 10) {
            console.warn(`[SkillsManager] Regex pattern "${pattern}" took ${executionTime}ms, potential ReDoS, falling back to substring`)
            return context.toLowerCase().includes(regexPattern.toLowerCase())
          }

          console.log(`[SkillsManager] Pattern "${pattern}" (regex match) result: ${result}`)
          return result
        } catch (error) {
          // Invalid regex syntax - fallback to substring matching
          console.warn(`[SkillsManager] Invalid regex pattern "${pattern}", falling back to substring match:`, error)
          return context.toLowerCase().includes(regexPattern.toLowerCase())
        }
      })

      return matched
    })
  }

  /**
   * Create a new user skill
   */
  async createUserSkill(metadata: SkillMetadata, content: string): Promise<Skill> {
    const userSkillsPath = this.getUserSkillsPath()

    // Ensure user skills directory exists
    await fs.mkdir(userSkillsPath, { recursive: true })

    // Create skill directory
    const skillDir = path.join(userSkillsPath, metadata.id)
    await fs.mkdir(skillDir, { recursive: true })

    // Build SKILL.md content
    const skillContent = this.buildSkillFile(metadata, content)

    // Write SKILL.md file
    const skillPath = path.join(skillDir, SKILL_FILE_NAME)
    await fs.writeFile(skillPath, skillContent, 'utf-8')

    // Reload skills
    await this.loadAllSkills()

    const skill = this.skills.get(metadata.id)
    if (!skill) {
      throw new Error('Failed to create skill')
    }

    return skill
  }

  /**
   * Delete a user skill
   */
  async deleteUserSkill(id: string): Promise<void> {
    const skill = this.skills.get(id)
    if (!skill) {
      throw new Error(`Skill not found: ${id}`)
    }

    if (skill.source !== 'user') {
      throw new Error('Can only delete user-created skills')
    }

    // Delete skill directory
    const skillDir = path.dirname(skill.path)
    await fs.rm(skillDir, { recursive: true, force: true })

    // Remove from memory
    this.skills.delete(id)
    this.skillStates.delete(id)

    // Notify webview
    await this.notifySkillsUpdate()
  }

  /**
   * Import a skill from a ZIP file
   * Supports two ZIP structures:
   * - Structure A: SKILL.md at root (extracts to folder named after skill ID)
   * - Structure B: SKILL.md in subdirectory (extracts the subdirectory)
   */
  async importSkillFromZip(zipPath: string, overwrite?: boolean): Promise<SkillImportResult> {
    console.log(`[SkillsManager] Importing skill from ZIP: ${zipPath}`)

    let zip: AdmZip
    try {
      zip = new AdmZip(zipPath)
    } catch (error) {
      console.error('[SkillsManager] Failed to open ZIP file:', error)
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
        console.error('[SkillsManager] Potential path traversal detected:', entryName)
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

    const skillId = metadata.id as string
    const skillName = metadata.name as string

    // Check if skill already exists
    const userSkillsPath = this.getUserSkillsPath()
    const targetDir = path.join(userSkillsPath, skillId)

    if (await this.directoryExists(targetDir)) {
      if (!overwrite) {
        return {
          success: false,
          skillId,
          skillName,
          error: `Skill "${skillId}" already exists`,
          errorCode: 'DIR_EXISTS'
        }
      }
      // Remove existing directory for overwrite
      console.log(`[SkillsManager] Overwriting existing skill: ${skillId}`)
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
        console.log(`[SkillsManager] Extracted: ${relativePath}`)
      }

      // Reload skills to pick up the new skill
      await this.loadAllSkills()

      console.log(`[SkillsManager] Successfully imported skill: ${skillId}`)
      return {
        success: true,
        skillId,
        skillName
      }
    } catch (error) {
      console.error('[SkillsManager] Failed to extract skill:', error)

      // Cleanup on failure
      try {
        await fs.rm(targetDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        skillId,
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
    file += `id: ${metadata.id}\n`
    file += `name: ${metadata.name}\n`
    file += `description: ${metadata.description}\n`
    file += `version: ${metadata.version || '1.0.0'}\n`
    if (metadata.author) {
      file += `author: ${metadata.author}\n`
    }
    if (metadata.tags && metadata.tags.length > 0) {
      file += `tags: [${metadata.tags.join(', ')}]\n`
    }
    if (metadata.icon) {
      file += `icon: ${metadata.icon}\n`
    }
    if (metadata.activation) {
      file += `activation: ${metadata.activation}\n`
    }
    if (metadata.contextPatterns && metadata.contextPatterns.length > 0) {
      file += `contextPatterns: [${metadata.contextPatterns.join(', ')}]\n`
    }
    if (metadata.requires && metadata.requires.length > 0) {
      file += `requires: [${metadata.requires.join(', ')}]\n`
    }

    return `---\n${file}---\n\n${content}`
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
