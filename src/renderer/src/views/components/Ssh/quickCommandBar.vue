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
        placeholder="Label"
        style="margin-bottom: 8px"
      />
      <a-textarea
        v-model:value="newCommandValue"
        placeholder="Content  \n\r: new line，\t: tab，\a: bell，\b: backspace"
        :auto-size="{ minRows: 4, maxRows: 4 }"
      />
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
  const command = parseEscapedString(cmd.snippet_content)
  emit('send', command)
}

function parseEscapedString(str: string) {
  return str.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\a/g, '\x07').replace(/\\b/g, '\b')
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
</style>
