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
        v-if="chatHistory.length === 0"
        class="ai-welcome-container"
      >
        <div class="ai-welcome-icon">
          <img
            src="@/assets/menu/ai.svg"
            alt="AI"
          />
        </div>
        <div class="ai-welcome-text">{{ $t('ai.welcome') }}</div>
      </div>
      <div
        v-if="chatHistory.length > 0"
        ref="chatContainer"
        :key="containerKey"
        class="chat-response-container"
      >
        <div
          ref="chatResponse"
          class="chat-response"
        >
          <template
            v-for="message in chatHistory"
            :key="message"
          >
            <div
              v-if="message.role === 'assistant'"
              class="assistant-message-container"
              :class="{
                'has-history-copy-btn': chatTypeValue === 'cmd' && message.ask === 'command' && message.actioned
              }"
            >
              <MarkdownRenderer
                v-if="typeof message.content === 'object' && 'question' in message.content"
                :content="(message.content as MessageContent).question"
                :class="`message ${message.role}`"
                :ask="message.ask"
                :say="message.say"
                :partial="message.partial"
                @collapse-change="handleCollapseChange"
              />
              <MarkdownRenderer
                v-else
                :content="typeof message.content === 'string' ? message.content : ''"
                :class="`message ${message.role}`"
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
              style="color: #ffffff; font-size: 10px"
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
            :placeholder="chatTypeValue === 'agent' ? $t('ai.agentMessage') : chatTypeValue === 'chat' ? $t('ai.chatMessage') : $t('ai.cmdMessage')"
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
              style="width: 150px"
              :options="AgentAiModelsOptions"
              show-search
              @change="handleChatAiModelChange"
            ></a-select>
            <a-button
              :disabled="!showSendButton"
              size="small"
              class="custom-round-button compact-button"
              style="margin-left: 8px"
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
                </div>
                <div class="history-virtual-list-container">
                  <a-menu-item
                    v-for="history in paginatedHistoryList"
                    :key="history.id"
                    class="history-menu-item"
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
                            class="menu-action-btn"
                            @click.stop="editHistory(history)"
                          >
                            <template #icon>
                              <EditOutlined />
                            </template>
                          </a-button>
                          <a-button
                            size="small"
                            class="menu-action-btn"
                            @click.stop="deleteHistory(history)"
                          >
                            <template #icon>
                              <DeleteOutlined />
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
                              <CheckOutlined />
                            </template>
                          </a-button>
                          <a-button
                            size="small"
                            class="menu-action-btn cancel-btn"
                            @click.stop.prevent="cancelEdit(history)"
                          >
                            <template #icon>
                              <CloseOutlined />
                            </template>
                          </a-button>
                        </template>
                      </div>
                      <!--                      <div class="history-type">{{ history.chatType }}</div>-->
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
  ReloadOutlined
} from '@ant-design/icons-vue'
import { notification } from 'ant-design-vue'
import { v4 as uuidv4 } from 'uuid'
import eventBus from '@/utils/eventBus'
import { getGlobalState, updateGlobalState, getSecret } from '@renderer/agent/storage/state'
import type { HistoryItem, TaskHistoryItem, Host, ChatMessage, MessageContent, AssetInfo } from './types'
import { createNewMessage, parseMessageContent, truncateText, formatHosts } from './utils'
import foldIcon from '@/assets/icons/fold.svg'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'
import sendIcon from '@/assets/icons/send.svg'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { getassetMenu } from '@/api/asset/asset'
import { aiModelOptions, deepseekAiModelOptions } from '@views/components/LeftTab/components/aiOptions'
import debounce from 'lodash/debounce'
import i18n from '@/locales'
import { ChatermMessage } from '@/types/ChatermMessage'

const { t } = i18n.global
const MarkdownRenderer = defineAsyncComponent(() => import('@views/components/AiTab/markdownRenderer.vue'))

// 定义事件类型
interface TabInfo {
  id: string
  ip: string
  organizationId?: string
  title?: string
}

// 扩展 AppEvents 类型
declare module '@/utils/eventBus' {
  interface AppEvents {
    tabChanged: TabInfo
  }
}

const hostSearchInputRef = ref()
const showHostSelect = ref(false)
const hostOptions = ref<{ label: string; value: string; uuid: string }[]>([])
const hostSearchValue = ref('')
const hovered = ref<string | null>(null)
const keyboardSelectedIndex = ref(-1)
const historyList = ref<HistoryItem[]>([])
const hosts = ref<Host[]>([])
const autoUpdateHost = ref(true)
const chatInputValue = ref('')
const chatAiModelValue = ref('claude-3-7-sonnet')
const chatTypeValue = ref('agent')
const activeKey = ref('chat')
const showSendButton = ref(true)
const responseLoading = ref(false)
const shouldShowSendButton = computed(() => {
  const trimmedValue = chatInputValue.value.trim()
  return trimmedValue.length >= 1 && !/^\s*$/.test(trimmedValue)
})
const lastChatMessageId = ref('')
const buttonsDisabled = ref(false)
const resumeDisabled = ref(false)
const showRetryButton = ref(false)
const showCancelButton = ref(false)

// 当前活动对话的 ID
const currentChatId = ref<string | null>(null)
const authTokenInCookie = ref<string | null>(null)

const chatHistory = reactive<ChatMessage[]>([])
const webSocket = ref<WebSocket | null>(null)

const props = defineProps({
  toggleSidebar: {
    type: Function,
    required: true
  }
})

const AgentAiModelsOptions = ref([
  { label: 'claude-4-sonnet', value: 'claude-4-sonnet' },
  { label: 'claude-4-haiku', value: 'claude-4-haiku' },
  { label: 'claude-3-7-sonnet', value: 'claude-3-7-sonnet' },
  { label: 'claude-3-7-haiku', value: 'claude-3-7-haiku' },
  { label: 'claude-3-5-sonnet', value: 'claude-3-5-sonnet' },
  { label: 'claude-3-haiku', value: 'claude-3-haiku' },
  { label: 'claude-3-opus', value: 'claude-3-opus' },
  { label: 'claude-3-5-haiku', value: 'claude-3-5-haiku' },
  { label: 'claude-3-opus-20240229', value: 'claude-3-opus-20240229' },
  { label: 'claude-3-5-opus', value: 'claude-3-5-opus' }
])
const AiTypeOptions = [
  { label: 'Chat', value: 'chat' },
  { label: 'Command', value: 'cmd' },
  { label: 'Agent', value: 'agent' }
]

const getChatermMessages = async () => {
  const result = await (window.api as any).chatermGetChatermMessages({
    taskId: currentChatId.value
  })
  const messages = result as ChatermMessage[]
  console.log('result', messages)
  return messages
}

// 获取当前活跃Tab的主机信息
const getCurentTabAssetInfo = async (): Promise<AssetInfo | null> => {
  try {
    // 创建一个Promise来等待assetInfoResult事件
    const assetInfo = await new Promise<AssetInfo | null>((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        eventBus.off('assetInfoResult', handleResult)
        reject(new Error('获取资产信息超时'))
      }, 5000) // 5秒超时

      // 监听结果事件
      const handleResult = (result: AssetInfo | null) => {
        clearTimeout(timeout)
        eventBus.off('assetInfoResult', handleResult)
        resolve(result)
      }
      eventBus.on('assetInfoResult', handleResult)
      // 发出请求事件
      eventBus.emit('getActiveTabAssetInfo')
    })
    // 直接在这里处理结果
    if (assetInfo) {
      return assetInfo
    } else {
      return null
    }
  } catch (error) {
    console.error('获取资产信息时发生错误:', error)
    return null
  }
}

// 创建主机信息对象
const createHostInfo = (ip: string, uuid: string, organizationId: string) => {
  return {
    host: ip,
    uuid: uuid,
    connection: organizationId !== 'personal' ? 'organization' : 'personal',
    organizationId: organizationId !== 'personal' ? organizationId : 'personal_01'
  }
}

// 更新主机列表
const updateHosts = (hostInfo: { ip: string; uuid: string; organizationId: string } | null) => {
  if (hostInfo) {
    const newHost = createHostInfo(hostInfo.ip, hostInfo.uuid, hostInfo.organizationId)
    hosts.value = [newHost]
  } else {
    hosts.value = []
  }
}

// 初始化资产信息
const initAssetInfo = async () => {
  const assetInfo = await getCurentTabAssetInfo()
  if (assetInfo) {
    updateHosts({
      ip: assetInfo.ip,
      uuid: assetInfo.uuid,
      organizationId: assetInfo.organizationId
    })
  } else {
    updateHosts(null)
  }
}

// 切换标签时候，当前的对话ID修改为对应的chat tag的id
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
  }
  return true
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
  // 获取当前活跃主机是否存在
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
  return
}

const handleClose = () => {
  props.toggleSidebar('right')
  eventBus.emit('updateRightIcon', false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  // 检查是否是输入法确认键
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    sendMessage('send')
  }
}

const handlePlusClick = async () => {
  const currentInput = chatInputValue.value
  const newChatId = uuidv4()
  currentChatId.value = newChatId
  const chatSetting = (await getGlobalState('chatSettings')) as { mode?: string }
  chatTypeValue.value = chatSetting?.mode || 'agent'
  hosts.value = []
  autoUpdateHost.value = true

  // 获取当前活动标签页的资产信息
  const assetInfo = await getCurentTabAssetInfo()
  if (assetInfo && assetInfo.ip) {
    hosts.value.push({
      host: assetInfo.ip,
      uuid: assetInfo.uuid,
      connection: assetInfo.organizationId === 'personal' ? 'personal' : 'organization',
      organizationId: assetInfo.organizationId !== 'personal' ? assetInfo.organizationId : 'personal_01'
    })
  }

  chatHistory.length = 0
  chatInputValue.value = ''
  // 开启新窗口后，cancel掉原始的agent窗口
  console.log('handleCancel:取消')
  const response = await (window.api as any).cancelTask()
  console.log('主进程响应:', response)
  buttonsDisabled.value = false
  resumeDisabled.value = false
  showCancelButton.value = false
  showSendButton.value = true
  responseLoading.value = false
  if (currentInput.trim()) {
    sendMessage('newTask')
  }
  showRetryButton.value = false
}

const containerKey = ref(0)

const restoreHistoryTab = async (history: HistoryItem) => {
  if (webSocket.value) {
    webSocket.value.close()
    webSocket.value = null
  }

  containerKey.value++

  currentChatId.value = history.id
  chatTypeValue.value = history.chatType
  lastChatMessageId.value = ''

  autoUpdateHost.value = false

  try {
    if (history.chatType === 'agent' || history.chatType === 'cmd') {
      try {
        const metadataResult = await (window.api as any).getTaskMetadata(history.id)
        if (metadataResult.success && metadataResult.data && Array.isArray(metadataResult.data.hosts)) {
          hosts.value = metadataResult.data.hosts.map((item: any) => ({
            host: item.host,
            uuid: item.uuid || '',
            connection: item.connection,
            organizationId: item.organizationId
          }))
        }
      } catch (e) {
        console.error('获取metadata失败:', e)
      }
      const conversationHistory = await getChatermMessages()
      console.log('[conversationHistory]', conversationHistory)
      chatHistory.length = 0
      // 按时间戳排序并过滤相邻重复项
      let lastItem: any = null
      conversationHistory.forEach((item, index) => {
        // 检查是否与前一项重复
        const isDuplicate =
          lastItem && item.text === lastItem.text && item.ask === lastItem.ask && item.say === lastItem.say && item.type === lastItem.type

        if (
          !isDuplicate &&
          (item.ask === 'followup' ||
            item.ask === 'command' ||
            item.say === 'command_output' ||
            item.say === 'completion_result' ||
            item.say === 'text' ||
            item.say === 'reasoning' ||
            item.ask === 'resume_task' ||
            item.say === 'user_feedback')
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
      await (window.api as any).sendToMain({
        type: 'showTaskWithId',
        text: history.id,
        hosts: hosts.value.map((h) => ({
          host: h.host,
          uuid: h.uuid,
          connection: h.connection,
          organizationId: h.organizationId
        }))
      })
    }
    chatInputValue.value = ''
    responseLoading.value = false
  } catch (err) {
    console.error(err)
  }
}

const handleHistoryClick = async () => {
  try {
    // 重置分页状态
    currentPage.value = 1
    isLoadingMore.value = false

    // 从 globalState 获取所有 agent 历史记录并按 ts 倒序排序
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []

    const historyItems = taskHistory
      .sort((a, b) => b.ts - a.ts)
      .map((task) => ({
        id: task.id,
        chatTitle: truncateText(task?.task || `${chatTypeValue.value} Chat`),
        chatType: chatTypeValue.value,
        chatContent: []
      }))

    // 批量更新历史列表
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

  if (operation === 'copy') {
    eventBus.emit('executeTerminalCommand', content)
  } else if (operation === 'apply') {
    eventBus.emit('executeTerminalCommand', content + '\n')
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
    console.log('发送消息到主进程:', messageRsp)
    const response = await (window.api as any).sendToMain(messageRsp)
    buttonsDisabled.value = true
    console.log('主进程响应:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
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
    console.log('发送消息到主进程:', messageRsp)
    const response = await (window.api as any).sendToMain(messageRsp)
    console.log('主进程响应:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
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
    console.log('发送消息到主进程:', messageRsp)
    const response = await (window.api as any).sendToMain(messageRsp)
    buttonsDisabled.value = true
    console.log('主进程响应:', response)
    responseLoading.value = true
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
  }
}

const handleCancel = async () => {
  console.log('handleCancel:取消')
  const response = await (window.api as any).cancelTask()
  console.log('主进程响应:', response)
  showCancelButton.value = false
  showSendButton.value = true
  responseLoading.value = false
  lastChatMessageId.value = ''
}

const handleResume = async () => {
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  console.log('handleResume:恢复')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('发送消息到主进程:', messageRsp)
  const response = await (window.api as any).sendToMain(messageRsp)
  console.log('主进程响应:', response)
  resumeDisabled.value = true
  responseLoading.value = true
}

const handleRetry = async () => {
  console.log('handleRetry:重试')
  const messageRsp = {
    type: 'askResponse',
    askResponse: 'yesButtonClicked'
  }
  console.log('发送消息到主进程:', messageRsp)
  const response = await (window.api as any).sendToMain(messageRsp)
  console.log('主进程响应:', response)
  showRetryButton.value = false
}

// 声明removeListener变量
let removeListener: (() => void) | null = null

const currentCwdStore = useCurrentCwdStore()

// 使用计算属性来获取当前工作目录
const currentCwd = computed(() => currentCwdStore.keyValueMap)

watch(currentCwd, (newValue) => {
  console.log('当前工作目录:', newValue)
})

// 创建防抖的事件发送函数
const debouncedEmitModelChange = debounce(async (type, model) => {
  eventBus.emit('AiTabModelChanged', [type, model])
}, 200)

const debouncedUpdateGlobalState = debounce(async (provider, model) => {
  switch (provider) {
    case 'bedrock':
      await updateGlobalState('apiModelId', model)
      break
    case 'litellm':
      await updateGlobalState('liteLlmModelId', model)
      break
    case 'deepseek':
      await updateGlobalState('apiModelId', model)
      break
  }
}, 200)

// 修改 watch 处理函数
watch(
  () => chatTypeValue.value,
  async (newValue) => {
    try {
      await updateGlobalState('chatSettings', {
        mode: newValue
      })
      debouncedEmitModelChange(chatTypeValue.value, chatAiModelValue.value)
    } catch (error) {
      console.error('更新 chatSettings 失败:', error)
    }
  }
)

const handleChatAiModelChange = async () => {
  const apiProvider = await getGlobalState('apiProvider')
  debouncedUpdateGlobalState(apiProvider, chatAiModelValue.value)
  debouncedEmitModelChange(chatTypeValue.value, chatAiModelValue.value)
}

// 修改模型更新函数
const changeModel = debounce(async (newValue) => {
  const chatSetting = (await getGlobalState('chatSettings')) as { mode?: string }
  chatTypeValue.value = chatSetting?.mode || 'agent'
  let apiProvider = ''
  if (newValue?.[0]) {
    apiProvider = newValue?.[0]
    switch (apiProvider) {
      case 'bedrock':
        chatAiModelValue.value = newValue?.[1]
        AgentAiModelsOptions.value = aiModelOptions
        break
      case 'litellm':
        chatAiModelValue.value = newValue?.[2]
        AgentAiModelsOptions.value = [
          {
            value: newValue?.[2],
            label: newValue?.[2]
          }
        ]
        break
      case 'deepseek':
        chatAiModelValue.value = newValue?.[1]
        AgentAiModelsOptions.value = deepseekAiModelOptions
        break
    }
  } else {
    apiProvider = (await getGlobalState('apiProvider')) as string
    switch (apiProvider) {
      case 'bedrock':
        chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
        AgentAiModelsOptions.value = aiModelOptions
        break
      case 'litellm':
        chatAiModelValue.value = (await getGlobalState('liteLlmModelId')) as string
        AgentAiModelsOptions.value = [
          {
            value: chatAiModelValue.value,
            label: chatAiModelValue.value
          }
        ]
        break
      case 'deepseek':
        chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
        AgentAiModelsOptions.value = deepseekAiModelOptions
        break
    }
  }
}, 200)

onBeforeUnmount(() => {
  debouncedEmitModelChange.cancel()
  debouncedUpdateGlobalState.cancel()
  changeModel.cancel()
})

onMounted(async () => {
  eventBus.on('triggerAiSend', () => {
    if (chatInputValue.value.trim()) {
      sendMessage('commandSend')
    }
  })
  eventBus.on('chatToAi', (text) => {
    chatInputValue.value = text
  })

  await changeModel(null)
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

  // 初始化资产信息
  await initAssetInfo()

  // 添加事件监听
  eventBus.on('SettingModelChanged', async (newValue) => {
    console.log('[newValue]', newValue)
    await changeModel(newValue)
  })

  // 监听标签页变化
  eventBus.on('activeTabChanged', async (tabInfo) => {
    if (!autoUpdateHost.value || chatHistory.length > 0) {
      return
    }
    if (tabInfo && tabInfo.ip) {
      updateHosts({
        ip: tabInfo.ip,
        uuid: tabInfo.data.uuid,
        organizationId: tabInfo.organizationId || 'personal'
      })
    } else {
      updateHosts(null)
    }
  })

  eventBus.on('chatToAi', async (text) => {
    chatInputValue.value = text
    initAssetInfo() //防止初始化失败
    nextTick(() => {
      const textarea = document.getElementsByClassName('chat-textarea')[0] as HTMLTextAreaElement | null
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight
        textarea.focus({ preventScroll: true })
      }
    })
  })

  currentChatId.value = chatId

  let lastMessage: any = null
  let lastPartialMessage: any = null
  removeListener = (window.api as any).onMainMessage((message: any) => {
    console.log('Received main process message:', message.type, message)
    if (message?.type === 'partialMessage') {
      // handle model error -- api_req_failed
      if (message.partialMessage.type === 'ask' && message.partialMessage.ask === 'api_req_failed') {
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
      }

      lastPartialMessage = message
      if (!message.partialMessage?.partial) {
        showSendButton.value = true
        showCancelButton.value = false
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

onUnmounted(() => {
  if (typeof removeListener === 'function') {
    removeListener()
    removeListener = null
  }
  // 移除事件监听
  eventBus.off('apiProviderChanged')
  eventBus.off('activeTabChanged')
  eventBus.off('chatToAi')
})

// 添加发送消息到主进程的方法
const sendMessageToMain = async (userContent: string, sendType: string) => {
  try {
    let message
    // 只发送hosts中IP对应的cwd键值对
    const filteredCwd = new Map()
    hosts.value.forEach((h) => {
      if (h.host && currentCwd.value[h.host]) {
        filteredCwd.set(h.host, currentCwd.value[h.host])
      }
    })
    const hostsArray = hosts.value.map((h) => ({
      host: h.host,
      uuid: h.uuid,
      connection: h.connection,
      organizationId: h.organizationId
    }))
    if (chatHistory.length === 0) {
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
    console.log('发送消息到主进程:', message)
    const response = await (window.api as any).sendToMain(message)
    console.log('主进程响应:', response)
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
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
    connection: item.connection,
    organizationId: item.organizationId
  }

  if (chatTypeValue.value === 'cmd') {
    hosts.value = [newHost]
  } else {
    // 检查是否已选中
    const existingIndex = hosts.value.findIndex((h) => h.host === item.label)
    if (existingIndex > -1) {
      // 如果已选中，则取消选择
      hosts.value.splice(existingIndex, 1)
    } else {
      // 如果未选中，则添加
      hosts.value.push(newHost)
    }
  }
  autoUpdateHost.value = false
  // showHostSelect.value = false
  chatInputValue.value = ''
}

// 移除指定的host
const removeHost = (hostToRemove: any) => {
  const index = hosts.value.findIndex((h) => h.uuid === hostToRemove.uuid)
  if (index > -1) {
    hosts.value.splice(index, 1)
    autoUpdateHost.value = false
  }
}

// 处理host搜索框的键盘事件
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
      break
    case 'ArrowUp':
      e.preventDefault()
      if (keyboardSelectedIndex.value === -1) {
        keyboardSelectedIndex.value = filteredHostOptions.value.length - 1
      } else {
        keyboardSelectedIndex.value = Math.max(keyboardSelectedIndex.value - 1, 0)
      }
      break
    case 'Enter':
      e.preventDefault()
      if (keyboardSelectedIndex.value >= 0 && keyboardSelectedIndex.value < filteredHostOptions.value.length) {
        onHostClick(filteredHostOptions.value[keyboardSelectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      showHostSelect.value = false
      keyboardSelectedIndex.value = -1
      // 将焦点回到主输入框
      nextTick(() => {
        const textarea = document.getElementsByClassName('chat-textarea')[0] as HTMLTextAreaElement | null
        if (textarea) {
          textarea.focus()
        }
      })
      break
  }
}

// 处理鼠标悬停事件
const handleMouseOver = (value: string, index: number) => {
  hovered.value = value
  keyboardSelectedIndex.value = index
}

// 2. 监听输入框内容变化
const handleInputChange = async (e: Event) => {
  if (chatTypeValue.value === 'cmd') {
    return
  }
  const value = (e.target as HTMLTextAreaElement).value
  if (value === '@') {
    showHostSelect.value = true
    hostSearchValue.value = '' // 清空搜索框
    await fetchHostOptions('') // 这里调用，获取所有主机
    nextTick(() => {
      hostSearchInputRef.value?.focus?.()
    })
  } else {
    showHostSelect.value = false
  }
}

// 3. 获取主机列表
const debouncedFetchHostOptions = debounce((search: string) => {
  fetchHostOptions(search)
}, 300)

watch(hostSearchValue, (newVal) => {
  keyboardSelectedIndex.value = -1
  debouncedFetchHostOptions(newVal)
})
const fetchHostOptions = async (search: string) => {
  const hostsList = await (window.api as any).getUserHosts(search)

  let formatted = formatHosts(hostsList || [])

  // 获取资产菜单数据
  let assetHosts: { ip: string; organizationId: string }[] = []
  try {
    const res = await getassetMenu({ organizationId: 'firm-0001' })
    if (res && res.data && Array.isArray(res.data.routers)) {
      // 遍历 routers 下所有 children
      const routers = res.data.routers
      routers.forEach((group: any) => {
        if (Array.isArray(group.children)) {
          group.children.forEach((item: any) => {
            if (item.ip && item.organizationId) {
              assetHosts.push({ ip: item.ip, organizationId: item.organizationId })
            }
          })
        }
      })
    }
  } catch (e) {
    // 忽略资产接口异常
  }
  // 去重，只保留唯一 ip+organizationId
  const uniqueAssetHosts = Array.from(new Map(assetHosts.map((h) => [h.ip + '_' + h.organizationId, h])).values())
  // 转换为 hostOptions 兼容格式
  const assetHostOptions = uniqueAssetHosts.map((h) => ({
    label: h.ip,
    value: h.ip + '_' + h.organizationId,
    uuid: h.ip + '_' + h.organizationId,
    organizationId: h.organizationId,
    connection: 'organization'
  }))

  for (const host of formatted) {
    host.connection = 'personal'
    assetHostOptions.push(host)
  }

  const allOptions = [...assetHostOptions]
  const deduped = Array.from(new Map(allOptions.map((h) => [h.label + '_' + (h.organizationId || ''), h])).values())

  hostOptions.value.splice(0, hostOptions.value.length, ...deduped)

  console.log('hostOptions', hostOptions.value)
}

const showResumeButton = computed(() => {
  if (chatHistory.length === 0) {
    return false
  }
  let message = chatHistory.at(-1)
  if (!message) {
    return false
  }
  return chatTypeValue.value === 'agent' && message.ask === 'resume_task'
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

// 使用immediate选项确保初始化时也执行一次
watch(
  shouldShowSendButton,
  (newValue) => {
    showSendButton.value = newValue
  },
  { immediate: true }
)

const currentEditingId = ref(null)

const editHistory = async (history) => {
  // 如果有其他正在编辑的项，先还原它
  if (currentEditingId.value && currentEditingId.value !== history.id) {
    const previousEditingHistory = paginatedHistoryList.value.find((h) => h.id === currentEditingId.value)
    if (previousEditingHistory) {
      previousEditingHistory.isEditing = false
      previousEditingHistory.editingTitle = ''
    }
  }

  // 设置当前编辑项
  currentEditingId.value = history.id
  history.isEditing = true
  history.editingTitle = history.chatTitle

  // 等待DOM更新后聚焦输入框
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

  // 更新历史记录标题
  history.chatTitle = history.editingTitle.trim()
  history.isEditing = false
  currentEditingId.value = null

  try {
    // 获取当前历史记录
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    // 更新对应记录的标题
    const targetHistory = taskHistory.find((item) => item.id === history.id)
    if (targetHistory) {
      targetHistory.task = history.chatTitle
      // 保存更新后的历史记录
      await updateGlobalState('taskHistory', taskHistory)
    }
  } catch (err) {
    console.error('Failed to update history title:', err)
  }
}

const deleteHistory = async (history) => {
  // 获取当前历史记录
  const agentHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []

  // 过滤掉要删除的记录
  const filteredHistory = agentHistory.filter((item) => item.id !== history.id)

  // 更新全局状态
  await updateGlobalState('taskHistory', filteredHistory)

  // 更新显示列表
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
  console.log('发送消息到主进程:', message)
  const response = await (window.api as any).sendToMain(message)
  console.log('主进程响应:', response)
}

const historySearchValue = ref('')

const filteredHistoryList = computed(() => {
  // 实现过滤逻辑
  return historyList.value.filter((history) => {
    return history.chatTitle.toLowerCase().includes(historySearchValue.value.toLowerCase())
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
    await new Promise((resolve) => setTimeout(resolve, 300)) // 添加小延迟使加载更平滑
    currentPage.value++
  } finally {
    isLoadingMore.value = false
  }
}

// 使用 Intersection Observer 实现无限滚动
const handleIntersection = (entries) => {
  if (entries[0].isIntersecting) {
    loadMoreHistory()
  }
}

// 监听搜索值变化时重置分页
watch(historySearchValue, () => {
  currentPage.value = 1
})

const cancelEdit = async (history) => {
  try {
    // 获取当前历史记录
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    // 找到对应的记录
    const targetHistory = taskHistory.find((item) => item.id === history.id)
    if (targetHistory) {
      // 重置为数据库中的标题
      history.chatTitle = truncateText(targetHistory?.task || 'Agent Chat')
    }
    // 重置编辑状态
    history.isEditing = false
    history.editingTitle = ''
    currentEditingId.value = null
  } catch (err) {
    console.error('Failed to cancel edit:', err)
    // 发生错误时也要重置编辑状态
    history.isEditing = false
    history.editingTitle = ''
    currentEditingId.value = null
  }
}

const chatContainer = ref<HTMLElement | null>(null)
const chatResponse = ref<HTMLElement | null>(null)
// 添加一个标志来跟踪是否正在处理折叠操作
const isHandlingCollapse = ref(false)

// Add auto scroll function
const scrollToBottom = () => {
  // 如果正在处理折叠操作，则不执行滚动
  if (isHandlingCollapse.value) {
    // console.log('正在处理折叠操作，跳过自动滚动')
    return
  }

  // 记录当前容器底部位置
  const prevBottom = chatResponse.value?.getBoundingClientRect().bottom

  nextTick(() => {
    if (chatResponse.value) {
      // 获取更新后的容器底部位置
      const currentBottom = chatResponse.value.getBoundingClientRect().bottom
      // console.log('容器高度变化，直接滚动到底部', prevBottom, currentBottom)
      // 如果容器底部位置发生了变化，直接滚动到底部
      if (prevBottom !== currentBottom && prevBottom > 0 && currentBottom > 0) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    }
  })
}

// 修改 handleCollapseChange 函数
const handleCollapseChange = () => {
  // 设置标志，表示正在处理折叠操作
  isHandlingCollapse.value = true

  // 折叠完成后，直接调用adjustScrollPosition确保内容可见
  nextTick(() => {
    adjustScrollPosition()

    // 延迟重置标志，确保在处理完成后才允许自动滚动
    setTimeout(() => {
      isHandlingCollapse.value = false
    }, 500)
  })
}

// 添加一个专门用于调整折叠后滚动位置的函数
const adjustScrollPosition = () => {
  if (!chatContainer.value) return

  // 尝试找到最后一条可见消息
  const messages = Array.from(chatContainer.value.querySelectorAll('.message.assistant, .message.user'))

  if (messages.length > 0) {
    // 获取最后一条消息
    const lastMessage = messages[messages.length - 1]

    // 检查最后一条消息是否在视口内
    const rect = lastMessage.getBoundingClientRect()
    const containerRect = chatContainer.value.getBoundingClientRect()

    if (rect.bottom > containerRect.bottom || rect.top < containerRect.top) {
      // 如果最后一条消息不在视口内，将其滚动到视口中央
      lastMessage.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // console.log('将最后一条消息滚动到视口中央')
    } else {
      // console.log('最后一条消息已在视口内，无需调整')
    }
  } else {
    // 如果没有消息，滚动到底部
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}
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
  // 暗色主题变量
  .dark-theme {
    --bg-color: #141414;
    --bg-color-secondary: #1f1f1f;
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

  // 亮色主题变量
  .light-theme {
    --bg-color: #ffffff;
    --bg-color-secondary: #f5f5f5;
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
  border-radius: 8px;
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
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--hover-bg-color);
  }
}

.chat-response-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0px 4px 4px 4px;
  margin-top: 2px;
  scrollbar-width: thin;
  scrollbar-color: #2a2a2a #1a1a1a;
  width: 100%;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #2a2a2a;
    border-radius: 3px;

    &:hover {
      background-color: #3a3a3a;
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
      padding: 0px;
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

  .custom-round-button {
    height: 18px;
    width: 18px;
    padding: 0;
    border-radius: 50%;
    font-size: 10px;
    background-color: #1656b1;
    border: 1px solid #2d6fcd;
    color: white;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;

    &:hover {
      transform: scale(1.15);
      border-color: #40a9ff;
    }

    &:active {
      transform: scale(0.95);
      box-shadow: none;
      border-color: #1890ff;
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
  gap: 2px;
  width: 100%;
  position: relative;

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
  padding: 4px;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 280px !important;

  .history-search-container {
    display: flex;
    gap: 10px;

    :deep(.ant-input-affix-wrapper) {
      border-color: var(--border-color);
      box-shadow: none;
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
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 2px;

    &:hover {
      background-color: var(--scrollbar-thumb-hover);
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

    .menu-action-buttons {
      opacity: 1;
    }
  }

  &:active {
    background-color: var(--bg-color-secondary) !important;
  }
}

.history-item-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
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
    gap: 2px;
    margin-left: 4px;
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

  .approve-btn {
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

  .cancel-btn {
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

  .resume-btn {
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
  width: 130px;
  background: var(--bg-color);
  border-radius: 4px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  margin-bottom: 4px;
  margin-left: 8px;
  max-height: 150px;
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
}

.host-select-list {
  max-height: 120px;
  overflow-y: auto;
  padding: 2px 0px 2px 0px;
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
  color: rgba(255, 255, 255, 0.65) !important;
  padding: 0 2px;
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

  &.save-btn:hover {
    color: #52c41a !important;
  }

  &.cancel-btn:hover {
    color: #ff4d4f !important;
  }
}

.history-load-more {
  text-align: center;
  padding: 8px;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: #1890ff;
  }
}
</style>
