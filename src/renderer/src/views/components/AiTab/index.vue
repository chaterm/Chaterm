<template>
  <a-tabs
    v-model:active-key="activeKey"
    class="ai-chat-custom-tabs ai-chat-flex-container"
    @change="handleTabChange"
  >
    <a-tab-pane
      key="chat"
      :tab="
        currentChatId
          ? historyList.find((item) => item.id === currentChatId)?.chatTitle || 'New chat'
          : 'New chat'
      "
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
      <div class="hosts-display-container">
        <a-tag
          v-for="item in currentChatHosts"
          :key="item.uuid"
          color="blue"
        >
          <template #icon>
            <laptop-outlined />
          </template>
          {{ item.host }}
        </a-tag>
        <span
          v-if="!currentChatHosts || currentChatHosts.length === 0"
          class="hosts-display-container-host-tag"
          @click="handleAddHostClick"
        >
          @ {{ $t('ai.addHost') }}
        </span>
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
      <div
        v-if="chatHistory.length > 0"
        ref="chatContainer"
        :key="containerKey"
        class="chat-response-container"
      >
        <div class="chat-response">
          <template
            v-for="message in chatHistory"
            :key="message"
          >
            <div
              v-if="message.role === 'assistant'"
              class="assistant-message-container"
              :class="{
                'has-history-copy-btn':
                  chatTypeValue === 'cmd' && message.ask === 'command' && message.actioned
              }"
            >
              <MarkdownRenderer
                v-if="typeof message.content === 'object' && 'question' in message.content"
                :content="(message.content as MessageContent).question"
                :class="`message ${message.role}`"
                :ask="message.ask"
                :say="message.say"
                :partial="message.partial"
              />
              <MarkdownRenderer
                v-else
                :content="typeof message.content === 'string' ? message.content : ''"
                :class="`message ${message.role}`"
                :ask="message.ask"
                :say="message.say"
                :partial="message.partial"
              />

              <div class="message-actions">
                <a-tooltip :title="$t('ai.copy')">
                  <a-button
                    v-if="
                      chatTypeValue === 'cmd' && message.ask === 'command' && message.actioned
                    "
                    size="small"
                    class="history-copy-btn"
                    @click="handleHistoryCopy(message)"
                  >
                    <template #icon>
                      <CopyOutlined />
                    </template>
                  </a-button>
                </a-tooltip>
                <template
                  v-if="typeof message.content === 'object' && 'options' in message.content"
                >
                  <div class="options-container">
                    <a-button
                      v-for="(option, index) in (message.content as MessageContent).options"
                      :key="index"
                      size="small"
                      :class="[
                        'action-btn',
                        'option-btn',
                        { selected: message.selectedOption === option }
                      ]"
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
        <div class="input-send-container">
          <a-textarea
            v-model:value="chatInputValue"
            :placeholder="$t('ai.agentMessage')"
            class="chat-textarea"
            :auto-size="{ minRows: 2, maxRows: 20 }"
            @keydown="handleKeyDown"
            @input="handleInputChange"
          />
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
            />
            <div class="host-select-list">
              <div
                v-for="item in filteredHostOptions"
                :key="item.value"
                class="host-select-item"
                :class="{ hovered: hovered === item.value }"
                @mouseover="hovered = item.value"
                @mouseleave="hovered = null"
                @click="onHostClick(item)"
              >
                {{ item.label }}
              </div>
              <div
                v-if="filteredHostOptions.length === 0"
                class="host-select-empty"
                >{{ $t('ai.noMatchingHosts') }}
              </div>
            </div>
          </div>
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
              @click="sendMessage"
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
                <a-menu-item
                  v-for="(history, index) in historyList"
                  :key="index"
                  class="history-menu-item"
                  @click="restoreHistoryTab(history)"
                >
                  <div class="history-item-content">
                    <div class="history-title">{{ history.chatTitle }}</div>
                    <div class="history-type">{{ history.chatType }}</div>
                  </div>
                </a-menu-item>
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
import {
  ref,
  reactive,
  onMounted,
  defineAsyncComponent,
  onUnmounted,
  watch,
  computed,
  nextTick,
  onBeforeUnmount
} from 'vue'
import {
  CloseOutlined,
  LaptopOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  HourglassOutlined
} from '@ant-design/icons-vue'
import { notification } from 'ant-design-vue'
import { v4 as uuidv4 } from 'uuid'
import eventBus from '@/utils/eventBus'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import type {
  HistoryItem,
  TaskHistoryItem,
  Host,
  ChatMessage,
  MessageContent,
  AssetInfo
} from './types'
import { createNewMessage, parseMessageContent, truncateText, formatHosts } from './utils'
import foldIcon from '@/assets/icons/fold.svg'
import historyIcon from '@/assets/icons/history.svg'
import plusIcon from '@/assets/icons/plus.svg'
import sendIcon from '@/assets/icons/send.svg'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { getassetMenu } from '@/api/asset/asset'
import {
  aiModelOptions,
  litellmAiModelOptions,
  deepseekAiModelOptions
} from '@views/components/LeftTab/components/aiOptions'
import debounce from 'lodash/debounce'
import i18n from '@/locales'
const { t } = i18n.global
const MarkdownRenderer = defineAsyncComponent(
  () => import('@views/components/AiTab/MarkdownRenderer.vue')
)

import { ChatermMessage } from 'src/main/agent/shared/ExtensionMessage'

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
const historyList = ref<HistoryItem[]>([])
const hosts = ref<Host[]>([])
const chatInputValue = ref('')
const chatAiModelValue = ref('claude-4-sonnet')
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

let AgentAiModelsOptions = [
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
]
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

const checkModelConfig = async () => {
  const apiProvider = await getGlobalState('apiProvider')
  switch (apiProvider) {
    case 'bedrock':
      const awsAccessKey = await getGlobalState('awsAccessKey')
      const awsSecretKey = await getGlobalState('awsSecretKey')
      const awsRegion = await getGlobalState('awsRegion')
      const apiModelId = await getGlobalState('apiModelId')
      if (apiModelId == '' || awsAccessKey == '' || awsSecretKey == '' || awsRegion == '') {
        return false
      }
      break
    case 'litellm':
      const liteLlmBaseUrl = await getGlobalState('liteLlmBaseUrl')
      const liteLlmApiKey = await getGlobalState('liteLlmApiKey')
      const liteLlmModelId = await getGlobalState('liteLlmModelId')
      if (liteLlmBaseUrl == '' || liteLlmApiKey == '' || liteLlmModelId == '') {
        return false
      }
      break
    case 'deepseek':
      const deepSeekApiKey = await getGlobalState('deepSeekApiKey')
      const apiModelIdDeepSeek = await getGlobalState('apiModelId')
      if (deepSeekApiKey == '' || apiModelIdDeepSeek == '') {
        return false
      }
      break
  }
  return true
}

const sendMessage = async () => {
  const checkModelConfigResult = await checkModelConfig()
  if (!checkModelConfigResult) {
    notification.error({
      message: t('user.checkModelConfigFailedMessage'),
      description: t('user.checkModelConfigFailedDescription'),
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
  if (hosts.value.length === 0) {
    const assetInfo = await getCurentTabAssetInfo()
    // console.log('assetInsssssfo', assetInfo)
    if (assetInfo) {
      if (assetInfo.organizationId !== 'personal') {
        hosts.value.push({
          host: assetInfo.ip,
          uuid: assetInfo.uuid,
          connection: 'organization',
          organizationId: assetInfo.organizationId
        })
      } else {
        hosts.value.push({
          host: assetInfo.ip,
          uuid: assetInfo.uuid,
          connection: 'personal',
          organizationId: 'personal_01'
        })
      }
    } else {
      notification.error({
        message: '获取当前资产连接信息失败',
        description: '请先建立资产连接',
        duration: 3
      })
      return 'ASSET_ERROR'
    }
  }
  await sendMessageToMain(userContent)

  const userMessage: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userContent,
    type: 'message',
    ask: '',
    say: '',
    ts: 0
  }
  chatHistory.push(userMessage)
  chatInputValue.value = ''
  responseLoading.value = true
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
    sendMessage()
  }
}

const handlePlusClick = async () => {
  const currentInput = chatInputValue.value
  const newChatId = uuidv4()
  currentChatId.value = newChatId
  chatTypeValue.value = 'agent'
  hosts.value = []

  // 获取当前活动标签页的资产信息
  const assetInfo = await getCurentTabAssetInfo()
  if (assetInfo && assetInfo.ip) {
    hosts.value.push({
      host: assetInfo.ip,
      uuid: assetInfo.uuid,
      connection: assetInfo.organizationId === 'personal' ? 'personal' : 'organization',
      organizationId:
        assetInfo.organizationId !== 'personal' ? assetInfo.organizationId : 'personal_01'
    })
  }

  const chatTitle = currentInput ? truncateText(currentInput) : 'New chat'

  historyList.value.unshift({
    id: newChatId,
    chatTitle,
    chatType: chatTypeValue.value,
    chatContent: []
  })

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
    sendMessage()
  }
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

  try {
    if (history.chatType === 'agent') {
      try {
        const metadataResult = await (window.api as any).getTaskMetadata(history.id)
        if (
          metadataResult.success &&
          metadataResult.data &&
          Array.isArray(metadataResult.data.hosts)
        ) {
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
          lastItem &&
          item.text === lastItem.text &&
          item.ask === lastItem.ask &&
          item.say === lastItem.say &&
          item.type === lastItem.type

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
      // TODO:将hosts的发送时机推迟到点击resume按钮时
      if (hosts.value.length === 0) {
        notification.error({
          message: '获取当前资产连接信息失败',
          description: '请先建立资产连接',
          duration: 3
        })
        return 'ASSET_ERROR'
      }
      await (window.api as any).sendToMain({
        type: 'showTaskWithId',
        text: history.id,
        hosts: hosts.value.map((h) => ({
          host: h.host,
          uuid: h.uuid,
          connection: h.connection,
          organizationId: h.organizationId
        })),
        cwd: currentCwd.value
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
    if (chatTypeValue.value === 'agent') {
      // 从 globalState 获取所有 agent 历史记录并按 ts 倒序排序
      const agentHistory = (
        ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      ).sort((a, b) => b.ts - a.ts)
      // 转换格式并添加到历史列表
      historyList.value = []
      agentHistory.forEach((messages) => {
        historyList.value.push({
          id: messages.id,
          chatTitle: truncateText(messages?.task || 'Agent Chat'),
          chatType: 'agent',
          chatContent: []
        })
      })
    }
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

const handleHistoryCopy = (message: ChatMessage) => {
  let content = ''
  if (typeof message.content === 'string') {
    content = message.content
  } else if (message.content && 'question' in message.content) {
    content = (message.content as MessageContent).question || ''
  }
  eventBus.emit('executeTerminalCommand', content)
}

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
          typeof message.content === 'object' && 'options' in message.content
            ? (message.content as MessageContent).options?.[1] || ''
            : ''
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
          typeof message.content === 'object' && 'options' in message.content
            ? (message.content as MessageContent).options?.[0] || ''
            : ''
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
  responseLoading.value = false
}

// 声明removeListener变量
let removeListener: (() => void) | null = null

const currentCwdStore = useCurrentCwdStore()

// 使用计算属性来获取当前工作目录
const currentCwd = computed(() => currentCwdStore.currentCwd)

// 监听 currentCwd 的变化
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
        AgentAiModelsOptions = aiModelOptions
        break
      case 'litellm':
        chatAiModelValue.value = newValue?.[2]
        const exists =
          litellmAiModelOptions.findIndex((option) => option.value === newValue?.[2]) !== -1
        if (!exists && newValue?.[2]) {
          litellmAiModelOptions.push({
            value: newValue?.[2],
            label: newValue?.[2]
          })
        }
        AgentAiModelsOptions = litellmAiModelOptions
        break
      case 'deepseek':
        chatAiModelValue.value = newValue?.[1]
        AgentAiModelsOptions = deepseekAiModelOptions
        break
    }
  } else {
    apiProvider = (await getGlobalState('apiProvider')) as string
    switch (apiProvider) {
      case 'bedrock':
        chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
        AgentAiModelsOptions = aiModelOptions
        break
      case 'litellm':
        chatAiModelValue.value = (await getGlobalState('liteLlmModelId')) as string
        const exists =
          litellmAiModelOptions.findIndex((option) => option.value === chatAiModelValue.value) !== -1
        if (!exists && chatAiModelValue.value) {
          litellmAiModelOptions.push({
            value: chatAiModelValue.value,
            label: chatAiModelValue.value
          })
        }
        AgentAiModelsOptions = litellmAiModelOptions
        break
      case 'deepseek':
        chatAiModelValue.value = (await getGlobalState('apiModelId')) as string
        AgentAiModelsOptions = deepseekAiModelOptions
        break
    }
  }
}, 200)

// 在组件卸载时取消所有未执行的防抖函数
onBeforeUnmount(() => {
  debouncedEmitModelChange.cancel()
  debouncedUpdateGlobalState.cancel()
  changeModel.cancel()
})

// 在 onMounted 中添加事件监听
onMounted(async () => {
  await changeModel(null)
  authTokenInCookie.value = localStorage.getItem('ctm-token')
  const chatId = uuidv4()

  // 初始化资产信息
  await initAssetInfo()

  // 添加事件监听
  eventBus.on('SettingModelChanged', async (newValue) => {
    await changeModel(newValue)
  })

  // 监听标签页变化
  eventBus.on('activeTabChanged', async (tabInfo) => {
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

  historyList.value = [
    {
      id: chatId,
      chatTitle: 'New chat',
      chatType: chatTypeValue.value,
      chatContent: []
    }
  ]

  currentChatId.value = chatId

  let lastMessage: any = null
  let lastPartialMessage: any = null
  removeListener = (window.api as any).onMainMessage((message: any) => {
    if (message?.type === 'partialMessage') {
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
        lastMessageInChat.ask =
          message.partialMessage.type === 'ask' ? message.partialMessage.ask : ''
        lastMessageInChat.say =
          message.partialMessage.type === 'say' ? message.partialMessage.say : ''
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

onUnmounted(() => {
  if (typeof removeListener === 'function') {
    removeListener()
    removeListener = null
  }
  // 移除事件监听
  eventBus.off('apiProviderChanged')
  eventBus.off('activeTabChanged')
})

// 添加发送消息到主进程的方法
const sendMessageToMain = async (userContent: string) => {
  try {
    let message
    if (chatHistory.length === 0) {
      message = {
        type: 'newTask',
        askResponse: 'messageResponse',
        text: userContent,
        terminalOutput: '',
        hosts: hosts.value.map((h) => ({
          host: h.host,
          uuid: h.uuid,
          connection: h.connection,
          organizationId: h.organizationId
        })),
        cwd: currentCwd.value
      }
    } else {
      message = {
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: userContent,
        cwd: currentCwd.value
      }
    }
    console.log('发送消息到主进程:', message)
    const response = await (window.api as any).sendToMain(message)
    console.log('主进程响应:', response)
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
  }
}

const chatContainer = ref<HTMLElement | null>(null)

// Add auto scroll function
const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

// Watch chatHistory changes
watch(
  chatHistory,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

// 计算属性，用于获取当前聊天会话的 hosts
const currentChatHosts = computed(() => hosts.value)
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

// 1. 新增状态变量
const filteredHostOptions = computed(() =>
  hostOptions.value.filter((item) => item.label.includes(hostSearchValue.value))
)
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
    if (!hosts.value.some((h) => h.host === item.label)) {
      hosts.value.push(newHost)
    }
  }
  showHostSelect.value = false
  chatInputValue.value = ''
}

// 2. 监听输入框内容变化
const handleInputChange = async (e: Event) => {
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
  const uniqueAssetHosts = Array.from(
    new Map(assetHosts.map((h) => [h.ip + '_' + h.organizationId, h])).values()
  )
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
  const deduped = Array.from(
    new Map(allOptions.map((h) => [h.label + '_' + (h.organizationId || ''), h])).values()
  )

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
    await fetchHostOptions('')
    nextTick(() => {
      hostSearchInputRef.value?.focus?.()
    })
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
</script>

<style lang="less" scoped>
.ai-chat-custom-tabs {
  :deep(.ant-tabs-tab:not(.ant-tabs-tab-active) .ant-tabs-tab-btn) {
    color: #e0e0e0;
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
}

.ai-chat-flex-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #141414;
  border-radius: 8px;
  overflow: hidden;
}

.hosts-display-container {
  position: relative;
  background-color: #141414;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 0px solid #333;
  justify-content: flex-start;
  user-select: text;

  :deep(.ant-tag) {
    font-size: 10px;
    padding: 0 6px;
    height: 16px;
    line-height: 16px;
    display: flex;
    align-items: center;
    margin-left: 2px;
    margin-bottom: 2px;
    background-color: #2a2a2a !important;
    border: 1px solid #3a3a3a !important;
    color: #ffffff !important;

    .anticon-laptop {
      color: #1890ff !important;
      margin-right: 0cap;
    }
  }
}

.other-hosts-display-container {
  background: #2a2a2a;
  color: #fff;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid #3a3a3a;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  height: 16px;
  line-height: 16px;
  margin-left: 2px;
  margin-top: 4px;
}

.hosts-display-container-host-tag {
  font-size: 10px !important;
  display: flex;
  align-items: center;
  padding: 0 6px;
  height: 16px;
  line-height: 16px;
  background-color: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ffffff;
  border-radius: 2px;
  margin-bottom: 2px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: #3a3a3a;
    border-color: #4a4a4a;
  }
}

.chat-response-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0px 4px 4px 4px;
  margin-top: 2px;
  scrollbar-width: thin;
  height: v-bind(
    '(showResumeButton || showCancelButton) ? "calc(100vh - 202px)" : (showBottomButton ? "calc(100vh - 202px)" : "calc(100vh - 165px)")'
  );
  width: 100%;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #4a4a4a;
    border-radius: 3px;

    &:hover {
      background-color: #5a5a5a;
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
      background-color: #3a3a3a;
      color: #ffffff;
      border-radius: 4px;
      border: none;
      margin-left: auto;
      float: right;
      clear: both;
    }

    &.assistant {
      // align-self: flex-start;
      // background-color: #1e2a38;
      color: #ffffff;
      // border: 1px solid #2c3e50;
      width: 100%;
      padding: 0px;
    }
  }
}

.input-send-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: #141414;
  border-radius: 8px;
  border: 1px solid #333;
  width: 100%;

  .chat-textarea {
    background-color: #141414 !important;
    color: #fff !important;
    border: none !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }

  .ant-textarea {
    background-color: #141414 !important;
    border: none !important;
    border-radius: 8px !important;
    color: #e0e0e0 !important;
    padding: 8px 12px !important;
    font-size: 12px !important;

    :deep(.ant-input::placeholder) {
      color: #666 !important;
    }
  }
}

.input-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 8px;

  .ant-select {
    width: 120px;

    :deep(.ant-select-selector) {
      background-color: transparent !important;
      border: none !important;
      border-radius: 4px !important;
      color: #e0e0e0 !important;
      height: 24px !important;
      line-height: 24px !important;
    }

    :deep(.ant-select-selection-item) {
      font-size: 12px !important;
      line-height: 24px !important;
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

  &.has-history-copy-btn :deep(.command-editor-container) {
    padding-right: 20px;
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

.history-copy-btn {
  position: absolute;
  top: 16px;
  right: 5px;
  background-color: #2a2a2a;
  color: #e0e0e0;
  border: none;
  border-radius: 4px;
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
    background-color: #3a3a3a;
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
    color: #e0e0e0;
    border-radius: 4px;
    transition: all 0.3s ease;
    filter: invert(0.25);

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: #fff;
      filter: invert(0.1);
    }

    &:active {
      background-color: rgba(255, 255, 255, 0.15);
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
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
  background-color: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #4a4a4a;
    border-radius: 2px;

    &:hover {
      background-color: #5a5a5a;
    }
  }
}

.history-menu-item {
  padding: 6px 8px !important;
  margin: 2px 0 !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  min-height: unset !important;

  &:hover {
    background-color: #3a3a3a !important;
    transform: translateX(2px);
  }

  &:active {
    background-color: #4a4a4a !important;
  }
}

.history-item-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.history-title {
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
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

.bottom-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  background-color: #2b2b2b !important;
  border: 1px solid #3a3a3a !important;

  :deep(.ant-input) {
    height: 22px !important;
    font-size: 12px !important;
    background-color: #2b2b2b !important;
    color: #999 !important;

    &::placeholder {
      color: #999 !important;
    }

    padding: 0px 0px 2px 2px !important;
    line-height: 22px !important;
  }
}

.host-select-popup {
  position: absolute;
  left: 20px;
  width: 130px;
  background: #222;
  border-radius: 4px;
  box-shadow: 0 2px 8px #0002;
  border: 1px solid #484747;
}

.host-select-list {
  max-height: 120px;
  overflow-y: auto;
  padding: 2px 0px 2px 0px;
}

.host-select-item {
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 3px;
  margin-bottom: 2px;
  background: #222;
  color: #fff;
  font-size: 12px;
  line-height: 16px;
  transition: background 0.2s;

  &.hovered {
    background: #1656b1;
  }
}

.host-select-empty {
  color: #888;
  text-align: center;
  padding: 8px 0;
}

.ai-welcome-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 165px);

  .ai-welcome-icon {
    margin-bottom: 12px;

    img {
      width: 28px;
      height: 28px;
      opacity: 0.65;
    }
  }

  .ai-welcome-text {
    color: #e0e0e0;
    font-size: 14px;
    text-align: center;
    font-weight: 400;
    opacity: 0.65;
  }
}
</style>
