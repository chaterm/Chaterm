/**
 * Skills Settings Component Unit Tests
 *
 * Tests for the Skills settings component including:
 * - Component mounting and initialization
 * - Skills list loading and display
 * - Skill creation, deletion, and toggling
 * - Skill import from ZIP
 * - Skills folder operations
 * - Error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import SkillsComponent from '../skills.vue'
import { message, Modal } from 'ant-design-vue'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  },
  Modal: {
    confirm: vi.fn()
  }
}))

// Mock i18n
const mockTranslations: Record<string, string> = {
  'skills.title': 'Skills',
  'skills.openFolder': 'Open Folder',
  'skills.reload': 'Reload',
  'skills.import': 'Import',
  'skills.importTooltip': 'Import skill from ZIP file',
  'skills.create': 'Create',
  'skills.noSkillsYet': 'No skills yet',
  'skills.noSkillsDescription': 'Create your first skill to extend Agent capabilities',
  'skills.createFirst': 'Create First Skill',
  'skills.createSkill': 'Create New Skill',
  'skills.skillId': 'Skill ID',
  'skills.skillIdPlaceholder': 'e.g., docker-deploy',
  'skills.skillName': 'Skill Name',
  'skills.skillNamePlaceholder': 'e.g., Docker Deployment Assistant',
  'skills.skillDescription': 'Description',
  'skills.skillDescriptionPlaceholder': 'Brief description of this skill',
  'skills.skillVersion': 'Version',
  'skills.skillAuthor': 'Author',
  'skills.skillAuthorPlaceholder': 'Your name or organization',
  'skills.skillActivation': 'Activation',
  'skills.activationAlways': 'Always',
  'skills.activationOnDemand': 'On Demand',
  'skills.activationContextMatch': 'Context Match',
  'skills.contextPatterns': 'Context Patterns',
  'skills.contextPatternsPlaceholder': 'Comma-separated, e.g., log, error, debug',
  'skills.contextPatternsHint': 'Skill will be activated when user message contains these keywords',
  'skills.contextPatternsRequired': 'Context patterns are required for context-match activation',
  'skills.skillTags': 'Tags',
  'skills.skillTagsPlaceholder': 'Comma-separated, e.g., docker, deployment',
  'skills.skillContent': 'Content',
  'skills.skillContentPlaceholder': 'Write skill instructions here (Markdown format)...',
  'skills.sourceBuiltin': 'Built-in',
  'skills.sourceUser': 'User',
  'skills.sourceMarketplace': 'Marketplace',
  'skills.fillRequired': 'Please fill all required fields',
  'skills.invalidId': 'ID can only contain lowercase letters, numbers, and hyphens',
  'skills.loadError': 'Failed to load skills',
  'skills.reloadSuccess': 'Skills reloaded successfully',
  'skills.reloadError': 'Failed to reload skills',
  'skills.openFolderError': 'Failed to open skills folder',
  'skills.toggleError': 'Failed to toggle skill',
  'skills.createSuccess': 'Skill created successfully',
  'skills.createError': 'Failed to create skill',
  'skills.deleteConfirmTitle': 'Confirm Delete',
  'skills.deleteConfirmContent': 'Are you sure you want to delete skill "{name}"? This action cannot be undone.',
  'skills.deleteSuccess': 'Skill deleted successfully',
  'skills.deleteError': 'Failed to delete skill',
  'skills.importSuccess': 'Skill "{name}" imported successfully',
  'skills.importError': 'Failed to import skill',
  'skills.importInvalidZip': 'Invalid or corrupted ZIP file',
  'skills.importNoSkillMd': 'SKILL.md file not found in ZIP package',
  'skills.importInvalidMetadata': 'SKILL.md missing required fields',
  'skills.importOverwriteTitle': 'Skill Already Exists',
  'skills.importOverwriteContent': 'Do you want to overwrite the existing skill?',
  'skills.importOverwrite': 'Overwrite',
  'common.delete': 'Delete',
  'common.cancel': 'Cancel',
  'common.create': 'Create'
}

const mockT = (key: string, params?: Record<string, string>) => {
  let translation = mockTranslations[key] || key
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      translation = translation.replace(`{${paramKey}}`, params[paramKey])
    })
  }
  return translation
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

// Mock window.api
const mockWindowApi = {
  getSkills: vi.fn(),
  reloadSkills: vi.fn(),
  openSkillsFolder: vi.fn(),
  importSkillZip: vi.fn(),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  setSkillEnabled: vi.fn(),
  onSkillsUpdate: vi.fn(),
  showOpenDialog: vi.fn()
}

describe('Skills Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>
  let unsubscribeMock: ReturnType<typeof vi.fn>

  const createWrapper = (options = {}) => {
    return mount(SkillsComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-button': {
            template: '<button class="a-button" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'size', 'loading']
          },
          'a-switch': {
            template: '<input type="checkbox" class="a-switch" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
            props: ['checked', 'size']
          },
          'a-tooltip': {
            template: '<div class="a-tooltip"><slot /></div>',
            props: ['title']
          },
          'a-modal': {
            template:
              '<div v-if="open" class="a-modal"><div class="ant-modal-header"><slot name="title" /></div><div class="ant-modal-body"><slot /></div><div class="ant-modal-footer"><button @click="$emit(\'cancel\')">Cancel</button><button @click="$emit(\'ok\')">OK</button></div></div>',
            props: ['open', 'title', 'okText', 'cancelText', 'confirmLoading', 'width']
          },
          'a-form': {
            template: '<form class="a-form"><slot /></form>'
          },
          'a-form-item': {
            template:
              '<div class="a-form-item"><label v-if="label">{{ label }}</label><slot /><div v-if="$slots.hint" class="form-hint"><slot name="hint" /></div></div>',
            props: ['label', 'required']
          },
          'a-input': {
            template: '<input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" :placeholder="placeholder" />',
            props: ['value', 'placeholder']
          },
          'a-textarea': {
            template:
              '<textarea class="a-textarea" :value="value" @input="$emit(\'update:value\', $event.target.value)" :placeholder="placeholder" :rows="rows" />',
            props: ['value', 'placeholder', 'rows']
          },
          'a-select': {
            template: '<select class="a-select" :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>',
            props: ['value']
          },
          'a-select-option': {
            template: '<option :value="value"><slot /></option>',
            props: ['value']
          },
          'a-tag': {
            template: '<span class="a-tag"><slot /></span>',
            props: ['size']
          },
          FolderOpenOutlined: { template: '<span class="folder-icon" />' },
          ReloadOutlined: { template: '<span class="reload-icon" />' },
          PlusOutlined: { template: '<span class="plus-icon" />' },
          DeleteOutlined: { template: '<span class="delete-icon" />' },
          ThunderboltOutlined: { template: '<span class="thunderbolt-icon" />' },
          ImportOutlined: { template: '<span class="import-icon" />' }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Setup unsubscribe mock
    unsubscribeMock = vi.fn()
    mockWindowApi.onSkillsUpdate.mockReturnValue(unsubscribeMock)

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    mockWindowApi.getSkills.mockResolvedValue([])
    mockWindowApi.reloadSkills.mockResolvedValue(undefined)
    mockWindowApi.openSkillsFolder.mockResolvedValue(undefined)
    mockWindowApi.importSkillZip.mockResolvedValue({ success: true, skillId: 'test-skill', skillName: 'Test Skill' })
    mockWindowApi.createSkill.mockResolvedValue({ success: true })
    mockWindowApi.deleteSkill.mockResolvedValue(undefined)
    mockWindowApi.setSkillEnabled.mockResolvedValue(undefined)
    mockWindowApi.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.skills-settings').exists()).toBe(true)
    })

    it('should load skills on mount', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Test Skill 1',
          description: 'Test description',
          version: '1.0.0',
          enabled: true,
          source: 'user'
        }
      ]
      mockWindowApi.getSkills.mockResolvedValue(mockSkills)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockWindowApi.getSkills).toHaveBeenCalled()
      const vm = wrapper.vm as any
      expect(vm.skills).toEqual(mockSkills)
    })

    it('should subscribe to skills updates on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(mockWindowApi.onSkillsUpdate).toHaveBeenCalled()
    })

    it('should handle skills load errors', async () => {
      const error = new Error('Load failed')
      mockWindowApi.getSkills.mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to load skills')
    })

    it('should update skills when onSkillsUpdate callback is called', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const updateCallback = mockWindowApi.onSkillsUpdate.mock.calls[0][0] as (skills: any[]) => void
      const updatedSkills = [
        {
          id: 'skill-2',
          name: 'Updated Skill',
          description: 'Updated description',
          enabled: true,
          source: 'user'
        }
      ]

      updateCallback(updatedSkills)
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.skills).toEqual(updatedSkills)
    })

    it('should cleanup subscription on unmount', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      wrapper.unmount()

      expect(unsubscribeMock).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('should display empty state when no skills', async () => {
      mockWindowApi.getSkills.mockResolvedValue([])

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('No skills yet')
    })

    it('should show create button in empty state', async () => {
      mockWindowApi.getSkills.mockResolvedValue([])

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const createButton = wrapper.find('.empty-state .a-button')
      expect(createButton.exists()).toBe(true)
    })
  })

  describe('Skills List Display', () => {
    const mockSkills = [
      {
        id: 'skill-1',
        name: 'Test Skill 1',
        description: 'Test description 1',
        version: '1.0.0',
        author: 'Test Author',
        enabled: true,
        source: 'user',
        tags: ['docker', 'deployment'],
        activation: 'on-demand'
      },
      {
        id: 'skill-2',
        name: 'Test Skill 2',
        description: 'Test description 2',
        version: '2.0.0',
        enabled: false,
        source: 'builtin',
        activation: 'always'
      },
      {
        id: 'skill-3',
        name: 'Test Skill 3',
        description: 'Test description 3',
        enabled: true,
        source: 'marketplace',
        activation: 'context-match',
        contextPatterns: ['log', 'error']
      }
    ]

    beforeEach(async () => {
      mockWindowApi.getSkills.mockResolvedValue(mockSkills)
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should display skills list when skills exist', () => {
      expect(wrapper.find('.skills-list').exists()).toBe(true)
      expect(wrapper.findAll('.skill-item').length).toBe(3)
    })

    it('should display skill information correctly', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const firstSkill = skillItems[0]

      expect(firstSkill.text()).toContain('Test Skill 1')
      expect(firstSkill.text()).toContain('v1.0.0')
      expect(firstSkill.text()).toContain('User')
      expect(firstSkill.text()).toContain('Test Author')
      expect(firstSkill.text()).toContain('Test description 1')
    })

    it('should not display author when author is missing', async () => {
      const mockSkillsWithoutAuthor = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          description: 'Test',
          enabled: true,
          source: 'user'
        }
      ]
      mockWindowApi.getSkills.mockResolvedValue(mockSkillsWithoutAuthor)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const skillItem = wrapper.find('.skill-item')
      expect(skillItem.find('.skill-author').exists()).toBe(false)
    })

    it('should display skill tags', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const firstSkill = skillItems[0]

      expect(firstSkill.text()).toContain('docker')
      expect(firstSkill.text()).toContain('deployment')
    })

    it('should display activation type', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const firstSkill = skillItems[0]

      expect(firstSkill.text()).toContain('On Demand')
    })

    it('should display context patterns for context-match activation', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const thirdSkill = skillItems[2]

      expect(thirdSkill.text()).toContain('Context Match')
      expect(thirdSkill.text()).toContain('log, error')
    })

    it('should show delete button only for user-created skills', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const firstSkill = skillItems[0] // user source
      const secondSkill = skillItems[1] // builtin source

      expect(firstSkill.find('.delete-btn').exists()).toBe(true)
      expect(secondSkill.find('.delete-btn').exists()).toBe(false)
    })

    it('should apply disabled class for disabled skills', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const secondSkill = skillItems[1] // enabled: false

      expect(secondSkill.classes()).toContain('disabled')
    })

    it('should display default version when version is missing', () => {
      const skillItems = wrapper.findAll('.skill-item')
      const thirdSkill = skillItems[2] // no version

      expect(thirdSkill.text()).toContain('v1.0.0')
    })
  })

  describe('Reload Skills', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should reload skills when reload button is clicked', async () => {
      const reloadButton = wrapper.find('.skills-actions .a-button:nth-child(2)')

      await reloadButton.trigger('click')
      await nextTick()

      expect(mockWindowApi.reloadSkills).toHaveBeenCalled()
      expect(mockWindowApi.getSkills).toHaveBeenCalled()
    })

    it('should show success message after successful reload', async () => {
      const vm = wrapper.vm as any
      await vm.reloadSkills()
      await nextTick()

      expect(message.success).toHaveBeenCalledWith('Skills reloaded successfully')
    })

    it('should show error message on reload failure', async () => {
      const error = new Error('Reload failed')
      mockWindowApi.reloadSkills.mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.reloadSkills()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to reload skills')
    })

    it('should set loading state during reload', async () => {
      let resolveReload: () => void
      const reloadPromise = new Promise<void>((resolve) => {
        resolveReload = resolve
      })
      mockWindowApi.reloadSkills.mockReturnValue(reloadPromise)

      const vm = wrapper.vm as any
      const reloadPromise2 = vm.reloadSkills()

      await nextTick()
      expect(vm.isReloading).toBe(true)

      resolveReload!()
      await reloadPromise2
      await nextTick()

      expect(vm.isReloading).toBe(false)
    })
  })

  describe('Open Skills Folder', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should open skills folder when button is clicked', async () => {
      const vm = wrapper.vm as any
      await vm.openSkillsFolder()

      expect(mockWindowApi.openSkillsFolder).toHaveBeenCalled()
    })

    it('should show error message on failure', async () => {
      const error = new Error('Open failed')
      mockWindowApi.openSkillsFolder.mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.openSkillsFolder()

      expect(message.error).toHaveBeenCalledWith('Failed to open skills folder')
    })
  })

  describe('Import Skill ZIP', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should open file dialog when import button is clicked', async () => {
      const vm = wrapper.vm as any
      await vm.importSkillZip()

      expect(mockWindowApi.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
      })
    })

    it('should not import if dialog is canceled', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      const vm = wrapper.vm as any
      await vm.importSkillZip()

      expect(mockWindowApi.importSkillZip).not.toHaveBeenCalled()
    })

    it('should import skill when file is selected', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: true,
        skillId: 'imported-skill',
        skillName: 'Imported Skill'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(mockWindowApi.importSkillZip).toHaveBeenCalledWith('/path/to/skill.zip')
      expect(message.success).toHaveBeenCalledWith('Skill "Imported Skill" imported successfully')
      expect(mockWindowApi.getSkills).toHaveBeenCalled()
    })

    it('should show overwrite confirmation when skill already exists', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: false,
        errorCode: 'DIR_EXISTS'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(Modal.confirm).toHaveBeenCalled()
    })

    it('should overwrite skill when confirmed', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip
        .mockResolvedValueOnce({
          success: false,
          errorCode: 'DIR_EXISTS'
        })
        .mockResolvedValueOnce({
          success: true,
          skillId: 'imported-skill',
          skillName: 'Imported Skill'
        })

      const confirmHandler = vi.fn((options) => {
        options.onOk()
      })
      ;(Modal.confirm as ReturnType<typeof vi.fn>).mockImplementation(confirmHandler)

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()
      await nextTick()

      expect(mockWindowApi.importSkillZip).toHaveBeenCalledWith('/path/to/skill.zip', true)
      expect(message.success).toHaveBeenCalledWith('Skill "Imported Skill" imported successfully')
    })

    it('should handle overwrite import failure', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip
        .mockResolvedValueOnce({
          success: false,
          errorCode: 'DIR_EXISTS'
        })
        .mockResolvedValueOnce({
          success: false,
          errorCode: 'INVALID_ZIP'
        })

      const confirmHandler = vi.fn((options) => {
        options.onOk()
      })
      ;(Modal.confirm as ReturnType<typeof vi.fn>).mockImplementation(confirmHandler)

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Invalid or corrupted ZIP file')
    })

    it('should handle overwrite import error', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip
        .mockResolvedValueOnce({
          success: false,
          errorCode: 'DIR_EXISTS'
        })
        .mockRejectedValueOnce(new Error('Overwrite failed'))

      const confirmHandler = vi.fn((options) => {
        options.onOk()
      })
      ;(Modal.confirm as ReturnType<typeof vi.fn>).mockImplementation(confirmHandler)

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to import skill')
    })

    it('should show error for invalid ZIP', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: false,
        errorCode: 'INVALID_ZIP'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Invalid or corrupted ZIP file')
    })

    it('should show error for missing SKILL.md', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: false,
        errorCode: 'NO_SKILL_MD'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('SKILL.md file not found in ZIP package')
    })

    it('should show error for invalid metadata', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: false,
        errorCode: 'INVALID_METADATA'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('SKILL.md missing required fields')
    })

    it('should show default error for unknown error code', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockResolvedValue({
        success: false,
        errorCode: 'UNKNOWN_ERROR'
      })

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to import skill')
    })

    it('should handle import errors', async () => {
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      const error = new Error('Import failed')
      mockWindowApi.importSkillZip.mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.importSkillZip()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to import skill')
    })

    it('should set loading state during import', async () => {
      let resolveImport: () => void
      const importPromise = new Promise<any>((resolve) => {
        resolveImport = () => resolve({ success: true, skillId: 'test', skillName: 'Test' })
      })
      mockWindowApi.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/skill.zip']
      })
      mockWindowApi.importSkillZip.mockReturnValue(importPromise)

      const vm = wrapper.vm as any
      const importPromise2 = vm.importSkillZip()

      await nextTick()
      expect(vm.isImporting).toBe(true)

      resolveImport!()
      await importPromise2
      await nextTick()

      expect(vm.isImporting).toBe(false)
    })
  })

  describe('Create Skill Modal', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should show create modal when create button is clicked', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      expect(vm.createModalVisible).toBe(true)
    })

    it('should reset form when modal is opened', async () => {
      const vm = wrapper.vm as any
      vm.newSkill.id = 'old-id'
      vm.newSkill.name = 'Old Name'

      await vm.showCreateModal()
      await nextTick()

      expect(vm.newSkill.id).toBe('')
      expect(vm.newSkill.name).toBe('')
      expect(vm.newSkill.activation).toBe('on-demand')
    })

    it('should validate required fields', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = ''
      vm.newSkill.name = 'Test'
      vm.newSkill.description = 'Test'
      vm.newSkill.content = 'Test'

      await vm.createSkill()
      await nextTick()

      expect(message.warning).toHaveBeenCalledWith('Please fill all required fields')
      expect(mockWindowApi.createSkill).not.toHaveBeenCalled()
    })

    it('should validate ID format', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'Invalid ID!'
      vm.newSkill.name = 'Test'
      vm.newSkill.description = 'Test'
      vm.newSkill.content = 'Test'

      await vm.createSkill()
      await nextTick()

      expect(message.warning).toHaveBeenCalledWith('ID can only contain lowercase letters, numbers, and hyphens')
      expect(mockWindowApi.createSkill).not.toHaveBeenCalled()
    })

    it('should validate context patterns for context-match activation', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test'
      vm.newSkill.description = 'Test'
      vm.newSkill.content = 'Test'
      vm.newSkill.activation = 'context-match'
      vm.newSkill.contextPatternsInput = ''

      await vm.createSkill()
      await nextTick()

      expect(message.warning).toHaveBeenCalledWith('Context patterns are required for context-match activation')
      expect(mockWindowApi.createSkill).not.toHaveBeenCalled()
    })

    it('should create skill with valid data', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'
      vm.newSkill.version = '1.0.0'
      vm.newSkill.author = 'Test Author'
      vm.newSkill.activation = 'on-demand'
      vm.newSkill.tagsInput = 'docker, deployment'

      await vm.createSkill()
      await nextTick()

      expect(mockWindowApi.createSkill).toHaveBeenCalledWith(
        {
          id: 'test-skill',
          name: 'Test Skill',
          description: 'Test Description',
          version: '1.0.0',
          author: 'Test Author',
          activation: 'on-demand',
          tags: ['docker', 'deployment']
        },
        'Test Content'
      )
      expect(message.success).toHaveBeenCalledWith('Skill created successfully')
      expect(vm.createModalVisible).toBe(false)
      expect(mockWindowApi.getSkills).toHaveBeenCalled()
    })

    it('should create skill with context patterns', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'
      vm.newSkill.activation = 'context-match'
      vm.newSkill.contextPatternsInput = 'log, error, debug'

      await vm.createSkill()
      await nextTick()

      expect(mockWindowApi.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          contextPatterns: ['log', 'error', 'debug']
        }),
        'Test Content'
      )
    })

    it('should handle create skill errors', async () => {
      const error = new Error('Create failed')
      mockWindowApi.createSkill.mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'

      await vm.createSkill()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to create skill')
    })

    it('should set loading state during creation', async () => {
      let resolveCreate: () => void
      const createPromise = new Promise<any>((resolve) => {
        resolveCreate = () => resolve({ success: true })
      })
      mockWindowApi.createSkill.mockReturnValue(createPromise)

      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'

      const createPromise2 = vm.createSkill()

      await nextTick()
      expect(vm.isCreating).toBe(true)

      resolveCreate!()
      await createPromise2
      await nextTick()

      expect(vm.isCreating).toBe(false)
    })

    it('should convert ID to lowercase', async () => {
      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'TEST-SKILL'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'

      await vm.createSkill()
      await nextTick()

      expect(mockWindowApi.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-skill'
        }),
        'Test Content'
      )
    })
  })

  describe('Toggle Skill', () => {
    const mockSkill = {
      id: 'skill-1',
      name: 'Test Skill',
      enabled: true,
      source: 'user'
    }

    beforeEach(async () => {
      mockWindowApi.getSkills.mockResolvedValue([mockSkill])
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should toggle skill enabled state', async () => {
      const vm = wrapper.vm as any
      const skill = vm.skills[0]

      await vm.toggleSkill(skill)
      await nextTick()

      expect(mockWindowApi.setSkillEnabled).toHaveBeenCalledWith('skill-1', true)
    })

    it('should revert change on toggle failure', async () => {
      const error = new Error('Toggle failed')
      mockWindowApi.setSkillEnabled.mockRejectedValue(error)

      const vm = wrapper.vm as any
      const skill = vm.skills[0]
      const originalEnabled = skill.enabled

      await vm.toggleSkill(skill)
      await nextTick()

      expect(skill.enabled).toBe(!originalEnabled)
      expect(message.error).toHaveBeenCalledWith('Failed to toggle skill')
    })
  })

  describe('Delete Skill', () => {
    const mockSkill = {
      id: 'skill-1',
      name: 'Test Skill',
      enabled: true,
      source: 'user'
    }

    beforeEach(async () => {
      mockWindowApi.getSkills.mockResolvedValue([mockSkill])
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should show confirmation modal when delete is clicked', async () => {
      const vm = wrapper.vm as any
      const skill = vm.skills[0]

      await vm.confirmDeleteSkill(skill)
      await nextTick()

      expect(Modal.confirm).toHaveBeenCalled()
    })

    it('should delete skill when confirmed', async () => {
      const confirmHandler = vi.fn((options) => {
        options.onOk()
      })
      ;(Modal.confirm as ReturnType<typeof vi.fn>).mockImplementation(confirmHandler)

      const vm = wrapper.vm as any
      const skill = vm.skills[0]

      await vm.confirmDeleteSkill(skill)
      await nextTick()
      await nextTick()

      expect(mockWindowApi.deleteSkill).toHaveBeenCalledWith('skill-1')
      expect(message.success).toHaveBeenCalledWith('Skill deleted successfully')
      expect(mockWindowApi.getSkills).toHaveBeenCalled()
    })

    it('should handle delete errors', async () => {
      const error = new Error('Delete failed')
      mockWindowApi.deleteSkill.mockRejectedValue(error)

      const confirmHandler = vi.fn((options) => {
        options.onOk()
      })
      ;(Modal.confirm as ReturnType<typeof vi.fn>).mockImplementation(confirmHandler)

      const vm = wrapper.vm as any
      const skill = vm.skills[0]

      await vm.confirmDeleteSkill(skill)
      await nextTick()
      await nextTick()

      expect(message.error).toHaveBeenCalledWith('Failed to delete skill')
    })
  })

  describe('Helper Functions', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should return correct source label', () => {
      const vm = wrapper.vm as any

      expect(vm.getSourceLabel('builtin')).toBe('Built-in')
      expect(vm.getSourceLabel('user')).toBe('User')
      expect(vm.getSourceLabel('marketplace')).toBe('Marketplace')
      expect(vm.getSourceLabel('unknown')).toBe('unknown')
    })

    it('should return correct activation label', () => {
      const vm = wrapper.vm as any

      expect(vm.getActivationLabel('always')).toBe('Always')
      expect(vm.getActivationLabel('on-demand')).toBe('On Demand')
      expect(vm.getActivationLabel('context-match')).toBe('Context Match')
      expect(vm.getActivationLabel(undefined)).toBe('On Demand')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty skills array', async () => {
      mockWindowApi.getSkills.mockResolvedValue([])
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.skills).toEqual([])
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })

    it('should handle skills with missing optional fields', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          description: 'Test',
          enabled: true,
          source: 'user'
        }
      ]
      mockWindowApi.getSkills.mockResolvedValue(mockSkills)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      expect(vm.skills).toEqual(mockSkills)
    })

    it('should handle skill with icon', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          description: 'Test',
          enabled: true,
          source: 'user',
          icon: '🚀'
        }
      ]
      mockWindowApi.getSkills.mockResolvedValue(mockSkills)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const skillItem = wrapper.find('.skill-item')
      expect(skillItem.find('.custom-icon').exists()).toBe(true)
      expect(skillItem.find('.custom-icon').text()).toBe('🚀')
    })

    it('should handle skill without tags', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Test Skill',
          description: 'Test',
          enabled: true,
          source: 'user'
        }
      ]
      mockWindowApi.getSkills.mockResolvedValue(mockSkills)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const skillItem = wrapper.find('.skill-item')
      expect(skillItem.find('.skill-tags').exists()).toBe(false)
    })

    it('should handle create skill with empty tags', async () => {
      mockWindowApi.getSkills.mockResolvedValue([])
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'
      vm.newSkill.tagsInput = ''

      await vm.createSkill()
      await nextTick()

      expect(mockWindowApi.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: undefined
        }),
        'Test Content'
      )
    })

    it('should handle create skill with whitespace-only tags', async () => {
      mockWindowApi.getSkills.mockResolvedValue([])
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      await vm.showCreateModal()
      await nextTick()

      vm.newSkill.id = 'test-skill'
      vm.newSkill.name = 'Test Skill'
      vm.newSkill.description = 'Test Description'
      vm.newSkill.content = 'Test Content'
      vm.newSkill.tagsInput = '  ,  ,  '

      await vm.createSkill()
      await nextTick()

      // Empty strings should be filtered out, resulting in undefined
      expect(mockWindowApi.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: undefined
        }),
        'Test Content'
      )
    })
  })
})
