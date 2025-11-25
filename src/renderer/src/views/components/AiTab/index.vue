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
      <!-- 只渲染当前激活的 tab 内容，避免重复渲染导致的性能问题 -->
      <template v-if="tab.id === currentChatId">
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
                  :ref="(el) => setMarkdownRendererRef(el, index)"
                  :content="(message.content as MessageContent).question"
                  :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                  :ask="message.ask"
                  :say="message.say"
                  :partial="message.partial"
                  :executed-command="message.executedCommand"
                />
                <MarkdownRenderer
                  v-else
                  :ref="(el) => setMarkdownRendererRef(el, index)"
                  :content="typeof message.content === 'string' ? message.content : ''"
                  :class="`message ${message.role} ${message.say === 'completion_result' ? 'completion-result' : ''} ${message.say === 'interactive_command_notification' ? 'interactive-notification' : ''}`"
                  :ask="message.ask"
                  :say="message.say"
                  :partial="message.partial"
                  :executed-command="message.executedCommand"
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
                  <template v-if="typeof message.content === 'object' && 'options' in message.content && index === filteredChatHistory.length - 1">
                    <div class="options-container">
                      <!-- 显示原有选项作为单选按钮 -->
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
                          <!-- 当选项数量大于1时，添加自定义输入选项 -->
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

                      <!-- 提交按钮 - 选择任何选项后显示 -->
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
                      chatTypeValue === 'agent' &&
                      index === filteredChatHistory.length - 1 &&
                      lastChatMessageId === message.id &&
                      (message.ask === 'command' || message.ask === 'mcp_tool_call') &&
                      !showCancelButton
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
                      chatTypeValue === 'cmd' &&
                      index === filteredChatHistory.length - 1 &&
                      lastChatMessageId === message.id &&
                      message.ask === 'command' &&
                      !showCancelButton
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
                      chatTypeValue === 'cmd' &&
                      index === filteredChatHistory.length - 1 &&
                      lastChatMessageId === message.id &&
                      message.ask === 'mcp_tool_call' &&
                      !showCancelButton
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
              <div
                v-else
                :class="`message ${message.role}`"
              >
                {{ message.content }}
              </div>

              <!-- 动态插入 Todo 显示 -->
              <TodoInlineDisplay
                v-if="shouldShowTodoAfterMessage(message)"
                :todos="getTodosForMessage(message)"
                :show-trigger="message.role === 'assistant' && message.hasTodoUpdate"
                class="todo-inline"
              />
            </template>
          </div>
        </div>
        <div class="bottom-container">
          <div
            v-if="currentTab?.session.showCancelButton"
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
              <div
                ref="hostSelectListRef"
                class="host-select-list"
                @scroll="handleHostListScroll"
              >
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
                  v-if="hostOptionsLoading && filteredHostOptions.length > 0"
                  class="host-select-loading"
                >
                  {{ $t('ai.loading') }}...
                </div>
                <div
                  v-if="filteredHostOptions.length === 0 && !hostOptionsLoading"
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
                v-model:value="chatInputValue"
                :placeholder="
                  chatTypeValue === 'agent' ? $t('ai.agentMessage') : chatTypeValue === 'chat' ? $t('ai.chatMessage') : $t('ai.cmdMessage')
                "
                class="chat-textarea"
                :auto-size="{ minRows: 2, maxRows: 5 }"
                @keydown="handleKeyDown"
                @input="handleInputChange"
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
                      ref="voiceInputRef"
                      :disabled="responseLoading"
                      :auto-send-after-voice="autoSendAfterVoice"
                      @transcription-complete="handleTranscriptionComplete"
                      @transcription-error="handleTranscriptionError"
                    />
                  </a-tooltip>
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
      </template>
    </a-tab-pane>
    <template #rightExtra>
      <div class="right-extra-buttons">
        <a-tooltip :title="$t('ai.newChat')">
          <a-button
            type="text"
            class="action-icon-btn"
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
                      :class="{ 'favorite-header': group.dateLabel === '收藏' }"
                    >
                      <template v-if="group.dateLabel === '收藏'">
                        <StarFilled style="color: #faad14; font-size: 12px" />
                        <span>收藏</span>
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
        <a-tooltip
          v-if="!props.isAgentMode"
          :title="$t('ai.closeAiSidebar')"
        >
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
  <input
    ref="fileInputRef"
    type="file"
    accept=".txt,.md,.js,.ts,.py,.java,.cpp,.c,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,.log,.csv,.tsv"
    style="display: none"
    @change="handleFileSelected"
  />
</template>

<script setup lang="ts">
// ============================================================================
// 导入语句
// ============================================================================

// Vue 核心 API
import { ref, onMounted, defineAsyncComponent, watch } from 'vue'
import { useRouter } from 'vue-router'

// Composables
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
import { useUserInteractions } from './composables/useUserInteractions'
import { useWatchers } from './composables/useWatchers'

// UI 组件
import VoiceInput from './voiceInput.vue'
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  DislikeOutlined,
  EditOutlined,
  HourglassOutlined,
  LaptopOutlined,
  LikeOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons-vue'

// 工具函数
import { isFocusInAiTab } from '@/utils/domUtils'
import { getGlobalState } from '@renderer/agent/storage/state'

// 类型定义
import type { MessageContent } from './types'

// 静态资源
import foldIcon from '@/assets/icons/fold.svg'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'
import sendIcon from '@/assets/icons/send.svg'
import uploadIcon from '@/assets/icons/upload.svg'

// ============================================================================
// 类型定义
// ============================================================================

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

// ============================================================================
// Props 和 Emits
// ============================================================================
interface Props {
  toggleSidebar: () => void
  savedState?: Record<string, any> | null
  isAgentMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  savedState: null
})

const emit = defineEmits(['state-changed'])

// ============================================================================
// 外部依赖初始化
// ============================================================================

const router = useRouter()
const MarkdownRenderer = defineAsyncComponent(() => import('@views/components/AiTab/markdownRenderer.vue'))
const TodoInlineDisplay = defineAsyncComponent(() => import('./components/todo/TodoInlineDisplay.vue'))

// ============================================================================
// 本地响应式状态
// ============================================================================

const isSkippedLogin = ref(localStorage.getItem('login-skipped') === 'true')
const hostSelectListRef = ref<HTMLElement | null>(null)

// ============================================================================
// Composables 初始化
// ============================================================================

// 会话状态管理
const {
  currentChatId,
  chatTabs,
  currentTab,
  currentSession,
  chatTypeValue,
  hosts,
  chatInputValue,
  lastChatMessageId,
  responseLoading,
  showCancelButton,
  chatHistory,
  filteredChatHistory,
  showSendButton,
  buttonsDisabled,
  showResumeButton
} = useSessionState()

// 模型配置管理
const { chatAiModelValue, AgentAiModelsOptions, initModel, handleChatAiModelChange, checkModelConfig, initModelOptions } = useModelConfiguration()

// 状态快照
const { getCurrentState, restoreState, emitStateChange } = useStateSnapshot(chatAiModelValue, emit)

// Todo 功能
const { currentTodos, shouldShowTodoAfterMessage, getTodosForMessage, markLatestMessageWithTodoUpdate, clearTodoState } = useTodo()

// 主机管理
const {
  showHostSelect,
  hostSearchValue,
  hostOptionsLoading,
  hovered,
  keyboardSelectedIndex,
  filteredHostOptions,
  isHostSelected,
  onHostClick,
  removeHost,
  handleHostSearchKeyDown,
  handleMouseOver,
  handleInputChange,
  handleHostListScroll,
  handleAddHostClick,
  updateHosts,
  updateHostsForCommandMode,
  hostSearchInputRef,
  getCurentTabAssetInfo
} = useHostManagement()

// 自动滚动
const { chatContainer, chatResponse, scrollToBottom, initializeAutoScroll, handleTabSwitch } = useAutoScroll()

// 消息选项管理
const { handleOptionSelect, getSelectedOption, handleCustomInputChange, getCustomInput, canSubmitOption, handleOptionSubmit } = useMessageOptions()

// 消息管理
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

// 用户交互
const {
  fileInputRef,
  voiceInputRef,
  autoSendAfterVoice,
  handleTranscriptionComplete,
  handleTranscriptionError,
  handleFileUpload,
  handleFileSelected,
  handleKeyDown,
  handleClose
} = useUserInteractions(sendMessage, props.toggleSidebar)

// 命令交互
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
  clearTodoState
})

// Tab 管理
const { createNewEmptyTab, restoreHistoryTab, handleTabRemove } = useTabManagement({
  getCurentTabAssetInfo,
  emitStateChange,
  handleClose,
  isFocusInAiTab
})

// 聊天历史
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

// 事件总线监听器
useEventBusListeners({
  sendMessageWithContent,
  initModel,
  getCurentTabAssetInfo,
  updateHosts
})

// ============================================================================
// 常量定义
// ============================================================================

const AiTypeOptions = [
  { label: 'Chat', value: 'chat' },
  { label: 'Command', value: 'cmd' },
  { label: 'Agent', value: 'agent' }
]

// ============================================================================
// 辅助函数
// ============================================================================

const goToLogin = () => {
  router.push('/login')
}

// ============================================================================
// Watchers
// ============================================================================

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

// ============================================================================
// 生命周期钩子
// ============================================================================

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

// ============================================================================
// 对外暴露
// ============================================================================

defineExpose({
  getCurrentState,
  restoreState,
  restoreHistoryTab,
  createNewEmptyTab,
  handleTabRemove
})
</script>

<style lang="less" scoped>
@import './index.less';
</style>
