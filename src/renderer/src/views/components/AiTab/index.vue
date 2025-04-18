<template>
  <a-tabs
    v-model:activeKey="activeKey"
    class="ai-chat-custom-tabs ai-chat-flex-container"
    @change="handleTabChange"
  >
    <a-tab-pane key="ctm-chat" tab="Chat">
      <div class="chat-response-container" v-if="chatHistoryChat.length > 0">
        <div class="chat-response">
          <template v-for="message in chatHistoryChat" :key="message">
            <div v-if="message.role === 'assistant'">
              <MarkdownRenderer :content="message.content" :class="`message ${message.role}`" />
            </div>
            <div v-else :class="`message ${message.role}`" v-html="message.content"></div>
          </template>
        </div>
      </div>
      <div class="input-container">
        <div class="input-send-container">
          <a-textarea
            v-model:value="chatInputValue"
            placeholder="Ask AI chat"
            style="background-color: gray; color: #fff"
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
              @click="sendMessage"
              class="custom-round-button compact-button"
              style="margin-left: 8px"
            >
              Send ⏎
            </a-button>
          </div>
        </div>
      </div>
    </a-tab-pane>
    <a-tab-pane key="ctm-cmd" tab="Cmd" force-render>
      <div class="chat-response-container" v-if="chatHistoryCmd.length > 0">
        <div class="chat-response">
          <template v-for="message in chatHistoryCmd" :key="message">
            <div
              v-if="message.role === 'assistant'"
              :class="`message ${message.role}`"
              class="assistant-message-container"
            >
              <div class="message-actions">
                <a-button
                  type="primary"
                  size="small"
                  class="action-btn copy-btn"
                  @click="handleCopyContent(message.content)"
                >
                  <CopyOutlined />
                </a-button>
                <a-button
                  type="primary"
                  size="small"
                  class="action-btn apply-btn"
                  @click="handleApplyCommand(message)"
                >
                  Run
                </a-button>
              </div>
              <div v-html="message.content" class="message-content"></div>
            </div>
            <div v-else :class="`message ${message.role}`" v-html="message.content"></div>
          </template>
        </div>
      </div>
      <div class="input-container">
        <div class="input-send-container">
          <a-textarea
            v-model:value="composerInputValue"
            placeholder="查询命令"
            style="background-color: gray; color: #fff"
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
              type="primary"
              size="small"
              @click="sendMessage"
              class="custom-round-button compact-button"
              style="margin-left: 8px"
            >
              Send⏎
            </a-button>
          </div>
        </div>
      </div>
    </a-tab-pane>
    <template #rightExtra>
      <PlusOutlined
        @click="handlePlusClick"
        style="color: #fff; margin-left: 1px; font-size: 13x"
      />

      <a-dropdown :trigger="['click']">
        <HistoryOutlined
          @click="handleHistoryClick"
          style="color: #fff; margin-left: 10px; font-size: 13px"
        />
        <template #overlay>
          <a-menu>
            <a-menu-item
              v-for="(history, index) in historyList"
              :key="index"
              @click="restoreHistoryTab(history)"
            >
              {{ history.chatTitle }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>

      <CloseOutlined @click="handleClose" style="color: #fff; margin-left: 13px; font-size: 11px" />
    </template>
  </a-tabs>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, defineAsyncComponent } from 'vue'
import { PlusOutlined, CloseOutlined, HistoryOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { notification } from 'ant-design-vue'
import { v4 as uuidv4 } from 'uuid'
import { getAiModel, getChatDetailList, getConversationList } from '@/api/ai/ai'

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
const composerModelValue = ref('qwen-chat')
const chatrModelValue = ref('qwen-chat')
const activeKey = ref('ctm-chat')

// 当前活动对话的 ID
const currentChatId = ref<string | null>(null)
const authTokenInCookie = ref<string | null>(null)

// 为 CHAT 和 CMD 分别创建独立的聊天历史记录
const chatHistoryChat = reactive<Array<{ role: string; content: string }>>([])
const chatHistoryCmd = reactive<Array<{ role: string; content: string }>>([])

const chatWebSocket = ref<WebSocket | null>(null)
const cmdWebSocket = ref<WebSocket | null>(null)

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
  let token = JSON.parse(JSON.stringify(authTokenInCookie.value))
  const wsUrl = `${protocol}//demo.chaterm.ai:8000/v1/ai/chat/ws?token=${token}`
  const ws = new WebSocket(wsUrl)
  const currentHistory = type === 'ctm-chat' ? chatHistoryChat : chatHistoryCmd

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
      } else {
        cmdWebSocket.value = null
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
  const currentWebSocket = activeKey.value === 'ctm-chat' ? chatWebSocket : cmdWebSocket
  const userContent =
    activeKey.value === 'ctm-chat' ? chatInputValue.value : composerInputValue.value

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
  const userContent = type === 'ctm-chat' ? chatInputValue.value : composerInputValue.value
  const currentHistory = type === 'ctm-chat' ? chatHistoryChat : chatHistoryCmd
  const currentModel = type === 'ctm-chat' ? chatrModelValue.value : composerModelValue.value

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
  } else {
    composerInputValue.value = ''
  }
}

const handleClose = () => {
  props.toggleSidebar('right')
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
  }

  const currentInput = tabType === 'ctm-chat' ? chatInputValue.value : composerInputValue.value

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
  }

  if (currentInput.trim() !== '') {
    sendMessage()
  }
}

const handlePlusClick = () => {
  const currentTabType = activeKey.value === 'ctm-chat' ? 'ctm-chat' : 'ctm-cmd'
  const currentInput =
    currentTabType === 'ctm-chat' ? chatInputValue.value : composerInputValue.value
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
      } else {
        chatHistoryCmd.length = 0
        chatHistoryCmd.push(...chatContentTemp)
        composerInputValue.value = ''
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
  notification.success({
    message: '成功',
    description: '命令执行成功！',
    placement: 'topRight',
    duration: 1
  })
  console.log('执行命令:', message.content)
}

const handleCopyContent = (content: string) => {
  navigator.clipboard
    .writeText(content)
    .then(() => {
      notification.success({
        message: '成功',
        description: '已复制到剪贴板',
        placement: 'topRight',
        duration: 1
      })
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

<style>
/* 移除 scoped 属性，让样式全局生效 */
.ai-chat-custom-tabs .ant-tabs-tab {
  color: #ccc;
  font-size: 12px;
  padding: 6px 2px;
  height: 28px;
  line-height: 16px;
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  text-align: center;
  /* overflow: hidden; */
}

.ai-chat-custom-tabs .ant-tabs-tab-active {
  color: #404040;
  width: 30px;
}

.ai-chat-custom-tabs .ant-tabs-nav {
  margin-bottom: 0;
  margin-top: 0;
  height: 22px;
}

.ai-chat-custom-tabs .ant-tabs-content-holder {
  font-size: 12px;
}

.ai-chat-custom-tabs .ant-tabs-ink-bar {
  background-color: #4caf50;
}

.ai-chat-custom-tabs .ant-tabs-tab:hover {
  color: #4caf50;
}

.ai-chat-custom-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
  color: #4caf50 !important;
}

.ai-chat-custom-tabs .ant-tabs-nav::before {
  border-bottom: none;
}

.ai-chat-custom-tabs .ant-select-selector {
  background-color: #333 !important;
  color: #7b7a7a !important;
}

.ai-chat-custom-tabs .ant-select-selection-item {
  color: #7b7a7a !important;
}

/* 修改 chat-response-container 的样式 */
.ai-chat-custom-tabs .chat-response-container {
  flex-grow: 1;
  overflow-y: auto;
  border: 1px solid #333;
  border-radius: 4px;
  background-color: #1a1a1a;
  scrollbar-width: thin;
  /* Firefox */
  scrollbar-color: #4a4a4a;
  /* Firefox */

  /* 限制最大高度为视窗高度的80% */
  max-height: 70vh;
}

/* 添加 flex 布局以确保正确的高度分配 */
.ai-chat-flex-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 修改 input-container 的样式 */
.ai-chat-custom-tabs .input-container {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  height: 20vh;
}

.ai-chat-custom-tabs .input-container .ant-textarea {
  flex-grow: 1;
  margin-bottom: 10px;
}

.ai-chat-custom-tabs .input-container .ant-select {
  align-self: flex-start;
  width: 100%;
  /* 使 select 宽度填满容器 */
  max-width: 200px;
  /* 限制最大宽度 */
  margin-top: 5px;
  /* 添加一些间距 */
}

.ai-chat-custom-tabs .chat-response {
  padding: 8px;
  color: #ffffff;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 100%;
  overflow-y: auto;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.ai-chat-custom-tabs .chat-response .message {
  margin-bottom: 10px;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.ai-chat-custom-tabs .chat-response .message.assistant {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.ai-chat-custom-tabs .chat-response .message.user {
  background-color: #2c3e50;
  /* 深蓝色背景 */
  color: #c9c8c8;
  /* 浅色文字 */
  align-self: flex-end;
  /* 靠右对齐 */
  margin-left: auto;
  border: 1px solid #34495e;
  max-width: 96%;
  border-radius: 8px;
  padding: 10px;
  word-wrap: break-word;
  font-size: 11px;
}

.ai-chat-custom-tabs .chat-response .message.assistant {
  background-color: #1e2a38;
  /* 深灰色背景 */
  color: #bdc3c7;
  /* 灰色文字 */
  align-self: flex-start;
  /* 靠左对齐 */
  margin-right: auto;
  border: 1px solid #2c3e50;
  max-width: 100%;
  border-radius: 8px;
  padding: 11px;
  word-wrap: break-word;
}

/* 其他滚动条样式保持不变 */
.ai-chat-custom-tabs .chat-response-container::-webkit-scrollbar {
  width: 8px;
}

.ai-chat-custom-tabs .chat-response-container::-webkit-scrollbar-thumb {
  background-color: #4a4a4a;
  border-radius: 4px;
}

.ai-chat-custom-tabs .chat-response-container::-webkit-scrollbar-thumb:hover {
  background-color: #5a5a5a;
}

/* 添加 Markdown 相关样式 */
.ai-chat-custom-tabs .chat-response .message pre {
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}

.ai-chat-custom-tabs .chat-response .message code {
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 0.9em;
}

/* 统一所有 Markdown 元素的样式 */
/* 重置所有元素的基础样式 */
.ai-chat-custom-tabs .chat-response .message * {
  font-size: 12px !important;
  color: #bdc3c7 !important;
  font-weight: normal !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.5 !important;
  border-spacing: 0 !important;
}

/* 段落和块级元素间距 */
.ai-chat-custom-tabs .chat-response .message p,
.ai-chat-custom-tabs .chat-response .message div,
.ai-chat-custom-tabs .chat-response .message h1,
.ai-chat-custom-tabs .chat-response .message h2,
.ai-chat-custom-tabs .chat-response .message h3,
.ai-chat-custom-tabs .chat-response .message h4,
.ai-chat-custom-tabs .chat-response .message h5,
.ai-chat-custom-tabs .chat-response .message h6,
.ai-chat-custom-tabs .chat-response .message ul,
.ai-chat-custom-tabs .chat-response .message ol,
.ai-chat-custom-tabs .chat-response .message li,
.ai-chat-custom-tabs .chat-response .message pre,
.ai-chat-custom-tabs .chat-response .message blockquote {
  margin-top: 5px !important;
  margin-bottom: 5px !important;
}

/* 列表项特殊处理 */
.ai-chat-custom-tabs .chat-response .message li {
  margin-left: 20px !important;
  display: list-item !important;
}

/* 有序列表数字样式统一 */
.ai-chat-custom-tabs .chat-response .message ol {
  list-style-type: decimal !important;
  padding-left: 20px !important;
}

/* 无序列表样式统一 */
.ai-chat-custom-tabs .chat-response .message ul {
  list-style-type: disc !important;
  padding-left: 20px !important;
}

/* 清除列表和列表项之间的额外间距 */
.ai-chat-custom-tabs .chat-response .message ul li,
.ai-chat-custom-tabs .chat-response .message ol li {
  padding: 0 !important;
  margin-top: 5px !important;
  margin-bottom: 5px !important;
}

/* 水平线样式 */
.ai-chat-custom-tabs .chat-response .message hr {
  border: none !important;
  border-top: 1px solid #3a3a3a !important;
  margin: 10px 0 !important;
}

/* 链接样式 */
.ai-chat-custom-tabs .chat-response .message a {
  text-decoration: none !important;
}

/* 引用块样式 */
.ai-chat-custom-tabs .chat-response .message blockquote {
  border-left: 4px solid #4caf50 !important;
  padding-left: 10px !important;
}

代码样式 .ai-chat-custom-tabs .chat-response .message code,
.ai-chat-custom-tabs .chat-response .message pre {
  background-color: #282828 !important;
  border-radius: 3px !important;
}

.ai-chat-custom-tabs .chat-response .message pre {
  padding: 10px !important;
  overflow-x: auto !important;
  margin: 5px 0 !important;
}

/* 确保内容区域内的间距一致 */
.ai-chat-custom-tabs .chat-response .message {
  line-height: 1.5 !important;
}

/* 更新下拉菜单样式 */
.ant-dropdown {
  background-color: transparent !important;
}

.ant-dropdown-menu {
  max-height: 300px !important;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: #333 !important;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  width: 195px !important;
  /* 固定宽度 */
  border: 0.1px solid #6e6e6e;
}

.ant-dropdown-menu::-webkit-scrollbar {
  width: 6px;
  /* 调整为你想要的宽度 */
}

/* 滚动条轨道 */
.ant-dropdown-menu::-webkit-scrollbar-track {
  background: rgba(18, 18, 18, 0.8);
  border-radius: 3px;
}

/* 滚动条滑块 */
.ant-dropdown-menu::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.5);
  border-radius: 3px;
}

.ant-dropdown-menu-item {
  color: #ffffff !important;
  background-color: #333 !important;
  transition: all 0.3s;
  font-size: 12px !important;
  padding: 2px 7px !important;
  /* 减小内边距 */
  margin: 2px 0 !important;
  /* 设置项目间距为5px (2px + 2px + 1px border) */
  border-bottom: 1px solid #444;
  /* 添加分隔线 */
}

.ant-dropdown-menu-item:last-child {
  border-bottom: none;
  /* 最后一项不需要分隔线 */
}

.ant-dropdown-menu-item:hover {
  background-color: #4a4a4a !important;
  color: #4caf50 !important;
}

/* 为 Apply 按钮添加样式 */
.assistant-message-container {
  position: relative;
}

.message-actions {
  background-color: #1a1a1a;
  /* 更深的背景色 */
  padding: 4px 8px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  border-bottom: 1px solid #333;
  /* 添加底部边框 */
  margin: -10px -10px 10px -10px;
  /* 负边距使其延伸到边缘 */
}

/* 调整按钮样式以配合新的背景 */
.action-btn {
  height: 14px;
  min-width: 14px;
  padding: 0;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 14px;
}

.copy-btn {
  background-color: #444 !important;
  border-color: #444 !important;
}

.apply-btn {
  background-color: #444 !important;
  border-color: #444 !important;
  min-width: 30px;
}

.action-btn:hover {
  background-color: #555 !important;
  border-color: #555 !important;
}

.action-btn .anticon {
  font-size: 10px;
}

.input-send-container {
  display: flex;
  flex-direction: column;
}

.input-controls {
  display: flex;
  align-items: center;
  margin-top: 1px;
  justify-content: space-between;
  /* 使内容分散对齐 */
}

.ai-chat-custom-tabs .input-container .ant-select {
  flex-grow: 1;
  max-width: 150px;
  margin-right: 8px;
  /* 添加右侧间距 */
}

.input-controls .send-button {
  margin-left: auto;
  /* 确保按钮靠右 */
}

.custom-round-button {
  border-radius: 5px;
  height: 14px;
  width: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  gap: 4px;
}

.custom-round-button .anticon {
  font-size: 12px;
}

.custom-round-button.ant-btn-primary {
  background-color: #4caf50;
  border-color: #4caf50;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.custom-round-button.ant-btn-primary:hover {
  background-color: #45a049;
  border-color: #45a049;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

.custom-round-button.compact-button {
  border-radius: 4px;
  height: 19px;
  min-width: 40px;
  padding: 0 8px;
  font-size: 11px;
  gap: 2px;
}

.custom-round-button.compact-button .anticon {
  font-size: 10px;
}

/* 下拉菜单圆角 */
.ant-select-dropdown {
  border-radius: 8px !important;
  background-color: #333 !important;
  border-color: #444 !important;
}

/* 下拉选项圆角 */
.ant-select-dropdown .ant-select-item {
  background-color: #333 !important;
  color: #e0e0e0 !important;
  border-radius: 4px !important;
  margin: 2px 4px !important;
}

.ant-select-dropdown .ant-select-item:first-child {
  border-top-left-radius: 8px !important;
  border-top-right-radius: 8px !important;
}

.ant-select-dropdown .ant-select-item:last-child {
  border-bottom-left-radius: 8px !important;
  border-bottom-right-radius: 8px !important;
}

.ant-select-dropdown .ant-select-item:hover {
  background-color: #444 !important;
  color: #4caf50 !important;
}

/* 选择器本身的圆角 */
.ant-select-selector {
  border-radius: 6px !important;
  border: none !important;
  background-color: #333 !important;
  box-shadow: none !important;
}

/* 为新建按钮添加动画效果 */
.ai-chat-custom-tabs .anticon-plus {
  transition: all 0.2s ease;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.ai-chat-custom-tabs .anticon-plus:active {
  transform: scale(0.85);
  background-color: rgba(255, 255, 255, 0.1);
}

.ai-chat-custom-tabs .anticon-plus:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
</style>
