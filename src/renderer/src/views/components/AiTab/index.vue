<template>
  <a-tabs
    v-model:active-key="activeKey"
    class="ai-chat-custom-tabs ai-chat-flex-container"
    @change="handleTabChange"
  >
    <a-tab-pane
      key="chat"
      :tab="currentChatId ? historyList.find((item) => item.id === currentChatId)?.chatTitle || 'New chat' : 'New chat'"
    >
      <div
        v-if="filteredChatHistory.length === 0"
        class="ai-welcome-container"
      >
        <div class="ai-welcome-icon">
          <img
            src="@/assets/menu/ai.svg"
            alt="AI"
          />
        </div>
        <template v-if="isSkippedLogin">
          <div class="ai-login-prompt">
            <p>{{ $t('ai.loginPrompt') }}</p>
            <a-button
              type="primary"
              class="login-button"
              @click="goToLogin"
            >
              {{ $t('common.login') }}
            </a-button>
          </div>
        </template>
        <template v-else>
          <div class="ai-welcome-text">{{ $t('ai.welcome') }}</div>
        </template>
      </div>
      <div
        v-if="filteredChatHistory.length > 0"
        ref="chatContainer"
        :key="containerKey"
        class="chat-response-container"
      >
        <div
          ref="chatResponse"
          class="chat-response"
        >
          <template
            v-for="(message, index) in filteredChatHistory"
            :key="message"
          >
            <div
              v-if="message.role === 'assistant'"
              class="assistant-message-container"
              :class="{
                'has-history-copy-btn': chatTypeValue === 'cmd' && message.ask === 'command' && message.actioned,
                'last-message': message.say === 'completion_result'
              }"
            >
              <div
                v-if="message.say === 'completion_result'"
                class="message-header"
              >
                <div class="message-title">
                  <CheckCircleFilled style="color: #52c41a; margin-right: 4px" />
                  {{ $t('ai.taskCompleted') }}
                </div>
                <div
                  v-if="index === filteredChatHistory.length - 1"
                  class="message-feedback"
                >
                  <a-button
                    type="text"
                    class="feedback-btn like-btn"
                    size="small"
                    :disabled="isMessageFeedbackSubmitted(message.id)"
                    @click="handleFeedback(message, 'like')"
                  >
                    <template #icon>
                      <LikeOutlined
                        :style="{
                          color: getMessageFeedback(message.id) === 'like' ? '#52c41a' : '',
                          opacity: getMessageFeedback(message.id) === 'like' ? 1 : ''
                        }"
                      />
                    </template>
                  </a-button>
                  <a-button
                    type="text"
                    class="feedback-btn dislike-btn"
                    size="small"
                    :disabled="isMessageFeedbackSubmitted(message.id)"
                    @click="handleFeedback(message, 'dislike')"
                  >
                    <template #icon>
                      <DislikeOutlined
                        :style="{
                          color: getMessageFeedback(message.id) === 'dislike' ? '#ff4d4f' : '',
                          opacity: getMessageFeedback(message.id) === 'dislike' ? 1 : ''
                        }"
                      />
                    </template>
                  </a-button>
                </div>
              </div>
              <MarkdownRenderer
                v-if="typeof message.content === 'object' && 'question' in message.content"
                :content="(message.content as MessageContent).question"
                :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                :ask="message.ask"
                :say="message.say"
                :partial="message.partial"
                @collapse-change="handleCollapseChange"
              />
              <MarkdownRenderer
                v-else
                :content="typeof message.content === 'string' ? message.content : ''"
                :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                :ask="message.ask"
                :say="message.say"
                :partial="message.partial"
                @collapse-change="handleCollapseChange"
              />

              <div class="message-actions">
                <template v-if="typeof message.content === 'object' && 'options' in message.content">
                  <div class="options-container">
                    <a-button
                      v-for="(option, index) in (message.content as MessageContent).options"
                      :key="index"
                      size="small"
                      :class="['action-btn', 'option-btn', { selected: message.selectedOption === option }]"
                      @click="handleOptionChoose(message, option)"
                    >
                      {{ option }}
                    </a-button>
                  </div>
                </template>
              </div>
            </div>
            <div
              v-else
              :class="`message ${message.role}`"
            >
              {{ message.content }}
            </div>
          </template>
        </div>
      </div>
      <div class="bottom-container">
        <div
          v-if="showBottomButton && chatTypeValue == 'agent'"
          class="bottom-buttons"
        >
          <a-button
            size="small"
            class="reject-btn"
            :disabled="buttonsDisabled"
            @click="handleRejectContent"
          >
            <template #icon>
              <CloseOutlined />
            </template>
            {{ $t('ai.reject') }}
          </a-button>
          <a-button
            size="small"
            class="approve-btn"
            :disabled="buttonsDisabled"
            @click="handleApproveCommand"
          >
            <template #icon>
              <PlayCircleOutlined />
            </template>
            {{ $t('ai.run') }}
          </a-button>
        </div>
        <div
          v-if="showBottomButton && chatTypeValue == 'cmd'"
          class="bottom-buttons"
        >
          <a-button
            size="small"
            class="reject-btn"
            @click="handleCopyContent"
          >
            <template #icon>
              <CopyOutlined />
            </template>
            {{ $t('ai.copy') }}
          </a-button>
          <a-button
            size="small"
            class="approve-btn"
            @click="handleApplyCommand"
          >
            <template #icon>
              <PlayCircleOutlined />
            </template>
            {{ $t('ai.run') }}
          </a-button>
        </div>
        <div
          v-if="showCancelButton"
          class="bottom-buttons cancel-row"
        >
          <a-button
            size="small"
            class="cancel-btn"
            @click="handleCancel"
          >
            <template #icon>
              <CloseOutlined />
            </template>
            {{ $t('ai.cancel') }}
          </a-button>
        </div>
        <div
          v-if="showResumeButton"
          class="bottom-buttons"
        >
          <a-button
            size="small"
            type="primary"
            class="resume-btn"
            :disabled="resumeDisabled"
            @click="handleResume"
          >
            <template #icon>
              <RedoOutlined />
            </template>
            {{ $t('ai.resume') }}
          </a-button>
        </div>
        <div
          v-if="showRetryButton"
          class="bottom-buttons"
        >
          <a-button
            size="small"
            type="primary"
            class="retry-btn"
            @click="handleRetry"
          >
            <template #icon>
              <ReloadOutlined />
            </template>
            {{ $t('ai.retry') }}
          </a-button>
        </div>
        <div
          v-if="showNewTaskButton"
          class="bottom-buttons"
        >
          <a-button
            size="small"
            type="primary"
            class="retry-btn"
            @click="handlePlusClick"
          >
            <template #icon>
              <PlusOutlined />
            </template>
            {{ $t('ai.newTask') }}
          </a-button>
        </div>
        <div class="input-send-container">
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
              <div
                v-for="(item, index) in filteredHostOptions"
                :key="item.value"
                class="host-select-item"
                :class="{
                  hovered: hovered === item.value,
                  'keyboard-selected': keyboardSelectedIndex === index
                }"
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
              <div
                v-if="filteredHostOptions.length === 0"
                class="host-select-empty"
                >{{ $t('ai.noMatchingHosts') }}
              </div>
            </div>
          </div>
          <div
            v-if="!isSkippedLogin"
            class="input-container"
          >
            <div class="hosts-display-container">
              <span
                v-if="chatTypeValue === 'agent' && chatHistory.length === 0"
                class="hosts-display-container-host-tag"
                @click="handleAddHostClick"
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
                v-if="responseLoading"
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
              :value="displayInputValue"
              :placeholder="chatTypeValue === 'agent' ? $t('ai.agentMessage') : chatTypeValue === 'chat' ? $t('ai.cmdMessage') : $t('ai.cmdMessage')"
              class="chat-textarea"
              :auto-size="{ minRows: 2, maxRows: 5 }"
              @keydown="handleKeyDown"
              @input="handleInputChange"
              @update:value="(val) => (chatInputValue = val)"
            />
            <div class="input-controls">
              <a-select
                v-model:value="chatTypeValue"
                size="small"
                style="width: 100px"
                :options="AiTypeOptions"
                show-search
              ></a-select>
              <a-select
                v-model:value="chatAiModelValue"
                size="small"
                style="width: 150px"
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
              <div class="action-buttons-container">
                <!--                <VoiceInputRealTime-->
                <!--                  ref="tencentVoiceInputRef"-->
                <!--                  :disabled="responseLoading"-->
                <!--                  :auto-send-after-voice="autoSendAfterVoice"-->
                <!--                  @transcription-complete="handleTranscriptionComplete"-->
                <!--                  @transcription-update="handleTranscriptionUpdate"-->
                <!--                  @transcription-error="handleTranscriptionError"-->
                <!--                  @recording-stop="handleVoiceRecordingStop"-->
                <!--                />-->
                <VoiceInput
                  :disabled="responseLoading"
                  :auto-send-after-voice="autoSendAfterVoice"
                  @transcription-complete="handleTranscriptionComplete"
                  @transcription-error="handleTranscriptionError"
                />
                <a-button
                  :disabled="!showSendButton"
                  size="small"
                  class="custom-round-button compact-button"
                  @click="sendMessage('send')"
                >
                  <img
                    :src="sendIcon"
                    alt="send"
                    style="width: 18px; height: 18px"
                  />
                </a-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-tab-pane>
    <template #rightExtra>
      <div class="right-extra-buttons">
        <a-tooltip :title="$t('ai.newChat')">
          <a-button
            type="text"
            class="action-icon-btn"
            @click="handlePlusClick"
          >
            <img
              :src="plusIcon"
              alt="plus"
            />
          </a-button>
        </a-tooltip>
        <a-tooltip :title="$t('ai.showChatHistory')">
          <a-dropdown :trigger="['click']">
            <a-button
              type="text"
              class="action-icon-btn"
              @click="handleHistoryClick"
            >
              <img
                :src="historyIcon"
                alt="history"
              />
            </a-button>
            <template #overlay>
              <a-menu class="history-dropdown-menu">
                <div class="history-search-container">
                  <a-input
                    v-model:value="historySearchValue"
                    :placeholder="$t('ai.searchHistoryPH')"
                    size="small"
                    class="history-search-input"
                    allow-clear
                  >
                    <template #prefix>
                      <SearchOutlined style="color: #666" />
                    </template>
                  </a-input>
                  <a-button
                    size="small"
                    class="favorites-button"
                    type="text"
                    @click="showOnlyFavorites = !showOnlyFavorites"
                  >
                    <template #icon>
                      <StarFilled
                        v-if="showOnlyFavorites"
                        style="color: #faad14"
                      />
                      <StarOutlined
                        v-else
                        style="color: #999999"
                      />
                    </template>
                  </a-button>
                </div>
                <div class="history-virtual-list-container">
                  <a-menu-item
                    v-for="history in paginatedHistoryList"
                    :key="history.id"
                    class="history-menu-item"
                    :class="{ 'favorite-item': history.isFavorite }"
                    @click="!history.isEditing && restoreHistoryTab(history)"
                  >
                    <div class="history-item-content">
                      <div
                        v-if="!history.isEditing"
                        class="history-title"
                      >
                        {{ history.chatTitle }}
                      </div>
                      <a-input
                        v-else
                        v-model:value="history.editingTitle"
                        size="small"
                        class="history-title-input"
                        @press-enter="saveHistoryTitle(history)"
                        @blur.stop="() => {}"
                        @click.stop
                      />
                      <div class="menu-action-buttons">
                        <template v-if="!history.isEditing">
                          <a-button
                            size="small"
                            class="menu-action-btn favorite-btn"
                            @click.stop="toggleFavorite(history)"
                          >
                            <template #icon>
                              <template v-if="history.isFavorite">
                                <StarFilled style="color: #faad14" />
                              </template>
                              <template v-else>
                                <StarOutlined style="color: #999999" />
                              </template>
                            </template>
                          </a-button>
                          <a-button
                            size="small"
                            class="menu-action-btn"
                            @click.stop="editHistory(history)"
                          >
                            <template #icon>
                              <EditOutlined style="color: #999999" />
                            </template>
                          </a-button>
                          <a-button
                            size="small"
                            class="menu-action-btn"
                            @click.stop="deleteHistory(history)"
                          >
                            <template #icon>
                              <DeleteOutlined style="color: #999999" />
                            </template>
                          </a-button>
                        </template>
                        <template v-else>
                          <a-button
                            size="small"
                            class="menu-action-btn save-btn"
                            @click.stop="saveHistoryTitle(history)"
                          >
                            <template #icon>
                              <CheckOutlined style="color: #999999" />
                            </template>
                          </a-button>
                          <a-button
                            size="small"
                            class="menu-action-btn cancel-btn"
                            @click.stop.prevent="cancelEdit(history)"
                          >
                            <template #icon>
                              <CloseOutlined style="color: #999999" />
                            </template>
                          </a-button>
                        </template>
                      </div>
                    </div>
                  </a-menu-item>
                  <div
                    v-if="hasMoreHistory"
                    class="history-load-more"
                    @click="loadMoreHistory"
                    @intersection="handleIntersection"
                  >
                    {{ isLoadingMore ? $t('ai.loading') : $t('ai.loadMore') }}
                  </div>
                </div>
              </a-menu>
            </template>
          </a-dropdown>
        </a-tooltip>
        <a-tooltip :title="$t('ai.closeAiSidebar')">
          <a-button
            type="text"
            class="action-icon-btn"
            @click="handleClose"
          >
            <img
              :src="foldIcon"
              alt="fold"
            />
          </a-button>
        </a-tooltip>
      </div>
    </template>
  </a-tabs>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, defineAsyncComponent, onUnmounted, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  CloseOutlined,
  LaptopOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  HourglassOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckOutlined,
  ReloadOutlined,
  StarOutlined,
  StarFilled,
  LikeOutlined,
  DislikeOutlined,
  CheckCircleFilled,
  PlusOutlined
} from '@ant-design/icons-vue'
import { notification } from 'ant-design-vue'
import { v4 as uuidv4 } from 'uuid'
import eventBus from '@/utils/eventBus'
import { getGlobalState, updateGlobalState, getSecret, storeSecret } from '@renderer/agent/storage/state'

import type { HistoryItem, TaskHistoryItem, Host, ChatMessage, MessageContent, AssetInfo } from './types'
import { createNewMessage, parseMessageContent, truncateText, formatHosts } from './utils'
import foldIcon from '@/assets/icons/fold.svg'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'
import sendIcon from '@/assets/icons/send.svg'
import VoiceInput from './voiceInput.vue'
// import VoiceInputRealTime from './voiceInputRealTime.vue'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import debounce from 'lodash/debounce'
import i18n from '@/locales'
import { ChatermMessage } from '@/types/ChatermMessage'
import { getUser } from '@api/user/user'

const { t } = i18n.global
const MarkdownRenderer = defineAsyncComponent(() => import('@views/components/AiTab/markdownRenderer.vue'))
const router = useRouter()
const isSkippedLogin = ref(localStorage.getItem('login-skipped') === 'true')

watch(
  () => localStorage.getItem('login-skipped'),
  (newValue) => {
    isSkippedLogin.value = newValue === 'true'
  }
)

const goToLogin = () => {
  router.push('/login')
}

// Define event type
interface TabInfo {
  id: string
  ip: string
  organizationId?: string
  title?: string
}

// Extend AppEvents type
declare module '@/utils/eventBus' {
  interface AppEvents {
    tabChanged: TabInfo
  }
}

// Add message feedback storage
const messageFeedbacks = ref<Record<string, 'like' | 'dislike'>>({})

// Get message feedback status
const getMessageFeedback = (messageId: string): 'like' | 'dislike' | undefined => {
  return messageFeedbacks.value[messageId]
}

// Check if message feedback has been submitted
const isMessageFeedbackSubmitted = (messageId: string): boolean => {
  // Check if there are feedback records and they have been submitted
  return !!messageFeedbacks.value[messageId]
}

const hostSearchInputRef = ref()
const showHostSelect = ref(false)
const hostOptions = ref<{ label: string; value: string; uuid: string; connect: string }[]>([])
const hostSearchValue = ref('')
const hovered = ref<string | null>(null)
const keyboardSelectedIndex = ref(-1)
const historyList = ref<HistoryItem[]>([])
const favoriteTaskList = ref<string[]>([])
const hosts = ref<Host[]>([])
const autoUpdateHost = ref(true)
const chatInputValue = ref('')
const chatAiModelValue = ref('')
const chatTypeValue = ref('')
// 临时显示语音识别结果的变量，不影响 chatInputValue
const tempVoiceDisplay = ref('')
// 保存上一次录音的非稳态数据，防止被新录音覆盖
const lastVoiceSessionData = ref('')
const activeKey = ref('chat')

// 语音组件的引用
const tencentVoiceInputRef = ref<InstanceType<typeof TencentVoiceInput> | null>(null)

// 计算输入框的显示值：chatInputValue + tempVoiceDisplay
const displayInputValue = computed(() => {
  if (tempVoiceDisplay.value) {
    // 如果有临时语音显示，优先显示临时内容
    return tempVoiceDisplay.value
  }
  return chatInputValue.value
})
const showSendButton = ref(true)
const responseLoading = ref(false)
const shouldShowSendButton = computed(() => {
  const trimmedValue = chatInputValue.value.trim()
  return trimmedValue.length >= 1 && !/^\s*$/.test(trimmedValue)
})
const lastChatMessageId = ref('')
const isCurrentChatMessage = ref(true)
const buttonsDisabled = ref(false)
const resumeDisabled = ref(false)
const showRetryButton = ref(false)
const showCancelButton = ref(false)
const showNewTaskButton = ref(false)

// Track the current state of command execution
const isExecutingCommand = ref(false)

// Current active conversation ID
const currentChatId = ref<string | null>(null)
const authTokenInCookie = ref<string | null>(null)

const chatHistory = reactive<ChatMessage[]>([])

// 过滤SSH连接消息：Agent回复后隐藏sshInfo消息
const filteredChatHistory = computed(() => {
  const hasAgentReply = chatHistory.some(
    (msg) => msg.role === 'assistant' && msg.say !== 'sshInfo' && (msg.say === 'text' || msg.say === 'completion_result' || msg.ask === 'command')
  )
  return hasAgentReply ? chatHistory.filter((msg) => msg.say !== 'sshInfo') : chatHistory
})

const props = defineProps({
  toggleSidebar: {
    type: Function,
    required: true
  },
  savedState: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['state-changed'])

// Define AgentAiModelsOptions type
interface ModelSelectOption {
  label: string
  value: string
}

const AgentAiModelsOptions = ref<ModelSelectOption[]>([])
const AiTypeOptions = [
  { label: 'Chat', value: 'chat' },
  { label: 'Command', value: 'cmd' },
  { label: 'Agent', value: 'agent' }
]

const getChatermMessages = async () => {
  const result = await window.api.chatermGetChatermMessages({
    taskId: currentChatId.value
  })
  const messages = result as ChatermMessage[]
  console.log('result', messages)
  return messages
}

// Get current active tab host information
const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
  try {
    // Create a Promise to wait for assetInfoResult event
    const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        eventBus.off('assetInfoResult', handleResult)
        reject(new Error('Timeout getting asset information'))
      }, 5000) // 5 second timeout

      // Listen for result event
      const handleResult = (result: AssetInfo | null) => {
        clearTimeout(timeout)
        eventBus.off('assetInfoResult', handleResult)
        resolve(result)
      }
      eventBus.on('assetInfoResult', handleResult)
      // Emit request event
      eventBus.emit('getActiveTabAssetInfo')
    })
    // Process result directly here
    if (assetInfo) {
      if (assetInfo.organizationId != 'personal') {
        assetInfo.connection = 'jumpserver'
      } else {
        assetInfo.connection = 'personal'
      }
      return assetInfo
    } else {
      return null
    }
  } catch (error) {
    console.error('Error getting asset information:', error)
    return null
  }
}

// Create host information object
const createHostInfo = (ip: string, uuid: string, connection: string) => {
  return {
    host: ip,
    uuid: uuid,
    connection: connection
  }
}

// Update host list
const updateHosts = (hostInfo: { ip: string; uuid: string; connection: string } | null) => {
  if (hostInfo) {
    const newHost = createHostInfo(hostInfo.ip, hostInfo.uuid, hostInfo.connection)
    hosts.value = [newHost]
  } else {
    hosts.value = []
  }
}

// Initialize asset information
const initAssetInfo = async () => {
  if (!autoUpdateHost.value || chatHistory.length > 0) {
    return
  }
  const assetInfo = await getCurentTabAssetInfo()
  if (assetInfo) {
    updateHosts({
      ip: assetInfo.ip,
      uuid: assetInfo.uuid,
      connection: assetInfo.connection ? assetInfo.connection : 'personal'
    })
  } else {
    updateHosts(null)
  }
}

// When switching tabs, update current conversation ID to match the chat tag ID
const handleTabChange = (key: string | number) => {
  currentChatId.value = historyList.value.find((item) => item.chatType === key)?.id || null
}

const isEmptyValue = (value) => value === undefined || value === ''

const checkModelConfig = async () => {
  const apiProvider = await getGlobalState('apiProvider')
  switch (apiProvider) {
    case 'bedrock':
      const awsAccessKey = await getSecret('awsAccessKey')
      const awsSecretKey = await getSecret('awsSecretKey')
      const awsRegion = await getGlobalState('awsRegion')
      const apiModelId = await getGlobalState('apiModelId')
      if (isEmptyValue(apiModelId) || isEmptyValue(awsAccessKey) || isEmptyValue(awsSecretKey) || isEmptyValue(awsRegion)) {
        return false
      }
      break
    case 'litellm':
      const liteLlmBaseUrl = await getGlobalState('liteLlmBaseUrl')
      const liteLlmApiKey = await getSecret('liteLlmApiKey')
      const liteLlmModelId = await getGlobalState('liteLlmModelId')
      if (isEmptyValue(liteLlmBaseUrl) || isEmptyValue(liteLlmApiKey) || isEmptyValue(liteLlmModelId)) {
        return false
      }
      break
    case 'deepseek':
      const deepSeekApiKey = await getSecret('deepSeekApiKey')
      const apiModelIdDeepSeek = await getGlobalState('apiModelId')
      if (isEmptyValue(deepSeekApiKey) || isEmptyValue(apiModelIdDeepSeek)) {
        return false
      }
      break
    case 'openai':
      const openAiBaseUrl = await getGlobalState('openAiBaseUrl')
      const openAiApiKey = await getSecret('openAiApiKey')
      const openAiModelId = await getGlobalState('openAiModelId')
      if (isEmptyValue(openAiBaseUrl) || isEmptyValue(openAiApiKey) || isEmptyValue(openAiModelId)) {
        return false
      }
      break
  }
  return true
}

// 添加一个变量来跟踪上一次的识别内容，用于去重
const lastTranscription = ref('')

// 语音转录完成事件处理（稳态结果，追加到 chatInputValue 中）
const handleTranscriptionComplete = (transcribedText: string) => {
  // 检查是否与上一次识别内容完全相同（完全重复才跳过）
  if (lastTranscription.value === transcribedText) {
    console.log('Exact duplicate final transcription, skipping:', transcribedText)
    return
  }

  // 更新上一次识别内容
  lastTranscription.value = transcribedText

  // 稳态结果追加到 chatInputValue 中，而不是替换
  // 这样可以累积多次语音输入的结果
  if (chatInputValue.value.trim()) {
    chatInputValue.value = chatInputValue.value + ' ' + transcribedText
  } else {
    chatInputValue.value = transcribedText
  }

  // 清空临时显示，因为稳态结果已经添加到 chatInputValue 中
  tempVoiceDisplay.value = ''

  console.log('Stable transcription completed and appended to chatInputValue:', transcribedText)
  console.log('Final chatInputValue:', chatInputValue.value)

  // 自动发送消息（可选，可以通过设置开关控制）
  if (autoSendAfterVoice.value) {
    nextTick(() => {
      sendMessage('send')
    })
  }
}

// 语音转录实时更新事件处理（非稳态结果，显示在临时变量中）
const handleTranscriptionUpdate = (transcribedText: string) => {
  // 检查是否与上一次识别内容完全相同（完全重复才跳过）
  if (lastTranscription.value === transcribedText) {
    console.log('Exact duplicate transcription, skipping:', transcribedText)
    return
  }

  // 更新上一次识别内容
  lastTranscription.value = transcribedText

  // 非稳态结果显示在临时变量中，基于当前的 chatInputValue 构建
  // 这样可以实时显示识别进度，用户可以看到识别过程
  // 临时显示 = 当前 chatInputValue + 新的非稳态结果
  // 不再包含 lastVoiceSessionData，避免重复
  tempVoiceDisplay.value = chatInputValue.value + ' ' + transcribedText

  console.log('=== Real-time transcription update ===')
  console.log('transcribedText:', transcribedText)
  console.log('chatInputValue.value:', chatInputValue.value)
  console.log('lastVoiceSessionData.value:', lastVoiceSessionData.value)
  console.log('tempVoiceDisplay.value:', tempVoiceDisplay.value)
}

// 语音转录错误事件处理
const handleTranscriptionError = (error: string) => {
  console.error('语音转录错误:', error)
}

// 语音录制停止事件处理
const handleVoiceRecordingStop = () => {
  console.log('=== Voice recording stopped ===')
  console.log('tempVoiceDisplay.value:', tempVoiceDisplay.value)
  console.log('chatInputValue.value:', chatInputValue.value)
  console.log('lastVoiceSessionData.value:', lastVoiceSessionData.value)

  // 录制停止时，将非稳态的语音识别数据加入到 chatInputValue
  if (tempVoiceDisplay.value && tempVoiceDisplay.value.trim()) {
    const currentInput = chatInputValue.value.trim()
    const tempDisplay = tempVoiceDisplay.value.trim()

    console.log('currentInput:', currentInput)
    console.log('tempDisplay:', tempDisplay)

    if (tempDisplay.startsWith(currentInput) && tempDisplay.length > currentInput.length) {
      // 提取新增的语音识别内容
      const newVoiceContent = tempDisplay.substring(currentInput.length).trim()
      console.log('newVoiceContent:', newVoiceContent)

      if (newVoiceContent) {
        // 将新的语音内容追加到 chatInputValue
        if (currentInput) {
          chatInputValue.value = currentInput + ' ' + newVoiceContent
        } else {
          chatInputValue.value = newVoiceContent
        }
        console.log('Voice recording stopped - non-stable content added to chatInputValue:', newVoiceContent)
        console.log('Updated chatInputValue:', chatInputValue.value)

        // 不再保存到 lastVoiceSessionData，避免重复
        // lastVoiceSessionData.value = newVoiceContent
        console.log('Skipped updating lastVoiceSessionData to avoid duplication')
      }
    } else {
      console.log('tempDisplay does not start with currentInput or length is not greater')
    }
  } else {
    console.log('No tempVoiceDisplay value to process')
  }

  // 清空临时语音显示
  tempVoiceDisplay.value = ''
  console.log('Cleared tempVoiceDisplay')
}

const sendMessage = async (sendType: string) => {
  const checkModelConfigResult = await checkModelConfig()
  if (!checkModelConfigResult) {
    notification.error({
      message: t('user.checkModelConfigFailMessage'),
      description: t('user.checkModelConfigFailDescription'),
      duration: 3
    })
    return 'SEND_ERROR'
  }
  if (chatInputValue.value.trim() === '') {
    notification.error({
      message: '发送内容错误',
      description: '发送内容为空，请输入内容',
      duration: 3
    })
    return 'SEND_ERROR'
  }
  const userContent = chatInputValue.value.trim()
  if (!userContent) return
  // Check if current active host exists
  if (hosts.value.length === 0 && chatTypeValue.value !== 'chat') {
    notification.error({
      message: '获取当前资产连接信息失败',
      description: '请先建立资产连接',
      duration: 3
    })
    return 'ASSET_ERROR'
  }
  await sendMessageToMain(userContent, sendType)

  const userMessage: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userContent,
    type: 'message',
    ask: '',
    say: '',
    ts: 0
  }
  if (sendType === 'commandSend') {
    userMessage.role = 'assistant'
    userMessage.say = 'command_output'
  }
  chatHistory.push(userMessage)
  chatInputValue.value = ''
  responseLoading.value = true
  showRetryButton.value = false
  showNewTaskButton.value = false
  return
}

const handleClose = () => {
  props.toggleSidebar('right')
  eventBus.emit('updateRightIcon', false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  // 如果正在语音识别过程中，任何键盘输入都立即停止语音录制
  if (tempVoiceDisplay.value) {
    console.log('Keyboard input detected during voice recognition, immediately stopping recording...')

    // 立即停止语音录制
    if (tencentVoiceInputRef.value) {
      tencentVoiceInputRef.value.stopRecording()
    }

    // 清空临时语音显示
    tempVoiceDisplay.value = ''
  }

  // Check if it's an input method confirmation key
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    sendMessage('send')
  }
}
const handlePlusClick = async () => {
  const newChatId = uuidv4()
  currentChatId.value = newChatId
  const chatSetting = (await getGlobalState('chatSettings')) as { mode?: string }
  chatTypeValue.value = chatSetting?.mode || 'agent'
  hosts.value = []
  autoUpdateHost.value = true
  // Get the asset information of the current active tab
  const assetInfo = await getCurentTabAssetInfo()
  if (assetInfo && assetInfo.ip) {
    hosts.value.push({
      host: assetInfo.ip,
      uuid: assetInfo.uuid,
      connection: assetInfo.connection ? assetInfo.connection : 'personal'
    })
  }

  chatHistory.length = 0
  // Clear current feedback data
  messageFeedbacks.value = {}

  isExecutingCommand.value = false

  // After opening new window, cancel the original agent window
  console.log('handleCancel: cancel')
  const response = await window.api.cancelTask()
  console.log('Main process response:', response)
  buttonsDisabled.value = false
  resumeDisabled.value = false
  showCancelButton.value = false
  showSendButton.value = true
  responseLoading.value = false
  showRetryButton.value = false
  showNewTaskButton.value = false
}

const containerKey = ref(0)

const restoreHistoryTab = async (history: HistoryItem) => {
  // Save current input content
  const currentInput = chatInputValue.value

  containerKey.value++

  currentChatId.value = history.id
  chatTypeValue.value = history.chatType
  lastChatMessageId.value = ''
  autoUpdateHost.value = false

  try {
    try {
      const metadataResult = await window.api.getTaskMetadata(history.id)
      if (metadataResult.success && metadataResult.data && Array.isArray(metadataResult.data.hosts)) {
        hosts.value = metadataResult.data.hosts.map((item: any) => ({
          host: item.host,
          uuid: item.uuid || '',
          connection: item.connection
        }))
      }
    } catch (e) {
      console.error('Failed to get metadata:', e)
    }
    const conversationHistory = await getChatermMessages()
    console.log('[conversationHistory]', conversationHistory)
    chatHistory.length = 0
    // Sort by timestamp and filter adjacent duplicates
    let lastItem: any = null
    conversationHistory.forEach((item, index) => {
      // Check if duplicate with previous item
      const isDuplicate =
        lastItem && item.text === lastItem.text && item.ask === lastItem.ask && item.say === lastItem.say && item.type === lastItem.type

      if (
        !isDuplicate &&
        (item.ask === 'followup' ||
          item.ask === 'command' ||
          item.say === 'command' ||
          item.say === 'command_output' ||
          item.say === 'completion_result' ||
          item.say === 'text' ||
          item.say === 'reasoning' ||
          item.ask === 'resume_task' ||
          item.say === 'user_feedback' ||
          item.say === 'sshInfo' ||
          item.say === 'interactive_command_notification')
      ) {
        let role: 'assistant' | 'user' = 'assistant'
        if (index === 0 || item.say === 'user_feedback') {
          role = 'user'
        }
        const userMessage: ChatMessage = {
          id: uuidv4(),
          role: role,
          content: item.text || '',
          type: item.type,
          ask: item.ask,
          say: item.say,
          ts: item.ts
        }
        if (!item.partial && item.type === 'ask' && item.text) {
          try {
            let contentJson = JSON.parse(item.text)
            if (item.ask === 'followup') {
              userMessage.content = contentJson
              userMessage.selectedOption = contentJson?.selected
            } else {
              userMessage.content = contentJson?.question
            }
          } catch (e) {
            userMessage.content = item.text
          }
        }
        chatHistory.push(userMessage)
        lastItem = item
      }
    })
    isCurrentChatMessage.value = false
    // Load feedback data for this conversation
    await window.api.sendToMain({
      type: 'showTaskWithId',
      text: history.id,
      hosts: hosts.value.map((h) => ({
        host: h.host,
        uuid: h.uuid,
        connection: h.connection
      }))
    })
    // Restore saved input content
    chatInputValue.value = currentInput
    responseLoading.value = false
  } catch (err) {
    console.error(err)
  }
}

const handleHistoryClick = async () => {
  try {
    // Reset pagination state
    currentPage.value = 1
    isLoadingMore.value = false

    // Get all agent history records from globalState and sort by ts in descending order
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []

    // Load favorites list
    const favorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []
    favoriteTaskList.value = favorites

    const historyItems = taskHistory
      .sort((a, b) => b.ts - a.ts)
      .map((task) => ({
        id: task.id,
        chatTitle: truncateText(task?.task || `${chatTypeValue.value} Chat`),
        chatType: chatTypeValue.value,
        chatContent: [],
        isFavorite: favorites.includes(task.id)
      }))

    // Batch update history list
    historyList.value = historyItems
  } catch (err) {
    console.error('Failed to get conversation list:', err)
  }
}
const handleMessageOperation = async (operation: 'copy' | 'apply') => {
  const lastMessage = chatHistory.at(-1)
  if (!lastMessage) {
    notification.error({
      message: '操作失败',
      description: '没有可操作的消息',
      duration: 2,
      placement: 'topRight'
    })
    return
  }

  let content = ''
  if (typeof lastMessage.content === 'string') {
    content = lastMessage.content
  } else if (lastMessage.content && 'question' in lastMessage.content) {
    content = (lastMessage.content as MessageContent).question || ''
  }
  lastMessage.actioned = true

  // In the command mode, check whether the current window matches the target server.
  if (chatTypeValue.value === 'cmd' && hosts.value.length > 0) {
    const currentAssetInfo = await getCurentTabAssetInfo()
    const targetHost = hosts.value[0] // The command mode only supports a single host.

    // Check whether the current window matches the target server
    if (!currentAssetInfo || currentAssetInfo.ip !== targetHost.host) {
      notification.warning({
        message: '无法执行命令',
        description: `当前窗口不是执行命令的服务器窗口。\n目标服务器: ${targetHost.host}\n当前窗口: ${currentAssetInfo?.ip || '非终端窗口'}\n\n请切换到正确的服务器窗口后再执行命令。`,
        duration: 5,
        placement: 'topRight'
      })
      return
    }
  }

  if (operation === 'copy') {
    eventBus.emit('executeTerminalCommand', content)
  } else if (operation === 'apply') {
    eventBus.emit('executeTerminalCommand', content + '\n')
    responseLoading.value = true
  }
  lastChatMessageId.value = ''
}

const handleApplyCommand = () => handleMessageOperation('apply')
const handleCopyContent = () => handleMessageOperation('copy')

const handleRejectContent = async () => {
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  try {
    let messageRsp = {
      type: 'askResponse',
      askResponse: 'noButtonClicked',
      text: ''
    }
    switch (message.ask) {
      case 'followup':
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text =
          typeof message.content === 'object' && 'options' in message.content ? (message.content as MessageContent).options?.[1] || '' : ''
        break
      case 'api_req_failed':
      case 'ssh_con_failed':
        messageRsp.askResponse = 'noButtonClicked'
        break
      case 'completion_result':
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = 'Task completed failed.'
        break
      case 'auto_approval_max_req_reached':
        messageRsp.askResponse = 'noButtonClicked'
        break
    }
    message.action = 'rejected'
    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(messageRsp)
    buttonsDisabled.value = true
    console.log('Main process response:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

const handleOptionChoose = async (message: ChatMessage, option?: string) => {
  try {
    if (option) {
      message.selectedOption = option
    }
    let messageRsp = {
      type: 'askResponse',
      askResponse: option || 'yesButtonClicked',
      text: ''
    }
    switch (message.ask) {
      case 'followup':
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = option || ''
        break
    }
    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(messageRsp)
    console.log('Main process response:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

const handleApproveCommand = async () => {
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  try {
    let messageRsp = {
      type: 'askResponse',
      askResponse: 'yesButtonClicked',
      text: ''
    }
    switch (message.ask) {
      case 'followup':
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text =
          typeof message.content === 'object' && 'options' in message.content ? (message.content as MessageContent).options?.[0] || '' : ''
        break
      case 'api_req_failed':
      case 'ssh_con_failed':
        messageRsp.askResponse = 'yesButtonClicked'
        break
      case 'completion_result':
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = 'Task completed successfully.'
        break
      case 'auto_approval_max_req_reached':
        messageRsp.askResponse = 'yesButtonClicked'
        break
    }
    message.action = 'approved'

    if (message.ask === 'command') {
      isExecutingCommand.value = true
    }

    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(messageRsp)
    buttonsDisabled.value = true
    console.log('Main process response:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

const handleCancel = async () => {
  console.log('handleCancel: cancel')

  if (isExecutingCommand.value) {
    const response = await window.api.gracefulCancelTask()
    console.log('Main process graceful cancel response:', response)
  } else {
    // Use regular cancel for non-command operations
    const response = await window.api.cancelTask()
    console.log('Main process cancel response:', response)
    responseLoading.value = false
  }

  showCancelButton.value = false
  showSendButton.value = true
  lastChatMessageId.value = ''
  isExecutingCommand.value = false
}

const handleResume = async () => {
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  console.log('handleResume: resume')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(messageRsp)
  console.log('Main process response:', response)
  resumeDisabled.value = true
  responseLoading.value = true
}

const handleRetry = async () => {
  console.log('handleRetry: retry')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(messageRsp)
  console.log('Main process response:', response)
  showRetryButton.value = false
}

// Declare removeListener variable
let removeListener: (() => void) | null = null

const currentCwdStore = useCurrentCwdStore()

// Use computed property to get current working directory
const currentCwd = computed(() => currentCwdStore.keyValueMap)

watch(currentCwd, (newValue) => {
  console.log('Current working directory:', newValue)
})

// Modify watch handler function
watch(
  () => chatTypeValue.value,
  async (newValue) => {
    try {
      await updateGlobalState('chatSettings', {
        mode: newValue
      })
      // Emit state change event
      emitStateChange()
    } catch (error) {
      console.error('Failed to update chatSettings:', error)
    }
  }
)
watch(
  () => hosts.value,
  () => emitStateChange(),
  { deep: true }
)
watch(chatInputValue, () => emitStateChange())
watch(currentChatId, () => emitStateChange())
watch(chatAiModelValue, () => emitStateChange())

const handleChatAiModelChange = async () => {
  const modelOptions = (await getGlobalState('modelOptions')) as ModelOption[]
  const selectedModel = modelOptions.find((model) => model.name === chatAiModelValue.value)
  if (selectedModel && selectedModel.apiProvider) {
    await updateGlobalState('apiProvider', selectedModel.apiProvider)
  }
  const apiProvider = selectedModel?.apiProvider
  switch (apiProvider) {
    case 'bedrock':
      await updateGlobalState('apiModelId', chatAiModelValue.value)
      break
    case 'litellm':
      await updateGlobalState('liteLlmModelId', chatAiModelValue.value)
      break
    case 'deepseek':
      await updateGlobalState('apiModelId', chatAiModelValue.value)
      break
    case 'openai':
      await updateGlobalState('openAiModelId', chatAiModelValue.value)
      break
    default:
      await updateGlobalState('defaultModelId', chatAiModelValue.value)
      break
  }
}

// Modify model update function
const initModel = async () => {
  const chatSetting = (await getGlobalState('chatSettings')) as { mode?: string }
  chatTypeValue.value = chatSetting?.mode || 'agent'
  const apiProvider = (await getGlobalState('apiProvider')) as string
  switch (apiProvider) {
    case 'bedrock':
      chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
      break
    case 'litellm':
      chatAiModelValue.value = (await getGlobalState('liteLlmModelId')) as string
      break
    case 'deepseek':
      chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
      break
    case 'openai':
      chatAiModelValue.value = (await getGlobalState('openAiModelId')) as string
      break
    default:
      chatAiModelValue.value = (await getGlobalState('defaultModelId')) as string
      break
  }
  const modelOptions = (await getGlobalState('modelOptions')) as ModelOption[]

  // Sort modelOptions: models with '-Thinking' suffix first
  modelOptions.sort((a, b) => {
    const aIsThinking = a.name.endsWith('-Thinking')
    const bIsThinking = b.name.endsWith('-Thinking')

    if (aIsThinking && !bIsThinking) return -1
    if (!aIsThinking && bIsThinking) return 1

    return a.name.localeCompare(b.name)
  })

  AgentAiModelsOptions.value = modelOptions
    .filter((item) => item.checked)
    .map((item) => ({
      label: item.name,
      value: item.name
    }))
  if ((chatAiModelValue.value === undefined || chatAiModelValue.value === '') && AgentAiModelsOptions.value[0]) {
    chatAiModelValue.value = AgentAiModelsOptions.value[0].label
    await handleChatAiModelChange()
  }
}

// Watch for changes in AgentAiModelsOptions to ensure chatAiModelValue is valid
watch(
  AgentAiModelsOptions,
  async (newOptions) => {
    if (newOptions.length > 0) {
      // If current value is not in the options, set it to the first available option
      const isCurrentValueValid = newOptions.some((option) => option.value === chatAiModelValue.value)
      if (!isCurrentValueValid && newOptions[0]) {
        chatAiModelValue.value = ''
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {})

// Global ESC key listener
const handleGlobalEscKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && showHostSelect.value) {
    closeHostSelect()
  }
}

onMounted(async () => {
  // Add global ESC key listener
  document.addEventListener('keydown', handleGlobalEscKey)

  eventBus.on('triggerAiSend', () => {
    if (chatInputValue.value.trim()) {
      sendMessage('commandSend')
    }
  })

  eventBus.on('chatToAi', async (text) => {
    if (chatInputValue.value.trim()) {
      chatInputValue.value = chatInputValue.value + '\n' + text
    } else {
      chatInputValue.value = text
    }
    initAssetInfo() // Prevent initialization failure
    nextTick(() => {
      const textarea = document.getElementsByClassName('chat-textarea')[0] as HTMLTextAreaElement | null
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight
        textarea.focus({ preventScroll: true })
      }
    })
  })

  await initModelOptions()
  await initModel()
  authTokenInCookie.value = localStorage.getItem('ctm-token')
  const chatId = uuidv4()

  historyList.value = [
    {
      id: chatId,
      chatTitle: 'New chat',
      chatType: chatTypeValue.value,
      chatContent: []
    }
  ]

  // Initialize favorites list
  favoriteTaskList.value = ((await getGlobalState('favoriteTaskList')) as string[]) || []

  // Initialize asset information
  await initAssetInfo()

  // If there's saved state, restore it
  if (props.savedState) {
    chatInputValue.value = props.savedState.chatInputValue || ''
    chatTypeValue.value = props.savedState.chatTypeValue || 'agent'
    chatAiModelValue.value = props.savedState.chatAiModelValue || ''
    if (props.savedState.hosts && props.savedState.hosts.length > 0) {
      hosts.value = props.savedState.hosts
      autoUpdateHost.value = false
    }
    if (props.savedState.currentChatId) {
      currentChatId.value = props.savedState.currentChatId
    }
  }

  // Load message feedback
  messageFeedbacks.value = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>

  // Add event listeners
  eventBus.on('SettingModelOptionsChanged', async () => {
    await initModel()
  })

  // Listen for tab changes
  eventBus.on('activeTabChanged', async (tabInfo) => {
    if (!autoUpdateHost.value || chatHistory.length > 0) {
      return
    }
    if (tabInfo && tabInfo.ip) {
      updateHosts({
        ip: tabInfo.ip,
        uuid: tabInfo.data.uuid,
        connection: tabInfo.connection || 'personal'
      })
    } else {
      updateHosts(null)
    }
  })

  currentChatId.value = chatId

  let lastMessage: any = null
  let lastPartialMessage: any = null
  removeListener = window.api.onMainMessage((message: any) => {
    // const responseStartTime = new Date().toLocaleString()
    // console.log(`[AI Request Time Analysis] 2. Renderer AI received main process message time: ${responseStartTime}`)

    console.log('Received main process message:', message.type, message)
    if (message?.type === 'partialMessage') {
      if (message.partialMessage.type === 'ask' && message.partialMessage.ask === 'completion_result') {
        showNewTaskButton.value = true
        responseLoading.value = false
        showCancelButton.value = false
        return
      } else {
        showNewTaskButton.value = false
      }

      // Handle interactive_command_notification messages
      if (message.partialMessage.say === 'interactive_command_notification') {
        handleInteractiveCommandNotification(message)
        return
      }

      // Handle model error -- api_req_failed or ssh_con_failed
      if (
        message.partialMessage.type === 'ask' &&
        (message.partialMessage.ask === 'api_req_failed' || message.partialMessage.ask === 'ssh_con_failed')
      ) {
        handleModelApiReqFailed(message)
        return
      }
      showRetryButton.value = false
      showSendButton.value = false
      showCancelButton.value = true
      let lastMessageInChat = chatHistory.at(-1)

      let openNewMessage =
        (lastMessage?.type === 'state' && !lastPartialMessage?.partialMessage?.partial) ||
        lastMessageInChat?.role === 'user' ||
        !lastMessage ||
        lastPartialMessage.partialMessage.ts !== message.partialMessage.ts

      if (lastMessage && JSON.stringify(lastMessage) === JSON.stringify(message)) {
        return
      }
      isCurrentChatMessage.value = true
      if (openNewMessage) {
        const newAssistantMessage = createNewMessage(
          'assistant',
          message.partialMessage.text,
          message.partialMessage.type,
          message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
          message.partialMessage.type === 'say' ? message.partialMessage.say : '',
          message.partialMessage.ts,
          message.partialMessage.partial
        )

        if (!message.partialMessage.partial && message.partialMessage.type === 'ask') {
          newAssistantMessage.content = parseMessageContent(message.partialMessage.text)
        }

        if (message.partialMessage.type === 'say' && message.partialMessage.say === 'command') {
          isExecutingCommand.value = true
        }

        lastChatMessageId.value = newAssistantMessage.id
        chatHistory.push(newAssistantMessage)
      } else if (lastMessageInChat && lastMessageInChat.role === 'assistant') {
        lastMessageInChat.content = message.partialMessage.text
        lastMessageInChat.type = message.partialMessage.type
        lastMessageInChat.ask = message.partialMessage.type === 'ask' ? message.partialMessage.ask : ''
        lastMessageInChat.say = message.partialMessage.type === 'say' ? message.partialMessage.say : ''
        lastMessageInChat.partial = message.partialMessage.partial

        if (!message.partialMessage.partial && message.partialMessage.type === 'ask') {
          lastMessageInChat.content = parseMessageContent(message.partialMessage.text)
        }

        if (message.partialMessage.type === 'say' && message.partialMessage.say === 'command_output' && !message.partialMessage.partial) {
          isExecutingCommand.value = false
        }
      }

      lastPartialMessage = message
      if (!message.partialMessage?.partial) {
        showSendButton.value = true
        showCancelButton.value = false

        if (message.partialMessage?.type === 'ask' && message.partialMessage?.ask === 'command') {
          responseLoading.value = false
        }
      }
    } else if (message?.type === 'state') {
      let lastStateChatermMessages = message.state?.chatermMessages.at(-1)
      if (
        message.state?.chatermMessages.length > 0 &&
        lastStateChatermMessages.partial != undefined &&
        !lastStateChatermMessages.partial &&
        responseLoading.value
      ) {
        responseLoading.value = false
      }
    }
    lastMessage = message
  })
})

const handleModelApiReqFailed = (message: any) => {
  const newAssistantMessage = createNewMessage(
    'assistant',
    message.partialMessage.text,
    message.partialMessage.type,
    message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
    message.partialMessage.type === 'say' ? message.partialMessage.say : '',
    message.partialMessage.ts,
    false
  )
  chatHistory.push(newAssistantMessage)
  console.log('showRetryButton.value', showRetryButton.value)
  showRetryButton.value = true
  responseLoading.value = false
}

const handleInteractiveCommandNotification = (message: any) => {
  console.log('Processing interactive_command_notification:', message)

  const notificationMessage = createNewMessage(
    'assistant',
    message.partialMessage.text,
    message.partialMessage.type,
    message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
    message.partialMessage.type === 'say' ? message.partialMessage.say : '',
    message.partialMessage.ts,
    false
  )

  chatHistory.push(notificationMessage)

  console.log('Interactive command notification processed and added to chat history')
}

onUnmounted(() => {
  if (typeof removeListener === 'function') {
    removeListener()
    removeListener = null
  }
  document.removeEventListener('keydown', handleGlobalEscKey)
  eventBus.off('apiProviderChanged')
  eventBus.off('activeTabChanged')
  eventBus.off('chatToAi')
})

// Update cwd for all hosts with timeout protection
const updateCwdForAllHosts = async () => {
  if (hosts.value.length > 0) {
    const updatePromises = hosts.value.map((host) => {
      return new Promise<void>((resolve, reject) => {
        // Add timeout mechanism to prevent infinite waiting
        const timeout = setTimeout(() => {
          eventBus.off('cwdUpdatedForHost', handleCwdUpdated)
          resolve()
        }, 1000)

        const handleCwdUpdated = (updatedHost: string) => {
          if (updatedHost === host.host) {
            clearTimeout(timeout) // Clear timeout when response received
            eventBus.off('cwdUpdatedForHost', handleCwdUpdated)
            resolve()
          }
        }

        eventBus.on('cwdUpdatedForHost', handleCwdUpdated)
        eventBus.emit('requestUpdateCwdForHost', host.host)
      })
    })

    await Promise.all(updatePromises)
  }
}

// Add method to send message to main process
const sendMessageToMain = async (userContent: string, sendType: string) => {
  try {
    // // Record AI message send start time, format as yyyy-MM-dd HH:mm:ss
    // const sendStartTime = new Date().toLocaleString()
    // console.log(`[AI Request Time Analysis] 1. Renderer AI send message start time: ${sendStartTime}`)

    await updateCwdForAllHosts() // TODO:use cache

    // Update cwd for all hosts with timeout protection
    const filteredCwd = new Map()
    hosts.value.forEach((h) => {
      if (h.host && currentCwd.value[h.host]) {
        filteredCwd.set(h.host, currentCwd.value[h.host])
      }
    })
    const hostsArray = hosts.value.map((h) => ({
      host: h.host,
      uuid: h.uuid,
      connection: h.connection
    }))

    let message
    // Check if it is an interactive command input: only when a command is currently executing, the user's message is considered as interactive input
    if (isExecutingCommand.value && chatHistory.length > 0) {
      message = {
        type: 'interactiveCommandInput',
        input: userContent
      }
      console.log('Sending interactive command input:', userContent)
    } else if (chatHistory.length === 0) {
      message = {
        type: 'newTask',
        askResponse: 'messageResponse',
        text: userContent,
        terminalOutput: '',
        hosts: hostsArray,
        cwd: filteredCwd
      }
    } else if (sendType === 'commandSend') {
      message = {
        type: 'askResponse',
        askResponse: 'yesButtonClicked',
        text: userContent,
        cwd: filteredCwd
      }
    } else {
      message = {
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: userContent,
        cwd: filteredCwd
      }
    }
    console.log('Send message to main process:', message)
    const response = await window.api.sendToMain(message)
    console.log('Main process response:', response)
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

// Watch chatHistory changes
watch(
  chatHistory,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

// Watch chatHistory length changes to enable buttons
watch(
  () => chatHistory.length,
  () => {
    // console.log('watch  chatHistory.length')
    buttonsDisabled.value = false
    resumeDisabled.value = false
  }
)

const showBottomButton = computed(() => {
  if (chatHistory.length === 0) {
    return false
  }
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  return (
    (chatTypeValue.value === 'agent' || chatTypeValue.value === 'cmd') &&
    lastChatMessageId.value !== '' &&
    lastChatMessageId.value == message.id &&
    message.ask === 'command' &&
    !showCancelButton.value
  )
})

const filteredHostOptions = computed(() => hostOptions.value.filter((item) => item.label.includes(hostSearchValue.value)))

const isHostSelected = (hostOption: any) => {
  return hosts.value.some((h) => h.host === hostOption.label)
}
const onHostClick = (item: any) => {
  const newHost = {
    host: item.label,
    uuid: item.uuid,
    connection: item.connection
  }

  if (chatTypeValue.value === 'cmd') {
    hosts.value = [newHost]
  } else {
    // Check if already selected
    const existingIndex = hosts.value.findIndex((h) => h.host === item.label)
    if (existingIndex > -1) {
      // If already selected, then deselect
      hosts.value.splice(existingIndex, 1)
    } else {
      // If not selected, then add
      hosts.value.push(newHost)
    }
  }
  autoUpdateHost.value = false
  // showHostSelect.value = false
  chatInputValue.value = ''
}

// Remove specified host
const removeHost = (hostToRemove: any) => {
  const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
  if (index > -1) {
    hosts.value.splice(index, 1)
    autoUpdateHost.value = false
  }
}

// Handle host search box keyboard events
const handleHostSearchKeyDown = (e: KeyboardEvent) => {
  if (!showHostSelect.value || filteredHostOptions.value.length === 0) return

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (keyboardSelectedIndex.value === -1) {
        keyboardSelectedIndex.value = 0
      } else {
        keyboardSelectedIndex.value = Math.min(keyboardSelectedIndex.value + 1, filteredHostOptions.value.length - 1)
      }
      scrollToSelectedItem()
      break
    case 'ArrowUp':
      e.preventDefault()
      if (keyboardSelectedIndex.value === -1) {
        keyboardSelectedIndex.value = filteredHostOptions.value.length - 1
      } else {
        keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
      }
      scrollToSelectedItem()
      break
    case 'Enter':
      e.preventDefault()
      if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < filteredHostOptions.value.length) {
        onHostClick(filteredHostOptions.value[keyboardSelectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      closeHostSelect()
      break
  }
}

// Scroll to the selected item
const scrollToSelectedItem = () => {
  nextTick(() => {
    const hostSelectList = document.querySelector('.host-select-list')
    const selectedItem = document.querySelector('.host-select-item.keyboard-selected')

    if (hostSelectList && selectedItem) {
      const listRect = hostSelectList.getBoundingClientRect()
      const itemRect = selectedItem.getBoundingClientRect()

      // Scroll to the visible position if the selected item is outside the visible area of the list
      if (itemRect.top < listRect.top) {
        selectedItem.scrollIntoView({ block: 'start', behavior: 'smooth' })
      } else if (itemRect.bottom > listRect.bottom) {
        selectedItem.scrollIntoView({ block: 'end', behavior: 'smooth' })
      }
    }
  })
}

// Close the host selection box
const closeHostSelect = () => {
  showHostSelect.value = false
  keyboardSelectedIndex.value = -1
  // Refocus on the main input field
  nextTick(() => {
    const textarea = document.getElementsByClassName('chat-textarea')[0] as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
    }
  })
}

// Handle mouse hover event
const handleMouseOver = (value: string, index: number) => {
  hovered.value = value
  keyboardSelectedIndex.value = index
}

// 2. Listen for input box content changes
const handleInputChange = async (e: Event) => {
  if (chatTypeValue.value === 'cmd') {
    return
  }
  const value = (e.target as HTMLTextAreaElement).value
  if (value === '@') {
    showHostSelect.value = true
    hostSearchValue.value = '' // Clear search box
    await fetchHostOptions('') // Call here to get all hosts
    nextTick(() => {
      hostSearchInputRef.value?.focus?.()
    })
  } else {
    showHostSelect.value = false
  }

  // 如果正在语音识别过程中出现手动输入，则立即停止语音识别
  if (tempVoiceDisplay.value && value !== tempVoiceDisplay.value) {
    console.log('Manual input detected during voice recognition, immediately stopping recording...')

    // 立即停止语音录制
    if (tencentVoiceInputRef.value) {
      tencentVoiceInputRef.value.stopRecording()
    }

    // 在停止录制后，将非稳态的语音识别数据加入到 chatInputValue
    if (tempVoiceDisplay.value.trim()) {
      // 提取临时语音显示中的新内容（排除 chatInputValue 已有的部分）
      const currentInput = chatInputValue.value.trim()
      const tempDisplay = tempVoiceDisplay.value.trim()

      if (tempDisplay.startsWith(currentInput) && tempDisplay.length > currentInput.length) {
        // 提取新增的语音识别内容
        const newVoiceContent = tempDisplay.substring(currentInput.length).trim()
        if (newVoiceContent) {
          // 将新的语音内容追加到 chatInputValue
          if (currentInput) {
            chatInputValue.value = currentInput + ' ' + newVoiceContent
          } else {
            chatInputValue.value = newVoiceContent
          }
          console.log('Non-stable voice content added to chatInputValue:', newVoiceContent)
        }
      }
    }

    // 清空临时语音显示
    tempVoiceDisplay.value = ''
  }
}

// 3. Get host list
const debouncedFetchHostOptions = debounce((search: string) => {
  fetchHostOptions(search)
}, 300)

watch(hostSearchValue, (newVal) => {
  keyboardSelectedIndex.value = -1
  debouncedFetchHostOptions(newVal)
})
const fetchHostOptions = async (search: string) => {
  const hostsList = await window.api.getUserHosts(search)
  let formatted = formatHosts(hostsList || [])
  hostOptions.value.splice(0, hostOptions.value.length, ...formatted)
}

const showResumeButton = computed(() => {
  if (chatHistory.length === 0) {
    return false
  }
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  return message.ask === 'resume_task'
})

const handleAddHostClick = async () => {
  showHostSelect.value = !showHostSelect.value
  if (showHostSelect.value) {
    hostSearchValue.value = ''
    keyboardSelectedIndex.value = -1
    await fetchHostOptions('')
    nextTick(() => {
      hostSearchInputRef.value?.focus?.()
    })
  } else {
    keyboardSelectedIndex.value = -1
  }
}

// Use immediate option to ensure execution during initialization
watch(
  shouldShowSendButton,
  (newValue) => {
    showSendButton.value = newValue
  },
  { immediate: true }
)

const currentEditingId = ref(null)

// 语音识别后自动发送消息的开关
const autoSendAfterVoice = ref(false)
const editHistory = async (history) => {
  // If there are other items being edited, restore them first
  if (currentEditingId.value && currentEditingId.value !== history.id) {
    const previousEditingHistory = paginatedHistoryList.value.find((h) => h.id === currentEditingId.value)
    if (previousEditingHistory) {
      previousEditingHistory.isEditing = false
      previousEditingHistory.editingTitle = ''
    }
  }

  // Set current editing item
  currentEditingId.value = history.id
  history.isEditing = true
  history.editingTitle = history.chatTitle

  // Wait for DOM update then focus input box
  await nextTick()
  const input = document.querySelector('.history-title-input input') as HTMLInputElement
  if (input) {
    input.focus()
    input.select()
  }
}

const saveHistoryTitle = async (history) => {
  if (!history.editingTitle?.trim()) {
    history.editingTitle = history.chatTitle
  }

  // Update history record title
  history.chatTitle = history.editingTitle.trim()
  history.isEditing = false
  currentEditingId.value = null

  try {
    // Get current history records
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    // Update corresponding record title
    const targetHistory = taskHistory.find((item) => item.id === history.id)
    if (targetHistory) {
      targetHistory.task = history.chatTitle
      // Save updated history records
      await updateGlobalState('taskHistory', taskHistory)
    }
  } catch (err) {
    console.error('Failed to update history title:', err)
  }
}

const deleteHistory = async (history) => {
  // Get current history records
  const agentHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []

  // Filter out records to be deleted
  const filteredHistory = agentHistory.filter((item) => item.id !== history.id)

  // Update global state
  await updateGlobalState('taskHistory', filteredHistory)

  // Update display list
  historyList.value = filteredHistory
    .sort((a, b) => b.ts - a.ts)
    .map((messages) => ({
      id: messages.id,
      chatTitle: truncateText(messages?.task || 'Agent Chat'),
      chatType: 'agent',
      chatContent: []
    }))
  const message = {
    type: 'deleteTaskWithId',
    text: history.id,
    cwd: currentCwd.value
  }
  console.log('Send message to main process:', message)
  const response = await window.api.sendToMain(message)
  console.log('Main process response:', response)
}

const historySearchValue = ref('')
const showOnlyFavorites = ref(false)

const filteredHistoryList = computed(() => {
  // Implement filtering logic
  return historyList.value
    .filter((history) => {
      // Filter by search term
      const matchesSearch = history.chatTitle.toLowerCase().includes(historySearchValue.value.toLowerCase())

      // Filter by favorites if the toggle is on
      const matchesFavorite = !showOnlyFavorites.value || history.isFavorite

      return matchesSearch && matchesFavorite
    })
    .sort((a, b) => {
      // Sort favorites to the top
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      return 0
    })
})

const PAGE_SIZE = 20
const currentPage = ref(1)
const isLoadingMore = ref(false)

const paginatedHistoryList = computed(() => {
  const filtered = filteredHistoryList.value
  const end = currentPage.value * PAGE_SIZE
  return filtered.slice(0, end)
})

const hasMoreHistory = computed(() => {
  return paginatedHistoryList.value.length < filteredHistoryList.value.length
})

const loadMoreHistory = async () => {
  if (isLoadingMore.value || !hasMoreHistory.value) return

  isLoadingMore.value = true
  try {
    await new Promise((resolve) => setTimeout(resolve, 300)) // Add small delay to make loading smoother
    currentPage.value++
  } finally {
    isLoadingMore.value = false
  }
}

// Use Intersection Observer to implement infinite scrolling
const handleIntersection = (entries) => {
  if (entries[0].isIntersecting) {
    loadMoreHistory()
  }
}

// Listen for search value changes to reset pagination
watch(historySearchValue, () => {
  currentPage.value = 1
})

const cancelEdit = async (history) => {
  try {
    // Get current history records
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    // Find corresponding record
    const targetHistory = taskHistory.find((item) => item.id === history.id)
    if (targetHistory) {
      // Reset to title in database
      history.chatTitle = truncateText(targetHistory?.task || 'Agent Chat')
    }
    // Reset editing state
    history.isEditing = false
    history.editingTitle = ''
    currentEditingId.value = null
  } catch (err) {
    console.error('Failed to cancel edit:', err)
    // Also reset editing state when error occurs
    history.isEditing = false
    history.editingTitle = ''
    currentEditingId.value = null
  }
}

const chatContainer = ref<HTMLElement | null>(null)
const chatResponse = ref<HTMLElement | null>(null)
// Add a flag to track if collapse operation is being processed
const isHandlingCollapse = ref(false)

// Add auto scroll function
const scrollToBottom = () => {
  // If collapse operation is being processed, don't execute scrolling
  if (isHandlingCollapse.value) {
    // console.log('Processing collapse operation, skip auto scroll')
    // console.log('1.scrollToBottom isHandlingCollapse')
    handleCollapseChange()
    return
  }

  // Check if scrollbar is near bottom (threshold 20px)
  if (chatContainer.value) {
    const scrollPosition = chatContainer.value.scrollTop + chatContainer.value.clientHeight
    const scrollHeight = chatContainer.value.scrollHeight
    const isNearBottom = scrollHeight - scrollPosition < 20

    // If not near bottom, don't execute scrolling
    if (!isNearBottom) {
      // console.log('2.scrollToBottom not isNearBottom')
      handleCollapseChange()
      return
    }
  }

  // Record current container bottom position
  const prevBottom = chatResponse.value?.getBoundingClientRect().bottom

  nextTick(() => {
    if (chatResponse.value && chatContainer.value && prevBottom) {
      // Get updated container bottom position
      const currentBottom = chatResponse.value.getBoundingClientRect().bottom
      // console.log('Container height changed, scroll to bottom directly', prevBottom, currentBottom)
      // If container bottom position changed, scroll to bottom directly
      if (prevBottom !== currentBottom && prevBottom > 0 && currentBottom > 0) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    }
  })
}

// Modify handleCollapseChange function
const handleCollapseChange = (collapseType = '') => {
  // console.log('3.handleCollapseChange begin', collapseType)
  if (collapseType === 'code' || collapseType === 'thinking') {
    // Set flag to indicate collapse operation is being processed
    isHandlingCollapse.value = true
  }

  // After collapse completes, directly call adjustScrollPosition to ensure content is visible
  nextTick(() => {
    if (chatContainer.value) {
      // First check if there are Monaco editor collapse blocks
      const codeCollapses = chatContainer.value.querySelectorAll('.code-collapse')
      if (collapseType === 'code' && codeCollapses.length > 0) {
        const lastCodeCollapse = codeCollapses[codeCollapses.length - 1]
        const collapseHeader = lastCodeCollapse.querySelector('.ant-collapse-header')

        // Check if expanded or collapsed state
        const isCollapsed = lastCodeCollapse.querySelector('.ant-collapse-content-inactive')

        if (collapseHeader) {
          if (isCollapsed) {
            // If collapsed state, scroll Monaco editor top to center of window with smooth scrolling
            // console.log('4.handleCollapseChange collapseHeader isCollapsed center', isCollapsed)
            collapseHeader.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          } else {
            // console.log('5.handleCollapseChange collapseHeader normal adjustScrollPosition', isCollapsed)
            adjustScrollPosition()
            return
          }
        }
      }

      // Check if there are thinking collapse blocks
      const thinkingCollapses = chatContainer.value.querySelectorAll('.thinking-collapse')
      if (collapseType === 'thinking' && thinkingCollapses.length > 0) {
        const lastThinkingCollapse = thinkingCollapses[thinkingCollapses.length - 1]
        const thinkingHeader = lastThinkingCollapse.querySelector('.ant-collapse-header')

        // Check if expanded or collapsed state
        const isCollapsed = lastThinkingCollapse.querySelector('.ant-collapse-content-inactive')

        if (thinkingHeader) {
          if (isCollapsed) {
            // If collapsed state, scroll thinking top to center of window with smooth scrolling
            // console.log('6.handleCollapseChange thinkingHeader isCollapsed center', isCollapsed)
            thinkingHeader.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          } else {
            // console.log('7.handleCollapseChange thinkingHeader normal adjustScrollPosition', isCollapsed)
            adjustScrollPosition()
            return
          }
        }
      }
      // If no special collapse blocks exist, use normal scroll logic
      adjustScrollPosition()
      // console.log('8.handleCollapseChange normal adjustScrollPosition')
    }
  })
  if (collapseType === 'code' || collapseType === 'thinking') {
    // Delay reset flag to ensure processing is complete
    setTimeout(() => {
      isHandlingCollapse.value = false
      // console.log('10 adjustScrollPosition collapseType', collapseType)
    }, 200)
    adjustScrollPosition()
  }
}

// Add a function specifically for adjusting scroll position after collapse
const adjustScrollPosition = () => {
  if (!chatContainer.value) return
  // if (isHandlingCollapse.value) return
  // Try to find the last visible message
  const messages = Array.from(chatContainer.value.querySelectorAll('.message.assistant, .message.user'))

  if (messages.length > 0) {
    // Get the last message
    const lastMessage = messages[messages.length - 1]

    // Check if the last message is within the viewport
    const rect = lastMessage.getBoundingClientRect()
    const containerRect = chatContainer.value.getBoundingClientRect()

    if (rect.bottom > containerRect.bottom || rect.top < containerRect.top) {
      // If the last message is not within the viewport, scroll it to the bottom of the viewport with smooth scrolling
      // console.log('9.adjustScrollPosition scroll last message to bottom of window')
      lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' })
      // console.log('Scroll last message to bottom of viewport')
    } else {
      // console.log('Last message is already within viewport, no adjustment needed')
    }
  } else {
    // If no messages, scroll to bottom with smooth scrolling
    chatContainer.value.scrollTo({
      top: chatContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

const toggleFavorite = async (history) => {
  history.isFavorite = !history.isFavorite

  try {
    // Load current favorite list
    const currentFavorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

    if (history.isFavorite) {
      // Add to favorites if not already there
      if (!currentFavorites.includes(history.id)) {
        currentFavorites.push(history.id)
      }
    } else {
      // Remove from favorites
      const index = currentFavorites.indexOf(history.id)
      if (index !== -1) {
        currentFavorites.splice(index, 1)
      }
    }

    // Update local ref
    favoriteTaskList.value = currentFavorites

    // Save to global state
    await updateGlobalState('favoriteTaskList', currentFavorites)
  } catch (err) {
    console.error('Failed to update favorite status:', err)
  }
}

// Define interface for default models from API
interface DefaultModel {
  id: string
  name?: string
  provider?: string

  [key: string]: any
}

// Define interface for model options
interface ModelOption {
  id: string
  name: string
  checked: boolean
  type: string
  apiProvider: string
}

const initModelOptions = async () => {
  let modelOptions: ModelOption[]
  try {
    const savedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
    console.log('savedModelOptions', savedModelOptions)
    if (savedModelOptions.length !== 0) {
      return
    }
    let defaultModels: DefaultModel[] = []
    await getUser({}).then((res) => {
      console.log('res', res)
      defaultModels = res?.data?.models || []
      updateGlobalState('defaultBaseUrl', res?.data?.llmGatewayAddr)
      storeSecret('defaultApiKey', res?.data?.key)
    })
    modelOptions = defaultModels.map((model) => ({
      id: String(model) || '',
      name: String(model) || '',
      checked: true,
      type: 'standard',
      apiProvider: 'default'
    }))

    // Create a simple serializable object array
    const serializableModelOptions = modelOptions.map((model) => ({
      id: model.id,
      name: model.name,
      checked: Boolean(model.checked),
      type: model.type || 'standard',
      apiProvider: model.apiProvider || 'default'
    }))

    await updateGlobalState('modelOptions', serializableModelOptions)
  } catch (error) {
    console.error('Failed to get/save model options:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to get/save model options'
    })
  }
}

// Add method to handle feedback
const handleFeedback = async (message: ChatMessage, type: 'like' | 'dislike') => {
  // If feedback has already been submitted, don't allow operation again
  if (isMessageFeedbackSubmitted(message.id)) {
    return
  }

  // Update local state
  messageFeedbacks.value[message.id] = type
  // Get current feedback from globalState
  const feedbacks = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>
  // Add or update feedback for this message
  feedbacks[message.id] = type
  // Update globalState
  await updateGlobalState('messageFeedbacks', feedbacks)
  // Send feedback to main process
  let messageRsp = {
    type: 'taskFeedback',
    feedbackType: type === 'like' ? 'thumbs_up' : 'thumbs_down'
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(messageRsp)
  console.log('Main process response:', response)
}

// Restore saved state
const restoreState = (savedState: any) => {
  if (!savedState) return
  // Restore input box content
  if (savedState.chatInputValue !== undefined) {
    chatInputValue.value = savedState.chatInputValue
  }

  // Restore chat type and AI model
  if (savedState.chatTypeValue) {
    chatTypeValue.value = savedState.chatTypeValue
  }
  if (savedState.chatAiModelValue) {
    chatAiModelValue.value = savedState.chatAiModelValue
  }

  // Restore host list
  if (savedState.hosts && savedState.hosts.length > 0) {
    hosts.value = [...savedState.hosts]
    autoUpdateHost.value = false
  }

  // Restore chat history
  if (savedState.chatHistory && savedState.chatHistory.length > 0) {
    chatHistory.length = 0 // Clear current history
    savedState.chatHistory.forEach((message: any) => {
      chatHistory.push(message)
    })
  }

  // Restore current conversation ID
  if (savedState.currentChatId) {
    currentChatId.value = savedState.currentChatId
  }
}

// Function to get current state
const getCurrentState = () => {
  return {
    size: 0, // This will be set in parent component
    chatInputValue: chatInputValue.value,
    chatHistory: [...chatHistory], // Create copy to avoid reference issues
    currentChatId: currentChatId.value,
    hosts: [...hosts.value], // Create copy to avoid reference issues
    chatTypeValue: chatTypeValue.value,
    chatAiModelValue: chatAiModelValue.value
  }
}

// Function to emit state change event
const emitStateChange = () => {
  const currentState = getCurrentState()
  emit('state-changed', currentState)
}
// Expose getCurrentState and restoreState methods for parent component use
defineExpose({
  getCurrentState,
  restoreState
})
</script>

<style lang="less">
.history-dropdown-menu {
  .ant-input {
    background-color: var(--bg-color) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;
    font-size: 12px !important;
    padding: 0 4px !important;
    height: 16px !important;
    line-height: 16px !important;

    &:focus {
      border-color: #1890ff !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
    }
  }
}
</style>

<style lang="less" scoped>
:root {
  // Dark theme variables
  .theme-dark {
    --bg-color: #141414;
    --bg-color-secondary: #1f1f1f;
    --bg-color-quaternary: #3a3a3a;
    --bg-color-quinary: #2a2a2a;
    --text-color: #ffffff;
    --text-color-secondary: #e0e0e0;
    --text-color-tertiary: #666666;
    --border-color: #333333;
    --border-color-light: #3a3a3a;
    --hover-bg-color: #2a2a2a;
    --scrollbar-thumb: #2a2a2a;
    --scrollbar-track: #1a1a1a;
    --scrollbar-thumb-hover: #3a3a3a;
    --icon-filter: invert(0.25);
    --icon-filter-hover: invert(0.1);
  }

  // Light theme variables
  .theme-light {
    --bg-color: #ffffff;
    --bg-color-secondary: #f5f5f5;
    --bg-color-quaternary: #d9d9d9;
    --bg-color-quinary: #e8e8e8;
    --text-color: #000000;
    --text-color-secondary: #333333;
    --text-color-tertiary: #666666;
    --border-color: #d9d9d9;
    --border-color-light: #e8e8e8;
    --hover-bg-color: #f0f0f0;
    --scrollbar-thumb: #e8e8e8;
    --scrollbar-track: #f5f5f5;
    --scrollbar-thumb-hover: #d9d9d9;
    --icon-filter: invert(0.75);
    --icon-filter-hover: invert(0.9);
  }
}

.ai-chat-custom-tabs {
  :deep(.ant-tabs-tab:not(.ant-tabs-tab-active) .ant-tabs-tab-btn) {
    color: var(--text-color-secondary);
    transition:
      color 0.2s,
      text-shadow 0.2s;
  }

  :deep(.ant-tabs-nav) {
    height: 26px;
    margin-bottom: 2px;
  }

  :deep(.ant-tabs-tab) {
    padding: 0 4px;
    height: 22px;
    line-height: 22px;
    font-size: 12px;
  }

  :deep(.ant-tabs-content-holder) {
    display: flex;
    flex: 1;
    min-height: 0;
    max-height: 100%;
  }

  :deep(.ant-tabs-content) {
    height: 100%;
    width: 100%;
  }

  :deep(.ant-tabs-tabpane) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}

.ai-chat-flex-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-color);
  overflow: hidden;
}

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

.chat-response-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0px 4px 4px 4px;
  margin-top: 2px;
  scrollbar-width: thin;
  // scrollbar-color: #2a2a2a #1a1a1a;
  scrollbar-color: var(--bg-color-quinary) var(--bg-color-senary);
  width: 100%;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-color-senary);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--bg-color-quinary);
    border-radius: 3px;

    &:hover {
      background-color: var(--bg-color-quaternary);
    }
  }
}

.chat-response {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;

  .message {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 2px;
    font-size: 12px;
    line-height: 1.5;
    box-sizing: border-box;
    user-select: text;

    &.user {
      align-self: flex-end;
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      border-radius: 4px;
      border: none;
      margin-left: auto;
      float: right;
      clear: both;
    }

    &.assistant {
      color: var(--text-color);
      width: 100%;
      padding: 0;

      &.completion-result {
        background-color: var(--bg-color-secondary);
        border-radius: 0 0 4px 4px;
        padding: 0 8px 2px 8px;
        margin-top: 0;
      }

      &.interactive-notification {
        background-color: var(--bg-color-quaternary) !important;
        border: none !important;
        border-radius: 4px !important;
        margin: 8px 0 !important;
        padding: 8px 12px !important;
        font-size: 12px !important;
        line-height: 1.5715 !important;
        position: relative;
        overflow: hidden;

        &:before {
          content: '💡';
          position: absolute;
          left: 12px;
          top: 8px;
          font-size: 14px;
          line-height: 1;
        }

        :deep(.markdown-content) {
          color: var(--text-color) !important;
          margin-left: 24px !important;
          padding: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          font-size: 12px !important;
          line-height: 1.5715 !important;

          p,
          div,
          span {
            color: var(--text-color) !important;
            font-size: 12px !important;
            line-height: 1.5715 !important;
            margin: 0 !important;
          }

          p:first-child {
            margin-top: 0 !important;
          }

          p:last-child {
            margin-bottom: 0 !important;
          }
        }
      }
    }
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
  justify-content: space-between;
  gap: 4px;
  padding: 8px 8px;
  flex-wrap: nowrap;
  min-height: 32px;

  // 确保按钮组不会被压缩
  .action-buttons-container {
    flex-shrink: 0;
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
      font-size: 12px !important;
      line-height: 24px !important;
      color: var(--text-color) !important;
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
    margin-left: 4px;
    flex-shrink: 0;

    @media (max-width: 480px) {
      gap: 6px;
      margin-left: 2px;
    }
  }

  .custom-round-button {
    height: 18px;
    width: 18px;
    padding: 0;
    border-radius: 50%;
    font-size: 10px;
    background-color: transparent;
    border: 1px solid var(--border-color);
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
  }
}

.assistant-message-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  position: relative;

  &.last-message {
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);

    .message-header {
      background-color: var(--bg-color-secondary);
      border-radius: 4px 4px 0 0;
      padding: 4px 8px 0 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: none;
      margin-bottom: 0;
      z-index: 2;
      position: relative;
    }

    .message-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-color);
    }

    .message-feedback {
      display: flex;
      gap: 6px;

      .feedback-btn {
        height: 16px;
        width: 16px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;

        &:hover {
          background: var(--hover-bg-color);
        }

        &[disabled] {
          cursor: not-allowed;

          .anticon:not([style*='opacity: 1']) {
            opacity: 0.5;
          }

          &:hover {
            background: transparent;
          }
        }

        .anticon {
          font-size: 12px;
        }
      }

      .like-btn {
        .anticon {
          color: var(--text-color-tertiary);

          &:hover {
            color: #52c41a;
          }
        }

        &[disabled] .anticon[style*='color: #52c41a'] {
          opacity: 1;
          color: #52c41a !important;
        }
      }

      .dislike-btn {
        .anticon {
          color: var(--text-color-tertiary);

          &:hover {
            color: #ff4d4f;
          }
        }

        &[disabled] .anticon[style*='color: #ff4d4f'] {
          opacity: 1;
          color: #ff4d4f !important;
        }
      }
    }
  }

  .message-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 0px;
    width: 100%;

    .options-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;

      .option-btn {
        width: 100%;
        height: auto;
        white-space: normal;
        text-align: left;
        padding: 8px 12px;
        line-height: 1.4;
        font-size: 12px;
        background-color: #2a2a2a;
        border: 1px solid #3a3a3a;
        color: #e0e0e0;
        transition: all 0.2s ease;

        &:hover {
          background-color: #3a3a3a;
          border-color: #4a4a4a;
          transform: translateX(4px);
        }

        &:active {
          background-color: #4a4a4a;
          transform: translateX(2px);
        }

        &.selected {
          background-color: #1656b1;
          border-color: #2d6fcd;
          color: white;
          transform: none;

          &:hover {
            background-color: #1656b1;
            border-color: #2d6fcd;
            transform: none;
          }
        }
      }
    }

    .action-buttons {
      width: 100%;
      margin: 0;
      padding: 0;

      .button-row {
        display: flex;
        gap: 4px;
        width: 100%;

        &:has(.options-container) {
          flex-direction: column;
        }
      }
    }

    .action-btn {
      height: 18px;
      padding: 0 6px;
      border-radius: 4px;
      font-size: 10px;
      display: flex;
      align-items: center;
      gap: 3px;
      transition: all 0.3s ease;
      border: none;

      &.copy-btn {
        background-color: #2a2a2a;
        color: #e0e0e0;

        &:hover {
          background-color: #3a3a3a;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        &:active {
          transform: translateY(0);
        }
      }

      &.apply-btn {
        background-color: #4caf50;
        color: white;

        &:hover {
          background-color: #45a049;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        &:active {
          transform: translateY(0);
        }
      }

      .anticon {
        font-size: 12px;
      }
    }
  }
}

.right-extra-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;

  .action-icon-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color);
    border-radius: 4px;
    transition: all 0.3s ease;
    filter: var(--icon-filter);

    &:hover {
      background-color: rgba(0, 0, 0, 0.06);
      color: var(--text-color);
      filter: var(--icon-filter-hover);
    }

    &:active {
      background-color: rgba(0, 0, 0, 0.1);
    }

    .anticon,
    img {
      width: 14px;
      height: 14px;
      opacity: 0.65;
    }
  }
}

.history-dropdown-menu {
  max-height: none;
  overflow: visible;
  padding: 4px 0 4px 4px;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 280px !important;

  :deep(.ant-dropdown-menu-item) {
    padding: 0 4px 0 4px !important;
    line-height: 30px !important;
    height: 30px !important;
  }

  .history-search-container {
    display: flex;
    gap: 10px;
    align-items: center;

    :deep(.ant-input-affix-wrapper) {
      border-color: var(--border-color);
      box-shadow: none;
    }

    .favorites-button {
      flex-shrink: 0;
      border: none;
      background-color: transparent;
      margin-right: 6px;
      padding: 0 6px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;

      &.ant-btn-primary {
        background-color: transparent;
        border: none;
      }
    }
  }

  .history-search-input {
    width: 100%;
    background-color: var(--bg-color) !important;

    :deep(.ant-input) {
      background-color: var(--bg-color) !important;
      border: none !important;
      color: var(--text-color) !important;
      height: 20px !important;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }
    }

    :deep(.ant-input-clear-icon) {
      color: var(--text-color-tertiary);

      &:hover {
        color: var(--text-color-secondary);
      }
    }
  }
}

.history-virtual-list-container {
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-color-quinary) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--bg-color-quinary);
    border-radius: 2px;

    &:hover {
      background-color: var(--bg-color-quaternary);
    }
  }
}

.history-menu-item {
  padding: 6px 8px !important;
  margin: 2px 0 !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  min-height: unset !important;

  .menu-action-buttons {
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover {
    background-color: var(--hover-bg-color) !important;
    transform: translateX(2px);
    border-color: var(--border-color-light);

    .menu-action-buttons {
      opacity: 1;
    }
  }

  &:active {
    background-color: var(--bg-color-secondary) !important;
  }

  &.favorite-item {
    background-color: var(--bg-color) !important;
    border-left: 2px solid #faad14 !important;

    &:hover {
      background-color: var(--bg-color-secondary) !important;
    }
  }
}

.history-item-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-color) !important;
    font-size: 13px !important;
    padding: 0 4px !important;
    height: 20px !important;
    line-height: 20px !important;

    &:focus {
      border-color: var(--border-color) !important;
      box-shadow: 0 0 0 2px rgba(58, 58, 58, 0.2) !important;
    }
  }

  .menu-action-buttons {
    display: flex;
    gap: 0px;
    margin-left: 0px;

    > .menu-action-btn {
      margin-left: -3px;
    }
  }

  .history-title {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .history-title-input {
    flex: 1;
    margin-right: 8px;
  }

  .history-type {
    color: #888;
    font-size: 10px;
    padding: 1px 4px;
    background-color: #333;
    border-radius: 3px;
    display: inline-block;
    width: fit-content;
    flex-shrink: 0;
  }

  :deep(.ant-input::placeholder) {
    color: #666 !important;
  }

  .action-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;

    &.approved {
      background-color: #52c41a20;
      color: #52c41a;
    }

    &.rejected {
      background-color: #ff4d4f20;
      color: #ff4d4f;
    }
  }

  .action-buttons {
    margin: 0;
    padding: 0;
    width: 100%;

    .button-row {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
      margin-top: 2px;

      .options-container {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        width: 100%;
        justify-content: flex-end;

        &.vertical-layout {
          flex-direction: column;
          align-items: stretch;

          .action-btn {
            width: 100%;
            justify-content: flex-start;
            text-align: left;
          }
        }
      }
    }
  }
}

.bottom-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  flex-shrink: 0;
}

.bottom-buttons {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;

  &.cancel-row {
    padding-top: 0;
  }

  .reject-btn,
  .approve-btn,
  .cancel-btn,
  .retry-btn,
  .resume-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 10px;
    border-radius: 4px;
    transition: all 0.3s ease;
  }

  .reject-btn {
    .theme-dark & {
      background-color: #2a2a2a;
      border-color: #3a3a3a;
      color: #e0e0e0;

      &:hover {
        background-color: #ff4d4f20;
        border-color: #ff4d4f;
        color: #ff4d4f;
      }

      &[disabled] {
        background-color: #141414 !important;
        border-color: #2a2a2a !important;
        color: #666666 !important;
        cursor: not-allowed;

        &:hover {
          background-color: #141414 !important;
          border-color: #2a2a2a !important;
          color: #666666 !important;
        }
      }
    }

    .theme-light & {
      background-color: #fff;
      border: 1px solid #d9d9d9;
      color: #666;

      &:hover {
        color: #ff4d4f;
        border-color: #ff4d4f;
        background-color: #fff1f0;
      }

      &[disabled] {
        background-color: #f5f5f5 !important;
        border-color: #d9d9d9 !important;
        color: #d9d9d9 !important;
        cursor: not-allowed;
      }
    }
  }

  .approve-btn {
    .theme-dark & {
      color: #e0e0e0;
      background-color: #1656b1;
      border-color: #2d6fcd;

      &:hover {
        background-color: #52c41a20;
        border-color: #52c41a;
        color: #52c41a;
      }

      &[disabled] {
        background-color: #141414 !important;
        border-color: #2a2a2a !important;
        color: #666666 !important;
        cursor: not-allowed;

        &:hover {
          background-color: #141414 !important;
          border-color: #2a2a2a !important;
          color: #666666 !important;
        }
      }
    }

    .theme-light & {
      background-color: #1890ff;
      border-color: #1890ff;
      color: #fff;

      &:hover {
        background-color: #40a9ff;
        border-color: #40a9ff;
      }

      &[disabled] {
        background-color: #f5f5f5 !important;
        border-color: #d9d9d9 !important;
        color: #d9d9d9 !important;
        cursor: not-allowed;
      }
    }
  }

  .cancel-btn {
    .theme-dark & {
      background-color: #2a2a2a;
      border-color: #3a3a3a;
      color: #666666;

      &:hover {
        background-color: #3a3a3a;
        border-color: #4a4a4a;
        color: #888888;
      }

      &[disabled] {
        background-color: #141414 !important;
        border-color: #2a2a2a !important;
        color: #666666 !important;
        cursor: not-allowed;

        &:hover {
          background-color: #141414 !important;
          border-color: #2a2a2a !important;
          color: #666666 !important;
        }
      }
    }

    .theme-light & {
      background-color: #fff;
      border: 1px solid #d9d9d9;
      color: #666;

      &:hover {
        color: #40a9ff;
        border-color: #40a9ff;
      }

      &[disabled] {
        background-color: #f5f5f5 !important;
        border-color: #d9d9d9 !important;
        color: #d9d9d9 !important;
        cursor: not-allowed;
      }
    }
  }

  .resume-btn {
    .theme-dark & {
      background-color: #1656b1;
      border-color: #2d6fcd;
      color: #cccccc;
      opacity: 0.65;

      &:hover {
        opacity: 1;
        background-color: #1656b1;
        border-color: #2d6fcd;
        color: #ffffff;
      }

      &[disabled] {
        background-color: #141414 !important;
        border-color: #2a2a2a !important;
        color: #666666 !important;
        cursor: not-allowed;

        &:hover {
          background-color: #141414 !important;
          border-color: #2a2a2a !important;
          color: #666666 !important;
        }
      }
    }

    .theme-light & {
      background-color: #1890ff;
      border-color: #1890ff;
      color: #fff;
      opacity: 0.65;

      &:hover {
        opacity: 1;
        background-color: #40a9ff;
        border-color: #40a9ff;
      }

      &[disabled] {
        background-color: #f5f5f5 !important;
        border-color: #d9d9d9 !important;
        color: #d9d9d9 !important;
        cursor: not-allowed;
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
  // overflow: hidden;
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
}

.host-select-empty {
  color: var(--text-color-tertiary);
  text-align: center;
  padding: 8px 0;
}

.ai-welcome-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .ai-welcome-icon {
    margin-bottom: 12px;

    img {
      width: 28px;
      height: 28px;
      opacity: 0.65;
      filter: var(--icon-filter);
      transition: filter 0.2s ease;
    }
  }

  .ai-welcome-text {
    color: var(--text-color);
    font-size: 14px;
    text-align: center;
    font-weight: 400;
    opacity: 0.65;
  }
}

.menu-action-btn {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--text-color) !important;
  padding: 0;
  min-width: 0;
  height: 16px;
  line-height: 20px;
  font-size: 12px;
  margin-left: 0;
  margin-right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;

  :deep(.anticon) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  &:hover,
  &:focus {
    background: none !important;
  }

  &:hover :deep(.anticon) {
    color: #1890ff !important;
  }

  &.save-btn:hover :deep(.anticon) {
    color: #52c41a !important;
  }

  &.cancel-btn:hover :deep(.anticon) {
    color: #ff4d4f !important;
  }

  &.favorite-btn:hover :deep(.anticon) {
    color: #faad14 !important;
  }
}

.history-load-more {
  text-align: center;
  padding: 8px;
  color: var(--text-color-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: #1890ff;
    background-color: var(--hover-bg-color);
  }
}

.processing-text {
  font-size: 10px;
  color: var(--text-color);
}

.ai-login-prompt {
  text-align: center;
  margin-top: 20px;

  p {
    color: var(--text-color);
    font-size: 12px;
    margin-bottom: 20px;
  }

  .login-button {
    min-width: 150px;
    height: 32px;
    font-size: 14px;
  }
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
</style>
