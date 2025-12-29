<template>
  <div class="input-send-container">
    <div
      class="ai-tab-test-hook"
      data-testid="ai-tab"
      style="display: none"
    ></div>
    <div
      v-if="showHostSelect"
      class="host-select-popup"
    >
      <a-input
        ref="hostSearchInputRef"
        v-model:value="hostSearchValue"
        :placeholder="$t('ai.searchHost')"
        size="small"
        class="mini-host-search-input"
        allow-clear
        @keydown="handleHostSearchKeyDown"
      />
      <div class="host-select-list">
        <template
          v-for="(item, index) in filteredHostOptions"
          :key="item.value"
        >
          <!-- Jumpserver parent node (non-selectable, expandable) -->
          <div
            v-if="item.type === 'jumpserver'"
            class="host-select-item host-select-group"
            :class="{
              hovered: hovered === item.value,
              'keyboard-selected': keyboardSelectedIndex === index,
              expanded: item.expanded
            }"
            @mouseover="handleMouseOver(item.value, index)"
            @mouseleave="hovered = null"
            @click="toggleJumpserverExpand(item.key)"
          >
            <span class="host-label host-group-label">{{ item.label }}</span>
            <span class="host-group-badge">{{ item.childrenCount || 0 }}</span>
            <span class="host-group-toggle">
              <DownOutlined
                v-if="item.expanded"
                class="toggle-icon"
              />
              <RightOutlined
                v-else
                class="toggle-icon"
              />
            </span>
          </div>
          <!-- Normal selectable items (personal or jumpserver_child) -->
          <div
            v-else
            class="host-select-item"
            :class="{
              hovered: hovered === item.value,
              'keyboard-selected': keyboardSelectedIndex === index,
              'host-select-child': item.level === 1
            }"
            :style="{ paddingLeft: item.level === 1 ? '24px' : '6px' }"
            @mouseover="handleMouseOver(item.value, index)"
            @mouseleave="hovered = null"
            @click="onHostClick(item)"
          >
            <span class="host-label">{{ item.label }}</span>
            <CheckOutlined
              v-if="isHostSelected(item)"
              class="host-selected-icon"
            />
          </div>
        </template>
        <div
          v-if="hostOptionsLoading && filteredHostOptions.length > 0"
          class="host-select-loading"
        >
          {{ $t('ai.loading') }}...
        </div>
        <div
          v-if="filteredHostOptions.length === 0 && !hostOptionsLoading"
          class="host-select-empty"
        >
          {{ $t('ai.noMatchingHosts') }}
        </div>
      </div>
    </div>
    <div
      v-if="hasAvailableModels"
      class="input-container"
    >
      <div class="hosts-display-container">
        <span
          v-if="chatTypeValue === 'agent' && chatHistory.length === 0"
          class="hosts-display-container-host-tag"
          @click.stop="handleAddHostClick"
        >
          {{ hosts && hosts.length > 0 ? '@' : `@ ${$t('ai.addHost')}` }}
        </span>
        <a-tag
          v-for="item in hosts"
          :key="item.uuid"
          color="blue"
          class="host-tag-with-delete"
        >
          <template #icon>
            <laptop-outlined />
          </template>
          {{ item.host }}
          <CloseOutlined
            v-if="chatTypeValue === 'agent' && chatHistory.length === 0"
            class="host-delete-btn"
            @click.stop="removeHost(item)"
          />
        </a-tag>
        <span
          v-if="currentTab?.session.responseLoading"
          class="processing-text"
        >
          <HourglassOutlined
            spin
            style="color: #1890ff; margin-right: 2px"
          />
          {{ $t('ai.processing') }}
        </span>
      </div>
      <a-textarea
        ref="textareaRef"
        v-model:value="chatInputValue"
        :placeholder="inputPlaceholder"
        class="chat-textarea"
        data-testid="ai-message-input"
        :auto-size="{ minRows: 2, maxRows: 12 }"
        @keydown="handleKeyDown"
        @input="handleInputChange"
      />
      <div class="input-controls">
        <a-tooltip
          :title="$t('ai.switchAiModeHint')"
          placement="top"
          :get-popup-container="(triggerNode) => triggerNode.parentElement"
          :mouse-enter-delay="0.3"
          :visible="aiModeTooltipVisible && !aiModeSelectOpen"
          overlay-class-name="ai-mode-tooltip"
          @visible-change="
            (visible: boolean) => {
              aiModeTooltipVisible = visible
            }
          "
        >
          <a-select
            v-model:value="chatTypeValue"
            size="small"
            style="width: 100px"
            :options="AiTypeOptions"
            data-testid="ai-mode-select"
            @dropdown-visible-change="handleAiModeSelectOpenChange"
          ></a-select>
        </a-tooltip>
        <a-select
          v-model:value="chatAiModelValue"
          size="small"
          class="model-select-responsive"
          style="width: 160px"
          show-search
          @change="handleChatAiModelChange"
        >
          <a-select-option
            v-for="model in AgentAiModelsOptions"
            :key="model.value"
            :value="model.value"
          >
            <span class="model-label">
              <img
                v-if="model.label.endsWith('-Thinking')"
                src="@/assets/icons/thinking.svg"
                alt="Thinking"
                class="thinking-icon"
              />
              {{ model.label.replace(/-Thinking$/, '') }}
            </span>
          </a-select-option>
        </a-select>
        <div class="action-buttons-container-separator"></div>
        <div class="action-buttons-container">
          <a-tooltip :title="$t('ai.uploadFile')">
            <a-button
              :disabled="responseLoading"
              size="small"
              class="custom-round-button compact-button"
              @click="handleFileUpload"
            >
              <img
                :src="uploadIcon"
                alt="upload"
                style="width: 14px; height: 14px"
              />
            </a-button>
          </a-tooltip>
          <a-tooltip :title="$t('ai.startVoiceInput')">
            <VoiceInput
              :disabled="responseLoading"
              :auto-send-after-voice="autoSendAfterVoice"
              @transcription-complete="handleTranscriptionComplete"
              @transcription-error="handleTranscriptionError"
            />
          </a-tooltip>
          <a-tooltip :title="responseLoading ? $t('ai.interruptTask') : ''">
            <a-button
              size="small"
              class="custom-round-button compact-button"
              data-testid="send-message-btn"
              @click="responseLoading ? props.handleInterrupt() : props.sendMessage('send')"
            >
              <img
                v-if="responseLoading"
                :src="stopIcon"
                alt="stop"
                class="interrupt-icon"
                style="width: 18px; height: 18px"
              />
              <img
                v-else
                :src="sendIcon"
                alt="send"
                style="width: 18px; height: 18px"
              />
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </div>
  </div>
  <input
    ref="fileInputRef"
    type="file"
    accept=".txt,.md,.js,.ts,.py,.java,.cpp,.c,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,.log,.csv,.tsv"
    style="display: none"
    @change="handleFileSelected"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VoiceInput from '../components/voice/voiceInput.vue'
import { useSessionState } from '../composables/useSessionState'
import { useHostManagement } from '../composables/useHostManagement'
import { useModelConfiguration } from '../composables/useModelConfiguration'
import { useUserInteractions } from '../composables/useUserInteractions'
import { AiTypeOptions } from '../composables/useEventBusListeners'
import { CheckOutlined, CloseOutlined, DownOutlined, HourglassOutlined, LaptopOutlined, RightOutlined } from '@ant-design/icons-vue'
import uploadIcon from '@/assets/icons/upload.svg'
import sendIcon from '@/assets/icons/send.svg'
import stopIcon from '@/assets/icons/stop.svg'

const props = defineProps<{
  isActiveTab: boolean
  sendMessage: (sendType: string) => Promise<unknown>
  handleInterrupt: () => void
}>()

const { t } = useI18n()

const { chatTextareaRef, chatInputValue, currentTab, chatTypeValue, chatAiModelValue, hosts, responseLoading, chatHistory } = useSessionState()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Synchronize the current tab's textarea ref to the global state when active
watch(
  [() => props.isActiveTab, textareaRef],
  ([isActive, el]) => {
    if (isActive && el) {
      chatTextareaRef.value = el as unknown as HTMLTextAreaElement
    }
  },
  { immediate: true }
)

const {
  showHostSelect,
  hostSearchValue,
  hostOptionsLoading,
  filteredHostOptions,
  hovered,
  keyboardSelectedIndex,
  handleHostSearchKeyDown,
  handleMouseOver,
  toggleJumpserverExpand,
  onHostClick,
  isHostSelected,
  removeHost,
  handleAddHostClick,
  handleInputChange
} = useHostManagement()

const { AgentAiModelsOptions, handleChatAiModelChange } = useModelConfiguration()

// Use user interactions composable
const {
  fileInputRef,
  autoSendAfterVoice,
  handleTranscriptionComplete,
  handleTranscriptionError,
  handleFileUpload,
  handleFileSelected,
  handleKeyDown
} = useUserInteractions(props.sendMessage)
void fileInputRef

const aiModeTooltipVisible = ref(false)
const aiModeSelectOpen = ref(false)
const handleAiModeSelectOpenChange = (open: boolean) => {
  aiModeSelectOpen.value = open
  aiModeTooltipVisible.value = false
}

const hasAvailableModels = computed(() => AgentAiModelsOptions.value && AgentAiModelsOptions.value.length > 0)

const inputPlaceholder = computed(() => {
  return chatTypeValue.value === 'agent' ? t('ai.agentMessage') : chatTypeValue.value === 'chat' ? t('ai.chatMessage') : t('ai.cmdMessage')
})
</script>

<style lang="less" scoped>
.hosts-display-container {
  position: relative;
  background-color: var(--bg-color);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-start;
  user-select: text;
  padding: 4px 8px;
  border-radius: 8px 8px 0 0;
  max-height: 100px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) var(--bg-color-secondary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-color-secondary);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--border-color);
    border-radius: 3px;

    &:hover {
      background-color: var(--border-color-light);
    }
  }

  :deep(.ant-tag) {
    font-size: 10px;
    padding: 0 6px;
    height: 16px;
    line-height: 16px;
    display: flex;
    align-items: center;
    margin-left: 2px;
    margin-bottom: 2px;
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;

    .anticon-laptop {
      color: #1890ff !important;
      margin-right: 0cap;
    }
  }

  .host-tag-with-delete {
    position: relative;
    padding-right: 20px !important;
    height: 20px !important;
    line-height: 20px !important;
    padding-top: 2px !important;
    padding-bottom: 2px !important;

    .host-delete-btn {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 8px;
      color: var(--text-color-tertiary);
      cursor: pointer;
      padding: 1px;
      border-radius: 2px;
      transition: all 0.2s ease;

      &:hover {
        color: #ff4d4f;
        background-color: rgba(255, 77, 79, 0.1);
      }
    }
  }
}

.other-hosts-display-container {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  height: 16px;
  line-height: 16px;
  margin-left: 2px;
  margin-top: 4px;
}

.hosts-display-container-host-tag {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s ease;
  height: 20px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  border: 1px solid #3a3a3a;

  &:hover {
    background-color: var(--hover-bg-color) !important;
    border-color: var(--border-color-light) !important;
  }
}

.input-send-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  width: 100%;

  .chat-textarea {
    background-color: var(--bg-color) !important;
    color: var(--text-color) !important;
    border: none !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }

  :deep(.ant-input::placeholder) {
    color: var(--text-color-tertiary) !important;
  }

  .ant-textarea {
    background-color: var(--bg-color) !important;
    border: none !important;
    border-radius: 8px !important;
    color: var(--text-color) !important;
    padding: 8px 12px !important;
    font-size: 12px !important;
  }
}

.input-controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 8px 8px;
  flex-wrap: nowrap;
  min-height: 32px;
  container-type: inline-size;
  container-name: input-controls;

  .action-buttons-container-separator {
    flex: 1;
    min-width: 0;
  }

  .action-buttons-container {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ant-select:first-child {
    flex-shrink: 0;
    min-width: 80px;
  }

  .model-select-responsive {
    flex-shrink: 1;
    min-width: 145px;
    max-width: 240px;

    :deep(.ant-select-selector) {
      min-width: 0;
    }

    :deep(.ant-select-selection-item) {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      padding-right: 24px !important;
    }
  }

  @container input-controls (max-width: 320px) {
    .model-select-responsive {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .model-select-responsive {
      display: none;
    }
  }

  .ant-select {
    width: 120px;

    :deep(.ant-select-selector) {
      background-color: transparent !important;
      border: none !important;
      border-radius: 4px !important;
      color: var(--text-color) !important;
      height: 24px !important;
      line-height: 24px !important;
    }

    :deep(.ant-select-selection-item) {
      pointer-events: none;
    }

    :deep(.ant-select-arrow) {
      color: var(--text-color-tertiary) !important;
    }

    &:hover {
      :deep(.ant-select-selector) {
        background-color: var(--hover-bg-color) !important;
      }
    }
  }

  .action-buttons-container {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;

    @media (max-width: 480px) {
      gap: 6px;
    }
  }

  .custom-round-button {
    height: 18px;
    width: 18px;
    padding: 0;
    border-radius: 4px;
    font-size: 10px;
    background-color: transparent;
    border: none;
    color: var(--text-color);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;

    &:hover {
      transform: scale(1.15);
      background-color: var(--hover-bg-color);
    }

    &:active {
      transform: scale(0.95);
      box-shadow: none;
    }

    &[disabled] {
      cursor: not-allowed;
      opacity: 0.2;
      pointer-events: none;

      &:hover {
        transform: none;
      }
    }

    .interrupt-icon {
      .theme-dark & {
        filter: invert(1) brightness(1.5);
      }
      .theme-light & {
        filter: none;
      }
    }
  }
}

.mini-host-search-input {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;

  :deep(.ant-input) {
    height: 22px !important;
    font-size: 12px !important;
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color-secondary) !important;

    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }

    padding: 0px 0px 2px 2px !important;
    line-height: 22px !important;
  }
}

.host-select-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 229px;
  background: var(--bg-color);
  border-radius: 4px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  margin-bottom: 4px;
  margin-left: 8px;
  max-height: 240px;
}

.is-sticky {
  .host-select-popup {
    top: 100%;
    bottom: auto;
    margin-top: 4px;
    margin-bottom: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
}

.host-select-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 2px 0px 2px 0px;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-color-quinary) var(--bg-color-senary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 3px;

    &:hover {
      background-color: var(--scrollbar-thumb-hover);
    }
  }
}

.host-select-item {
  padding: 2px 6px;
  cursor: pointer;
  bottom: 100%;
  border-radius: 3px;
  margin-bottom: 2px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  line-height: 16px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .host-label {
    flex: 1;
  }

  .host-selected-icon {
    font-size: 10px;
    color: #52c41a;
    margin-left: 4px;
  }

  &.hovered {
    background: var(--hover-bg-color);
  }

  &.keyboard-selected {
    background: var(--hover-bg-color);
    outline: 2px solid rgba(24, 144, 255, 0.5);
    outline-offset: -2px;
  }

  &.host-select-group {
    background-color: var(--bg-color-secondary, rgba(0, 0, 0, 0.02));
    font-weight: 500;

    .host-group-label {
      flex: 1;
      color: var(--text-color);
      margin-right: 6px;
    }

    .host-group-badge {
      font-size: 10px;
      padding: 0 6px;
      background-color: var(--bg-color-quaternary, rgba(0, 0, 0, 0.06));
      border-radius: 10px;
      color: var(--text-color-secondary);
      margin-left: 6px;
      line-height: 16px;
      min-width: 24px;
      text-align: center;
    }

    .host-group-toggle {
      width: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;

      .toggle-icon {
        font-size: 10px;
        color: var(--text-color-tertiary);
        transition: transform 0.2s ease;
      }
    }
  }

  &.host-select-child {
    border-left: 2px solid var(--border-color-light, rgba(0, 0, 0, 0.06));
    margin-left: 8px;
    border-radius: 0 3px 3px 0;

    &:hover,
    &.hovered {
      border-left-color: #1890ff;
    }
  }
}

.host-select-empty {
  color: var(--text-color-tertiary);
  text-align: center;
  padding: 8px 0;
}

.host-select-loading {
  color: var(--text-color-tertiary);
  text-align: center;
  padding: 8px 0;
  font-size: 12px;
}

.model-label {
  display: inline-flex;
  align-items: center;
}

.thinking-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  filter: var(--icon-filter);
  transition: filter 0.2s ease;
}

.processing-text {
  font-size: 10px;
  color: var(--text-color);
}
</style>
