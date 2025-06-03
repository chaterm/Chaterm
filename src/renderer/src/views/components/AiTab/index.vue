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
        v-if="chatHistory.length > 0"
        ref="chatContainer"
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
            >
              <MarkdownRenderer
                v-if="message.content?.question"
                :content="message.content.question"
                :class="`message ${message.role}`"
              />
              <MarkdownRenderer
                v-else
                :content="message.content"
                :class="`message ${message.role}`"
              />

              <div class="message-actions">
                <a-button
                  v-if="chatTypeValue === 'ctm-cmd'"
                  size="small"
                  class="action-btn copy-btn"
                  @click="handleCopyContent(message)"
                >
                  <template #icon>
                    <CopyOutlined />
                  </template>
                  {{ $t('ai.copy') }}
                </a-button>
                <a-button
                  v-if="chatTypeValue === 'ctm-cmd'"
                  size="small"
                  class="action-btn apply-btn"
                  @click="handleApplyCommand(message)"
                >
                  <template #icon>
                    <PlayCircleOutlined />
                  </template>
                  {{ $t('ai.run') }}
                </a-button>
                <div
                  v-if="
                    chatTypeValue === 'ctm-agent' &&
                    message.type === 'ask' &&
                    message.content?.options?.length > 1
                  "
                >
                  <div
                    v-if="!message.action"
                    class="action-buttons"
                  >
                    <div class="button-row">
                      <a-button
                        size="small"
                        class="action-btn copy-btn"
                        @click="handleRejectContent(message)"
                      >
                        <template #icon>
                          <CloseOutlined />
                        </template>
                        {{ $t('ai.reject') }}
                      </a-button>
                      <a-button
                        size="small"
                        class="action-btn apply-btn"
                        @click="handleApproveCommand(message)"
                      >
                        <template #icon>
                          <CheckOutlined />
                        </template>
                        {{ $t('ai.approve') }}
                      </a-button>
                    </div>
                  </div>
                  <div
                    v-else
                    :class="message.action"
                    class="action-status"
                  >
                    {{ message.action === 'approved' ? $t('ai.approved') : $t('ai.rejected') }}
                  </div>
                </div>
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
      <div class="input-send-container">
        <a-textarea
          v-model:value="chatInputValue"
          :placeholder="$t('ai.agentMessage')"
          style="background-color: #161616; color: #fff; border: none; box-shadow: none"
          :auto-size="{ minRows: 2, maxRows: 20 }"
          @keydown="handleKeyDown"
        />
        <div class="input-controls">
          <a-select
            v-model:value="chatTypeValue"
            size="small"
            style="width: 80px"
            :options="AiTypeOptions"
            show-search
          ></a-select>
          <a-select
            v-model:value="chatModelValue"
            size="small"
            :options="AiModelsOptions"
            show-search
          ></a-select>
          <a-button
            size="small"
            class="custom-round-button compact-button"
            style="margin-left: 8px"
            @click="sendMessage"
          >
            {{ $t('ai.send') }} ⏎
          </a-button>
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
            <PlusOutlined />
          </a-button>
        </a-tooltip>
        <a-tooltip :title="$t('ai.showChatHistory')">
          <a-dropdown :trigger="['click']">
            <a-button
              type="text"
              class="action-icon-btn"
              @click="handleHistoryClick"
            >
              <HistoryOutlined />
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
            <CloseOutlined />
          </a-button>
        </a-tooltip>
      </div>
    </template>
  </a-tabs>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, defineAsyncComponent, onUnmounted, nextTick, watch } from 'vue'
import {
  PlusOutlined,
  CloseOutlined,
  HistoryOutlined,
  CopyOutlined,
  CheckOutlined,
  PlayCircleOutlined
} from '@ant-design/icons-vue'
import { notification } from 'ant-design-vue'
import { v4 as uuidv4 } from 'uuid'
import { getAiModel, getChatDetailList, getConversationList } from '@/api/ai/ai'
import eventBus from '@/utils/eventBus'
import { updateGlobalState, getGlobalState } from '@renderer/agent/storage/state'
import type { HistoryItem as TaskHistoryItem } from '@renderer/agent/storage/shared'
// 异步加载 Markdown 渲染组件
const MarkdownRenderer = defineAsyncComponent(
  () => import('@views/components/AiTab/MarkdownRenderer.vue')
)

import { ChatermMessage } from 'src/main/agent/shared/ExtensionMessage'

interface HistoryItem {
  id: string
  chatTitle: string
  chatType: string
  chatContent: ChatMessage[]
}

const historyList = ref<HistoryItem[]>([])

const chatInputValue = ref('')
const chatModelValue = ref('qwen-chat')
const chatTypeValue = ref('ctm-agent')
const activeKey = ref('chat')

// 当前活动对话的 ID
const currentChatId = ref<string | null>(null)
const authTokenInCookie = ref<string | null>(null)

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: string
  ask?: string
  say?: string
  action?: 'approved' | 'rejected'
  ts?: number
}

interface AssetInfo {
  uuid: string
  title: string
  ip?: string
  organizationId?: string
  type?: string
}

const chatHistory = reactive<ChatMessage[]>([])
const webSocket = ref<WebSocket | null>(null)

const props = defineProps({
  toggleSidebar: {
    type: Function,
    required: true
  }
})

interface ModelOption {
  label: string
  value: string
}

const AiModelsOptions = ref<ModelOption[]>([])
const AiTypeOptions = [
  { label: 'Chat', value: 'ctm-chat' },
  { label: 'Cmd', value: 'ctm-cmd' },
  { label: 'Agent', value: 'ctm-agent' }
]

const getChatermMessages = async () => {
  const result = await (window.api as any).chatermGetChatermMessages({
    taskId: currentChatId.value
  })
  const messages = result as ChatermMessage[]
  console.log('result', messages)
  return messages
}

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
      console.log('获取到资产信息:', assetInfo)
      return assetInfo
    } else {
      console.error('未能获取到当前标签页的资产信息:')
      return null
    }
  } catch (error) {
    console.error('获取资产信息时发生错误:', error)
    return null
  }
}

// 切换标签时候，当前的对话ID修改为对应的chat tag的id
const handleTabChange = (key: string | number) => {
  currentChatId.value = historyList.value.find((item) => item.chatType === key)?.id || null
}

// 创建 WebSocket 连接的函数
const createWebSocket = (type: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // console.log('当前协议:', protocol)
  const token = JSON.parse(JSON.stringify(authTokenInCookie.value))
  const wsUrl = `${protocol}//demo.chaterm.ai/v1/ai/chat/ws?token=${token}`
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    // console.log(`${type} WebSocket 连接成功`)
    // 设置定时发送ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      } else {
        clearInterval(pingInterval)
      }
    }, 30000) // 每30秒发送一次ping

    // 在WebSocket关闭时清除定时器
    ws.onclose = () => {
      clearInterval(pingInterval)
      // console.log(`${type} WebSocket连接已关闭`)
      webSocket.value = null
    }
  }

  ws.onmessage = (e) => {
    try {
      const parsedData = JSON.parse(e.data)
      // 处理pong消息
      if (parsedData.type === 'pong') {
        // console.log('收到服务器pong响应')
        return
      }
      if (parsedData.conversation_id) {
        // console.log('更新会话ID:', parsedData.conversation_id)
        currentChatId.value = parsedData.conversation_id
      }
      if (
        parsedData.choices &&
        parsedData.choices[0] &&
        parsedData.choices[0].delta &&
        parsedData.choices[0].delta.content
      ) {
        const currentHistoryEntry = historyList.value.find(
          (entry) => entry.id === currentChatId.value
        )

        if (chatHistory.at(-1)?.role === 'assistant') {
          const lastAssistantMessage = chatHistory.at(-1)!
          lastAssistantMessage.content += parsedData.choices[0].delta.content

          // 同时更新 historyList 中的记录
          if (currentHistoryEntry) {
            const lastHistoryContent = currentHistoryEntry.chatContent.at(-1)
            if (lastHistoryContent?.role === 'assistant') {
              lastHistoryContent.content += parsedData.choices[0].delta.content
            }
          }
        } else {
          const newMessage: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: parsedData.choices[0].delta.content,
            type: 'message',
            ask: '',
            say: ''
          }
          chatHistory.push(newMessage)

          // 同时更新 historyList 中的记录
          if (currentHistoryEntry) {
            currentHistoryEntry.chatContent.push(newMessage)
          }
        }
      }
    } catch (error) {
      console.error('解析消息错误:', error)
      chatHistory.push({
        id: uuidv4(),
        role: 'assistant',
        content: '连接失败，请检查服务器状态',
        type: 'message',
        ask: '',
        say: ''
      } as ChatMessage)
    }
  }

  ws.onerror = (error) => {
    console.error(`${type} WebSocket错误:`, error)
    chatHistory.push({
      id: uuidv4(),
      role: 'assistant',
      content: '连接失败，请检查服务器状态',
      type: 'message',
      ask: '',
      say: ''
    } as ChatMessage)
  }

  return ws
}

const sendMessage = () => {
  const userContent = chatInputValue.value.trim()
  if (!userContent) return
  if (chatTypeValue.value === 'ctm-agent') {
    sendMessageToMain(userContent)

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: userContent,
      type: 'message',
      ask: '',
      say: ''
    }
    chatHistory.push(userMessage)
    chatInputValue.value = ''
    return
  }

  // 如果没有 WebSocket 连接，创建新的连接
  if (!webSocket.value) {
    webSocket.value = createWebSocket(chatTypeValue.value)
  }

  // 等待连接建立
  if (webSocket.value.readyState === WebSocket.CONNECTING) {
    webSocket.value.onopen = () => {
      sendWebSocketMessage(webSocket.value!, chatTypeValue.value)
    }
    return
  }

  // 如果连接已经打开，直接发送消息
  if (webSocket.value.readyState === WebSocket.OPEN) {
    sendWebSocketMessage(webSocket.value, chatTypeValue.value)
  }
}

const sendWebSocketMessage = (ws: WebSocket, type: string) => {
  const userContent = chatInputValue.value
  const currentHistoryEntry = historyList.value.find((entry) => entry.id === currentChatId.value)

  if (currentHistoryEntry) {
    if (currentHistoryEntry.chatContent.length === 0) {
      currentHistoryEntry.chatTitle =
        userContent.length > 15 ? userContent.substring(0, 15) + '.' : userContent
    }
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: userContent,
      type: 'message',
      ask: '',
      say: ''
    }
    currentHistoryEntry.chatContent.push(userMessage)
  }

  const userMessage: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userContent,
    type: 'message',
    ask: '',
    say: ''
  }
  chatHistory.push(userMessage)

  const messageData = {
    model: chatModelValue.value,
    messages: [{ role: 'user', content: userContent }],
    modelMethod: type,
    conversationId: currentChatId.value?.length === 56 ? currentChatId.value : ''
  }

  ws.send(JSON.stringify(messageData))
  chatInputValue.value = ''
}

const handleClose = () => {
  props.toggleSidebar('right')
  eventBus.emit('updateRightIcon', false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const handlePlusClick = () => {
  const currentInput = chatInputValue.value
  const newChatId = uuidv4()
  currentChatId.value = newChatId
  chatTypeValue.value = 'ctm-cmd'

  const chatTitle = currentInput
    ? currentInput.length > 15
      ? currentInput.substring(0, 15) + '...'
      : currentInput
    : `New chat`

  historyList.value.unshift({
    id: newChatId,
    chatTitle,
    chatType: chatTypeValue.value,
    chatContent: []
  })

  chatHistory.length = 0
  chatInputValue.value = ''

  if (currentInput.trim()) {
    sendMessage()
  }
}

const restoreHistoryTab = async (history: HistoryItem) => {
  if (webSocket.value) {
    webSocket.value.close()
    webSocket.value = null
  }

  currentChatId.value = history.id
  chatTypeValue.value = history.chatType

  try {
    if (history.chatType === 'ctm-agent') {
      const conversationHistory = await getChatermMessages()
      chatHistory.length = 0
      // 按时间戳排序
      conversationHistory.forEach((item, index) => {
        if (item.ask === 'followup' || item.ask === 'command' || item.say === 'text') {
          let role: 'assistant' | 'user' = 'assistant'
          if (index === 0) {
            role = 'user'
          }
          const userMessage: ChatMessage = {
            id: uuidv4(),
            role: role,
            content: item.text || '',
            type: item.type,
            ask: item.ask,
            say: item.say
          }
          chatHistory.push(userMessage)
        }
      })

      await (window.api as any).sendToMain({
        type: 'showTaskWithId',
        text: history.id
      })
    } else {
      const res = await getChatDetailList({
        conversationId: history.id,
        limit: 10,
        offset: 0
      })

      const chatContentTemp = res.data.list
        .map((item: any) => {
          try {
            const parsedContent = JSON.parse(item.content)
            if (
              typeof parsedContent === 'object' &&
              parsedContent !== null &&
              ['user', 'assistant'].includes(parsedContent.role) &&
              typeof parsedContent.content === 'string'
            ) {
              return {
                id: uuidv4(),
                role: parsedContent.role as 'user' | 'assistant',
                content: parsedContent.content,
                type: 'message',
                ask: '',
                say: ''
              } as ChatMessage
            }
          } catch (e) {
            console.error('解析聊天记录失败:', e)
          }
          return null
        })
        .filter(Boolean)

      chatHistory.length = 0
      chatHistory.push(...chatContentTemp)
    }
    chatInputValue.value = ''
  } catch (err) {
    console.error(err)
  }
}

const handleHistoryClick = async () => {
  try {
    if (chatTypeValue.value === 'ctm-agent') {
      // 从 globalState 获取所有 agent 历史记录并按 ts 倒序排序
      const agentHistory = (
        ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      ).sort((a, b) => b.ts - a.ts)
      // 转换格式并添加到历史列表
      historyList.value = []
      agentHistory.forEach((messages) => {
        historyList.value.push({
          id: messages.id,
          chatTitle: messages?.task?.substring(0, 15) + '...' || 'Agent Chat',
          chatType: 'ctm-agent',
          chatContent: []
        })
      })
    } else {
      const res = await getConversationList({})
      historyList.value = res.data.list
        .filter((item) => item.conversateType !== 'ctm-agent')
        .map((item: any) => ({
          id: item.conversationId,
          chatTitle: item.title,
          chatType: item.conversateType,
          chatContent: []
        }))
    }
  } catch (err) {
    console.error('Failed to get conversation list:', err)
  }
}

const handleApplyCommand = (message: ChatMessage) => {
  eventBus.emit('executeTerminalCommand', message.content + '\n')
}

const handleCopyContent = async (message: ChatMessage) => {
  try {
    await navigator.clipboard.writeText(message.content)
    eventBus.emit('executeTerminalCommand', message.content)
  } catch (err) {
    console.error('Copy failed:', err)
    notification.error({
      message: 'Error',
      description: 'Copy failed',
      duration: 3,
      placement: 'topRight'
    })
  }
}

const handleRejectContent = async (message: ChatMessage) => {
  try {
    let messageRsp = {
      type: 'askResponse',
      askResponse: 'noButtonClicked',
      text: ''
    }
    switch (message.ask) {
      case 'followup':
        // For follow-up questions, provide a generic response
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = message.content.options[1]
        break
      case 'api_req_failed':
        // Always retry API requests
        messageRsp.askResponse = 'noButtonClicked' // "Retry" button
        break
      case 'completion_result':
        // Accept the completion
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = 'Task completed failed.'
        break
      case 'auto_approval_max_req_reached':
        // Reset the count to continue
        messageRsp.askResponse = 'noButtonClicked' // "Reset and continue" button
        break
    }
    message.action = 'rejected'
    console.log('发送消息到主进程:', messageRsp)
    const response = await (window.api as any).sendToMain(messageRsp)
    console.log('主进程响应:', response)
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
  }
}

const handleApproveCommand = async (message: ChatMessage) => {
  try {
    let messageRsp = {
      type: 'askResponse',
      askResponse: message.content.options[0] ? message.content.options[0] : 'yesButtonClicked',
      text: ''
    }
    switch (message.ask) {
      case 'followup':
        // For follow-up questions, provide a generic response
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = message.content.options[0]
        break

      case 'api_req_failed':
        // Always retry API requests
        messageRsp.askResponse = 'yesButtonClicked' // "Retry" button
        break

      case 'completion_result':
        // Accept the completion
        messageRsp.askResponse = 'messageResponse'
        messageRsp.text = 'Task completed successfully.'
        break
      case 'auto_approval_max_req_reached':
        // Reset the count to continue
        messageRsp.askResponse = 'yesButtonClicked' // "Reset and continue" button
        break
    }
    message.action = 'approved'
    console.log('发送消息到主进程:', messageRsp)
    const response = await (window.api as any).sendToMain(messageRsp)
    console.log('主进程响应:', response)
  } catch (error) {
    console.error('发送消息到主进程失败:', error)
  }
}

// 声明removeListener变量
let removeListener: (() => void) | null = null

// 修改 onMounted 中的初始化代码
onMounted(async () => {
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

  currentChatId.value = chatId

  try {
    const res = await getAiModel({})
    AiModelsOptions.value = res.data.models.map((model: any) => ({
      label: model.name,
      value: model.name
    }))
  } catch (err) {
    console.error('Failed to get AI models:', err)
  }

  let lastMessage: any = null

  removeListener = (window.api as any).onMainMessage((message: any) => {
    console.log('Received main process message:', message)
    if (message?.type === 'partialMessage') {
      let openNewMessage =
        !lastMessage || lastMessage.partialMessage.ts !== message.partialMessage.ts

      // 检查是否与上一条消息完全相同
      if (lastMessage && lastMessage.partialMessage.text === message.partialMessage.text) {
        return
      }
      const lastMessageInChat = chatHistory.at(-1)

      if (openNewMessage) {
        // 创建新的assistant消息
        const newAssistantMessage: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: message.partialMessage.text,
          type: message.partialMessage.type,
          ask: message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
          say: message.partialMessage.type === 'say' ? message.partialMessage.say : '',
          ts: message.ts
        }
        chatHistory.push(newAssistantMessage)
      } else if (lastMessageInChat && lastMessageInChat.role === 'assistant') {
        lastMessageInChat.content = message.partialMessage.text
      }
      lastMessage = message
    }
    console.log('chatHistory after processing:', chatHistory)
  })
})

onUnmounted(() => {
  if (typeof removeListener === 'function') {
    removeListener()
    removeListener = null
  }
})

// 添加发送消息到主进程的方法
const sendMessageToMain = async (userContent: string) => {
  try {
    let message
    if (chatHistory.length === 0) {
      const assetInfo = await getCurentTabAssetInfo()
      if (!assetInfo) {
        notification.error({
          message: '获取当前资产连接信息失败',
          description: '请先建立资产连接',
          duration: 3
        })
        return
      }

      message = {
        type: 'newTask',
        askResponse: 'messageResponse',
        text: userContent,
        terminalUuid: assetInfo?.uuid
      }
    } else {
      message = {
        type: 'askResponse',
        askResponse: 'messageResponse',
        text: userContent
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
    height: 22px;
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
  background-color: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.chat-response-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 16px;
  scrollbar-width: thin;
  max-height: calc(100vh - 150px);
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
  gap: 16px;
  width: 100%;
  min-width: 0;

  .message {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 2px;
    font-size: 12px;
    line-height: 1.5;
    box-sizing: border-box;

    &.user {
      align-self: flex-end;
      background-color: #3a3a3a;
      color: #ffffff;
      border: none;
      width: 100%;
      margin-left: auto;
      float: right;
      clear: both;
    }

    &.assistant {
      align-self: flex-start;
      background-color: #1e2a38;
      color: #e0e0e0;
      border: 1px solid #2c3e50;
      width: 100%;
    }
  }
}

.input-send-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: #161616;
  border-radius: 8px;
  border: 1px solid #333;

  .ant-textarea {
    background-color: #1a1a1a !important;
    border: none !important;
    border-radius: 8px !important;
    color: #e0e0e0 !important;
    padding: 8px 12px !important;
    font-size: 13px !important;

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
      font-size: 12px !important;

      &:hover {
        border-color: transparent !important;
      }
    }

    :deep(.ant-select-selection-item) {
      font-size: 12px !important;
      line-height: 24px !important;
    }
  }

  .custom-round-button {
    height: 20px;
    padding: 0 8px;
    border-radius: 4px;
    font-size: 10px;
    background-color: #1656b1;
    border-color: #1656b1;
    color: white;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 3px;

    &:hover {
      background-color: #2d6fcd;
      border-color: #2d6fcd;
    }

    &:active {
      transform: translateY(0);
      box-shadow: none;
    }
  }
}

.assistant-message-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;

  .message-actions {
    display: flex;
    gap: 6px;
    margin-top: 0px;
    justify-content: flex-end;

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
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e0e0e0;
    border-radius: 4px;
    transition: all 0.3s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    &:active {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .anticon {
      font-size: 14px;
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

  .button-row {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
    margin-top: 2px;
  }
}
</style>
