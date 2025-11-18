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
import { ref, onMounted, defineAsyncComponent, onUnmounted, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
const TodoInlineDisplay = defineAsyncComponent(() => import('./components/todo/TodoInlineDisplay.vue'))
import { useTodo } from './composables/useTodo'
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
  CheckCircleOutlined,
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
import type { Todo } from '@/types/todo'
import { createNewMessage, parseMessageContent, formatHosts, isStringContent, getDateLabel } from './utils'
import foldIcon from '@/assets/icons/fold.svg'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'
import sendIcon from '@/assets/icons/send.svg'
import uploadIcon from '@/assets/icons/upload.svg'
import VoiceInput from './voiceInput.vue'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import debounce from 'lodash/debounce'
import i18n from '@/locales'
import { ChatermMessage } from '@/types/ChatermMessage'
import { getUser } from '@api/user/user'
import { ExtensionMessage } from '@shared/ExtensionMessage'

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

// Get message feedback status
const getMessageFeedback = (messageId: string): 'like' | 'dislike' | undefined => {
  return currentTab.value?.session.messageFeedbacks[messageId]
}

// Todo 功能
const { currentTodos, displayPreference, shouldShowTodoAfterMessage, getTodosForMessage, markLatestMessageWithTodoUpdate, clearTodoState } = useTodo()

// 添加调试日志监听
watch(displayPreference, (newPref) => {
  console.log('AiTab - displayPreference changed:', newPref)
})

// Check if message feedback has been submitted
const isMessageFeedbackSubmitted = (messageId: string): boolean => {
  // Check if there are feedback records and they have been submitted
  return !!currentTab.value?.session.messageFeedbacks[messageId]
}

const hostSearchInputRef = ref()
const hostSelectListRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement>()
const voiceInputRef = ref()
const markdownRendererRefs = ref<Array<{ setThinkingLoading: (loading: boolean) => void }>>([])
const showHostSelect = ref(false)
const hostOptions = ref<{ label: string; value: string; uuid: string; connect: string }[]>([])
const hostSearchValue = ref('')
// Pagination state for lazy loading
const hostOptionsOffset = ref(0)
const hostOptionsHasMore = ref(false)
const hostOptionsLoading = ref(false)
const hostOptionsLimit = 30 // Load 30 items per page
const hovered = ref<string | null>(null)
const keyboardSelectedIndex = ref(-1)
const historyList = ref<HistoryItem[]>([])
const favoriteTaskList = ref<string[]>([])
const chatAiModelValue = ref('')

// 选项相关的响应式数据
const messageOptionSelections = ref<Record<string, string>>({}) // 存储每个消息的选项选择
const messageCustomInputs = ref<Record<string, string>>({}) // 存储每个消息的自定义输入内容
const shouldShowSendButton = computed(() => {
  const trimmedValue = chatInputValue.value.trim()
  return trimmedValue.length >= 1 && !/^\s*$/.test(trimmedValue)
})
const isCurrentChatMessage = ref(true)

// Current active conversation ID
const currentChatId = ref<string | undefined>(undefined)
const authTokenInCookie = ref<string | null>(null)

// Session 状态接口定义
interface SessionState {
  chatHistory: ChatMessage[] // 会话消息历史列表
  lastChatMessageId: string // 最后一条聊天消息的ID
  responseLoading: boolean // 当前是否正在加载回复（AI响应中）
  showCancelButton: boolean // 是否显示"取消"按钮
  showRetryButton: boolean // 是否显示"重试"按钮
  showNewTaskButton: boolean // 是否显示"新任务"按钮
  showSendButton: boolean // 是否显示"发送"按钮
  buttonsDisabled: boolean // 是否整体禁用交互按钮
  resumeDisabled: boolean // 是否禁用恢复按钮
  isExecutingCommand: boolean // 是否正在执行命令
  messageFeedbacks: Record<string, 'like' | 'dislike'> // 消息反馈记录（消息ID => 反馈类型）
  lastStreamMessage: ExtensionMessage | null // 最后一条流式消息对象
  lastPartialMessage: ExtensionMessage | null // 最后一条部分回复的消息对象
  shouldStickToBottom: boolean // 是否应该粘在底部（自动滚动）
}

const createEmptySessionState = (): SessionState => ({
  chatHistory: [],
  lastChatMessageId: '',
  responseLoading: false,
  showCancelButton: false,
  showRetryButton: false,
  showNewTaskButton: false,
  showSendButton: true,
  buttonsDisabled: false,
  resumeDisabled: false,
  isExecutingCommand: false,
  messageFeedbacks: {},
  lastStreamMessage: null,
  lastPartialMessage: null,
  shouldStickToBottom: true
})

interface ChatTab {
  id: string // Tab ID，对应一个会话
  title: string // Tab 标题
  hosts: Host[] // 当前会话关联的主机列表
  chatType: string // 聊天类型，agent/cmd/chat
  autoUpdateHost: boolean // 是否根据当前资产自动更新主机
  session: SessionState // 当前会话的消息状态等数据
  inputValue: string // 输入框内容
}

const chatTabs = ref<ChatTab[]>([])

// 通过 computed 属性直接引用 chatTabs 中当前 Tab 的数据，避免手动保存/恢复元数据
const currentTab = computed(() => {
  return chatTabs.value.find((tab) => tab.id === currentChatId.value)
})

// 便捷访问当前 tab 的 session
const currentSession = computed(() => currentTab.value?.session)

// 为模板提供便捷访问当前session状态的computed属性
const lastChatMessageId = computed(() => currentSession.value?.lastChatMessageId ?? '')
const responseLoading = computed(() => currentSession.value?.responseLoading ?? false)
const showCancelButton = computed(() => currentSession.value?.showCancelButton ?? false)
const chatHistory = computed(() => currentSession.value?.chatHistory ?? [])
const showSendButton = computed(() => currentSession.value?.showSendButton ?? true)
const buttonsDisabled = computed(() => currentSession.value?.buttonsDisabled ?? false)
const resumeDisabled = computed(() => currentSession.value?.resumeDisabled ?? false)
const isExecutingCommand = computed(() => currentSession.value?.isExecutingCommand ?? false)
const showRetryButton = computed(() => currentSession.value?.showRetryButton ?? false)
const showNewTaskButton = computed(() => currentSession.value?.showNewTaskButton ?? false)

// 使用 computed 属性配合 getter/setter 来直接操作 chatTabs 中的数据
const currentChatTitle = computed({
  get: () => currentTab.value?.title ?? 'New chat',
  set: (value: string) => {
    if (currentTab.value) {
      currentTab.value.title = value
    }
  }
})

const chatTypeValue = computed({
  get: () => currentTab.value?.chatType ?? '',
  set: (value: string) => {
    if (currentTab.value) {
      currentTab.value.chatType = value
    }
  }
})

const hosts = computed({
  get: () => currentTab.value?.hosts ?? [],
  set: (value: Host[]) => {
    if (currentTab.value) {
      currentTab.value.hosts = value
    }
  }
})

const autoUpdateHost = computed({
  get: () => currentTab.value?.autoUpdateHost ?? true,
  set: (value: boolean) => {
    if (currentTab.value) {
      currentTab.value.autoUpdateHost = value
    }
  }
})

// 每个 tab 独立的输入框内容
const chatInputValue = computed({
  get: () => currentTab.value?.inputValue ?? '',
  set: (value: string) => {
    if (currentTab.value) {
      currentTab.value.inputValue = value
    }
  }
})

let suppressStateChange = false

watch(currentChatId, () => {
  if (!suppressStateChange) {
    emitStateChange()
  }
  // 切换Tab时，重置滚动状态并滚动到底部
  if (currentSession.value) {
    currentSession.value.shouldStickToBottom = true
  }

  // 切换Tab时，需要重新初始化滚动监听器和DOM观察器
  nextTick(() => {
    initializeAutoScroll()
    if (currentSession.value) {
      currentSession.value.shouldStickToBottom = true
    }
    scrollToBottomWithRetry()
  })
})

const attachTabContext = <T extends Record<string, any>>(payload: T): T & { tabId?: string; taskId?: string } => {
  const tabId = currentChatId.value
  if (!tabId) {
    return payload
  }

  return {
    ...payload,
    tabId: payload?.tabId ?? tabId,
    taskId: payload?.taskId ?? tabId
  }
}

// 监听消息变化，检查todo显示逻辑
watch(
  () => currentSession.value?.chatHistory,
  (newHistory) => {
    if (!newHistory) return
    console.log('AiTab - chatHistory changed, length:', newHistory.length)
    if (newHistory.length > 0) {
      const lastMessage = newHistory[newHistory.length - 1]
      console.log('AiTab - last message:', lastMessage)
      console.log('AiTab - shouldShowTodoAfterMessage for last message:', shouldShowTodoAfterMessage(lastMessage))
      console.log('AiTab - getTodosForMessage for last message:', getTodosForMessage(lastMessage))
    }
  },
  { deep: true }
)

// 过滤SSH连接消息：Agent回复后隐藏sshInfo消息
const filteredChatHistory = computed(() => {
  const chatHistory = currentSession.value?.chatHistory ?? []
  const hasAgentReply = chatHistory.some(
    (msg) => msg.role === 'assistant' && msg.say !== 'sshInfo' && (msg.say === 'text' || msg.say === 'completion_result' || msg.ask === 'command')
  )
  return hasAgentReply ? chatHistory.filter((msg) => msg.say !== 'sshInfo') : chatHistory
})

interface Props {
  toggleSidebar: () => void
  savedState?: Record<string, any> | null
  isAgentMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  savedState: null
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

// 格式化 MCP 工具参数值
const formatParamValue = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

// Get current active tab host information
const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
  try {
    // Create a Promise to wait for assetInfoResult event
    const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        eventBus.off('assetInfoResult', handleResult)
        reject(new Error(t('ai.timeoutGettingAssetInfo')))
      }, 5000) // 5 second timeout

      // Listen for result event
      const handleResult = (payload: { assetInfo: AssetInfo | null; tabId?: string } | AssetInfo | null) => {
        const { assetInfo, tabId } =
          payload && typeof payload === 'object' && 'assetInfo' in payload
            ? { assetInfo: payload.assetInfo as AssetInfo | null, tabId: payload.tabId }
            : { assetInfo: (payload as AssetInfo | null) ?? null, tabId: undefined }

        if (tabId && tabId !== currentChatId.value) {
          return
        }

        clearTimeout(timeout)
        eventBus.off('assetInfoResult', handleResult)
        resolve(assetInfo)
      }
      eventBus.on('assetInfoResult', handleResult)
      // Emit request event
      eventBus.emit('getActiveTabAssetInfo', { tabId: currentChatId.value ?? undefined })
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

// Update hosts for command mode - only show current terminal tab IP
const updateHostsForCommandMode = async () => {
  try {
    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo && assetInfo.ip) {
      // Only show host if current tab is a terminal (has IP)
      updateHosts({
        ip: assetInfo.ip,
        uuid: assetInfo.uuid,
        connection: assetInfo.connection || 'personal'
      })
    } else {
      // If current tab is not a terminal, clear hosts
      hosts.value = []
    }
  } catch (error) {
    console.error('Failed to update hosts for command mode:', error)
    hosts.value = []
  }
}

// Initialize asset information
const initAssetInfo = async () => {
  const session = currentSession.value
  if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
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

// 关闭 Tab
const handleTabRemove = async (tabId: string) => {
  const tabIndex = chatTabs.value.findIndex((tab) => tab.id === tabId)
  if (tabIndex === -1) return

  // 取消当前任务
  console.log('handleTabRemove: cancel task for tab', tabId)
  await window.api.cancelTask(tabId)

  // 删除 Tab（session 会随着 tab 一起删除）
  chatTabs.value.splice(tabIndex, 1)

  if (chatTabs.value.length === 0) {
    currentChatId.value = undefined
    emitStateChange()
    handleClose()
    return
  }

  const newActiveIndex = Math.min(tabIndex, chatTabs.value.length - 1)
  const newActiveTab = chatTabs.value[newActiveIndex]

  currentChatId.value = newActiveTab.id
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

// 语音转录完成事件处理
const handleTranscriptionComplete = (transcribedText: string) => {
  // 将转录的文本添加到输入框
  if (chatInputValue.value.trim()) {
    chatInputValue.value = chatInputValue.value + ' ' + transcribedText
  } else {
    chatInputValue.value = transcribedText
  }
  console.log('handleTranscriptionComplete', autoSendAfterVoice.value)
  // 自动发送消息（可选，可以通过设置开关控制）
  if (autoSendAfterVoice.value) {
    nextTick(() => {
      sendMessage('send')
    })
  }
}

// 语音转录错误事件处理
const handleTranscriptionError = (error: string) => {
  console.error('Voice transcription error:', error)
}

// File upload handling methods
const handleFileUpload = () => {
  fileInputRef.value?.click()
}

// Voice input handling methods
// const handleVoiceClick = () => {
//   // Trigger the hidden VoiceInput component's toggle method
//   if (voiceInputRef.value && voiceInputRef.value.toggleVoiceInput) {
//     voiceInputRef.value.toggleVoiceInput()
//   }
// }

const handleFileSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  try {
    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      notification.warning({
        message: t('ai.fileTooLarge'),
        description: t('ai.fileTooLargeDesc'),
        duration: 3
      })
      return
    }

    // Read file content
    const content = await readFileContent(file)

    // Add file content to chat input
    const fileName = file.name
    const fileExtension = fileName.split('.').pop()?.toLowerCase()

    // Format the content based on file type
    let formattedContent = ''
    if (fileExtension === 'json') {
      try {
        const jsonContent = JSON.parse(content)
        formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`json\n${JSON.stringify(jsonContent, null, 2)}\n\`\`\``
      } catch {
        formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`\n${content}\n\`\`\``
      }
    } else if (['md', 'markdown'].includes(fileExtension || '')) {
      formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`markdown\n${content}\n\`\`\``
    } else if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'sh', 'bat', 'ps1'].includes(fileExtension || '')) {
      formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`${fileExtension}\n${content}\n\`\`\``
    } else {
      formattedContent = `${t('ai.fileContent', { fileName })}:\n\`\`\`\n${content}\n\`\`\``
    }

    // Add to existing input or replace if empty
    if (chatInputValue.value.trim()) {
      chatInputValue.value = chatInputValue.value + '\n\n' + formattedContent
    } else {
      chatInputValue.value = formattedContent
    }

    // Show success notification
    notification.success({
      message: t('ai.fileUploadSuccess'),
      description: t('ai.fileUploadSuccessDesc', { fileName }),
      duration: 2
    })
  } catch (error) {
    console.error('File read error:', error)
    notification.error({
      message: t('ai.fileReadFailed'),
      description: t('ai.fileReadErrorDesc'),
      duration: 3
    })
  } finally {
    // Reset file input
    if (target) {
      target.value = ''
    }
  }
}

const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target?.result as string
      resolve(content)
    }

    reader.onerror = () => {
      reject(new Error(t('ai.fileReadFailed')))
    }

    reader.readAsText(file, 'utf-8')
  })
}

// 设置 MarkdownRenderer 组件的 ref
const setMarkdownRendererRef = (el: any, index: number) => {
  if (el) {
    markdownRendererRefs.value[index] = el
  }
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
      message: t('ai.sendContentError'),
      description: t('ai.sendContentEmpty'),
      duration: 3
    })
    return 'SEND_ERROR'
  }
  const userContent = chatInputValue.value.trim()
  if (!userContent) return
  chatInputValue.value = ''
  // Check if current active host exists
  if (hosts.value.length === 0 && chatTypeValue.value !== 'chat') {
    notification.error({
      message: t('ai.getAssetInfoFailed'),
      description: t('ai.pleaseConnectAsset'),
      duration: 3
    })
    return 'ASSET_ERROR'
  }
  if (sendType === 'send' && currentTodos.value.length > 0) {
    if (currentSession.value) {
      clearTodoState(currentSession.value.chatHistory)
    }
  }

  return await sendMessageWithContent(userContent, sendType)
}

const sendMessageWithContent = async (userContent: string, sendType: string, tabId?: string) => {
  const targetTab = tabId ? chatTabs.value.find((tab) => tab.id === tabId) : currentTab.value

  if (!targetTab || !targetTab.session) {
    return
  }

  const session = targetTab.session

  await sendMessageToMain(userContent, sendType, tabId)

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

  session.chatHistory.push(userMessage)
  session.responseLoading = true
  session.showRetryButton = false
  session.showNewTaskButton = false

  if (!tabId || tabId === currentChatId.value) {
    scrollToBottom(true)
  }

  return
}

const handleClose = () => {
  props.toggleSidebar()
  eventBus.emit('updateRightIcon', false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  // Check if it's an input method confirmation key
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    // 检查输入内容是否为空
    if (!chatInputValue.value.trim()) {
      return
    }

    sendMessage('send')
  }
}
const createNewEmptyTab = async () => {
  const newChatId = uuidv4()

  // Use default values first for immediate UI response
  const defaultHosts: Host[] = [
    {
      host: '127.0.0.1',
      uuid: 'localhost',
      connection: 'localhost'
    }
  ]

  // Create tab immediately with default values
  const newTab: ChatTab = {
    id: newChatId,
    title: 'New chat',
    hosts: defaultHosts,
    chatType: 'agent', // Default to 'agent', will update if needed
    autoUpdateHost: true,
    session: createEmptySessionState(),
    inputValue: ''
  }
  chatTabs.value.push(newTab)
  currentChatId.value = newChatId
  chatInputValue.value = ''

  // Update settings and hosts asynchronously after UI is shown
  Promise.all([getGlobalState('chatSettings').catch(() => ({ mode: 'agent' })), getCurentTabAssetInfo().catch(() => null)])
    .then(([chatSetting, assetInfo]) => {
      const newChatType = (chatSetting as { mode?: string })?.mode || 'agent'
      const newHosts: Host[] = []

      if (assetInfo && assetInfo.ip) {
        newHosts.push({
          host: assetInfo.ip,
          uuid: assetInfo.uuid,
          connection: assetInfo.connection ? assetInfo.connection : 'personal'
        })
      } else {
        newHosts.push({
          host: '127.0.0.1',
          uuid: 'localhost',
          connection: 'localhost'
        })
      }

      // Update the tab with correct values
      const tabIndex = chatTabs.value.findIndex((tab) => tab.id === newChatId)
      if (tabIndex !== -1) {
        chatTabs.value[tabIndex].chatType = newChatType
        chatTabs.value[tabIndex].hosts = newHosts
      }
    })
    .catch((error) => {
      console.error('Failed to update new tab settings:', error)
    })
}

const restoreHistoryTab = async (history: HistoryItem) => {
  try {
    // 1. 首先检查 Tab 是否已存在，如果存在则直接切换，无需重新加载
    const existingTabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
    if (existingTabIndex !== -1) {
      currentChatId.value = history.id
      return
    }

    // 加载元数据（hosts等）
    let loadedHosts: Host[] = []
    try {
      const metadataResult = await window.api.getTaskMetadata(history.id)
      if (metadataResult.success && metadataResult.data && Array.isArray(metadataResult.data.hosts)) {
        loadedHosts = metadataResult.data.hosts.map((item: Host) => ({
          host: item.host,
          uuid: item.uuid || '',
          connection: item.connection
        }))
      }
    } catch (e) {
      console.error('Failed to get metadata:', e)
    }

    // 加载历史消息
    const result = await window.api.chatermGetChatermMessages({
      taskId: history.id
    })
    const conversationHistory = result as ChatermMessage[]
    console.log('[conversationHistory]', conversationHistory)

    // 3. 将历史消息转换为 ChatMessage 格式，存储到临时数组中
    const historyChatMessages: ChatMessage[] = []
    let lastItem: any = null
    conversationHistory.forEach((item, index) => {
      // Check if duplicate with previous item
      const isDuplicate =
        lastItem && item.text === lastItem.text && item.ask === lastItem.ask && item.say === lastItem.say && item.type === lastItem.type

      if (
        !isDuplicate &&
        (item.ask === 'followup' ||
          item.ask === 'command' ||
          item.ask === 'mcp_tool_call' ||
          item.say === 'command' ||
          item.say === 'command_output' ||
          item.say === 'completion_result' ||
          item.say === 'search_result' ||
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
        // 添加 MCP 工具调用信息
        if (item.mcpToolCall) {
          userMessage.mcpToolCall = item.mcpToolCall
        }
        if (userMessage.say === 'user_feedback' && isStringContent(userMessage.content) && userMessage.content.startsWith('Terminal output:')) {
          userMessage.say = 'command_output'
          userMessage.role = 'assistant'
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
        historyChatMessages.push(userMessage)
        lastItem = item
      }
    })

    // 4. 创建历史会话状态
    const historySession: SessionState = {
      chatHistory: historyChatMessages,
      lastChatMessageId: '',
      responseLoading: false,
      showCancelButton: false,
      showRetryButton: false,
      showNewTaskButton: false,
      showSendButton: true,
      buttonsDisabled: false,
      resumeDisabled: false,
      isExecutingCommand: false,
      messageFeedbacks: {},
      lastStreamMessage: null,
      lastPartialMessage: null,
      shouldStickToBottom: true
    }

    // 5. 创建历史 Tab 对象
    const finalHosts = loadedHosts.length > 0 ? loadedHosts : (currentTab.value?.hosts ?? [])
    const historyTab: ChatTab = {
      id: history.id,
      title: history.chatTitle,
      hosts: finalHosts,
      chatType: history.chatType,
      autoUpdateHost: false,
      session: historySession,
      inputValue: ''
    }

    // 6. 如果当前 Tab 是 new Tab，直接覆盖；否则创建新 Tab
    const isCurrentNewTab = currentTab.value && currentTab.value.title === 'New chat' && currentTab.value.session.chatHistory.length === 0
    if (isCurrentNewTab) {
      const currentTabIndex = chatTabs.value.findIndex((tab) => tab.id === currentTab.value!.id)
      if (currentTabIndex !== -1) {
        chatTabs.value[currentTabIndex] = historyTab
      }
    } else {
      chatTabs.value.push(historyTab)
    }
    currentChatId.value = history.id

    // 7. 加载反馈数据
    await window.api.sendToMain({
      type: 'showTaskWithId',
      text: history.id,
      hosts: finalHosts.map((h) => ({
        host: h.host,
        uuid: h.uuid,
        connection: h.connection
      }))
    })
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
        chatTitle: task?.chatTitle || task?.task || `${chatTypeValue.value} Chat`,
        chatType: chatTypeValue.value,
        chatContent: [],
        isFavorite: favorites.includes(task.id),
        ts: task.ts
      }))

    // Batch update history list
    historyList.value = historyItems
  } catch (err) {
    console.error('Failed to get conversation list:', err)
  }
}

const handleMessageOperation = async (operation: 'copy' | 'apply') => {
  const session = currentSession.value
  if (!session) return

  const lastMessage = session.chatHistory.at(-1)
  if (!lastMessage) {
    notification.error({
      message: t('ai.operationFailed'),
      description: t('ai.noOperableMessage'),
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

  // Record executed command for command execution
  if (operation === 'apply' && content) {
    lastMessage.executedCommand = content
  }

  // In the command mode, check whether the current window matches the target server.
  if (chatTypeValue.value === 'cmd' && hosts.value.length > 0) {
    const targetHost = hosts.value[0] // The command mode only supports a single host.

    const currentAssetInfo = await getCurentTabAssetInfo()

    // Check whether the current window matches the target server
    if (!currentAssetInfo || currentAssetInfo.ip !== targetHost.host) {
      notification.warning({
        message: t('ai.cannotExecuteCommand'),
        description: t('ai.wrongServerWindow', {
          targetServer: targetHost.host,
          currentWindow: currentAssetInfo?.ip || t('ai.nonTerminalWindow')
        }),
        duration: 5,
        placement: 'topRight'
      })
      return
    }
  }

  if (operation === 'copy') {
    eventBus.emit('executeTerminalCommand', { command: content, tabId: currentChatId.value ?? undefined })
  } else if (operation === 'apply') {
    eventBus.emit('executeTerminalCommand', { command: content + '\n', tabId: currentChatId.value ?? undefined })
    session.responseLoading = true
  }
  session.lastChatMessageId = ''
}

const handleApplyCommand = () => handleMessageOperation('apply')
const handleCopyContent = () => handleMessageOperation('copy')

// Todo 相关处理方法已移除 - 不再支持关闭功能
const handleRejectContent = async () => {
  const session = currentSession.value
  if (!session) return false

  let message = session.chatHistory.at(-1)
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
      case 'mcp_tool_call':
        messageRsp.askResponse = 'noButtonClicked'
        break
    }
    message.action = 'rejected'
    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    session.buttonsDisabled = true
    console.log('Main process response:', response)
    session.responseLoading = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

const handleOptionChoose = async (message: ChatMessage, option?: string) => {
  const session = currentSession.value
  if (!session) return

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
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    console.log('Main process response:', response)
    session.responseLoading = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

// 新的选项处理方法
const getSelectedOption = (message: ChatMessage): string => {
  return messageOptionSelections.value[message.id] || ''
}

const handleOptionSelect = (message: ChatMessage, value: string) => {
  messageOptionSelections.value[message.id] = value
}

const getCustomInput = (message: ChatMessage): string => {
  return messageCustomInputs.value[message.id] || ''
}

const handleCustomInputChange = (message: ChatMessage, value: string) => {
  messageCustomInputs.value[message.id] = value
}

const canSubmitOption = (message: ChatMessage): boolean => {
  const selectedOption = getSelectedOption(message)
  if (!selectedOption) return false

  if (selectedOption === '__custom__') {
    const customInput = getCustomInput(message)
    return customInput.trim().length > 0
  }

  return true
}

const handleOptionSubmit = async (message: ChatMessage) => {
  const selectedOption = getSelectedOption(message)
  let finalOption = selectedOption

  if (selectedOption === '__custom__') {
    finalOption = getCustomInput(message)
  }

  // 调用原有的选项处理逻辑
  await handleOptionChoose(message, finalOption)
}

const handleApproveCommand = async () => {
  const session = currentSession.value
  if (!session) return false

  let message = session.chatHistory.at(-1)
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
      case 'mcp_tool_call':
        messageRsp.askResponse = 'yesButtonClicked'
        break
    }
    message.action = 'approved'

    if (message.ask === 'command') {
      session.isExecutingCommand = true
    }

    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    session.buttonsDisabled = true
    console.log('Main process response:', response)
    session.responseLoading = true
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

const handleApproveAndAutoApprove = async () => {
  const session = currentSession.value
  if (!session) return false

  let message = session.chatHistory.at(-1)
  if (!message) {
    return false
  }

  // 只有 mcp_tool_call 类型的消息才能使用此功能
  if (message.ask !== 'mcp_tool_call' || !message.mcpToolCall) {
    return false
  }

  try {
    const { serverName, toolName } = message.mcpToolCall

    // 1. 首先设置工具为自动批准
    await window.api.setMcpToolAutoApprove(serverName, toolName, true)
    console.log(`Set auto-approve for ${serverName}/${toolName}`)

    // 2. 然后批准当前调用
    let messageRsp = {
      type: 'askResponse',
      askResponse: 'yesButtonClicked',
      text: ''
    }
    message.action = 'approved'

    console.log('Send message to main process:', messageRsp)
    const response = await window.api.sendToMain(attachTabContext(messageRsp))
    session.buttonsDisabled = true
    console.log('Main process response:', response)
    session.responseLoading = true
  } catch (error) {
    console.error('Failed to approve and set auto-approve:', error)
  }
}

const handleCancel = async () => {
  console.log('handleCancel: cancel')

  const session = currentSession.value
  if (!session) return

  // 立即更新UI状态，实现即时响应
  session.responseLoading = false
  session.showCancelButton = false
  session.showSendButton = true
  session.lastChatMessageId = ''
  const wasExecutingCommand = session.isExecutingCommand
  session.isExecutingCommand = false

  // 停止最后一个消息的 thinking loading 状态
  const lastMessageIndex = filteredChatHistory.value.length - 1
  if (lastMessageIndex >= 0 && markdownRendererRefs.value[lastMessageIndex]) {
    markdownRendererRefs.value[lastMessageIndex].setThinkingLoading(false)
  }

  // 清理Todo状态
  if (currentTodos.value.length > 0) {
    clearTodoState(session.chatHistory)
  }

  // 异步发送取消请求到主进程，不等待响应
  try {
    if (wasExecutingCommand) {
      // 对于执行中的命令，使用优雅取消
      window.api
        .gracefulCancelTask(currentChatId.value ?? undefined)
        .then((response) => {
          console.log('Main process graceful cancel response:', response)
        })
        .catch((error) => {
          console.error('Graceful cancel failed:', error)
        })
    } else {
      // 对于非命令操作，使用常规取消
      window.api
        .cancelTask(currentChatId.value ?? undefined)
        .then((response) => {
          console.log('Main process cancel response:', response)
        })
        .catch((error) => {
          console.error('Cancel task failed:', error)
        })
    }
  } catch (error) {
    console.error('Failed to send cancel request:', error)
  }
}

const handleResume = async () => {
  const session = currentSession.value
  if (!session) return false

  let message = session.chatHistory.at(-1)
  if (!message) {
    return false
  }
  console.log('handleResume: resume')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(attachTabContext(messageRsp))
  console.log('Main process response:', response)
  session.resumeDisabled = true
  session.responseLoading = true
}

const handleRetry = async () => {
  const session = currentSession.value
  if (!session) return

  console.log('handleRetry: retry')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(attachTabContext(messageRsp))
  console.log('Main process response:', response)
  session.showRetryButton = false
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

      // When switching to command mode, update hosts to show only current terminal tab IP
      if (newValue === 'cmd') {
        await updateHostsForCommandMode()
      }

      // Emit state change event
      if (!suppressStateChange) {
        emitStateChange()
      }
    } catch (error) {
      console.error('Failed to update chatSettings:', error)
    }
  }
)
watch(
  () => hosts.value,
  () => {
    if (!suppressStateChange) {
      emitStateChange()
    }
  },
  { deep: true }
)
watch(chatInputValue, () => {
  if (!suppressStateChange) {
    emitStateChange()
  }
})
watch(chatAiModelValue, () => {
  if (!suppressStateChange) {
    emitStateChange()
  }
})

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

// Global click outside listener to close host select popup
const handleGlobalClick = (e: MouseEvent) => {
  if (!showHostSelect.value) return

  const target = e.target as HTMLElement
  const hostSelectPopup = document.querySelector('.host-select-popup')
  const hostTag = document.querySelector('.hosts-display-container-host-tag')

  // Check if click is outside the host select popup and host tag
  if (hostSelectPopup && !hostSelectPopup.contains(target) && hostTag && !hostTag.contains(target)) {
    closeHostSelect()
  }
}

onMounted(async () => {
  // Add global ESC key listener
  document.addEventListener('keydown', handleGlobalEscKey)
  // Add global click listener to close host select popup when clicking outside
  document.addEventListener('click', handleGlobalClick)

  eventBus.on('sendMessageToAi', async (payload: { content: string; tabId?: string }) => {
    const { content, tabId } = payload

    if (!content || content.trim() === '') {
      return
    }

    if (tabId) {
      const targetTab = chatTabs.value.find((tab) => tab.id === tabId)
      if (!targetTab) {
        console.warn('sendMessageToAi: Tab not found:', tabId)
        return
      }
    }

    await initAssetInfo()

    await sendMessageWithContent(content.trim(), 'commandSend', tabId)
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
  authTokenInCookie.value = localStorage.getItem('ctm-token')

  // Check if there's saved state with multi-tab data
  if (props.savedState && props.savedState.chatTabs && props.savedState.chatTabs.length > 0) {
    // Restore all tabs from saved state
    chatTabs.value = props.savedState.chatTabs.map((savedTab: any) => ({
      id: savedTab.id,
      title: savedTab.title,
      hosts: [...savedTab.hosts],
      chatType: savedTab.chatType,
      autoUpdateHost: savedTab.autoUpdateHost,
      inputValue: savedTab.inputValue,
      session: {
        ...createEmptySessionState(),
        chatHistory: [...savedTab.session.chatHistory],
        lastChatMessageId: savedTab.session.lastChatMessageId,
        responseLoading: savedTab.session.responseLoading || false,
        showCancelButton: savedTab.session.showCancelButton || false,
        showSendButton: savedTab.session.showSendButton ?? true,
        buttonsDisabled: savedTab.session.buttonsDisabled || false,
        resumeDisabled: savedTab.session.resumeDisabled || false,
        isExecutingCommand: savedTab.session.isExecutingCommand || false,
        showRetryButton: savedTab.session.showRetryButton || false,
        showNewTaskButton: savedTab.session.showNewTaskButton || false,
        messageFeedbacks: savedTab.session.messageFeedbacks || {},
        shouldStickToBottom: savedTab.session.shouldStickToBottom ?? true
      }
    }))

    // Restore current active tab
    const savedCurrentChatId = props.savedState.currentChatId
    if (savedCurrentChatId && chatTabs.value.some((tab) => tab.id === savedCurrentChatId)) {
      currentChatId.value = savedCurrentChatId
    } else if (chatTabs.value.length > 0) {
      currentChatId.value = chatTabs.value[0].id
    }

    // Restore global AI model setting
    if (props.savedState.chatAiModelValue) {
      chatAiModelValue.value = props.savedState.chatAiModelValue
    }
  } else {
    createNewEmptyTab()
  }

  await initModel()

  // Initialize favorites list
  favoriteTaskList.value = ((await getGlobalState('favoriteTaskList')) as string[]) || []

  // Load message feedback
  const messageFeedbacks = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>
  if (currentSession.value) {
    currentSession.value.messageFeedbacks = messageFeedbacks
  }

  // Add event listeners
  eventBus.on('SettingModelOptionsChanged', async () => {
    await initModel()
  })

  // Listen for tab changes
  eventBus.on('activeTabChanged', async (tabInfo) => {
    const session = currentSession.value
    if (!autoUpdateHost.value || (session && session.chatHistory.length > 0)) {
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

  // Initialize auto-scroll functionality
  initializeAutoScroll()

  const processMainMessage = async (message: ExtensionMessage) => {
    const targetTabId = message?.tabId ?? message?.taskId
    if (!targetTabId) {
      console.error('AiTab: Ignoring message for no target tab:', message.type)
      return
    }

    // 获取目标 tab
    const targetTab = chatTabs.value.find((tab) => tab.id === targetTabId)
    if (!targetTab) {
      console.warn('AiTab: Ignoring message for deleted tab:', targetTabId)
      return
    }

    console.log('Received main process message:', message.type, message)

    const session = targetTab.session
    const isActiveTab = targetTabId === currentChatId.value
    const previousMainMessage = session.lastStreamMessage
    const previousPartialMessage = session.lastPartialMessage

    if (message?.type === 'partialMessage') {
      const partial = message.partialMessage
      if (!partial) {
        return
      }

      if (partial.type === 'ask' && partial.ask === 'completion_result') {
        session.showNewTaskButton = true
        session.responseLoading = false
        session.showCancelButton = false
        return
      } else {
        session.showNewTaskButton = false
      }

      if (partial.say === 'interactive_command_notification') {
        handleInteractiveCommandNotification(message, targetTab)
        return
      }

      if (partial.type === 'ask' && (partial.ask === 'api_req_failed' || partial.ask === 'ssh_con_failed')) {
        handleModelApiReqFailed(message, targetTab)
        return
      }

      session.showRetryButton = false
      session.showSendButton = false
      session.showCancelButton = true
      const lastMessageInChat = session.chatHistory.at(-1)

      const openNewMessage =
        (previousMainMessage?.type === 'state' && !previousPartialMessage?.partialMessage?.partial) ||
        lastMessageInChat?.role === 'user' ||
        !previousMainMessage ||
        previousPartialMessage?.partialMessage?.ts !== partial.ts

      if (previousPartialMessage && JSON.stringify(previousPartialMessage) === JSON.stringify(message)) {
        return
      }

      if (isActiveTab) {
        isCurrentChatMessage.value = true
      }

      if (openNewMessage) {
        const newAssistantMessage = createNewMessage(
          'assistant',
          partial.text ?? '',
          partial.type ?? '',
          partial.type === 'ask' ? (partial.ask ?? '') : '',
          partial.type === 'say' ? (partial.say ?? '') : '',
          partial.ts ?? 0,
          partial.partial
        )

        if (!partial.partial && partial.type === 'ask' && partial.text) {
          newAssistantMessage.content = parseMessageContent(partial.text)
        }

        if (partial.mcpToolCall) {
          newAssistantMessage.mcpToolCall = partial.mcpToolCall
        }

        if (partial.type === 'say' && partial.say === 'command') {
          session.isExecutingCommand = true
        }

        session.lastChatMessageId = newAssistantMessage.id
        cleanupPartialCommandMessages(session.chatHistory)
        session.chatHistory.push(newAssistantMessage)
      } else if (lastMessageInChat && lastMessageInChat.role === 'assistant') {
        lastMessageInChat.content = partial.text ?? ''
        lastMessageInChat.type = partial.type ?? ''
        lastMessageInChat.ask = partial.type === 'ask' ? (partial.ask ?? '') : ''
        lastMessageInChat.say = partial.type === 'say' ? (partial.say ?? '') : ''
        lastMessageInChat.partial = partial.partial

        if (partial.mcpToolCall) {
          lastMessageInChat.mcpToolCall = partial.mcpToolCall
        }

        if (!partial.partial && partial.type === 'ask' && partial.text) {
          lastMessageInChat.content = parseMessageContent(partial.text)
        }

        if (partial.type === 'say' && partial.say === 'command_output' && !partial.partial) {
          session.isExecutingCommand = false
        }
      }

      session.lastPartialMessage = message
      if (!partial.partial) {
        session.showSendButton = true
        session.showCancelButton = false

        if ((partial.type === 'ask' && partial.ask === 'command') || partial.say === 'command_blocked') {
          session.responseLoading = false
        }
      }
    } else if (message?.type === 'state') {
      const chatermMessages = message.state?.chatermMessages ?? []
      const lastStateChatermMessages = chatermMessages.at(-1)
      if (
        chatermMessages.length > 0 &&
        lastStateChatermMessages?.partial != undefined &&
        !lastStateChatermMessages.partial &&
        session.responseLoading
      ) {
        session.responseLoading = false
      }
    } else if (message?.type === 'todoUpdated') {
      console.log('AiTab: Received todoUpdated message', message)

      if (Array.isArray(message.todos) && message.todos.length > 0) {
        markLatestMessageWithTodoUpdate(session.chatHistory, message.todos as Todo[])
      } else {
        clearTodoState(session.chatHistory)
      }
    } else if (message?.type === 'chatTitleGenerated') {
      console.log('AiTab: Received chatTitleGenerated message', message)

      if (message.chatTitle && message.taskId) {
        // 直接更新 tab 的标题
        targetTab.title = message.chatTitle
        console.log('Updated chat title to:', message.chatTitle)
      }
    }

    session.lastStreamMessage = message
  }

  removeListener = window.api.onMainMessage((message: any) => {
    processMainMessage(message).catch((error) => {
      console.error('Failed to process main process message:', error)
    })
  })
})

const handleModelApiReqFailed = (message: any, targetTab: ChatTab) => {
  const session = targetTab.session
  const newAssistantMessage = createNewMessage(
    'assistant',
    message.partialMessage.text,
    message.partialMessage.type,
    message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
    message.partialMessage.type === 'say' ? message.partialMessage.say : '',
    message.partialMessage.ts,
    false
  )
  // 在添加新消息前，清理partial command消息
  cleanupPartialCommandMessages(session.chatHistory)
  session.chatHistory.push(newAssistantMessage)
  console.log('showRetryButton for tab', targetTab.id)
  session.showRetryButton = true
  session.responseLoading = false
}

const handleInteractiveCommandNotification = (message: any, targetTab: ChatTab) => {
  console.log('Processing interactive_command_notification:', message)

  const session = targetTab.session
  const notificationMessage = createNewMessage(
    'assistant',
    message.partialMessage.text,
    message.partialMessage.type,
    message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
    message.partialMessage.type === 'say' ? message.partialMessage.say : '',
    message.partialMessage.ts,
    false
  )

  // 在添加新消息前，清理partial command消息
  cleanupPartialCommandMessages(session.chatHistory)
  session.chatHistory.push(notificationMessage)

  console.log('Interactive command notification processed and added to chat history')
}

// 清理partial command消息：在新增消息时主动删除上一个partial=true的command消息
const cleanupPartialCommandMessages = (chatHistory: ChatMessage[]) => {
  // 倒序查找并删除partial=true且ask='command'的消息
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const message = chatHistory[i]
    if (message.role === 'assistant' && message.partial === true && message.type === 'ask' && message.ask === 'command') {
      console.log('🗑️ Removing partial command message:', message.id, 'with timestamp:', message.ts)
      chatHistory.splice(i, 1)
      break // 只删除最后一个partial command消息
    }
  }
}

onUnmounted(() => {
  if (typeof removeListener === 'function') {
    removeListener()
    removeListener = null
  }
  document.removeEventListener('keydown', handleGlobalEscKey)
  document.removeEventListener('click', handleGlobalClick)
  eventBus.off('apiProviderChanged')
  eventBus.off('activeTabChanged')
  eventBus.off('chatToAi')
  eventBus.off('sendMessageToAi')

  // Clean up auto-scroll
  const container = getElement(chatContainer.value)
  container?.removeEventListener('scroll', handleContainerScroll)

  if (domObserver.value) {
    try {
      domObserver.value.disconnect()
    } catch {}
    domObserver.value = null
  }
})

// 判断是否为本地主机
const isLocalHost = (ip: string): boolean => {
  return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1'
}

// Update cwd for all hosts with timeout protection
const updateCwdForAllHosts = async () => {
  if (hosts.value.length > 0) {
    const updatePromises = hosts.value.map((host) => {
      // 如果是本地主机，直接获取当前工作目录
      if (isLocalHost(host.host)) {
        return (async () => {
          try {
            // 通过API获取本地主机当前工作目录
            const result = await window.api.getLocalWorkingDirectory?.()
            if (result && result.success) {
              currentCwdStore.updateCwd(host.host, result.cwd)
            }
          } catch (error) {
            console.error('Failed to get local working directory:', error)
            // 即使失败也继续
          }
        })()
      }

      // 对于远程主机，使用原有的事件总线机制
      return new Promise<void>((resolve) => {
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
const sendMessageToMain = async (userContent: string, sendType: string, tabId?: string) => {
  try {
    const targetTab = tabId ? chatTabs.value.find((tab) => tab.id === tabId) : currentTab.value

    if (!targetTab || !targetTab.session) {
      return
    }

    const session = targetTab.session
    const targetHosts = targetTab.hosts

    await updateCwdForAllHosts()

    const filteredCwd = new Map()
    targetHosts.forEach((h) => {
      if (h.host && currentCwd.value[h.host]) {
        filteredCwd.set(h.host, currentCwd.value[h.host])
      }
    })
    const hostsArray = targetHosts.map((h) => ({
      host: h.host,
      uuid: h.uuid,
      connection: h.connection
    }))

    let message
    if (session.isExecutingCommand && session.chatHistory.length > 0) {
      message = {
        type: 'interactiveCommandInput',
        input: userContent
      }
      console.log('Sending interactive command input:', userContent)
    } else if (session.chatHistory.length === 0) {
      message = {
        type: 'newTask',
        askResponse: 'messageResponse',
        text: userContent,
        terminalOutput: '',
        hosts: hostsArray,
        cwd: filteredCwd,
        taskId: tabId || currentChatId.value
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

    const messageWithTabId = {
      ...message,
      tabId: tabId || currentChatId.value,
      taskId: tabId || currentChatId.value
    }
    console.log('Send message to main process:', messageWithTabId)
    const response = await window.api.sendToMain(messageWithTabId)
    console.log('Main process response:', response)
  } catch (error) {
    console.error('Failed to send message to main process:', error)
  }
}

// Watch chatHistory changes
// watch(
//   () => currentSession.value?.chatHistory,
//   () => {
//     scrollToBottom()
//   },
//   { deep: true }
// )

// Watch chatHistory length changes to enable buttons
watch(
  () => currentSession.value?.chatHistory.length,
  () => {
    // console.log('watch  chatHistory.length')
    const session = currentSession.value
    if (session) {
      session.buttonsDisabled = false
      session.resumeDisabled = false
    }
  }
)

const filteredHostOptions = computed(() => {
  if (chatTypeValue.value === 'cmd') {
    // In command mode, host options are already filtered by fetchHostOptionsForCommandMode
    return hostOptions.value
  } else {
    // In agent mode, filter by search value
    return hostOptions.value.filter((item) => item.label.includes(hostSearchValue.value))
  }
})

const isHostSelected = (hostOption: any) => {
  return hosts.value.some((h) => h.host === hostOption.label)
}
const onHostClick = (item: any) => {
  const newHost = {
    host: item.label,
    uuid: item.uuid,
    connection: item.isLocalHost ? 'localhost' : item.connection || item.connect
  }

  if (chatTypeValue.value === 'cmd') {
    hosts.value = [newHost]
  } else {
    // Check if already selected
    const existingIndex = hosts.value.findIndex((h) => h.host === item.label)
    if (existingIndex > -1) {
      hosts.value = hosts.value.filter((_, i) => i !== existingIndex)
    } else {
      // In agent mode, if selecting a non-localhost host, remove 127.0.0.1 automatically
      let updatedHosts = [...hosts.value]
      if (!item.isLocalHost && item.label !== '127.0.0.1') {
        updatedHosts = updatedHosts.filter((h) => h.host !== '127.0.0.1')
      }
      hosts.value = [...updatedHosts, newHost]
    }
  }
  autoUpdateHost.value = false
  // showHostSelect.value = false
  chatInputValue.value = ''
}

// Remove specified host
const removeHost = (hostToRemove: Host) => {
  const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
  if (index > -1) {
    // 创建新数组以触发 computed setter
    hosts.value = hosts.value.filter((_, i) => i !== index)
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
  const value = (e.target as HTMLTextAreaElement).value
  if (value === '@') {
    // Disable @ host list feature in command mode and chat mode
    if (chatTypeValue.value === 'cmd' || chatTypeValue.value === 'chat') {
      showHostSelect.value = false
      return
    }

    showHostSelect.value = true
    hostSearchValue.value = '' // Clear search box
    // Reset pagination when opening host select
    hostOptionsOffset.value = 0
    hostOptionsHasMore.value = false

    // In agent mode, show all hosts
    await fetchHostOptions('', true)

    nextTick(() => {
      hostSearchInputRef.value?.focus?.()
    })
  } else {
    showHostSelect.value = false
  }
}

// 3. Get host list
const debouncedFetchHostOptions = debounce((search: string) => {
  if (chatTypeValue.value === 'cmd') {
    fetchHostOptionsForCommandMode(search)
  } else {
    // Reset pagination when searching
    hostOptionsOffset.value = 0
    hostOptionsHasMore.value = false
    fetchHostOptions(search, true)
  }
}, 300)

// Handle scroll event for lazy loading
const handleHostListScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (!target) return

  // Load more when scrolled to within 50px of bottom
  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight
  if (scrollBottom < 50 && hostOptionsHasMore.value && !hostOptionsLoading.value) {
    loadMoreHosts()
  }
}

watch(hostSearchValue, (newVal) => {
  keyboardSelectedIndex.value = -1
  debouncedFetchHostOptions(newVal)
})
const fetchHostOptions = async (search: string, reset: boolean = true) => {
  if (hostOptionsLoading.value) return

  hostOptionsLoading.value = true
  try {
    const offset = reset ? 0 : hostOptionsOffset.value
    const result = await window.api.getUserHosts(search, hostOptionsLimit, offset)

    if (!result || !result.data) {
      hostOptions.value = []
      hostOptionsHasMore.value = false
      return
    }

    let formatted = formatHosts(result.data || [])

    // Add localhost option at the beginning (only on first load or reset)
    if (reset || hostOptions.value.length === 0) {
      const localHostOption = {
        label: '127.0.0.1',
        value: 'localhost',
        uuid: 'localhost',
        connect: 'localhost',
        title: t('ai.localhost'),
        isLocalHost: true
      }

      // Show localhost if search is empty or matches localhost
      const shouldShowLocalHost =
        !search || 'localhost'.includes(search.toLowerCase()) || '127.0.0.1'.includes(search) || t('ai.localhost').includes(search)

      if (shouldShowLocalHost) {
        formatted.unshift(localHostOption)
      }
    }

    if (reset) {
      hostOptions.value = formatted
      // Offset should only count backend results, not localhost
      const backendResultCount = result.data?.length || 0
      hostOptionsOffset.value = backendResultCount
    } else {
      // Append new items, avoiding duplicates
      const existingHosts = new Set(hostOptions.value.map((h) => h.uuid))
      const newItems = formatted.filter((h) => !existingHosts.has(h.uuid))
      hostOptions.value = [...hostOptions.value, ...newItems]
      // Offset should only count backend results, not localhost
      const backendResultCount = result.data?.length || 0
      hostOptionsOffset.value += backendResultCount
    }

    hostOptionsHasMore.value = result.hasMore || false
  } catch (error) {
    console.error('Failed to fetch host options:', error)
    if (reset) {
      hostOptions.value = []
    }
    hostOptionsHasMore.value = false
  } finally {
    hostOptionsLoading.value = false
  }
}

// Load more hosts when scrolling near bottom
const loadMoreHosts = async () => {
  if (hostOptionsLoading.value || !hostOptionsHasMore.value) return
  await fetchHostOptions(hostSearchValue.value, false)
}

// Fetch host options for command mode - only show current terminal tab IP
const fetchHostOptionsForCommandMode = async (search: string) => {
  try {
    const assetInfo = await getCurentTabAssetInfo()
    if (assetInfo && assetInfo.ip) {
      // Only show current terminal tab IP
      const currentHostOption = {
        label: assetInfo.ip,
        value: assetInfo.ip,
        uuid: assetInfo.uuid,
        connect: assetInfo.connection || 'personal',
        title: assetInfo.title || assetInfo.ip,
        isLocalHost: assetInfo.ip === '127.0.0.1' || assetInfo.ip === 'localhost'
      }

      // Filter by search if provided
      if (!search || currentHostOption.label.includes(search) || currentHostOption.title.includes(search)) {
        hostOptions.value.splice(0, hostOptions.value.length, currentHostOption)
      } else {
        hostOptions.value.splice(0, hostOptions.value.length)
      }
    } else {
      // If current tab is not a terminal, show no options
      hostOptions.value.splice(0, hostOptions.value.length)
    }
  } catch (error) {
    console.error('Failed to fetch host options for command mode:', error)
    hostOptions.value.splice(0, hostOptions.value.length)
  }
}

const showResumeButton = computed(() => {
  const chatHistory = currentSession.value?.chatHistory ?? []
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
    // Reset pagination when opening host select
    hostOptionsOffset.value = 0
    hostOptionsHasMore.value = false
    await fetchHostOptions('', true)
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
    const session = currentSession.value
    if (session) {
      session.showSendButton = newValue
    }
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
      // Update chatTitle field (for display), keep original task field intact
      targetHistory.chatTitle = history.chatTitle
      // Save updated history records
      await updateGlobalState('taskHistory', taskHistory)

      if (currentChatId.value === history.id) {
        currentChatTitle.value = history.chatTitle
      }

      // 同时更新对应 Tab 的标题
      const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
      if (tabIndex !== -1) {
        chatTabs.value[tabIndex].title = history.chatTitle
      }
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
  const index = historyList.value.findIndex((item) => item.id === history.id)
  if (index !== -1) {
    historyList.value.splice(index, 1)
  }

  // Check if the deleted history has a corresponding open tab, and remove it
  const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
  if (tabIndex !== -1) {
    // Remove the tab from chatTabs
    chatTabs.value.splice(tabIndex, 1)

    // If the deleted tab was the active one, switch to another tab
    if (currentChatId.value === history.id) {
      if (chatTabs.value.length > 0) {
        const newActiveIndex = Math.min(tabIndex, chatTabs.value.length - 1)
        const newActiveTab = chatTabs.value[newActiveIndex]
        currentChatId.value = newActiveTab.id
      } else {
        createNewEmptyTab()
      }
    }
  }

  const message = {
    type: 'deleteTaskWithId',
    text: history.id,
    taskId: history.id,
    cwd: currentCwd.value
  }
  console.log('Send message to main process:', message)
  const response = await window.api.sendToMain(attachTabContext(message))
  console.log('Main process response:', response)
}

const historySearchValue = ref('')
const showOnlyFavorites = ref(false)

const filteredHistoryList = computed(() => {
  // Implement filtering logic
  return historyList.value.filter((history) => {
    // Filter by search term
    const matchesSearch = history.chatTitle.toLowerCase().includes(historySearchValue.value.toLowerCase())

    // Filter by favorites if the toggle is on
    const matchesFavorite = !showOnlyFavorites.value || history.isFavorite

    return matchesSearch && matchesFavorite
  })
})

const PAGE_SIZE = 20
const currentPage = ref(1)
const isLoadingMore = ref(false)

const sortedHistoryList = computed(() => {
  return [...filteredHistoryList.value].sort((a, b) => (b.ts || 0) - (a.ts || 0))
})

const paginatedHistoryList = computed(() => {
  const totalToShow = currentPage.value * PAGE_SIZE
  return sortedHistoryList.value.slice(0, totalToShow)
})

// 将分页后的历史记录按日期分组
const groupedPaginatedHistory = computed(() => {
  const result: Array<{ dateLabel: string; items: HistoryItem[] }> = []

  const groups = new Map<string, HistoryItem[]>()
  paginatedHistoryList.value.forEach((item) => {
    const ts = item.ts || Date.now()
    const dateLabel = getDateLabel(ts, t)

    if (!groups.has(dateLabel)) {
      groups.set(dateLabel, [])
    }
    groups.get(dateLabel)!.push(item)
  })

  groups.forEach((items, dateLabel) => {
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0))
    result.push({ dateLabel, items })
  })

  return result
})

const hasMoreHistory = computed(() => {
  const displayedCount = currentPage.value * PAGE_SIZE
  return displayedCount < sortedHistoryList.value.length
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
      // Reset to title in database, prefer chatTitle if available
      history.chatTitle = targetHistory?.chatTitle || targetHistory?.task || 'Agent Chat'
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

// ============================================================================
// Auto-Scroll Management
// ============================================================================
// Handles automatic scrolling to bottom when new content arrives.
// Only scrolls if user was already at the bottom (sticky-to-bottom behavior).

// DOM References
const chatContainer = ref<HTMLElement | null>(null)
const chatResponse = ref<HTMLElement | null>(null)

// Helper: Safely get DOM element from ref (Vue may collect refs as arrays)
const getElement = (ref: any): HTMLElement | null => {
  if (!ref) return null
  return Array.isArray(ref) ? ref[0] || null : ref
}

// State Management - 通过 computed 访问当前 session 的状态
const shouldStickToBottom = computed({
  get: () => currentSession.value?.shouldStickToBottom ?? true,
  set: (value: boolean) => {
    if (currentSession.value) {
      currentSession.value.shouldStickToBottom = value
    }
  }
})
const STICKY_THRESHOLD = 24 // Distance from bottom to consider "at bottom"

const isAtBottom = (el: HTMLElement): boolean => {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) <= STICKY_THRESHOLD
}

// Core Scroll Functions
const executeScroll = () => {
  requestAnimationFrame(() => {
    const el = getElement(chatContainer.value)
    if (el instanceof HTMLElement) {
      el.scrollTop = el.scrollHeight
    }
  })
}

const scrollToBottom = (force = false) => {
  if (!force && !shouldStickToBottom.value) return
  nextTick(executeScroll)
}

const scrollToBottomWithRetry = (maxRetries = 5, delay = 50) => {
  let retryCount = 0
  let lastScrollHeight = 0

  const attemptScroll = () => {
    const el = getElement(chatContainer.value)
    if (!(el instanceof HTMLElement)) return

    const currentScrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight

    el.scrollTop = el.scrollHeight

    const newScrollTop = el.scrollTop
    const distanceFromBottom = currentScrollHeight - (newScrollTop + clientHeight)
    const isReallyAtBottom = distanceFromBottom <= STICKY_THRESHOLD

    const scrollHeightChanged = currentScrollHeight !== lastScrollHeight

    if (isReallyAtBottom && !scrollHeightChanged && retryCount > 0) {
      return
    }

    lastScrollHeight = currentScrollHeight
    retryCount++

    if (retryCount < maxRetries) {
      setTimeout(() => {
        requestAnimationFrame(attemptScroll)
      }, delay)
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(attemptScroll)
  })
}

// Scroll Event Handler
const handleContainerScroll = () => {
  const container = getElement(chatContainer.value)
  if (container && currentSession.value) {
    currentSession.value.shouldStickToBottom = isAtBottom(container)
  }
}

// DOM Mutation Observer (auto-scroll on content changes)
const domObserver = ref<MutationObserver | null>(null)

const isTerminalToggleMutation = (mutations: MutationRecord[], rootEl: HTMLElement | null): boolean => {
  return mutations.some((mutation) => {
    let target = mutation.target as HTMLElement
    while (target && target !== rootEl) {
      if (target.classList?.contains('terminal-output-container') || target.classList?.contains('terminal-output')) {
        return true
      }
      target = target.parentElement as HTMLElement
    }
    return false
  })
}

const startObservingDom = () => {
  if (domObserver.value) {
    try {
      domObserver.value.disconnect()
    } catch {}
  }

  const responseEl = getElement(chatResponse.value)
  if (!responseEl || !(responseEl instanceof Node)) return

  domObserver.value = new MutationObserver((mutations) => {
    if (isTerminalToggleMutation(mutations, responseEl)) return
    if (shouldStickToBottom.value) {
      executeScroll()
    }
  })

  domObserver.value.observe(responseEl, {
    childList: true,
    subtree: true,
    characterData: true
  })
}

const initializeAutoScroll = () => {
  nextTick(() => {
    const container = getElement(chatContainer.value)
    if (container && currentSession.value) {
      container.removeEventListener('scroll', handleContainerScroll)
      container.addEventListener('scroll', handleContainerScroll, { passive: true })
      currentSession.value.shouldStickToBottom = isAtBottom(container)
    }
    startObservingDom()
  })
}

watch(
  () => chatResponse.value,
  () => {
    nextTick(startObservingDom)
  }
)

// ============================================================================

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

  [key: string]: unknown
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
  const session = currentSession.value
  if (!session) return

  // If feedback has already been submitted, don't allow operation again
  if (isMessageFeedbackSubmitted(message.id)) {
    return
  }

  // Update local state
  session.messageFeedbacks[message.id] = type
  // Get current feedback from globalState
  const feedbacks = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>
  // Add or update feedback for this message
  feedbacks[message.id] = type
  // Update globalState
  await updateGlobalState('messageFeedbacks', feedbacks)
  // Send feedback to main process
  let messageRsp = {
    type: 'taskFeedback',
    feedbackType: type === 'like' ? 'thumbs_up' : 'thumbs_down',
    taskId: currentChatId.value || undefined
  }
  console.log('Send message to main process:', messageRsp)
  const response = await window.api.sendToMain(attachTabContext(messageRsp))
  console.log('Main process response:', response)
}

// Restore saved state
const restoreState = (savedState: any) => {
  if (!savedState) return

  // Restore all tabs
  if (savedState.chatTabs && savedState.chatTabs.length > 0) {
    chatTabs.value = savedState.chatTabs.map((savedTab: any) => ({
      id: savedTab.id,
      title: savedTab.title,
      hosts: [...savedTab.hosts],
      chatType: savedTab.chatType,
      autoUpdateHost: savedTab.autoUpdateHost,
      inputValue: savedTab.inputValue,
      session: {
        ...createEmptySessionState(),
        chatHistory: [...savedTab.session.chatHistory],
        lastChatMessageId: savedTab.session.lastChatMessageId,
        responseLoading: savedTab.session.responseLoading || false,
        showCancelButton: savedTab.session.showCancelButton || false,
        showSendButton: savedTab.session.showSendButton ?? true,
        buttonsDisabled: savedTab.session.buttonsDisabled || false,
        resumeDisabled: savedTab.session.resumeDisabled || false,
        isExecutingCommand: savedTab.session.isExecutingCommand || false,
        showRetryButton: savedTab.session.showRetryButton || false,
        showNewTaskButton: savedTab.session.showNewTaskButton || false,
        messageFeedbacks: savedTab.session.messageFeedbacks || {},
        shouldStickToBottom: savedTab.session.shouldStickToBottom ?? true
      }
    }))
  }

  // Restore current active tab (validate ID exists)
  if (savedState.currentChatId) {
    const tabExists = chatTabs.value.some((tab) => tab.id === savedState.currentChatId)
    if (tabExists) {
      currentChatId.value = savedState.currentChatId
    } else if (chatTabs.value.length > 0) {
      // If saved tab ID doesn't exist, use first tab
      currentChatId.value = chatTabs.value[0].id
    }
  }

  // Restore global AI model setting
  if (savedState.chatAiModelValue) {
    chatAiModelValue.value = savedState.chatAiModelValue
  }
}

// Function to get current state
const getCurrentState = () => {
  return {
    size: 0, // This will be set in parent component
    currentChatId: currentChatId.value || null, // Save current active tab ID
    chatTabs: chatTabs.value.map((tab) => ({
      id: tab.id,
      title: tab.title,
      hosts: [...tab.hosts], // Deep copy
      chatType: tab.chatType,
      autoUpdateHost: tab.autoUpdateHost,
      inputValue: tab.inputValue,
      session: {
        chatHistory: [...tab.session.chatHistory], // Deep copy chat history
        lastChatMessageId: tab.session.lastChatMessageId,
        responseLoading: tab.session.responseLoading,
        showCancelButton: tab.session.showCancelButton,
        showSendButton: tab.session.showSendButton,
        buttonsDisabled: tab.session.buttonsDisabled,
        resumeDisabled: tab.session.resumeDisabled,
        isExecutingCommand: tab.session.isExecutingCommand,
        showRetryButton: tab.session.showRetryButton,
        showNewTaskButton: tab.session.showNewTaskButton,
        messageFeedbacks: { ...tab.session.messageFeedbacks }
        // Do not save lastStreamMessage and lastPartialMessage (temporary state)
      }
    })),
    chatAiModelValue: chatAiModelValue.value // Global AI model setting
  }
}

// Function to emit state change event
const emitStateChange = () => {
  const currentState = getCurrentState()
  emit('state-changed', currentState)
}
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
