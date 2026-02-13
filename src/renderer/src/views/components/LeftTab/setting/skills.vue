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
          :key="skill.name"
          class="skill-item"
          :class="{ disabled: !skill.enabled }"
        >
          <div class="skill-header">
            <div class="skill-info">
              <div class="skill-icon">
                <ThunderboltOutlined />
              </div>
              <div class="skill-details">
                <div class="skill-name">{{ skill.name }}</div>
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
        ref="skillFormRef"
        :model="newSkill"
        layout="vertical"
        class="skill-form"
      >
        <a-form-item
          name="name"
          :label="$t('skills.skillName')"
          :rules="skillNameRules"
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
        <a-form-item
          :label="$t('skills.skillContent')"
          required
        >
          <a-textarea
            v-model:value="newSkill.content"
            :placeholder="$t('skills.skillContentPlaceholder')"
            :rows="10"
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

const logger = createRendererLogger('settings.skills')
const { t } = useI18n()

interface Skill {
  name: string
  description: string
  enabled: boolean
  path?: string
}

const skills = ref<Skill[]>([])
const isReloading = ref(false)
const isCreating = ref(false)
const isImporting = ref(false)
const createModalVisible = ref(false)
const skillFormRef = ref()

const newSkill = ref({
  name: '',
  description: '',
  content: ''
})

// Validation rules for skill name: only lowercase letters and hyphens
const skillNameRules = [
  {
    required: true,
    message: t('skills.skillNameRequired')
  },
  {
    pattern: /^[a-z-]+$/,
    message: t('skills.skillNameInvalidFormat')
  }
]

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
    logger.error('Failed to load skills', { error: error })
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
    logger.error('Failed to reload skills', { error: error })
    message.error(t('skills.reloadError'))
  } finally {
    isReloading.value = false
  }
}

const openSkillsFolder = async () => {
  try {
    await window.api.openSkillsFolder()
  } catch (error) {
    logger.error('Failed to open skills folder', { error: error })
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
            logger.error('Failed to import skill (overwrite)', { error: error })
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
    logger.error('Failed to import skill', { error: error })
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
    await window.api.setSkillEnabled(skill.name, skill.enabled)
  } catch (error) {
    logger.error('Failed to toggle skill', { error: error })
    // Revert the change
    skill.enabled = !skill.enabled
    message.error(t('skills.toggleError'))
  }
}

const showCreateModal = () => {
  // Reset form
  newSkill.value = {
    name: '',
    description: '',
    content: ''
  }
  // Clear validation errors
  skillFormRef.value?.resetFields()
  createModalVisible.value = true
}

const createSkill = async () => {
  // Validate form
  try {
    await skillFormRef.value?.validate()
  } catch (error) {
    // Validation failed, error message will be shown by form
    return
  }

  // Validate required fields
  if (!newSkill.value.description || !newSkill.value.content) {
    message.warning(t('skills.fillRequired'))
    return
  }

  isCreating.value = true
  try {
    const metadata: Record<string, unknown> = {
      name: newSkill.value.name,
      description: newSkill.value.description
    }

    await window.api.createSkill(metadata, newSkill.value.content)
    await loadSkills()
    createModalVisible.value = false
    // Reset form after successful creation
    skillFormRef.value?.resetFields()
    message.success(t('skills.createSuccess'))
  } catch (error) {
    logger.error('Failed to create skill', { error: error })
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
        await window.api.deleteSkill(skill.name)
        await loadSkills()
        message.success(t('skills.deleteSuccess'))
      } catch (error) {
        logger.error('Failed to delete skill', { error: error })
        message.error(t('skills.deleteError'))
      }
    }
  })
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
  margin: 28px 28px 0;

  h3 {
    font-size: 20px;
    font-weight: bold;
    line-height: 1.3;
    margin: 0;
    color: var(--text-color);
  }
}

.skills-actions {
  display: flex;
  gap: 8px;
  align-items: center;

  .ant-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 6px;
  }

  .ant-btn-text {
    color: var(--text-color-secondary);

    &:hover {
      color: var(--text-color);
      background-color: var(--bg-color-quaternary);
    }
  }

  .ant-btn-primary {
    background: linear-gradient(135deg, #1890ff, #096dd9);
    border: none;
    box-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);

    &:hover {
      background: linear-gradient(135deg, #40a9ff, #1890ff);
      box-shadow: 0 4px 8px rgba(24, 144, 255, 0.3);
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-color-secondary);

  .empty-icon {
    font-size: 36px;
    color: var(--text-color-quaternary);
    opacity: 0.6;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color-secondary);
  }

  .empty-description {
    font-size: 12px;
    color: var(--text-color-tertiary);
    text-align: center;
  }

  .ant-btn {
    margin-top: 8px;
    color: var(--text-color);
  }
}

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--primary-color, #1890ff);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  &.disabled {
    opacity: 0.5;

    &:hover {
      border-color: var(--border-color);
      box-shadow: none;
    }
  }

  .skill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .skill-info {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .skill-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, var(--bg-color-quaternary), var(--bg-color-octonary));
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--primary-color, #1890ff);
    flex-shrink: 0;
  }

  .skill-details {
    flex: 1;
    min-width: 0;
  }

  .skill-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-color);
    margin-bottom: 4px;
  }

  .skill-description {
    color: var(--text-color-tertiary);
    font-size: 12px;
    line-height: 1.5;
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
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 22px;
      color: var(--text-color-tertiary);
      padding: 0;
      border-radius: 4px;
      transition: all 0.2s ease;

      &:hover {
        color: #ff4d4f;
        background-color: rgba(255, 77, 79, 0.1);
      }
    }
  }
}

// Modal styles
.skill-modal {
  :deep(.ant-modal-content) {
    background-color: var(--bg-color);
    border-radius: 12px;
    overflow: hidden;
  }

  :deep(.ant-modal-header) {
    background-color: var(--bg-color);
    border-bottom: 1px solid var(--border-color);
    padding: 16px 20px;
  }

  :deep(.ant-modal-title) {
    color: var(--text-color);
    font-weight: 600;
  }

  :deep(.ant-modal-close-x) {
    color: var(--text-color-tertiary);
  }

  :deep(.ant-modal-body) {
    padding: 20px;
  }

  :deep(.ant-modal-footer) {
    border-top: 1px solid var(--border-color);
    padding: 12px 20px;
  }
}

.skill-form {
  :deep(.ant-form-item) {
    margin-bottom: 16px;
  }

  :deep(.ant-form-item-label > label) {
    color: var(--text-color-secondary);
    font-weight: 500;
  }

  :deep(.ant-input),
  :deep(.ant-input-textarea textarea) {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    color: var(--text-color);
    border-radius: 6px;

    &::placeholder {
      color: var(--text-color-quaternary);
    }

    &:hover {
      border-color: var(--primary-color, #1890ff);
    }

    &:focus {
      border-color: var(--primary-color, #1890ff);
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
    }
  }

  .skill-content-textarea {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.6;
  }
}

// Switch styles
:deep(.ant-switch) {
  background-color: var(--bg-color-quaternary);
}

:deep(.ant-switch.ant-switch-checked) {
  background: linear-gradient(135deg, #1890ff, #096dd9);
}
</style>
