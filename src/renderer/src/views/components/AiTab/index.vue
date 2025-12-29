<template>
  <a-tabs
    v-model:active-key="currentChatId"
    type="line"
    class="ai-chat-custom-tabs ai-chat-flex-container"
  >
    <a-tab-pane
      v-for="tab in chatTabs"
      :key="tab.id"
    >
      <template #tab>
        <span class="tab-title">{{ tab.title }}</span>
        <CloseOutlined
          class="tab-close-icon"
          @click.stop="handleTabRemove(tab.id)"
        />
      </template>
      <!-- Use v-show instead of v-if to keep tab content in DOM and avoid re-rendering on tab switch -->
      <div
        v-show="tab.id === currentChatId"
        class="tab-content-wrapper"
      >
        <div
          v-if="isEmptyTab(tab.id)"
          class="ai-welcome-container"
        >
          <div class="ai-welcome-icon">
            <img
              src="@/assets/menu/ai.svg"
              alt="AI"
            />
          </div>
          <template v-if="!hasAvailableModels">
            <div class="ai-login-prompt">
              <p>{{ $t('user.noAvailableModelMessage') }}</p>
              <p class="ai-prompt-description">
                {{ isSkippedLogin ? $t('user.noAvailableModelDescription') : $t('user.noAvailableModelDescriptionLoggedIn') }}
              </p>
              <div class="ai-prompt-buttons">
                <a-button
                  v-if="isSkippedLogin"
                  type="primary"
                  class="login-button"
                  @click="goToLogin"
                >
                  {{ $t('common.login') }}
                </a-button>
                <a-button
                  type="primary"
                  class="configure-model-button"
                  @click="goToModelSettings"
                >
                  {{ $t('user.configureModel') }}
                </a-button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="ai-welcome-text">{{ tab.welcomeTip }}</div>
          </template>
        </div>
        <div
          v-else
          :ref="
            (el) => {
              if (tab.id === currentChatId) {
                chatContainer = el as HTMLElement
              }
            }
          "
          class="chat-response-container"
        >
          <div
            :ref="
              (el) => {
                if (tab.id === currentChatId) {
                  chatResponse = el as HTMLElement
                }
              }
            "
            class="chat-response"
          >
            <template
              v-for="pair in getTabUserAssistantPairs(tab.id)"
              :key="pair.user?.message.id"
            >
              <div class="user-assistant-pair-message">
                <UserMessage
                  v-if="pair.user"
                  :message="pair.user.message"
                />

                <template
                  v-for="{ message, historyIndex } in pair.assistants"
                  :key="message.id"
                >
                  <div
                    class="assistant-message-container"
                    data-testid="ai-message"
                    :class="{
                      'has-history-copy-btn': getTabChatTypeValue(tab.id) === 'cmd' && message.ask === 'command' && message.actioned,
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
                        v-if="isLastMessage(tab.id, message.id)"
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
                      :ref="(el) => tab.id === currentChatId && setMarkdownRendererRef(el, historyIndex)"
                      :content="(message.content as MessageContent).question"
                      :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                      :ask="message.ask"
                      :say="message.say"
                      :partial="message.partial"
                      :executed-command="message.executedCommand"
                      :host-id="message.hostId"
                      :host-name="message.hostName"
                      :color-tag="message.colorTag"
                    />
                    <MarkdownRenderer
                      v-else
                      :ref="(el) => tab.id === currentChatId && setMarkdownRendererRef(el, historyIndex)"
                      :content="typeof message.content === 'string' ? message.content : ''"
                      :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                      :ask="message.ask"
                      :say="message.say"
                      :partial="message.partial"
                      :executed-command="message.executedCommand"
                      :host-id="message.hostId"
                      :host-name="message.hostName"
                      :color-tag="message.colorTag"
                    />

                    <div
                      v-if="message.ask === 'mcp_tool_call' && message.mcpToolCall"
                      class="mcp-tool-call-info"
                    >
                      <div class="mcp-info-section">
                        <div class="mcp-info-label">MCP Server:</div>
                        <div class="mcp-info-value">{{ message.mcpToolCall.serverName }}</div>
                      </div>
                      <div class="mcp-info-section">
                        <div class="mcp-info-label">Tool:</div>
                        <div class="mcp-info-value">{{ message.mcpToolCall.toolName }}</div>
                      </div>
                      <div
                        v-if="message.mcpToolCall.arguments && Object.keys(message.mcpToolCall.arguments).length > 0"
                        class="mcp-info-section"
                      >
                        <div class="mcp-info-label">Parameters:</div>
                        <div class="mcp-info-params">
                          <div
                            v-for="(value, key) in message.mcpToolCall.arguments"
                            :key="key"
                            class="mcp-param-item"
                          >
                            <span class="mcp-param-key">{{ key }}:</span>
                            <span class="mcp-param-value">{{ formatParamValue(value) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="message-actions">
                      <template v-if="typeof message.content === 'object' && 'options' in message.content && isLastMessage(tab.id, message.id)">
                        <div class="options-container">
                          <!-- Display original options as radio buttons -->
                          <div class="options-radio-group">
                            <a-radio-group
                              :value="getSelectedOption(message)"
                              @change="(e) => handleOptionSelect(message, e.target.value)"
                            >
                              <a-radio
                                v-for="(option, optionIndex) in (message.content as MessageContent).options"
                                :key="optionIndex"
                                :value="option"
                                class="option-radio"
                              >
                                {{ option }}
                              </a-radio>
                              <!-- Add custom input option when there are more than 1 options -->
                              <div
                                v-if="(message.content as MessageContent).options && (message.content as MessageContent).options!.length > 1"
                                class="option-radio custom-option"
                              >
                                <a-radio
                                  value="__custom__"
                                  class="custom-radio"
                                />
                                <a-textarea
                                  :value="getCustomInput(message)"
                                  :placeholder="$t('ai.enterCustomOption')"
                                  :auto-size="{ minRows: 1, maxRows: 4 }"
                                  class="custom-input"
                                  @input="(e) => handleCustomInputChange(message, (e.target as HTMLInputElement).value || '')"
                                  @focus="() => handleOptionSelect(message, '__custom__')"
                                />
                              </div>
                            </a-radio-group>
                          </div>

                          <!-- Submit button - shown after selecting any option -->
                          <div
                            v-if="(message.content as MessageContent).options && !message.selectedOption && getSelectedOption(message)"
                            class="submit-button-container"
                          >
                            <a-button
                              type="primary"
                              size="small"
                              :disabled="!canSubmitOption(message)"
                              class="submit-option-btn"
                              @click="handleOptionSubmit(message)"
                            >
                              {{ $t('ai.submit') }}
                            </a-button>
                          </div>
                        </div>
                      </template>
                      <!-- Inline approval buttons for Agent mode: attach to the pending command message -->
                      <template
                        v-if="
                          getTabChatTypeValue(tab.id) === 'agent' &&
                          isLastMessage(tab.id, message.id) &&
                          getTabLastChatMessageId(tab.id) === message.id &&
                          (message.ask === 'command' || message.ask === 'mcp_tool_call') &&
                          !getTabResponseLoading(tab.id)
                        "
                      >
                        <div class="bottom-buttons">
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
                            v-if="message.ask === 'mcp_tool_call'"
                            size="small"
                            class="approve-auto-btn"
                            :disabled="buttonsDisabled"
                            @click="handleApproveAndAutoApprove"
                          >
                            <template #icon>
                              <CheckCircleOutlined />
                            </template>
                            {{ $t('ai.addAutoApprove') }}
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
                            {{ message.ask === 'mcp_tool_call' ? $t('ai.approve') : $t('ai.run') }}
                          </a-button>
                        </div>
                      </template>
                      <!-- Inline copy/run buttons for Command mode - command type -->
                      <template
                        v-if="
                          getTabChatTypeValue(tab.id) === 'cmd' &&
                          isLastMessage(tab.id, message.id) &&
                          getTabLastChatMessageId(tab.id) === message.id &&
                          message.ask === 'command' &&
                          !getTabResponseLoading(tab.id)
                        "
                      >
                        <div class="bottom-buttons">
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
                      </template>
                      <!-- Inline approval buttons for Command mode - mcp_tool_call type -->
                      <template
                        v-if="
                          getTabChatTypeValue(tab.id) === 'cmd' &&
                          isLastMessage(tab.id, message.id) &&
                          getTabLastChatMessageId(tab.id) === message.id &&
                          message.ask === 'mcp_tool_call' &&
                          !getTabResponseLoading(tab.id)
                        "
                      >
                        <div class="bottom-buttons">
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
                            class="approve-auto-btn"
                            :disabled="buttonsDisabled"
                            @click="handleApproveAndAutoApprove"
                          >
                            <template #icon>
                              <CheckCircleOutlined />
                            </template>
                            {{ $t('ai.addAutoApprove') }}
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
                            {{ $t('ai.approve') }}
                          </a-button>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Dynamically insert Todo display -->
                  <TodoInlineDisplay
                    v-if="shouldShowTodoAfterMessage(message)"
                    :todos="getTodosForMessage(message)"
                    :show-trigger="message.role === 'assistant' && message.hasTodoUpdate"
                    class="todo-inline"
                  />
                </template>
              </div>
            </template>
          </div>
        </div>
        <div class="bottom-container">
          <div
            v-if="showResumeButton"
            class="bottom-buttons"
          >
            <a-button
              size="small"
              type="primary"
              class="resume-btn"
              :disabled="currentTab?.session.resumeDisabled"
              @click="handleResume"
            >
              <template #icon>
                <RedoOutlined />
              </template>
              {{ $t('ai.resume') }}
            </a-button>
          </div>
          <div
            v-if="currentTab?.session.showRetryButton"
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
            v-if="currentTab?.session.showNewTaskButton"
            class="bottom-buttons"
          >
            <a-button
              size="small"
              type="primary"
              class="retry-btn"
              @click="createNewEmptyTab"
            >
              <template #icon>
                <PlusOutlined />
              </template>
              {{ $t('ai.newTask') }}
            </a-button>
          </div>
          <InputSendContainer
            :is-active-tab="tab.id === currentChatId"
            :send-message="sendMessage"
            :handle-interrupt="handleInterrupt"
          />
        </div>
      </div>
    </a-tab-pane>
    <template #rightExtra>
      <div class="right-extra-buttons">
        <a-tooltip :title="$t('ai.newChat')">
          <a-button
            type="text"
            class="action-icon-btn"
            data-testid="new-tab-button"
            @click="createNewEmptyTab"
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
              @click="refreshHistoryList"
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
                  <template
                    v-for="group in groupedPaginatedHistory"
                    :key="group.dateLabel"
                  >
                    <div
                      class="history-date-header"
                      :class="{ 'favorite-header': group.dateLabel === favoriteLabel }"
                    >
                      <template v-if="group.dateLabel === favoriteLabel">
                        <StarFilled style="color: #faad14; font-size: 12px" />
                        <span>{{ $t('ai.favorite') }}</span>
                      </template>
                      <template v-else>
                        {{ group.dateLabel }}
                      </template>
                    </div>
                    <a-menu-item
                      v-for="history in group.items"
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
                  </template>
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
        <a-dropdown trigger="click">
          <a-button
            type="text"
            class="action-icon-btn"
          >
            <EllipsisOutlined />
          </a-button>
          <template #overlay>
            <a-menu>
              <a-menu-item
                key="export"
                @click="handleExportChat"
              >
                <ExportOutlined style="font-size: 12px" />
                <span style="margin-left: 8px; font-size: 12px">{{ $t('ai.exportChat') }}</span>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </template>
  </a-tabs>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAutoScroll } from './composables/useAutoScroll'
import { useChatHistory } from './composables/useChatHistory'
import { useChatMessages } from './composables/useChatMessages'
import { useCommandInteraction } from './composables/useCommandInteraction'
import { useEventBusListeners } from './composables/useEventBusListeners'
import { useHostManagement } from './composables/useHostManagement'
import { useMessageOptions } from './composables/useMessageOptions'
import { useModelConfiguration } from './composables/useModelConfiguration'
import { useSessionState } from './composables/useSessionState'
import { useStateSnapshot } from './composables/useStateSnapshot'
import { useTabManagement } from './composables/useTabManagement'
import { useTodo } from './composables/useTodo'
import { useWatchers } from './composables/useWatchers'
import { useExportChat } from './composables/useExportChat'
import InputSendContainer from './components/InputSendContainer.vue'
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  DislikeOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExportOutlined,
  LikeOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons-vue'
import { isFocusInAiTab } from '@/utils/domUtils'
import { getGlobalState } from '@renderer/agent/storage/state'
import type { MessageContent } from './types'
import i18n from '@/locales'
import eventBus from '@/utils/eventBus'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'

interface TabInfo {
  id: string
  ip: string
  organizationId?: string
  title?: string
}

declare module '@/utils/eventBus' {
  interface AppEvents {
    tabChanged: TabInfo
  }
}

interface Props {
  toggleSidebar: () => void
  savedState?: Record<string, any> | null
  isAgentMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  savedState: null
})

const emit = defineEmits(['state-changed'])

const router = useRouter()
const MarkdownRenderer = defineAsyncComponent(() => import('./components/format/markdownRenderer.vue'))
const TodoInlineDisplay = defineAsyncComponent(() => import('./components/todo/TodoInlineDisplay.vue'))
const UserMessage = defineAsyncComponent(() => import('./components/message/UserMessage.vue'))

const isSkippedLogin = ref(localStorage.getItem('login-skipped') === 'true')

const {
  currentChatId,
  chatTabs,
  currentTab,
  isEmptyTab,
  isLastMessage,
  currentSession,
  buttonsDisabled,
  showResumeButton,
  getTabUserAssistantPairs,
  getTabChatTypeValue,
  getTabLastChatMessageId,
  getTabResponseLoading
} = useSessionState()

// Model configuration management
const { AgentAiModelsOptions, modelsLoading, initModel, checkModelConfig, initModelOptions } = useModelConfiguration()

// State snapshot
const { getCurrentState, restoreState, emitStateChange } = useStateSnapshot(emit)

// Todo functionality
const { currentTodos, shouldShowTodoAfterMessage, getTodosForMessage, markLatestMessageWithTodoUpdate, clearTodoState } = useTodo()

// Host management
const { updateHosts, updateHostsForCommandMode, getCurentTabAssetInfo } = useHostManagement()
// Auto scroll
const { chatContainer, chatResponse, scrollToBottom, initializeAutoScroll, handleTabSwitch } = useAutoScroll()

// Message options management
const { handleOptionSelect, getSelectedOption, handleCustomInputChange, getCustomInput, canSubmitOption, handleOptionSubmit } = useMessageOptions()

// Message management
const {
  markdownRendererRefs,
  sendMessage,
  sendMessageWithContent,
  setMarkdownRendererRef,
  formatParamValue,
  handleFeedback,
  getMessageFeedback,
  isMessageFeedbackSubmitted
} = useChatMessages(scrollToBottom, clearTodoState, markLatestMessageWithTodoUpdate, currentTodos, checkModelConfig)

// Command interactions
const {
  handleApplyCommand,
  handleCopyContent,
  handleRejectContent,
  handleApproveCommand,
  handleApproveAndAutoApprove,
  handleCancel,
  handleResume,
  handleRetry
} = useCommandInteraction({
  getCurentTabAssetInfo,
  markdownRendererRefs,
  currentTodos,
  clearTodoState,
  scrollToBottom
})

const handleInterrupt = () => {
  handleCancel()
}

// Export chat functionality
const { exportChat } = useExportChat()

const handleExportChat = () => {
  exportChat()
}

// Tab management
const { createNewEmptyTab, restoreHistoryTab, handleTabRemove } = useTabManagement({
  getCurentTabAssetInfo,
  emitStateChange,
  isFocusInAiTab,
  toggleSidebar: props.toggleSidebar
})

// Chat history
const {
  historySearchValue,
  showOnlyFavorites,
  isLoadingMore,
  groupedPaginatedHistory,
  hasMoreHistory,
  loadMoreHistory,
  handleIntersection,
  editHistory,
  saveHistoryTitle,
  cancelEdit,
  deleteHistory,
  toggleFavorite,
  refreshHistoryList
} = useChatHistory(createNewEmptyTab)

// i18n
const { t } = i18n.global
const favoriteLabel = computed(() => t('ai.favorite'))

// Event bus listeners
useEventBusListeners({
  sendMessageWithContent,
  initModel,
  getCurentTabAssetInfo,
  updateHosts,
  isAgentMode: props.isAgentMode
})

const goToLogin = () => {
  router.push('/login')
}

const goToModelSettings = () => {
  eventBus.emit('openUserTab', 'userConfig')
  setTimeout(() => {
    eventBus.emit('switchToModelSettingsTab')
  }, 200)
}

// Check if there are available models
const hasAvailableModels = computed(() => {
  if (modelsLoading.value) {
    return true
  }
  return AgentAiModelsOptions.value && AgentAiModelsOptions.value.length > 0
})

watch(
  () => localStorage.getItem('login-skipped'),
  (newValue) => {
    isSkippedLogin.value = newValue === 'true'
  }
)

useWatchers({
  emitStateChange,
  handleTabSwitch,
  updateHostsForCommandMode
})

onMounted(async () => {
  await initModelOptions()

  if (props.savedState && props.savedState.chatTabs && props.savedState.chatTabs.length > 0) {
    restoreState(props.savedState)
  } else if (chatTabs.value.length === 0) {
    await createNewEmptyTab()
  }

  await initModel()

  const messageFeedbacks = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>
  if (currentSession.value) {
    currentSession.value.messageFeedbacks = messageFeedbacks
  }

  initializeAutoScroll()
})

// Expose to parent component
defineExpose({
  getCurrentState,
  restoreState,
  restoreHistoryTab,
  createNewEmptyTab,
  handleTabRemove,
  updateHostsForCommandMode
})
</script>

<style lang="less" scoped>
@import './index.less';
</style>
