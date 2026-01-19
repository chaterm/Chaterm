<template>
  <div class="skills-settings">
    <div class="section-header">
      <h3>{{ $t('skills.title') }}</h3>
      <!-- Action Buttons moved to header -->
      <div class="skills-actions">
        <a-button
          type="text"
          size="small"
          @click="openSkillsFolder"
        >
          <FolderOpenOutlined />
          {{ $t('skills.openFolder') }}
        </a-button>
        <a-button
          type="text"
          size="small"
          :loading="isReloading"
          @click="reloadSkills"
        >
          <ReloadOutlined />
          {{ $t('skills.reload') }}
        </a-button>
        <a-tooltip :title="$t('skills.importTooltip')">
          <a-button
            type="text"
            size="small"
            :loading="isImporting"
            @click="importSkillZip"
          >
            <ImportOutlined />
            {{ $t('skills.import') }}
          </a-button>
        </a-tooltip>
        <a-button
          type="primary"
          size="small"
          @click="showCreateModal"
        >
          <PlusOutlined />
          {{ $t('skills.create') }}
        </a-button>
      </div>
    </div>

    <!-- Skills List -->
    <a-card
      class="settings-section skills-list-section"
      :bordered="false"
    >
      <!-- Empty State -->
      <div
        v-if="skills.length === 0"
        class="empty-state"
      >
        <ThunderboltOutlined class="empty-icon" />
        <span class="empty-title">{{ $t('skills.noSkillsYet') }}</span>
        <span class="empty-description">{{ $t('skills.noSkillsDescription') }}</span>
        <a-button
          type="text"
          size="small"
          @click="showCreateModal"
        >
          {{ $t('skills.createFirst') }}
        </a-button>
      </div>

      <!-- Skills List -->
      <div
        v-else
        class="skills-list"
      >
        <div
          v-for="skill in skills"
          :key="skill.id"
          class="skill-item"
          :class="{ disabled: !skill.enabled }"
        >
          <div class="skill-header">
            <div class="skill-info">
              <div class="skill-icon">
                <ThunderboltOutlined v-if="!skill.icon" />
                <span
                  v-else
                  class="custom-icon"
                  >{{ skill.icon }}</span
                >
              </div>
              <div class="skill-details">
                <div class="skill-name-row">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-version">v{{ skill.version || '1.0.0' }}</span>
                  <span class="skill-source">{{ getSourceLabel(skill.source) }}</span>
                  <span
                    v-if="skill.author"
                    class="skill-author"
                    >{{ skill.author }}</span
                  >
                </div>
                <div class="skill-description">{{ skill.description }}</div>
              </div>
            </div>
            <div class="skill-controls">
              <a-switch
                v-model:checked="skill.enabled"
                size="small"
                @change="toggleSkill(skill)"
              />
              <a-button
                v-if="skill.source === 'user'"
                type="text"
                size="small"
                class="delete-btn"
                :title="$t('common.delete')"
                @click="confirmDeleteSkill(skill)"
              >
                <DeleteOutlined />
              </a-button>
            </div>
          </div>
          <div class="skill-footer">
            <div
              v-if="skill.tags && skill.tags.length > 0"
              class="skill-tags"
            >
              <a-tag
                v-for="tag in skill.tags"
                :key="tag"
                size="small"
              >
                {{ tag }}
              </a-tag>
            </div>
            <div class="skill-activation">
              <span class="activation-value">{{ getActivationLabel(skill.activation) }}</span>
              <template v-if="skill.activation === 'context-match' && skill.contextPatterns && skill.contextPatterns.length > 0">
                <span class="activation-patterns">({{ skill.contextPatterns.join(', ') }})</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </a-card>

    <!-- Create Skill Modal -->
    <a-modal
      v-model:open="createModalVisible"
      :title="$t('skills.createSkill')"
      :ok-text="$t('common.create')"
      :cancel-text="$t('common.cancel')"
      :confirm-loading="isCreating"
      width="600px"
      class="skill-modal"
      @ok="createSkill"
    >
      <a-form
        :model="newSkill"
        layout="vertical"
        class="skill-form"
      >
        <a-form-item
          :label="$t('skills.skillId')"
          required
        >
          <a-input
            v-model:value="newSkill.id"
            :placeholder="$t('skills.skillIdPlaceholder')"
          />
        </a-form-item>
        <a-form-item
          :label="$t('skills.skillName')"
          required
        >
          <a-input
            v-model:value="newSkill.name"
            :placeholder="$t('skills.skillNamePlaceholder')"
          />
        </a-form-item>
        <a-form-item
          :label="$t('skills.skillDescription')"
          required
        >
          <a-textarea
            v-model:value="newSkill.description"
            :placeholder="$t('skills.skillDescriptionPlaceholder')"
            :rows="2"
          />
        </a-form-item>
        <a-form-item :label="$t('skills.skillVersion')">
          <a-input
            v-model:value="newSkill.version"
            placeholder="1.0.0"
          />
        </a-form-item>
        <a-form-item :label="$t('skills.skillAuthor')">
          <a-input
            v-model:value="newSkill.author"
            :placeholder="$t('skills.skillAuthorPlaceholder')"
          />
        </a-form-item>
        <a-form-item :label="$t('skills.skillActivation')">
          <a-select v-model:value="newSkill.activation">
            <a-select-option value="always">{{ $t('skills.activationAlways') }}</a-select-option>
            <a-select-option value="on-demand">{{ $t('skills.activationOnDemand') }}</a-select-option>
            <a-select-option value="context-match">{{ $t('skills.activationContextMatch') }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item
          v-if="newSkill.activation === 'context-match'"
          :label="$t('skills.contextPatterns')"
          required
        >
          <a-input
            v-model:value="newSkill.contextPatternsInput"
            :placeholder="$t('skills.contextPatternsPlaceholder')"
          />
          <div class="form-hint">{{ $t('skills.contextPatternsHint') }}</div>
        </a-form-item>
        <a-form-item :label="$t('skills.skillTags')">
          <a-input
            v-model:value="newSkill.tagsInput"
            :placeholder="$t('skills.skillTagsPlaceholder')"
          />
        </a-form-item>
        <a-form-item
          :label="$t('skills.skillContent')"
          required
        >
          <a-textarea
            v-model:value="newSkill.content"
            :placeholder="$t('skills.skillContentPlaceholder')"
            :rows="8"
            class="skill-content-textarea"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import { FolderOpenOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined, ThunderboltOutlined, ImportOutlined } from '@ant-design/icons-vue'

const { t } = useI18n()

interface Skill {
  id: string
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  icon?: string
  activation?: 'always' | 'on-demand' | 'context-match'
  contextPatterns?: string[]
  enabled: boolean
  source: 'builtin' | 'user' | 'marketplace'
  path?: string
}

const skills = ref<Skill[]>([])
const isReloading = ref(false)
const isCreating = ref(false)
const isImporting = ref(false)
const createModalVisible = ref(false)

const newSkill = ref({
  id: '',
  name: '',
  description: '',
  version: '1.0.0',
  author: '',
  activation: 'on-demand' as 'always' | 'on-demand' | 'context-match',
  tagsInput: '',
  contextPatternsInput: '',
  content: ''
})

let unsubscribeSkillsUpdate: (() => void) | null = null

onMounted(async () => {
  await loadSkills()

  // Subscribe to skills updates
  unsubscribeSkillsUpdate = window.api.onSkillsUpdate((updatedSkills) => {
    skills.value = updatedSkills
  })
})

onBeforeUnmount(() => {
  if (unsubscribeSkillsUpdate) {
    unsubscribeSkillsUpdate()
  }
})

const loadSkills = async () => {
  try {
    const result = await window.api.getSkills()
    skills.value = result || []
  } catch (error) {
    console.error('Failed to load skills:', error)
    message.error(t('skills.loadError'))
  }
}

const reloadSkills = async () => {
  isReloading.value = true
  try {
    await window.api.reloadSkills()
    await loadSkills()
    message.success(t('skills.reloadSuccess'))
  } catch (error) {
    console.error('Failed to reload skills:', error)
    message.error(t('skills.reloadError'))
  } finally {
    isReloading.value = false
  }
}

const openSkillsFolder = async () => {
  try {
    await window.api.openSkillsFolder()
  } catch (error) {
    console.error('Failed to open skills folder:', error)
    message.error(t('skills.openFolderError'))
  }
}

const importSkillZip = async () => {
  try {
    // Open file dialog to select ZIP file
    const result = await window.api.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
    })

    if (!result || result.canceled || result.filePaths.length === 0) {
      return
    }

    const zipPath = result.filePaths[0]
    isImporting.value = true

    // Try to import the skill
    const importResult = await window.api.importSkillZip(zipPath)

    if (importResult.success) {
      message.success(t('skills.importSuccess', { name: importResult.skillName || importResult.skillId }))
      await loadSkills()
    } else if (importResult.errorCode === 'DIR_EXISTS') {
      // Skill already exists, ask for confirmation to overwrite
      Modal.confirm({
        title: t('skills.importOverwriteTitle'),
        content: t('skills.importOverwriteContent'),
        okText: t('skills.importOverwrite'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          isImporting.value = true
          try {
            const overwriteResult = await window.api.importSkillZip(zipPath, true)
            if (overwriteResult.success) {
              message.success(t('skills.importSuccess', { name: overwriteResult.skillName || overwriteResult.skillId }))
              await loadSkills()
            } else {
              showImportError(overwriteResult.errorCode)
            }
          } catch (error) {
            console.error('Failed to import skill (overwrite):', error)
            message.error(t('skills.importError'))
          } finally {
            isImporting.value = false
          }
        }
      })
    } else {
      showImportError(importResult.errorCode)
    }
  } catch (error) {
    console.error('Failed to import skill:', error)
    message.error(t('skills.importError'))
  } finally {
    isImporting.value = false
  }
}

const showImportError = (errorCode?: string) => {
  switch (errorCode) {
    case 'INVALID_ZIP':
      message.error(t('skills.importInvalidZip'))
      break
    case 'NO_SKILL_MD':
      message.error(t('skills.importNoSkillMd'))
      break
    case 'INVALID_METADATA':
      message.error(t('skills.importInvalidMetadata'))
      break
    default:
      message.error(t('skills.importError'))
  }
}

const toggleSkill = async (skill: Skill) => {
  try {
    await window.api.setSkillEnabled(skill.id, skill.enabled)
  } catch (error) {
    console.error('Failed to toggle skill:', error)
    // Revert the change
    skill.enabled = !skill.enabled
    message.error(t('skills.toggleError'))
  }
}

const showCreateModal = () => {
  // Reset form
  newSkill.value = {
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    author: '',
    activation: 'on-demand',
    tagsInput: '',
    contextPatternsInput: '',
    content: ''
  }
  createModalVisible.value = true
}

const createSkill = async () => {
  // Validate required fields
  if (!newSkill.value.id || !newSkill.value.name || !newSkill.value.description || !newSkill.value.content) {
    message.warning(t('skills.fillRequired'))
    return
  }

  // Validate ID format
  if (!/^[a-z0-9-]+$/.test(newSkill.value.id)) {
    message.warning(t('skills.invalidId'))
    return
  }

  // Validate contextPatterns if activation is context-match
  if (newSkill.value.activation === 'context-match' && !newSkill.value.contextPatternsInput.trim()) {
    message.warning(t('skills.contextPatternsRequired'))
    return
  }

  isCreating.value = true
  try {
    const metadata: Record<string, unknown> = {
      id: newSkill.value.id.toLowerCase(),
      name: newSkill.value.name,
      description: newSkill.value.description,
      version: newSkill.value.version || '1.0.0',
      author: newSkill.value.author || undefined,
      activation: newSkill.value.activation,
      tags: newSkill.value.tagsInput
        ? (() => {
            const filtered = newSkill.value.tagsInput
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
            return filtered.length > 0 ? filtered : undefined
          })()
        : undefined
    }

    // Add contextPatterns if activation is context-match
    if (newSkill.value.activation === 'context-match' && newSkill.value.contextPatternsInput.trim()) {
      metadata.contextPatterns = newSkill.value.contextPatternsInput
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p)
    }

    await window.api.createSkill(metadata, newSkill.value.content)
    await loadSkills()
    createModalVisible.value = false
    message.success(t('skills.createSuccess'))
  } catch (error) {
    console.error('Failed to create skill:', error)
    message.error(t('skills.createError'))
  } finally {
    isCreating.value = false
  }
}

const confirmDeleteSkill = (skill: Skill) => {
  Modal.confirm({
    title: t('skills.deleteConfirmTitle'),
    content: t('skills.deleteConfirmContent', { name: skill.name }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    onOk: async () => {
      try {
        await window.api.deleteSkill(skill.id)
        await loadSkills()
        message.success(t('skills.deleteSuccess'))
      } catch (error) {
        console.error('Failed to delete skill:', error)
        message.error(t('skills.deleteError'))
      }
    }
  })
}

const getSourceLabel = (source: string) => {
  switch (source) {
    case 'builtin':
      return t('skills.sourceBuiltin')
    case 'user':
      return t('skills.sourceUser')
    case 'marketplace':
      return t('skills.sourceMarketplace')
    default:
      return source
  }
}

const getActivationLabel = (activation?: string) => {
  switch (activation) {
    case 'always':
      return t('skills.activationAlways')
    case 'on-demand':
      return t('skills.activationOnDemand')
    case 'context-match':
      return t('skills.activationContextMatch')
    default:
      return t('skills.activationOnDemand')
  }
}
</script>

<style lang="less" scoped>
.skills-settings {
  padding: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 16px 0;

  h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 0;
  }
}

.skills-actions {
  display: flex;
  gap: 4px;
  align-items: center;

  .ant-btn {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ant-btn-text {
    color: var(--text-color-secondary);

    &:hover {
      color: var(--text-color);
      background-color: var(--bg-color-quaternary);
    }
  }
}

.settings-section {
  background-color: transparent;

  :deep(.ant-card-body) {
    padding: 12px 16px;
  }
}

.skills-list-section {
  margin-top: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color-secondary);

  .empty-icon {
    font-size: 24px;
    color: var(--text-color-quaternary);
  }

  .empty-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color-secondary);
  }

  .empty-description {
    font-size: 12px;
    color: var(--text-color-tertiary);
    margin-left: -4px;
  }
}

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-item {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--text-color-quaternary);
  }

  &.disabled {
    opacity: 0.6;
  }

  .skill-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .skill-info {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    flex: 1;
    min-width: 0;
  }

  .skill-icon {
    width: 32px;
    height: 32px;
    background-color: var(--bg-color-octonary);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--text-color-secondary);
    flex-shrink: 0;
  }

  .skill-details {
    flex: 1;
    min-width: 0;
  }

  .skill-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 2px;
  }

  .skill-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color);
  }

  .skill-version,
  .skill-source,
  .skill-author {
    font-size: 11px;
    color: var(--text-color-tertiary);
    background-color: var(--bg-color-octonary);
    padding: 0 5px;
    border-radius: 3px;
  }

  .skill-description {
    color: var(--text-color-tertiary);
    font-size: 12px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .skill-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;

    .delete-btn {
      color: var(--text-color-tertiary);
      padding: 2px 4px;

      &:hover {
        color: #ff4d4f;
      }
    }
  }

  .skill-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border-color);
  }

  .skill-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;

    :deep(.ant-tag) {
      background-color: var(--bg-color-octonary);
      border: none;
      color: var(--text-color-tertiary);
      font-size: 10px;
      padding: 0 4px;
      margin: 0;
      line-height: 18px;
    }
  }

  .skill-activation {
    font-size: 11px;
    color: var(--text-color-quaternary);
    display: flex;
    align-items: center;
    gap: 4px;

    .activation-value {
      color: var(--text-color-tertiary);
    }

    .activation-patterns {
      color: var(--text-color-quaternary);
      font-style: italic;
    }
  }
}

// Modal styles
.skill-modal {
  :deep(.ant-modal-content) {
    background-color: var(--bg-color);
  }

  :deep(.ant-modal-header) {
    background-color: var(--bg-color);
    border-bottom: 1px solid var(--border-color);
  }

  :deep(.ant-modal-title) {
    color: var(--text-color);
  }

  :deep(.ant-modal-close-x) {
    color: var(--text-color-tertiary);
  }

  :deep(.ant-modal-footer) {
    border-top: 1px solid var(--border-color);
  }
}

.skill-form {
  :deep(.ant-form-item-label > label) {
    color: var(--text-color-secondary);
  }

  :deep(.ant-input),
  :deep(.ant-input-textarea textarea) {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    color: var(--text-color);

    &::placeholder {
      color: var(--text-color-quaternary);
    }

    &:hover,
    &:focus {
      border-color: #1890ff;
    }
  }

  :deep(.ant-select-selector) {
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color);
  }

  :deep(.ant-select-arrow) {
    color: var(--text-color-tertiary);
  }

  .skill-content-textarea {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
  }

  .form-hint {
    font-size: 12px;
    color: var(--text-color-quaternary);
    margin-top: 4px;
  }
}

// Switch styles
:deep(.ant-switch) {
  background-color: var(--bg-color-quaternary);
}

:deep(.ant-switch.ant-switch-checked) {
  background-color: #1890ff;
}
</style>
