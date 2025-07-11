<template>
  <div
    class="quick-command-bar"
    @dblclick="openAddCommandDialog"
  >
    <a-button
      type="primary"
      size="small"
      class="add-button"
      @click="openAddCommandDialog"
    >
      <PlusOutlined />
    </a-button>
    <div
      ref="buttonListRef"
      class="button-container"
    >
      <a-button
        v-for="cmd in quickCommands"
        :key="cmd.id"
        v-contextmenu:quickCommandMenu
        class="quick-command-btn"
        size="middle"
        @dblclick.stop
        @click="handleClick(cmd)"
        @contextmenu.prevent="showContextMenu(cmd.id)"
      >
        {{ cmd.snippet_name }}
      </a-button>
    </div>
    <a-modal
      v-model:visible="showAddCommandDialog"
      :title="isEditMode ? $t('common.edit') : $t('common.add')"
      class="commandDialog"
      :cancel-text="$t('common.cancel')"
      :ok-text="$t('common.ok')"
      centered
      width="600px"
      @ok="addQuickCommand"
      @cancel="
        () => {
          showAddCommandDialog = false
          isEditMode = false
          selectedCommandId = null
        }
      "
    >
      <a-input
        v-model:value="newCommandLabel"
        placeholder="脚本名称"
        style="margin-bottom: 8px"
      />
      <a-textarea
        v-model:value="newCommandValue"
        placeholder="请输入脚本内容..."
        :auto-size="{ minRows: 6, maxRows: 10 }"
        style="margin-bottom: 12px"
      />

      <!-- 脚本语法说明 -->
      <div class="script-help">
        <div
          class="help-header"
          @click="toggleHelp"
        >
          <span class="help-title">📖 脚本语法说明</span>
          <span class="toggle-icon">{{ showHelp ? '▼' : '▶' }}</span>
        </div>

        <div
          v-if="showHelp"
          class="help-content"
        >
          <div class="help-layout">
            <!-- 左侧：命令说明 -->
            <div class="help-left">
              <div class="help-item">
                <strong>⚡ 基本命令：</strong>
                <span>每行一个命令，按顺序执行</span>
              </div>

              <div class="help-item">
                <strong>⏰ 延时命令：</strong>
                <code>sleep==秒数</code>
                <span>如：<code>sleep==3</code></span>
              </div>

              <div class="help-item">
                <strong>⌨️ 特殊按键：</strong>
                <div class="key-list">
                  <code>esc</code>
                  <code>tab</code>
                  <code>return</code>
                  <code>backspace</code>
                </div>
              </div>
            </div>

            <!-- 右侧：示例代码 -->
            <div class="help-right">
              <div class="example-header">
                <span>💡 示例脚本</span>
                <button
                  class="copy-btn"
                  :class="{ copied: copySuccess }"
                  @click="copyExample"
                >
                  {{ copySuccess ? '已复制' : '复制' }}
                </button>
              </div>
              <pre class="example-code">
ls -la
sleep==2
cd /home
pwd
sleep==1
sudo systemctl status nginx</pre
              >
            </div>
          </div>
        </div>
      </div>
    </a-modal>
    <v-contextmenu
      ref="quickCommandMenu"
      :custom-class="'quickCommandMenu'"
    >
      <v-contextmenu-item @click="handleEditCommand(selectedCommandId)">{{ $t('common.edit') }}</v-contextmenu-item>
      <v-contextmenu-item @click="handleRemoveCommand(selectedCommandId)">{{ $t('common.delete') }}</v-contextmenu-item>
    </v-contextmenu>
  </div>
</template>

<script setup lang="ts">
import { ref, defineEmits, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { PlusOutlined } from '@ant-design/icons-vue'
import { executeScript } from '../Ssh/commandScript'
import { inputManager } from '../Ssh/termInputManager'
const emit = defineEmits(['send'])

interface QuickCommand {
  id: number
  snippet_name: string
  snippet_content: string
  create_at?: string
  update_at?: string
}

const quickCommands = ref<QuickCommand[]>([])

const buttonListRef = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null
const showAddCommandDialog = ref(false)
const newCommandLabel = ref('')
const newCommandValue = ref('')
const selectedCommandId = ref<number | null>(null)
const isEditMode = ref(false)
const showHelp = ref(true)
const copySuccess = ref(false)

onMounted(async () => {
  await refresh()
  nextTick(() => {
    if (buttonListRef.value) {
      sortable = Sortable.create(buttonListRef.value, {
        animation: 150,
        handle: '.quick-command-btn',
        onEnd: async (evt) => {
          const oldIndex = evt.oldIndex
          const newIndex = evt.newIndex
          if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
            const id1 = quickCommands.value[oldIndex].id
            const id2 = quickCommands.value[newIndex].id
            if (id1 && id2) {
              await swapCommand(id1, id2)
            }
          }
        }
      })
    }
  })
})

onBeforeUnmount(() => {
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
})

const openAddCommandDialog = () => {
  newCommandLabel.value = ''
  newCommandValue.value = ''
  showAddCommandDialog.value = true
  isEditMode.value = false
  selectedCommandId.value = null
}

const showContextMenu = (id: number) => {
  selectedCommandId.value = id
}

const handleEditCommand = async (id: number | null) => {
  if (id === null) return
  const cmd = quickCommands.value.find((item) => item.id === id)
  if (!cmd) return
  newCommandLabel.value = cmd.snippet_name
  newCommandValue.value = cmd.snippet_content
  isEditMode.value = true
  showAddCommandDialog.value = true
  selectedCommandId.value = id
}

const handleRemoveCommand = async (id: number | null) => {
  if (id === null) return
  await removeCommand(id)
}

const addQuickCommand = async () => {
  if (newCommandLabel.value && newCommandValue.value) {
    const cmd = {
      snippet_name: newCommandLabel.value,
      snippet_content: newCommandValue.value
    }
    if (isEditMode.value && selectedCommandId.value !== null) {
      await editCommand({ id: selectedCommandId.value, ...cmd })
    } else {
      await addCommand(cmd)
    }
    showAddCommandDialog.value = false
    isEditMode.value = false
    selectedCommandId.value = null
  }
}

const handleClick = (cmd: QuickCommand) => {
  const terminal = {
    write: (data: string) => {
      inputManager.sendToActiveTerm(data)
    }
  }
  executeScript(cmd.snippet_content, terminal)
}

const toggleHelp = () => {
  showHelp.value = !showHelp.value
}

const copyExample = async () => {
  const exampleText = `ls -la
sleep==2
cd /home
pwd
sleep==1
sudo systemctl status nginx`

  try {
    await navigator.clipboard.writeText(exampleText)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

const api = (window as any).api
const refresh = async () => {
  const { data } = await api.userSnippetOperation({ operation: 'list' })
  quickCommands.value = data.snippets || []
}

// 新增
const addCommand = async (params) => {
  await api.userSnippetOperation({
    operation: 'create',
    params
  })
  await refresh()
}

// 编辑
const editCommand = async (params: QuickCommand) => {
  await api.userSnippetOperation({
    operation: 'update',
    params
  })
  await refresh()
}

// 删除
const removeCommand = async (id: number) => {
  await api.userSnippetOperation({
    operation: 'delete',
    params: { id }
  })
  await refresh()
}

// 交换顺序
const swapCommand = async (id1: number, id2: number) => {
  await api.userSnippetOperation({
    operation: 'swap',
    params: { id1, id2 }
  })
  await refresh()
}
</script>

<style scoped lang="less">
.quick-command-bar {
  width: 100%;
  height: 36px;
  background: var(--globalInput-bg-color);
  display: flex;
  align-items: center;
  border-radius: 4px;
  margin-bottom: 1px;
  .quick-command-btn {
    height: 100%;
    flex-shrink: 0;
    max-width: 120px;
    padding: 4px 15px;
    background-color: transparent;
    border-left: 1px solid var(--text-color-senary) !important;
    color: var(--text-color);
    border: none;
    &:hover {
      background-color: var(--bg-color-octonary);
    }
  }
  :deep(.ant-btn) {
    span {
      display: inline-block;
      max-width: 90px;
      text-overflow: ellipsis; /* 超出部分显示... */
      overflow: hidden;
    }
  }
  .quick-command-empty {
    color: var(--text-color);
    font-size: 13px;
    margin-left: 8px;
  }
}
.button-container {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.add-button {
  height: 35px;
  width: 35px;
  flex-shrink: 0;
  background-color: var(--bg-color-octonary);
  color: var(--text-color);
  &:hover {
    background-color: var(--bg-color-octonary) !important;
    color: var(--text-color);
  }
}

.script-help {
  background: var(--bg-color-secondary, #f8f9fa);
  border-radius: 6px;
  border: 1px solid var(--border-color, #e1e1e1);
  font-size: 12px;
  line-height: 1.4;

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 12px 16px;
    color: var(--text-color);
    border-bottom: 1px solid var(--border-color, #e1e1e1);
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--bg-color-tertiary, rgba(0, 0, 0, 0.02));
    }

    .help-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-color, #333);
    }

    .toggle-icon {
      font-size: 12px;
      transition: transform 0.3s ease;
      color: var(--text-color-secondary, #666);
    }
  }

  .help-content {
    padding: 16px;
    animation: slideDown 0.3s ease;
  }

  .help-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .help-left {
    padding-right: 8px;
    border-right: 1px solid var(--border-color, #e1e1e1);

    @media (max-width: 768px) {
      padding-right: 0;
      border-right: none;
      border-bottom: 1px solid var(--border-color, #e1e1e1);
      padding-bottom: 12px;
    }
  }

  .help-right {
    padding-left: 8px;

    @media (max-width: 768px) {
      padding-left: 0;
      padding-top: 12px;
    }
  }

  .help-item {
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }

    strong {
      color: var(--text-color, #333);
      font-size: 12px;
      display: block;
      margin-bottom: 4px;
    }

    span {
      color: var(--text-color-secondary, #666);
      font-size: 11px;
    }

    code {
      background: var(--bg-color-quaternary, #f0f0f0);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 11px;
      color: #1890ff;
      margin: 0 2px;
    }

    .key-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;

      code {
        background: var(--bg-color-quaternary, #f8f9fa);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 10px;
        color: var(--text-color, #333);
        border: 1px solid var(--border-color, #e1e1e1);
      }
    }
  }

  .example-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    span {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-color, #333);
    }

    .copy-btn {
      background: #1890ff;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #40a9ff;
      }

      &.copied {
        background: #52c41a;
      }
    }
  }

  .example-code {
    background: var(--bg-color-quaternary, #2d3748);
    color: var(--text-color-inverse, #e2e8f0);
    padding: 12px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
    overflow-x: auto;
    white-space: pre;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
