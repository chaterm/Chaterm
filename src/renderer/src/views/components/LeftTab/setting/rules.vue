<template>
  <div>
    <div class="section-header">
      <h3>{{ $t('user.rules') }}</h3>
    </div>
    <!-- User Rules -->
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <div class="setting-item">
        <a-form-item
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <template #label>
            <div class="label-header-container">
              <span class="label-text">{{ $t('user.userRules') }}</span>
              <a-button
                class="header-add-btn"
                size="small"
                @click="addUserRule"
              >
                <PlusOutlined />
                {{ $t('user.addRule') }}
              </a-button>
            </div>
          </template>
          <p class="setting-description-no-padding">
            {{ $t('user.userRulesDescription') }}
          </p>
          <div class="rules-list">
            <!-- Empty state display -->
            <div
              v-if="userRules.length === 0"
              class="empty-state"
            >
              <div class="empty-content">
                <p class="empty-title">{{ $t('user.noRulesYet') }}</p>
                <p class="empty-description">{{ $t('user.noRulesDescription') }}</p>
                <a-button
                  type="default"
                  class="empty-add-btn"
                  size="small"
                  @click="addUserRule"
                >
                  {{ $t('user.addRule') }}
                </a-button>
              </div>
            </div>

            <!-- Rules list -->
            <div
              v-for="(rule, index) in userRules"
              :key="rule.id"
              class="rule-item"
            >
              <!-- Edit state -->
              <template v-if="rule.isEditing">
                <a-textarea
                  v-model:value="rule.content"
                  :placeholder="$t('user.rulePlaceholder')"
                  :auto-size="{ minRows: 3, maxRows: 8 }"
                  class="rule-textarea"
                />
                <div class="rule-actions">
                  <a-button
                    type="text"
                    size="small"
                    class="cancel-btn"
                    @click="cancelUserRuleEdit(index)"
                  >
                    {{ $t('common.cancel') }}
                  </a-button>
                  <a-button
                    type="primary"
                    size="small"
                    class="save-btn"
                    @click="saveUserRule(index)"
                  >
                    {{ $t('common.done') }}
                  </a-button>
                </div>
              </template>

              <!-- Display state -->
              <template v-else>
                <div class="rule-display">
                  <div
                    class="rule-content"
                    @click="editUserRule(index)"
                    >{{ rule.content }}
                  </div>
                  <div class="rule-actions">
                    <a-switch
                      v-model:checked="rule.enabled"
                      size="small"
                      @change="toggleUserRule(index)"
                    />
                    <a-button
                      type="text"
                      size="small"
                      class="edit-btn"
                      :title="$t('common.edit')"
                      @click="editUserRule(index)"
                    >
                      <EditOutlined />
                    </a-button>
                    <a-button
                      type="text"
                      size="small"
                      class="delete-btn"
                      :title="$t('common.delete')"
                      @click="removeUserRule(index)"
                    >
                      <DeleteOutlined />
                    </a-button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </a-form-item>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { updateGlobalState, getGlobalState } from '@renderer/agent/storage/state'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'

interface Rule {
  id: string
  content: string
  isEditing?: boolean
  enabled?: boolean
}

// Load saved configuration when component is mounted
onMounted(async () => {
  await loadUserRules()
})

// Save configuration before component unmounts
onBeforeUnmount(async () => {})

// Rules
const userRules = ref<Rule[]>([])

// Generate unique ID for rules
const generateRuleId = () => {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Load rules from global state
const loadUserRules = async () => {
  try {
    // Get both userRules and customInstructions
    const [saved, customInstructions] = await Promise.all([getGlobalState('userRules'), getGlobalState('customInstructions')])

    // Process existing userRules
    if (saved && Array.isArray(saved)) {
      userRules.value = saved.map((rule) => ({
        id: rule.id || generateRuleId(), // Generate one if no ID
        content: rule.content || '',
        enabled: rule.enabled !== undefined ? rule.enabled : true, // Default enabled
        isEditing: false // Always set to non-editing state when loading
      }))
    } else {
      userRules.value = []
    }

    // Migrate customInstructions to userRules
    if (customInstructions && typeof customInstructions === 'string' && customInstructions.trim() !== '') {
      // Add customInstructions as new rule at top of list
      const migratedRule = {
        id: generateRuleId(),
        content: customInstructions.trim(),
        enabled: true,
        isEditing: false
      }
      userRules.value.unshift(migratedRule)

      // Clear customInstructions field
      await updateGlobalState('customInstructions', '')

      // Save updated userRules
      await saveUserRules()

      console.log('Successfully migrated customInstructions to userRules')
    }
  } catch (error) {
    console.error('Failed to load user rules:', error)
    userRules.value = []
  }
}

// Save rules to global state
const saveUserRules = async () => {
  try {
    const rulesToSave = userRules.value
      .filter((rule) => rule.content.trim() !== '') // Filter out rules with empty content
      .map((rule) => ({
        id: rule.id,
        content: rule.content,
        enabled: rule.enabled !== undefined ? rule.enabled : true
      })) // Save ID, content and enabled state, do not save editing state
    await updateGlobalState('userRules', rulesToSave)
  } catch (error) {
    console.error('Failed to save user rules:', error)
  }
}

// Add new rule
const addUserRule = () => {
  // Check if there is already a rule in editing state
  const hasEditingRule = userRules.value.some((rule) => rule.isEditing)
  if (hasEditingRule) {
    return // If there is already a rule in editing state, do not add new one
  }

  // Add new rule at top of list, set to editing state
  userRules.value.unshift({
    id: generateRuleId(),
    content: '',
    enabled: true, // Default enabled
    isEditing: true
  })
}

// Remove rule
const removeUserRule = async (index: number) => {
  userRules.value.splice(index, 1)
  await saveUserRules()
}

// Save individual rule
const saveUserRule = async (index: number) => {
  const rule = userRules.value[index]
  if (rule.content.trim() === '') {
    // If content is empty, delete the rule
    userRules.value.splice(index, 1)
  } else {
    // Save and set to non-editing state
    rule.isEditing = false
  }
  await saveUserRules()
}

// Cancel rule edit
const cancelUserRuleEdit = async (index: number) => {
  const rule = userRules.value[index]
  if (rule.isEditing && rule.content.trim() === '') {
    // If it's a newly added empty rule, delete directly
    userRules.value.splice(index, 1)
  } else {
    // Reload data to discard changes
    await loadUserRules()
  }
}

// Toggle rule enabled state
const toggleUserRule = async (_index: number) => {
  // a-switch component has already updated rule.enabled value, just need to save here
  await saveUserRules()
}

// Edit rule
const editUserRule = (index: number) => {
  // Cancel other rules being edited
  userRules.value.forEach((rule, i) => {
    if (i !== index) {
      rule.isEditing = false
    }
  })
  // Set current rule to editing state
  userRules.value[index].isEditing = true
}
</script>

<style lang="less" scoped>
.settings-section {
  background-color: transparent;

  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.section-header {
  margin-top: 8px;
  margin-left: 16px;

  h3 {
    font-size: 20px;
    font-weight: 500;
    margin: 0;
  }
}

.setting-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.setting-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-tertiary);
  padding-left: 22px;
}

.setting-description-no-padding {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-tertiary);
}

// Unified component styles
:deep(.ant-checkbox-wrapper),
:deep(.ant-form-item-label label),
:deep(.ant-select),
:deep(.ant-input),
:deep(.ant-input-password) {
  color: var(--text-color-secondary);
}

:deep(.ant-checkbox),
:deep(.ant-select-selector),
:deep(.ant-input),
:deep(.ant-input-password) {
  background-color: var(--bg-color-octonary) !important;
  border: 1px solid var(--bg-color-octonary) !important;

  &:hover,
  &:focus {
    border-color: #1890ff;
  }

  &::placeholder {
    color: var(--text-color-quaternary) !important;
  }
}

// Password input specific styles
:deep(.ant-input-password) {
  .ant-input {
    background-color: var(--bg-color-octonary) !important;
    color: var(--text-color-secondary);
  }

  .anticon {
    color: var(--text-color-tertiary);
  }

  &:hover .anticon {
    color: var(--text-color-secondary-light);
  }
}

// Add specific styles for select box
:deep(.ant-select) {
  .ant-select-selector {
    background-color: var(--bg-color-octonary) !important;
    border: none;

    .ant-select-selection-placeholder {
      color: var(--text-color-quaternary) !important;
    }
  }

  &.ant-select-focused {
    .ant-select-selector {
      background-color: var(--bg-color-octonary) !important;
      border-color: #1890ff !important;
    }
  }
}

:deep(.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: #1890ff !important;
  border-color: #1890ff !important;
}

// Dropdown menu styles
:deep(.ant-select-dropdown) {
  background-color: var(--bg-color-octonary);
  border: 1px solid rgba(255, 255, 255, 0.15);

  .ant-select-item {
    color: var(--text-color-secondary);
    background-color: var(--bg-color-octonary);

    &-option-active,
    &-option-selected {
      color: var(--text-color-secondary) !important; // Add selected item text color
      background-color: rgba(24, 144, 255, 0.2);
    }

    &-option:hover {
      color: var(--text-color-secondary);
      background-color: rgba(255, 255, 255, 0.08);
    }
  }
}

// Color of selected items in select box
:deep(.ant-select-selection-item) {
  color: var(--text-color-secondary) !important;
}

.label-container {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

// Reduce spacing between form items
:deep(.ant-form-item) {
  margin-bottom: 8px; // Reduce bottom margin
}

// Reduce spacing between label and input box
:deep(.ant-form-item-label) {
  padding-bottom: 0; // Remove label bottom padding
  > label {
    height: 24px; // Reduce label height
    line-height: 24px; // Adjust line height to match height
  }
}

:deep(.ant-form-item .ant-form-item-label > label) {
  color: var(--text-color-secondary);
}

:deep(.ant-checkbox-wrapper) {
  color: var(--text-color-secondary);
  height: 24px;
  line-height: 24px;
  display: flex;
  align-items: center;
}

:deep(.ant-checkbox) {
  border: 0 !important;
  background-color: var(--bg-color) !important;
  top: 0;
}

:deep(.ant-checkbox-inner) {
  background-color: var(--bg-color-octonary) !important;
  border-color: var(--text-color-quinary) !important;
}

:deep(.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: #1890ff !important;
  border-color: #1890ff !important;
}

:deep(.label-header-container) {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
}

// Ensure parent label container also supports flex layout
:deep(.ant-form-item-label > label) {
  width: 100% !important;
  display: flex !important;
}

.header-add-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 400;
  background-color: var(--bg-color-secondary);
  color: var(--text-color-secondary);
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  .anticon {
    font-size: 12px;
  }

  &:hover {
    background-color: var(--hover-bg-color);
    border-color: var(--text-color-quaternary);
    color: var(--text-color);
  }

  &:active {
    background-color: var(--active-bg-color);
    border-color: var(--text-color-tertiary);
    color: var(--text-color);
  }

  &:focus {
    box-shadow: none !important;
    outline: none !important;
  }

  &:focus-visible {
    box-shadow: none !important;
    outline: none !important;
  }
}

.setting-description-no-padding {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-tertiary);
}

.rules-list-item {
  margin-bottom: 20px;
}

.rules-list-item :deep(.ant-form-item-control) {
  margin-left: 0 !important;
  max-width: 100% !important;
}

.rules-list {
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    background-color: var(--bg-color-secondary);

    .empty-content {
      text-align: center;

      .empty-title {
        font-size: 16px;
        font-weight: 500;
        color: var(--text-color-secondary);
        margin: 0 0 8px 0;
      }

      .empty-description {
        font-size: 14px;
        color: var(--text-color-tertiary);
        margin: 0 0 16px 0;
      }

      .empty-add-btn {
        background-color: #666666;
        border-color: #666666;
        color: #ffffff;

        &:hover {
          background-color: #777777;
          border-color: #777777;
        }

        &:focus {
          box-shadow: none !important;
          outline: none !important;
        }

        &:focus-visible {
          box-shadow: none !important;
          outline: none !important;
        }
      }
    }
  }

  .rule-item {
    position: relative;
    margin-bottom: 16px;

    .rule-textarea {
      width: 100%;
      background-color: var(--bg-color-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;

      :deep(.ant-input) {
        background-color: var(--bg-color-secondary);
        border: none;
        color: var(--text-color);
        font-size: 14px;
        line-height: 1.5;
        padding: 8px;

        &:focus {
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }

        &::placeholder {
          color: var(--text-color-secondary);
        }
      }
    }

    .rule-display {
      background-color: var(--bg-color-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.2s;

      &:hover {
        border-color: var(--text-color-quaternary);
      }

      .rule-content {
        flex: 1;
        color: var(--text-color);
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        cursor: pointer;
        min-height: 21px; // Approximately 1 line height (14px * 1.5)
        display: -webkit-box;
        -webkit-line-clamp: 2; // Display 2 lines
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0; // Allow text to shrink

        &:hover {
          color: var(--text-color-secondary);
        }
      }

      .rule-actions {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 8px;

        .edit-btn,
        .delete-btn {
          padding: 2px;
          width: auto;
          height: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 4px;
          transition: all 0.2s;
          font-size: 14px;
        }

        .edit-btn {
          color: var(--text-color-tertiary);
          background-color: transparent;

          &:hover,
          &:focus {
            color: #1890ff;
            background-color: rgba(24, 144, 255, 0.1);
          }
        }

        .delete-btn {
          color: var(--text-color-tertiary);
          background-color: transparent;

          &:hover,
          &:focus {
            color: #ff4d4f;
            background-color: rgba(255, 77, 79, 0.1);
          }
        }
      }
    }

    .rule-actions {
      display: flex;
      justify-content: flex-end;
      gap: 4px;

      .cancel-btn {
        font-size: 10px;
        margin-top: 4px;
        color: var(--text-color-secondary);
        border: 1px solid var(--border-color);
        background-color: transparent;

        &:hover {
          color: var(--text-color);
          border-color: var(--text-color-secondary);
        }
      }

      .save-btn {
        font-size: 10px;
        margin-top: 4px;
        background-color: var(--bg-color-secondary);
        color: var(--text-color-secondary);
        border: 1px solid var(--border-color-light);

        &:hover {
          background-color: #777777;
          border-color: #777777;
        }
      }
    }
  }
}

// Force override switch styles
:deep(.ant-switch) {
  background-color: var(--bg-color-quaternary) !important;
}

:deep(.ant-switch.ant-switch-checked) {
  background-color: #1890ff !important;
}

:deep(.ant-switch.ant-switch-checked:hover) {
  background-color: #1890ff !important;
}

/* Override all possible elements inside button */
.header-add-btn *,
.header-add-btn .anticon,
.header-add-btn span {
  border-left: none !important;
  box-shadow: none !important;
  outline: none !important;
}
</style>
