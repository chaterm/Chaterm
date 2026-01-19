import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app before importing SkillsManager
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test-user-data')
  }
}))

// Mock chokidar to avoid filesystem side-effects
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() })) },
  watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() }))
}))

// Mock database service
const mockDbServiceInstance = {
  getSkillStates: vi.fn(async () => []),
  setSkillState: vi.fn(async () => undefined)
}

vi.mock('../../../../storage/db/chaterm.service', () => ({
  ChatermDatabaseService: {
    getInstance: vi.fn(async () => mockDbServiceInstance)
  }
}))

// Mock edition config
vi.mock('../../../../config/edition', () => ({
  getUserDataPath: vi.fn(() => '/tmp/test-user-data')
}))

// Mock fs/promises
vi.mock('fs/promises')

import * as fs from 'fs/promises'
import { vol } from 'memfs'
import { SkillsManager } from '../SkillsManager'

// Helper function to setup memfs with initial state
function setupMemfs(files: Record<string, string | Buffer> = {}) {
  vol.reset()
  vol.fromJSON(files as Record<string, string>)
}

// Helper to create a valid SKILL.md content
function createSkillMdContent(
  id: string,
  name: string,
  description: string,
  options: {
    version?: string
    author?: string
    activation?: string
    tags?: string[]
    contextPatterns?: string[]
  } = {}
): string {
  let content = '---\n'
  content += `id: ${id}\n`
  content += `name: ${name}\n`
  content += `description: ${description}\n`
  if (options.version) content += `version: ${options.version}\n`
  if (options.author) content += `author: ${options.author}\n`
  if (options.activation) content += `activation: ${options.activation}\n`
  if (options.tags) content += `tags: [${options.tags.join(', ')}]\n`
  if (options.contextPatterns) content += `contextPatterns: [${options.contextPatterns.join(', ')}]\n`
  content += '---\n\n'
  content += `# ${name}\n\nThis is the skill content for ${name}.`
  return content
}

describe('SkillsManager', () => {
  let skillsManager: SkillsManager

  beforeEach(async () => {
    vi.clearAllMocks()
    setupMemfs({})
    skillsManager = new SkillsManager()
  })

  afterEach(async () => {
    if (skillsManager) {
      await skillsManager.dispose()
    }
    vol.reset()
  })

  describe('parseFrontmatter', () => {
    it('should parse valid frontmatter with all fields', () => {
      const content = createSkillMdContent('test-skill', 'Test Skill', 'A test skill', {
        version: '1.0.0',
        author: 'Test Author',
        activation: 'on-demand',
        tags: ['test', 'example']
      })

      const result = (skillsManager as any).parseFrontmatter(content)

      expect(result.metadata.id).toBe('test-skill')
      expect(result.metadata.name).toBe('Test Skill')
      expect(result.metadata.description).toBe('A test skill')
      expect(result.metadata.version).toBe('1.0.0')
      expect(result.metadata.author).toBe('Test Author')
      expect(result.metadata.activation).toBe('on-demand')
      expect(result.metadata.tags).toEqual(['test', 'example'])
      expect(result.body).toContain('# Test Skill')
    })

    it('should parse frontmatter with minimal fields', () => {
      const content = '---\nid: minimal\nname: Minimal Skill\ndescription: A minimal skill\n---\n\nContent here'

      const result = (skillsManager as any).parseFrontmatter(content)

      expect(result.metadata.id).toBe('minimal')
      expect(result.metadata.name).toBe('Minimal Skill')
      expect(result.metadata.description).toBe('A minimal skill')
      expect(result.body).toBe('Content here')
    })

    it('should handle content without frontmatter', () => {
      const content = '# My Skill\n\nThis skill does something cool.'

      const result = (skillsManager as any).parseFrontmatter(content)

      expect(result.metadata.name).toBe('My Skill')
      expect(result.metadata.id).toBe('my-skill')
      expect(result.body).toBe(content)
    })

    it('should handle quoted strings in frontmatter', () => {
      const content = '---\nid: "quoted-skill"\nname: "Quoted Skill"\ndescription: "A skill with quotes"\n---\n\nContent'

      const result = (skillsManager as any).parseFrontmatter(content)

      expect(result.metadata.id).toBe('quoted-skill')
      expect(result.metadata.name).toBe('Quoted Skill')
      expect(result.metadata.description).toBe('A skill with quotes')
    })

    it('should handle boolean values in frontmatter', () => {
      const content = '---\nid: bool-test\nname: Bool Test\ndescription: Test\nenabled: true\ndisabled: false\n---\n\nContent'

      const result = (skillsManager as any).parseFrontmatter(content)

      expect((result.metadata as any).enabled).toBe(true)
      expect((result.metadata as any).disabled).toBe(false)
    })

    it('should handle numeric values in frontmatter', () => {
      const content = '---\nid: num-test\nname: Num Test\ndescription: Test\npriority: 10\n---\n\nContent'

      const result = (skillsManager as any).parseFrontmatter(content)

      expect((result.metadata as any).priority).toBe(10)
    })
  })

  describe('validateMetadata', () => {
    it('should validate complete metadata successfully', () => {
      const metadata = {
        id: 'valid-skill',
        name: 'Valid Skill',
        description: 'A valid skill'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation when id is missing', () => {
      const metadata = {
        name: 'Missing ID',
        description: 'A skill without id'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required field: id')
    })

    it('should fail validation when name is missing', () => {
      const metadata = {
        id: 'missing-name',
        description: 'A skill without name'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required field: name')
    })

    it('should fail validation when description is missing', () => {
      const metadata = {
        id: 'missing-desc',
        name: 'Missing Description'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required field: description')
    })

    it('should warn about invalid ID format', () => {
      const metadata = {
        id: 'Invalid ID With Spaces',
        name: 'Invalid ID Skill',
        description: 'A skill with invalid ID'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(true) // Still valid, just warning
      expect(result.warnings).toContain('ID should only contain alphanumeric characters and hyphens')
    })

    it('should warn about invalid version format', () => {
      const metadata = {
        id: 'version-test',
        name: 'Version Test',
        description: 'Test',
        version: 'invalid-version'
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Version should follow semver format (e.g., 1.0.0)')
    })

    it('should warn about invalid activation type', () => {
      const metadata = {
        id: 'activation-test',
        name: 'Activation Test',
        description: 'Test',
        activation: 'invalid-type' as any
      }

      const result = skillsManager.validateMetadata(metadata)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Invalid activation type')
    })
  })

  describe('parseSkillFile', () => {
    it('should parse a valid skill file', async () => {
      const skillContent = createSkillMdContent('test-skill', 'Test Skill', 'A test skill', {
        version: '1.0.0',
        activation: 'on-demand'
      })

      setupMemfs({
        '/tmp/skills/test-skill/SKILL.md': skillContent
      })

      const result = await skillsManager.parseSkillFile('/tmp/skills/test-skill/SKILL.md', 'user')

      expect(result.success).toBe(true)
      expect(result.skill).toBeDefined()
      expect(result.skill!.metadata.id).toBe('test-skill')
      expect(result.skill!.metadata.name).toBe('Test Skill')
      expect(result.skill!.source).toBe('user')
      expect(result.skill!.enabled).toBe(true)
    })

    it('should return error for non-existent file', async () => {
      setupMemfs({})

      const result = await skillsManager.parseSkillFile('/tmp/nonexistent/SKILL.md', 'user')

      expect(result.success).toBe(false)
      expect(result.error).toContain('File not found')
    })

    it('should return error for invalid metadata', async () => {
      const invalidContent = '---\nname: Only Name\n---\n\nContent'

      setupMemfs({
        '/tmp/skills/invalid/SKILL.md': invalidContent
      })

      const result = await skillsManager.parseSkillFile('/tmp/skills/invalid/SKILL.md', 'user')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid skill metadata')
    })

    it('should scan and include resource files', async () => {
      const skillContent = createSkillMdContent('resource-skill', 'Resource Skill', 'A skill with resources')

      setupMemfs({
        '/tmp/skills/resource-skill/SKILL.md': skillContent,
        '/tmp/skills/resource-skill/script.sh': '#!/bin/bash\necho "Hello"',
        '/tmp/skills/resource-skill/config.json': '{"key": "value"}'
      })

      const result = await skillsManager.parseSkillFile('/tmp/skills/resource-skill/SKILL.md', 'user')

      expect(result.success).toBe(true)
      expect(result.skill!.resources).toBeDefined()
      expect(result.skill!.resources!.length).toBe(2)

      const scriptResource = result.skill!.resources!.find((r) => r.name === 'script.sh')
      expect(scriptResource).toBeDefined()
      expect(scriptResource!.type).toBe('script')

      const configResource = result.skill!.resources!.find((r) => r.name === 'config.json')
      expect(configResource).toBeDefined()
      expect(configResource!.type).toBe('config')
    })
  })

  describe('getContextMatchingSkills', () => {
    beforeEach(async () => {
      // Setup skills with context patterns
      const skill1Content = createSkillMdContent('docker-skill', 'Docker Skill', 'Docker helper', {
        activation: 'context-match',
        contextPatterns: ['docker', 'container']
      })

      const skill2Content = createSkillMdContent('k8s-skill', 'K8s Skill', 'Kubernetes helper', {
        activation: 'context-match',
        contextPatterns: ['kubernetes', 'kubectl', 'k8s']
      })

      const skill3Content = createSkillMdContent('git-skill', 'Git Skill', 'Git helper', {
        activation: 'on-demand'
      })

      setupMemfs({
        '/tmp/test-user-data/skills/docker-skill/SKILL.md': skill1Content,
        '/tmp/test-user-data/skills/k8s-skill/SKILL.md': skill2Content,
        '/tmp/test-user-data/skills/git-skill/SKILL.md': skill3Content
      })

      await skillsManager.initialize()
    })

    it('should match skills based on context patterns', () => {
      const matchedSkills = skillsManager.getContextMatchingSkills('How do I run a docker container?')

      expect(matchedSkills.length).toBeGreaterThan(0)
      expect(matchedSkills.some((s) => s.metadata.id === 'docker-skill')).toBe(true)
    })

    it('should match multiple patterns', () => {
      const matchedSkills = skillsManager.getContextMatchingSkills('kubectl get pods')

      expect(matchedSkills.some((s) => s.metadata.id === 'k8s-skill')).toBe(true)
    })

    it('should not match unrelated context', () => {
      const matchedSkills = skillsManager.getContextMatchingSkills('How to write Python code?')

      expect(matchedSkills.some((s) => s.metadata.id === 'docker-skill')).toBe(false)
      expect(matchedSkills.some((s) => s.metadata.id === 'k8s-skill')).toBe(false)
    })

    it('should not include on-demand skills in context matching', () => {
      const matchedSkills = skillsManager.getContextMatchingSkills('git commit')

      expect(matchedSkills.some((s) => s.metadata.id === 'git-skill')).toBe(false)
    })

    it('should support regex patterns wrapped in slashes', async () => {
      // Create a new manager instance to avoid conflicts with previous tests
      const newManager = new SkillsManager()
      const regexSkillContent = createSkillMdContent('regex-skill', 'Regex Skill', 'Regex helper', {
        activation: 'context-match',
        contextPatterns: ['/^error\\s+\\d+/']
      })

      setupMemfs({
        '/tmp/test-user-data/skills/regex-skill/SKILL.md': regexSkillContent
      })

      await newManager.initialize()
      await newManager.setSkillEnabled('regex-skill', true)

      const matchedSkills = newManager.getContextMatchingSkills('error 404 not found')
      expect(matchedSkills.some((s) => s.metadata.id === 'regex-skill')).toBe(true)

      const notMatchedSkills = newManager.getContextMatchingSkills('no error here')
      expect(notMatchedSkills.some((s) => s.metadata.id === 'regex-skill')).toBe(false)

      await newManager.dispose()
    })

    it('should reject unsafe regex patterns during skill loading', async () => {
      // Create a new manager instance to avoid conflicts with previous tests
      const newManager = new SkillsManager()
      // Create a skill with a ReDoS-vulnerable pattern
      const unsafeSkillContent = createSkillMdContent('unsafe-skill', 'Unsafe Skill', 'Unsafe helper', {
        activation: 'context-match',
        contextPatterns: ['/(a+)+b/'] // Nested quantifiers - ReDoS pattern
      })

      setupMemfs({
        '/tmp/test-user-data/skills/unsafe-skill/SKILL.md': unsafeSkillContent
      })

      await newManager.initialize()

      // The skill should be rejected during validation and not loaded
      const skill = newManager.getSkill('unsafe-skill')
      expect(skill).toBeUndefined()

      // Verify that no skills with unsafe patterns are loaded
      const allSkills = newManager.getAllSkills()
      expect(allSkills.some((s) => s.metadata.id === 'unsafe-skill')).toBe(false)

      await newManager.dispose()
    })
  })

  describe('validateMetadata - ReDoS protection', () => {
    it('should reject nested quantifiers in regex patterns', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: ['/(a+)+b/'] // Nested quantifiers
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Nested quantifiers'))).toBe(true)
    })

    it('should reject excessive nesting depth', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: ['/(((((a))))))/'] // Deep nesting (5 levels)
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Excessive nesting depth'))).toBe(true)
    })

    it('should reject multiple consecutive quantifiers', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: ['/a+++/'] // Multiple consecutive quantifiers
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Multiple consecutive quantifiers'))).toBe(true)
    })

    it('should reject patterns that are too long', () => {
      const longPattern = '/a'.repeat(201) + '/'
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: [longPattern]
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Pattern too long'))).toBe(true)
    })

    it('should accept safe regex patterns', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: ['/^error\\s+\\d+$/'] // Safe pattern
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should accept substring patterns (default, always safe)', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        description: 'Test',
        version: '1.0.0',
        activation: 'context-match' as const,
        contextPatterns: ['docker', 'container'] // Substring patterns
      }

      const result = skillsManager.validateMetadata(metadata)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })
  })

  describe('buildSkillsPrompt', () => {
    beforeEach(async () => {
      const alwaysSkill = createSkillMdContent('always-skill', 'Always Skill', 'Always active', {
        activation: 'always'
      })

      const onDemandSkill = createSkillMdContent('on-demand-skill', 'On Demand Skill', 'On demand', {
        activation: 'on-demand'
      })

      setupMemfs({
        '/tmp/test-user-data/skills/always-skill/SKILL.md': alwaysSkill,
        '/tmp/test-user-data/skills/on-demand-skill/SKILL.md': onDemandSkill
      })

      await skillsManager.initialize()
    })

    it('should include always-active skills in prompt', () => {
      const prompt = skillsManager.buildSkillsPrompt()

      expect(prompt).toContain('ACTIVE SKILLS')
      expect(prompt).toContain('Always Skill')
    })

    it('should include on-demand skills in available section', () => {
      const prompt = skillsManager.buildSkillsPrompt()

      expect(prompt).toContain('AVAILABLE SKILLS')
      expect(prompt).toContain('On Demand Skill')
    })

    it('should return empty string when no skills are enabled', async () => {
      // Disable all skills
      await skillsManager.setSkillEnabled('always-skill', false)
      await skillsManager.setSkillEnabled('on-demand-skill', false)

      const prompt = skillsManager.buildSkillsPrompt()

      expect(prompt).toBe('')
    })
  })

  describe('createUserSkill', () => {
    beforeEach(() => {
      setupMemfs({})
      // Ensure directory structure exists
      vol.mkdirSync('/tmp/test-user-data/skills', { recursive: true })
    })

    it('should create a new user skill', async () => {
      const metadata = {
        id: 'new-skill',
        name: 'New Skill',
        description: 'A newly created skill',
        version: '1.0.0',
        activation: 'on-demand' as const
      }

      const skill = await skillsManager.createUserSkill(metadata, '# Instructions\n\nDo something.')

      expect(skill).toBeDefined()
      expect(skill.metadata.id).toBe('new-skill')
      expect(skill.metadata.name).toBe('New Skill')
      expect(skill.source).toBe('user')
    })

    it('should create skill directory and SKILL.md file', async () => {
      const metadata = {
        id: 'file-test',
        name: 'File Test',
        description: 'Test file creation',
        version: '1.0.0'
      }

      await skillsManager.createUserSkill(metadata, 'Content')

      // Verify the file was created
      const fileContent = await fs.readFile('/tmp/test-user-data/skills/file-test/SKILL.md', 'utf-8')
      expect(fileContent).toContain('id: file-test')
      expect(fileContent).toContain('name: File Test')
    })
  })

  describe('deleteUserSkill', () => {
    beforeEach(async () => {
      const skillContent = createSkillMdContent('deletable-skill', 'Deletable Skill', 'Can be deleted')

      setupMemfs({
        '/tmp/test-user-data/skills/deletable-skill/SKILL.md': skillContent
      })

      await skillsManager.initialize()
    })

    it('should delete a user skill', async () => {
      expect(skillsManager.getSkill('deletable-skill')).toBeDefined()

      await skillsManager.deleteUserSkill('deletable-skill')

      expect(skillsManager.getSkill('deletable-skill')).toBeUndefined()
    })

    it('should throw error for non-existent skill', async () => {
      await expect(skillsManager.deleteUserSkill('non-existent')).rejects.toThrow('Skill not found')
    })
  })

  describe('setSkillEnabled', () => {
    beforeEach(async () => {
      const skillContent = createSkillMdContent('toggle-skill', 'Toggle Skill', 'Can be toggled')

      setupMemfs({
        '/tmp/test-user-data/skills/toggle-skill/SKILL.md': skillContent
      })

      await skillsManager.initialize()
    })

    it('should enable a skill', async () => {
      await skillsManager.setSkillEnabled('toggle-skill', true)

      const skill = skillsManager.getSkill('toggle-skill')
      expect(skill!.enabled).toBe(true)
    })

    it('should disable a skill', async () => {
      await skillsManager.setSkillEnabled('toggle-skill', false)

      const skill = skillsManager.getSkill('toggle-skill')
      expect(skill!.enabled).toBe(false)
    })

    it('should throw error for non-existent skill', async () => {
      await expect(skillsManager.setSkillEnabled('non-existent', true)).rejects.toThrow('Skill not found')
    })

    it('should persist skill state to database', async () => {
      await skillsManager.setSkillEnabled('toggle-skill', false)

      expect(mockDbServiceInstance.setSkillState).toHaveBeenCalledWith('toggle-skill', false)
    })
  })

  describe('importSkillFromZip', () => {
    it('should return error for invalid ZIP file', async () => {
      // Create an invalid file that is not a ZIP
      setupMemfs({
        '/tmp/invalid.zip': 'not a zip file content'
      })
      vol.mkdirSync('/tmp/test-user-data/skills', { recursive: true })

      const result = await skillsManager.importSkillFromZip('/tmp/invalid.zip')

      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('INVALID_ZIP')
    })

    it('should return error for non-existent file', async () => {
      setupMemfs({})
      vol.mkdirSync('/tmp/test-user-data/skills', { recursive: true })

      const result = await skillsManager.importSkillFromZip('/tmp/nonexistent.zip')

      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('INVALID_ZIP')
    })
  })

  describe('getUserSkillsPath', () => {
    it('should return correct user skills path', () => {
      const result = skillsManager.getUserSkillsPath()
      const expected = require('path').join('/tmp/test-user-data', 'skills')

      expect(result).toBe(expected)
    })
  })

  describe('getAllSkills and getEnabledSkills', () => {
    beforeEach(async () => {
      const skill1 = createSkillMdContent('skill-1', 'Skill 1', 'First skill')
      const skill2 = createSkillMdContent('skill-2', 'Skill 2', 'Second skill')

      setupMemfs({
        '/tmp/test-user-data/skills/skill-1/SKILL.md': skill1,
        '/tmp/test-user-data/skills/skill-2/SKILL.md': skill2
      })

      await skillsManager.initialize()
    })

    it('should return all skills', () => {
      const allSkills = skillsManager.getAllSkills()

      expect(allSkills.length).toBe(2)
    })

    it('should return only enabled skills', async () => {
      await skillsManager.setSkillEnabled('skill-1', false)

      const enabledSkills = skillsManager.getEnabledSkills()

      expect(enabledSkills.length).toBe(1)
      expect(enabledSkills[0].metadata.id).toBe('skill-2')
    })
  })

  describe('getSkillsByActivation', () => {
    beforeEach(async () => {
      const alwaysSkill = createSkillMdContent('always', 'Always', 'Always active', { activation: 'always' })
      const onDemandSkill = createSkillMdContent('on-demand', 'On Demand', 'On demand', { activation: 'on-demand' })
      const contextSkill = createSkillMdContent('context', 'Context', 'Context match', {
        activation: 'context-match',
        contextPatterns: ['test']
      })

      setupMemfs({
        '/tmp/test-user-data/skills/always/SKILL.md': alwaysSkill,
        '/tmp/test-user-data/skills/on-demand/SKILL.md': onDemandSkill,
        '/tmp/test-user-data/skills/context/SKILL.md': contextSkill
      })

      await skillsManager.initialize()
    })

    it('should return skills by activation type - always', () => {
      const skills = skillsManager.getSkillsByActivation('always')

      expect(skills.length).toBe(1)
      expect(skills[0].metadata.id).toBe('always')
    })

    it('should return skills by activation type - on-demand', () => {
      const skills = skillsManager.getSkillsByActivation('on-demand')

      expect(skills.length).toBe(1)
      expect(skills[0].metadata.id).toBe('on-demand')
    })

    it('should return skills by activation type - context-match', () => {
      const skills = skillsManager.getSkillsByActivation('context-match')

      expect(skills.length).toBe(1)
      expect(skills[0].metadata.id).toBe('context')
    })
  })

  describe('dispose', () => {
    it('should clean up resources on dispose', async () => {
      const skillContent = createSkillMdContent('dispose-test', 'Dispose Test', 'Test dispose')

      setupMemfs({
        '/tmp/test-user-data/skills/dispose-test/SKILL.md': skillContent
      })

      await skillsManager.initialize()
      expect(skillsManager.getAllSkills().length).toBe(1)

      await skillsManager.dispose()

      expect(skillsManager.getAllSkills().length).toBe(0)
    })
  })
})
