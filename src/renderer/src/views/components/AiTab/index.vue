<template>
  <a-tabs
    v-model:active-key="activeKey"
    class="ai-chat-custom-tabs ai-chat-flex-container"
    @change="handleTabChange"
  >
    <a-tab-pane
      key="ctm-chat"
      tab="Chat"
    >
      <div
        v-if="chatHistoryChat.length > 0"
        class="chat-response-container"
      >
        <div class="chat-response">
          <template
            v-for="message in chatHistoryChat"
            :key="message"
          >
            <div v-if="message.role === 'assistant'">
              <MarkdownRenderer
                :content="message.content"
                :class="`message ${message.role}`"
              />
            </div>
            <div
              v-else
              :class="`message ${message.role}`"
              v-html="message.content"
            ></div>
          </template>
        </div>
      </div>
      <div class="input-container">
        <div class="input-send-container">
          <a-textarea
            v-model:value="chatInputValue"
            :placeholder="$t('ai.chatMessage')"
            style="background-color: #2b2b2b; color: #fff; border: none; box-shadow: none"
            :auto-size="{ minRows: 3, maxRows: 20 }"
            @keydown="handleKeyDown"
          />
          <div class="input-controls">
            <a-select
              v-model:value="chatrModelValue"
              size="small"
              :options="AiModelsOptions"
              show-search
            ></a-select>
            <a-button
              type="primary"
              size="small"
              class="custom-round-button compact-button"
              style="margin-left: 8px"
              @click="sendMessage"
            >
              {{ $t('ai.send') }} ⏎
            </a-button>
          </div>
        </div>
      </div>
    </a-tab-pane>
    <a-tab-pane
      key="ctm-cmd"
      tab="Cmd"
      force-render
    >
      <div
        v-if="chatHistoryCmd.length > 0"
        class="chat-response-container"
      >
        <div class="chat-response">
          <template
            v-for="message in chatHistoryCmd"
            :key="message"
          >
            <div
              v-if="message.role === 'assistant'"
              :class="`message ${message.role}`"
              class="assistant-message-container"
            >
              <div
                class="message-content"
                v-html="message.content"
              ></div>
              <div class="message-actions">
                <a-button
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
                  size="small"
                  class="action-btn apply-btn"
                  @click="handleApplyCommand(message)"
                >
                  <template #icon>
                    <PlayCircleOutlined />
                  </template>
                  {{ $t('ai.run') }}
                </a-button>
              </div>
            </div>
            <div
              v-else
              :class="`message ${message.role}`"
              v-html="message.content"
            ></div>
          </template>
        </div>
      </div>
      <div class="input-container">
        <div class="input-send-container">
          <a-textarea
            v-model:value="composerInputValue"
            :placeholder="$t('ai.commandMessage')"
            style="background-color: #2b2b2b; color: #fff; border: none; box-shadow: none"
            :auto-size="{ minRows: 3, maxRows: 20 }"
            @keydown="handleKeyDown"
          />
          <div class="input-controls">
            <a-select
              v-model:value="composerModelValue"
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
      </div>
    </a-tab-pane>
    <a-tab-pane
      key="ctm-agent"
      tab="Agent"
      force-render
    >
      <div
        v-if="chatHistoryAgent.length > 0"
        class="chat-response-container"
      >
        <div class="chat-response">
          <template
            v-for="message in chatHistoryAgent"
            :key="message"
          >
            <div
              v-if="message.role === 'assistant'"
              :class="`message ${message.role}`"
              class="assistant-message-container"
            >
              <div
                class="message-content"
                v-html="message.content"
              ></div>
              <div class="message-actions">
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
              :class="`message ${message.role}`"
              v-html="message.content"
            ></div>
          </template>
        </div>
      </div>
      <div class="input-container">
        <div class="input-send-container">
          <a-textarea
            v-model:value="agentInputValue"
            :placeholder="$t('ai.agentMessage')"
            style="background-color: #2b2b2b; color: #fff; border: none; box-shadow: none"
            :auto-size="{ minRows: 3, maxRows: 20 }"
            @keydown="handleKeyDown"
          />
          <div class="input-controls">
            <a-select
              v-model:value="composerModelValue"
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
      </div>
    </a-tab-pane>
    <template #rightExtra>
      <div class="right-extra-buttons">
        <a-button
          type="text"
          class="action-icon-btn"
          @click="handlePlusClick"
        >
          <PlusOutlined />
        </a-button>

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
                  <div class="history-type">{{
                    history.chatType === 'ctm-chat'
                      ? 'Chat'
                      : history.chatType === 'ctm-cmd'
                        ? 'Cmd'
                        : 'Agent'
                  }}</div>
                </div>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-button
          type="text"
          class="action-icon-btn"
          @click="handleClose"
        >
          <CloseOutlined />
        </a-button>
      </div>
    </template>
  </a-tabs>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, defineAsyncComponent, defineEmits } from 'vue'
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
const emit = defineEmits(['runCmd'])
// 异步加载 Markdown 渲染组件
const MarkdownRenderer = defineAsyncComponent(
  () => import('@views/components/MarkdownRenderer.vue')
)

const historyList = ref<
  Array<{
    id: string
    chatTitle: string
    chatType: string
    chatContent: Array<{ role: 'user' | 'assistant'; content: string }>
  }>
>([])

const chatInputValue = ref('')
const composerInputValue = ref('')
const agentInputValue = ref('')
const composerModelValue = ref('qwen-chat')
const chatrModelValue = ref('qwen-chat')
const agentModelValue = ref('qwen-chat')
const activeKey = ref('ctm-cmd')

// 当前活动对话的 ID
const currentChatId = ref<string | null>(null)
const authTokenInCookie = ref<string | null>(null)

// 为 CHAT ，CMD 和 Agent 分别创建独立的聊天历史记录
const chatHistoryChat = reactive<Array<{ role: string; content: string }>>([])
const chatHistoryCmd = reactive<Array<{ role: string; content: string }>>([])
const chatHistoryAgent = reactive<Array<{ role: string; content: string }>>([])

const chatWebSocket = ref<WebSocket | null>(null)
const cmdWebSocket = ref<WebSocket | null>(null)
const agentWebSocket = ref<WebSocket | null>(null)

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

// 切换标签时候，当前的对话ID修改为对应的chat tag的id
const handleTabChange = (key: string) => {
  currentChatId.value = historyList.value.find((item) => item.chatType === key)?.id || null
}

// 创建 WebSocket 连接的函数
const createWebSocket = (type: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // console.log('当前协议:', protocol)
  const token = JSON.parse(JSON.stringify(authTokenInCookie.value))
  const wsUrl = `${protocol}//demo.chaterm.ai/v1/ai/chat/ws?token=${token}`
  const ws = new WebSocket(wsUrl)
  const currentHistory =
    type === 'ctm-chat' ? chatHistoryChat : type === 'ctm-cmd' ? chatHistoryCmd : chatHistoryAgent

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
      if (type === 'ctm-chat') {
        chatWebSocket.value = null
      } else if (type === 'ctm-cmd') {
        cmdWebSocket.value = null
      } else if (type === 'ctm-agent') {
        agentWebSocket.value = null
      }
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

        if (
          currentHistory.length > 0 &&
          currentHistory[currentHistory.length - 1].role === 'assistant'
        ) {
          const lastAssistantMessage = currentHistory[currentHistory.length - 1]
          lastAssistantMessage.content += parsedData.choices[0].delta.content

          // 同时更新 historyList 中的记录
          if (currentHistoryEntry) {
            const lastHistoryContent =
              currentHistoryEntry.chatContent[currentHistoryEntry.chatContent.length - 1]
            if (lastHistoryContent && lastHistoryContent.role === 'assistant') {
              lastHistoryContent.content += parsedData.choices[0].delta.content
            }
          }
        } else {
          currentHistory.push({
            role: 'assistant',
            content: parsedData.choices[0].delta.content
          })

          // 同时更新 historyList 中的记录
          if (currentHistoryEntry) {
            currentHistoryEntry.chatContent.push({
              role: 'assistant',
              content: parsedData.choices[0].delta.content
            })
          }
        }
      }
    } catch (error) {
      console.error('解析消息错误:', error)
    }
  }

  ws.onerror = (error) => {
    console.error(`${type} WebSocket错误:`, error)
    currentHistory.push({
      role: 'assistant',
      content: '连接失败，请检查服务器状态'
    })
  }

  return ws
}

const sendMessage = () => {
  let currentWebSocket = chatWebSocket
  let userContent = chatInputValue.value
  if (activeKey.value === 'ctm-cmd') {
    currentWebSocket = cmdWebSocket
    userContent = composerInputValue.value
  } else if (activeKey.value === 'ctm-agent') {
    currentWebSocket = agentWebSocket
    userContent = agentInputValue.value
  }

  if (userContent.trim() === '') {
    return
  }

  // 如果没有 WebSocket 连接，创建新的连接
  if (!currentWebSocket.value) {
    currentWebSocket.value = createWebSocket(activeKey.value)
  }

  // 等待连接建立
  if (currentWebSocket.value.readyState === WebSocket.CONNECTING) {
    currentWebSocket.value.onopen = () => {
      sendWebSocketMessage(currentWebSocket.value!, activeKey.value)
    }
    return
  }

  // 如果连接已经打开，直接发送消息
  if (currentWebSocket.value.readyState === WebSocket.OPEN) {
    sendWebSocketMessage(currentWebSocket.value, activeKey.value)
  }
}

const sendWebSocketMessage = (ws: WebSocket, type: string) => {
  const userContent =
    type === 'ctm-chat'
      ? chatInputValue.value
      : type === 'ctm-cmd'
        ? composerInputValue.value
        : agentInputValue.value
  const currentHistory =
    type === 'ctm-chat' ? chatHistoryChat : type === 'ctm-cmd' ? chatHistoryCmd : chatHistoryAgent
  const currentModel =
    type === 'ctm-chat'
      ? chatrModelValue.value
      : type === 'ctm-cmd'
        ? composerModelValue.value
        : agentModelValue.value

  // 将消息添加到当前对话的历史记录中
  const currentHistoryEntry = historyList.value.find((entry) => entry.id === currentChatId.value)
  if (currentHistoryEntry) {
    // 如果是第一条消息，更新对话标题
    if (currentHistoryEntry.chatContent.length === 0) {
      currentHistoryEntry.chatTitle =
        userContent.length > 15 ? userContent.substring(0, 15) + '.' : userContent
    }

    currentHistoryEntry.chatContent.push({ role: 'user', content: userContent })
  }

  currentHistory.push({
    role: 'user',
    content: userContent
  })

  let seesionId = ''
  if (currentChatId.value != null && currentChatId.value.length === 56) {
    seesionId = currentChatId.value
  }
  const messageData = {
    model: currentModel,
    messages: [
      {
        role: 'user',
        content: userContent
      }
    ],
    modelMethod: type,
    conversationId: seesionId
  }

  ws.send(JSON.stringify(messageData))

  if (type === 'ctm-chat') {
    chatInputValue.value = ''
  } else if (type === 'ctm-cmd') {
    composerInputValue.value = ''
  } else if (type === 'ctm-agent') {
    agentInputValue.value = ''
  }
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

const newTabWithType = (tabType: string) => {
  // 关闭之前的 WebSocket
  if (tabType === 'ctm-chat' && chatWebSocket.value) {
    chatWebSocket.value = closeWebSocket(chatWebSocket.value)
  } else if (tabType === 'ctm-cmd' && cmdWebSocket.value) {
    cmdWebSocket.value = closeWebSocket(cmdWebSocket.value)
  } else if (tabType === 'ctm-agent' && agentWebSocket.value) {
    agentWebSocket.value = closeWebSocket(agentWebSocket.value)
  }

  const currentInput =
    tabType === 'ctm-chat'
      ? chatInputValue.value
      : tabType === 'ctm-cmd'
        ? composerInputValue.value
        : agentInputValue.value

  // 始终创建新的对话记录，不依赖于之前的 currentChatId
  const newChatId = uuidv4()
  currentChatId.value = newChatId

  // 如果有输入内容，使用输入内容的前15个字作为标题
  const chatTitle = currentInput
    ? currentInput.length > 15
      ? currentInput.substring(0, 15) + '...'
      : currentInput
    : `新对话 ${historyList.value.length + 1}`

  const newHistoryEntry = {
    id: newChatId,
    chatTitle: chatTitle,
    chatType: tabType,
    chatContent: []
  }

  // 使用 unshift 将新的历史记录项插入到数组开头
  historyList.value.unshift(newHistoryEntry)

  if (tabType === 'ctm-chat') {
    chatInputValue.value = ''
    chatHistoryChat.length = 0
    activeKey.value = 'ctm-chat'
  } else if (tabType === 'ctm-cmd') {
    composerInputValue.value = ''
    chatHistoryCmd.length = 0
    activeKey.value = 'ctm-cmd'
  } else if (tabType === 'ctm-agent') {
    agentInputValue.value = ''
    chatHistoryAgent.length = 0
    activeKey.value = 'ctm-agent'
  }

  if (currentInput.trim() !== '') {
    sendMessage()
  }
}

const handlePlusClick = () => {
  const currentTabType =
    activeKey.value === 'ctm-chat'
      ? 'ctm-chat'
      : activeKey.value === 'ctm-cmd'
        ? 'ctm-cmd'
        : 'ctm-agent'
  const currentInput =
    currentTabType === 'ctm-chat'
      ? chatInputValue.value
      : currentTabType === 'ctm-cmd'
        ? composerInputValue.value
        : agentInputValue.value
  if (!currentInput.trim()) {
    return
  }
  newTabWithType(currentTabType)
}

const restoreHistoryTab = (history: {
  id: string
  chatTitle: string
  chatType: string
  chatContent: Array<{ role: 'user' | 'assistant'; content: string }>
}) => {
  // 关闭之前的 WebSocket
  if (chatWebSocket.value) {
    chatWebSocket.value.close()
    chatWebSocket.value = null
  }
  if (cmdWebSocket.value) {
    cmdWebSocket.value.close()
    cmdWebSocket.value = null
  }
  if (agentWebSocket.value) {
    agentWebSocket.value.close()
    agentWebSocket.value = null
  }

  // 重置当前对话 ID
  currentChatId.value = history.id

  // 根据历史记录的类型切换 activeKey
  activeKey.value = history.chatType

  // 获取当前chat的聊天历史记录
  getChatDetailList({
    conversationId: history.id,
    limit: 10,
    offset: 0
  })
    .then((res) => {
      const chatContentTemp = reactive<Array<{ role: string; content: string }>>([])
      res.data.list.forEach((item: any) => {
        try {
          const parsedContent = JSON.parse(item.content)
          if (
            typeof parsedContent === 'object' &&
            parsedContent !== null &&
            ['user', 'assistant'].includes(parsedContent.role) &&
            typeof parsedContent.content === 'string'
          ) {
            chatContentTemp.push({
              role: parsedContent.role as 'user' | 'assistant',
              content: parsedContent.content
            })
          }
        } catch (e) {
          console.error('解析聊天记录失败:', e)
        }
      })
      // 清空当前聊天历史
      if (history.chatType === 'ctm-chat') {
        chatHistoryChat.length = 0
        chatHistoryChat.push(...chatContentTemp)
        chatInputValue.value = ''
      } else if (history.chatType === 'ctm-cmd') {
        chatHistoryCmd.length = 0
        chatHistoryCmd.push(...chatContentTemp)
        composerInputValue.value = ''
      } else if (history.chatType === 'ctm-agent') {
        chatHistoryAgent.length = 0
        chatHistoryAgent.push(...chatContentTemp)
        agentInputValue.value = ''
      }
    })
    .catch((err) => console.error(err))
}

const handleHistoryClick = () => {
  getConversationList({})
    .then((res) => {
      // 清空历史记录列表
      historyList.value = []
      res.data.list.forEach((item: any) => {
        historyList.value.push({
          id: item.conversationId,
          chatTitle: item.title,
          chatType: item.conversateType,
          chatContent: []
        })
      })
    })
    .catch((err) => console.error(err))
}

const handleApplyCommand = (message: { content: string }) => {
  // notification.success({
  //   message: '成功',
  //   description: '命令执行成功！',
  //   placement: 'topRight',
  //   duration: 1
  // })
  emit('runCmd', message.content + '\n')
  console.log('执行命令:', message.content)
}

const handleCopyContent = (message: { content: string }) => {
  navigator.clipboard
    .writeText(message.content)
    .then(() => {
      // notification.success({
      //   message: '成功',
      //   description: '已复制到终端',
      //   placement: 'topRight',
      //   duration: 1
      // })
      emit('runCmd', message.content)
    })
    .catch((err) => {
      console.error('复制失败:', err)
      notification.error({
        message: '错误',
        description: '复制失败',
        duration: 3,
        placement: 'topRight'
      })
    })
}

const handleRejectContent = (message: { content: string }) => {
  console.log('拒绝执行命令:', message.content)
}

const handleApproveCommand = (message: { content: string }) => {
  console.log('同意执行命令:', message.content)
}

// 修改 onMounted 中的初始化代码
onMounted(async () => {
  authTokenInCookie.value = localStorage.getItem('ctm-token')
  // 为 CHAT 标签创建初始会话
  const chatId = uuidv4()
  historyList.value.unshift({
    id: chatId,
    chatTitle: '新对话 (CHAT)',
    chatType: 'ctm-chat',
    chatContent: []
  })

  // 为 CMD 标签创建初始会话
  const cmdId = uuidv4()
  historyList.value.unshift({
    id: cmdId,
    chatTitle: '新对话 (CMD)',
    chatType: 'ctm-cmd',
    chatContent: []
  })

  // 为 AGENT 标签创建初始会话
  const agentId = uuidv4()
  historyList.value.unshift({
    id: agentId,
    chatTitle: '新对话 (AGENT)',
    chatType: 'ctm-agent',
    chatContent: []
  })

  // 设置初始的 currentChatId 为 CHAT 标签的会话 ID
  currentChatId.value = chatId
  // 获取可用模型
  getAiModel({})
    .then((res) => {
      res.data.models.forEach((model: any) => {
        const item = {
          label: model.name,
          value: model.name
        }
        AiModelsOptions.value.push(item)
      })
    })
    .catch((err) => console.error(err))
})

const closeWebSocket = (ws: WebSocket | null): WebSocket | null => {
  if (!ws) return null
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, '正常关闭')
      setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          console.warn('WebSocket 关闭超时，强制置为 null')
        }
      }, 1000)
    } else {
      console.log(`WebSocket 当前状态: ${ws.readyState}，不需要关闭`)
    }
  } catch (error) {
    console.error('关闭 WebSocket 时发生错误:', error)
  }

  return null
}
</script>

<style lang="less" scoped>
.ai-chat-custom-tabs {
  :deep(.ant-tabs-tab:not(.ant-tabs-tab-active) .ant-tabs-tab-btn) {
    color: #81b0bf;
    font-weight: 600;
    transition:
      color 0.2s,
      text-shadow 0.2s;
  }

  :deep(.ant-tabs-nav) {
    height: 22px;
    margin-bottom: 8px;
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
  max-height: calc(100vh - 200px);

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

  .message {
    width: 100%;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.5;

    &.user {
      align-self: flex-end;
      background-color: #2c3e50;
      color: #e0e0e0;
      border: 1px solid #34495e;
      max-width: 85%;
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

.input-container {
  padding: 16px;
  background-color: #1a1a1a;
  border-top: 1px solid #333;
}

.input-send-container {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .ant-textarea {
    background-color: #2a2a2a !important;
    border: 1px solid #3a3a3a !important;
    border-radius: 8px !important;
    color: #e0e0e0 !important;
    padding: 8px 12px !important;
    font-size: 13px !important;

    &:hover,
    &:focus {
      border-color: #4caf50 !important;
      box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1) !important;
    }
  }
}

.input-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .ant-select {
    width: 150px;

    :deep(.ant-select-selector) {
      background-color: #2a2a2a !important;
      border: 1px solid #3a3a3a !important;
      border-radius: 6px !important;
      color: #e0e0e0 !important;

      &:hover {
        border-color: #4caf50 !important;
      }
    }
  }

  .custom-round-button {
    height: 24px;
    padding: 0 16px;
    border-radius: 6px;
    font-size: 10px;
    background-color: #4caf50;
    border-color: #4caf50;
    color: white;
    transition: all 0.2s ease;

    &:hover {
      background-color: #45a049;
      border-color: #45a049;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.assistant-message-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  .message-content {
    width: 100%;
    font-size: 12px;
    line-height: 1.6;
    color: #e0e0e0;
    word-break: break-word;
    overflow-wrap: break-word;

    // 代码块样式
    pre {
      background-color: #1e1e1e;
      border-radius: 6px;
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
      border: 1px solid #333;

      code {
        font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        line-height: 1.5;
      }
    }

    // 行内代码样式
    code:not(pre code) {
      background-color: #2a2a2a;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      color: #e0e0e0;
      border: 1px solid #3a3a3a;
    }

    // 列表样式
    ul,
    ol {
      padding-left: 20px;
      margin: 8px 0;

      li {
        margin: 4px 0;
      }
    }

    // 引用块样式
    blockquote {
      border-left: 4px solid #4caf50;
      margin: 8px 0;
      padding: 8px 16px;
      background-color: #1e2a38;
      border-radius: 0 4px 4px 0;
    }

    // 标题样式
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 16px 0 8px;
      color: #fff;
      font-weight: 600;
      line-height: 1.4;

      &:first-child {
        margin-top: 0;
      }
    }

    h1 {
      font-size: 1.8em;
    }

    h2 {
      font-size: 1.5em;
    }

    h3 {
      font-size: 1.3em;
    }

    h4 {
      font-size: 1.2em;
    }

    h5 {
      font-size: 1.1em;
    }

    h6 {
      font-size: 1em;
    }

    // 表格样式
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      background-color: #1e2a38;
      border-radius: 4px;
      overflow: hidden;

      th,
      td {
        padding: 8px 12px;
        border: 1px solid #333;
      }

      th {
        background-color: #2c3e50;
        font-weight: 600;
      }

      tr:nth-child(even) {
        background-color: #1a2530;
      }
    }

    // 水平线样式
    hr {
      border: none;
      border-top: 1px solid #333;
      margin: 16px 0;
    }

    // 链接样式
    a {
      color: #4caf50;
      text-decoration: none;
      transition: color 0.2s;

      &:hover {
        color: #45a049;
        text-decoration: underline;
      }
    }

    // 图片样式
    img {
      max-width: 100%;
      border-radius: 4px;
      margin: 8px 0;
    }

    // 强调文本样式
    strong {
      font-weight: 600;
      color: #fff;
    }

    em {
      font-style: italic;
      color: #ccc;
    }
  }

  .message-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
    justify-content: flex-end;

    .action-btn {
      height: 24px;
      padding: 0 8px;
      border-radius: 4px;
      font-size: 11px;
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

:deep(.ant-dropdown-menu) {
  background-color: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  padding: 4px;

  .ant-dropdown-menu-item {
    color: #e0e0e0;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 4px;

    &:hover {
      background-color: #3a3a3a;
      color: #4caf50;
    }
  }
}

:deep(.ant-select-dropdown) {
  background-color: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;

  .ant-select-item {
    color: #e0e0e0;
    font-size: 13px;
    padding: 8px 12px;

    &:hover {
      background-color: #3a3a3a;
      color: #4caf50;
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

:deep(.ant-tabs-nav) {
  .ant-tabs-nav-wrap {
    .ant-tabs-nav-list {
      .ant-tabs-tab {
        &:last-child {
          margin-right: 0;
        }
      }
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
</style>
