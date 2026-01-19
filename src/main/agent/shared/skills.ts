//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

/**
 * Agent Skills System
 *
 * Skills are reusable instruction sets that extend Chaterm's capabilities.
 * Each skill is defined in a SKILL.md file following the Agent Skills standard.
 */

/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Unique identifier for the skill */
  id: string
  /** Display name of the skill */
  name: string
  /** Brief description of what the skill does */
  description: string
  /** Skill version (semver format) */
  version: string
  /** Author of the skill */
  author?: string
  /** Tags for categorization */
  tags?: string[]
  /** Icon name or URL */
  icon?: string
  /** Required capabilities or dependencies */
  requires?: string[]
  /** When the skill should be activated (e.g., 'always', 'on-demand', 'context-match') */
  activation?: 'always' | 'on-demand' | 'context-match'
  /** Context patterns that trigger this skill (for context-match activation) */
  contextPatterns?: string[]
}

/**
 * Resource file included in a skill folder
 */
export interface SkillResource {
  /** File name (relative to skill directory) */
  name: string
  /** Full path to the file */
  path: string
  /** File type based on extension */
  type: 'script' | 'template' | 'config' | 'data' | 'other'
  /** File content (loaded on demand) */
  content?: string
  /** File size in bytes */
  size: number
}

/**
 * A complete skill definition including content
 */
export interface Skill {
  /** Skill metadata */
  metadata: SkillMetadata
  /** The full instruction content from SKILL.md */
  content: string
  /** Path to the SKILL.md file */
  path: string
  /** Path to the skill directory (parent of SKILL.md) */
  directory: string
  /** Whether the skill is enabled */
  enabled: boolean
  /** Source of the skill (built-in, user, marketplace) */
  source: 'builtin' | 'user' | 'marketplace'
  /** Last modified timestamp */
  lastModified?: number
  /** Resource files in the skill directory */
  resources?: SkillResource[]
}

/**
 * Skill state stored in database
 */
export interface SkillState {
  /** Skill ID */
  skillId: string
  /** Whether the skill is enabled */
  enabled: boolean
  /** User-specific configuration overrides */
  config?: Record<string, unknown>
  /** Last used timestamp */
  lastUsed?: number
}

/**
 * Result of parsing a SKILL.md file
 */
export interface SkillParseResult {
  success: boolean
  skill?: Skill
  error?: string
}

/**
 * Skill directory info
 */
export interface SkillDirectory {
  /** Directory path */
  path: string
  /** Type of directory */
  type: 'builtin' | 'user' | 'marketplace'
  /** Whether the directory exists */
  exists: boolean
}

/**
 * Skill validation result
 */
export interface SkillValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Error codes for skill import operations
 */
export type SkillImportErrorCode = 'INVALID_ZIP' | 'NO_SKILL_MD' | 'INVALID_METADATA' | 'DIR_EXISTS' | 'EXTRACT_FAILED' | 'UNKNOWN'

/**
 * Result of importing a skill from ZIP
 */
export interface SkillImportResult {
  success: boolean
  skillId?: string
  skillName?: string
  error?: string
  errorCode?: SkillImportErrorCode
}

/**
 * Default skill metadata values
 */
export const DEFAULT_SKILL_METADATA: Partial<SkillMetadata> = {
  version: '1.0.0',
  activation: 'on-demand',
  tags: []
}

/**
 * Skill file constants
 */
export const SKILL_FILE_NAME = 'SKILL.md'
export const SKILLS_DIR_NAME = 'skills'

/**
 * Required metadata fields for a valid skill
 */
export const REQUIRED_SKILL_FIELDS: (keyof SkillMetadata)[] = ['id', 'name', 'description']

/**
 * File extension to resource type mapping
 */
export const RESOURCE_TYPE_MAP: Record<string, SkillResource['type']> = {
  // Scripts
  '.sh': 'script',
  '.bash': 'script',
  '.zsh': 'script',
  '.py': 'script',
  '.js': 'script',
  '.ts': 'script',
  '.rb': 'script',
  '.pl': 'script',
  '.ps1': 'script',
  '.bat': 'script',
  '.cmd': 'script',
  // Templates
  '.tmpl': 'template',
  '.tpl': 'template',
  '.hbs': 'template',
  '.ejs': 'template',
  '.jinja': 'template',
  '.jinja2': 'template',
  '.mustache': 'template',
  // Config
  '.json': 'config',
  '.yaml': 'config',
  '.yml': 'config',
  '.toml': 'config',
  '.ini': 'config',
  '.conf': 'config',
  '.env': 'config',
  // Data
  '.csv': 'data',
  '.tsv': 'data',
  '.xml': 'data',
  '.sql': 'data'
}

/**
 * Files to ignore when scanning skill resources
 */
export const IGNORED_RESOURCE_FILES = [
  SKILL_FILE_NAME,
  '.DS_Store',
  'Thumbs.db',
  '.git',
  '.gitignore',
  'node_modules',
  '__pycache__',
  '.vscode',
  '.idea'
]

/**
 * Maximum file size for auto-loading resource content (100KB)
 */
export const MAX_RESOURCE_AUTO_LOAD_SIZE = 100 * 1024
