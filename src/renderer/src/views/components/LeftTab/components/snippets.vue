<template>
  <div class="snippets-panel">
    <div
      v-if="!editingCommand"
      class="panel-header"
    >
      <template v-if="!isSearchActive">
        <div class="header-left">
          <a-button
            v-if="selectedGroupUuid"
            type="text"
            size="small"
            class="back-button icon-btn"
            @click="selectedGroupUuid = null"
          >
            <ArrowLeftOutlined />
          </a-button>
          <span
            v-if="selectedGroupUuid"
            class="group-title"
            >{{ currentGroupName }}</span
          >

          <template v-else>
            <a-button
              type="text"
              size="small"
              class="add-button"
              @click="startAddGroup"
            >
              <template #icon>
                <FolderAddOutlined />
              </template>
              {{ $t('common.command_group') }}
            </a-button>
          </template>
        </div>
        <div class="header-right">
          <a-tooltip
            v-if="!selectedGroupUuid"
            :title="$t('common.command_add')"
          >
            <a-button
              type="text"
              size="small"
              class="icon-btn"
              @click="openAddCommandDialog"
            >
              <img
                :src="snippetIcon"
                class="header-icon"
                style="width: 18px; height: 18px; filter: var(--icon-filter)"
              />
            </a-button>
          </a-tooltip>
          <a-tooltip
            v-if="selectedGroupUuid"
            :title="$t('common.command_add')"
          >
            <a-button
              type="text"
              size="small"
              class="icon-btn"
              @click="openAddCommandDialog"
            >
              <img
                :src="snippetIcon"
                class="header-icon"
                style="width: 18px; height: 18px; filter: var(--icon-filter)"
              />
            </a-button>
          </a-tooltip>
          <a-tooltip :title="$t('common.search')">
            <a-button
              type="text"
              size="small"
              class="icon-btn"
              @click="toggleSearch"
            >
              <SearchOutlined />
            </a-button>
          </a-tooltip>
        </div>
      </template>
      <div
        v-else
        class="search-container"
      >
        <a-input
          ref="searchInputRef"
          v-model:value="searchQuery"
          :placeholder="$t('common.search')"
          size="small"
          allow-clear
          @blur="handleSearchBlur"
          @press-enter="handleSearchBlur"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>
      </div>
    </div>

    <!-- Group List Removed -->

    <div class="snippets-list">
      <!-- Edit Panel for Command -->
      <div
        v-if="editingCommand"
        class="edit-panel"
      >
        <!-- Panel Title -->
        <div class="edit-panel-title">
          {{ isEditMode ? $t('common.command_edit') : $t('common.command_add') }}
        </div>

        <a-input
          v-model:value="newCommandLabel"
          :placeholder="$t('quickCommand.scriptName')"
          style="margin-bottom: 8px"
        />
        <a-select
          v-model:value="newCommandGroupUuid"
          style="width: 100%; margin-bottom: 8px"
          :placeholder="$t('common.command_group') || 'Select Group'"
          :get-popup-container="(trigger) => trigger.parentNode"
          allow-clear
        >
          <a-select-option
            v-for="g in groups"
            :key="g.uuid"
            :value="g.uuid"
            >{{ g.group_name }}</a-select-option
          >
        </a-select>
        <a-textarea
          v-model:value="newCommandValue"
          :placeholder="$t('quickCommand.scriptContent')"
          :auto-size="{ minRows: 6, maxRows: 10 }"
          style="margin-bottom: 12px"
        />

        <!-- Script syntax help -->
        <div class="script-help">
          <div
            class="help-header"
            @click="toggleHelp"
          >
            <span class="help-title">{{ $t('quickCommand.scriptSyntaxHelp') }}</span>
            <span class="toggle-icon">{{ showHelp ? '▼' : '▶' }}</span>
          </div>

          <div
            v-if="showHelp"
            class="help-content"
          >
            <div class="help-layout">
              <!-- Left: Command descriptions -->
              <div class="help-left">
                <div class="help-item">
                  <strong>{{ $t('quickCommand.basicCommands') }}</strong>
                  <span>{{ $t('quickCommand.basicCommandsDesc') }}</span>
                </div>

                <div class="help-item">
                  <strong>{{ $t('quickCommand.delayCommand') }}</strong>
                  <code>sleep=={{ $t('quickCommand.milliseconds') }}</code>
                  <span>{{ $t('quickCommand.delayCommandDesc') }}<code>sleep==3000</code></span>
                </div>

                <div class="help-item">
                  <strong>{{ $t('quickCommand.specialKeys') }}</strong>
                  <div class="key-list">
                    <code>esc</code>
                    <code>tab</code>
                    <code>return</code>
                    <code>backspace</code>
                  </div>
                </div>

                <div class="help-item">
                  <strong>{{ $t('quickCommand.arrowKeys') }}</strong>
                  <div class="key-list">
                    <code>up</code>
                    <code>down</code>
                    <code>left</code>
                    <code>right</code>
                  </div>
                </div>

                <div class="help-item">
                  <strong>{{ $t('quickCommand.ctrlKeys') }}</strong>
                  <span>{{ $t('quickCommand.ctrlKeysDesc') }}</span>
                  <div class="key-list">
                    <code>ctrl+c</code>
                    <code>ctrl+d</code>
                    <code>ctrl+z</code>
                  </div>
                </div>

                <div class="help-item">
                  <strong>{{ $t('quickCommand.comments') }}</strong>
                  <span>{{ $t('quickCommand.commentsDesc') }}</span>
                </div>
              </div>

              <!-- Right: Example code -->
              <div class="help-right">
                <div class="example-header">
                  <span>{{ $t('quickCommand.exampleScript') }}</span>
                  <button
                    class="copy-btn"
                    :class="{ copied: copySuccess }"
                    @click="copyExample"
                  >
                    {{ copySuccess ? $t('quickCommand.copied') : $t('quickCommand.copy') }}
                  </button>
                </div>
                <pre class="example-code">
# System monitoring
ls -la
sleep==2000
# Navigate to log directory
cd /var/log
pwd
sleep==1000
# Check service status
sudo systemctl status nginx
# Interrupt after 3 seconds
sleep==3000
ctrl+c</pre
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="edit-panel-actions">
          <a-button @click="cancelEditCommand">
            {{ $t('common.cancel') }}
          </a-button>
          <a-button @click="addQuickCommand">
            {{ $t('common.ok') }}
          </a-button>
        </div>
      </div>

      <!-- Command List -->
      <template v-else>
        <!-- Groups (Folders) -->
        <template v-if="selectedGroupUuid === null && !searchQuery">
          <!-- Editing/Adding Group Card -->
          <div
            v-if="editingGroupId !== undefined"
            class="snippet-item group-folder editing"
          >
            <div class="snippet-info">
              <span class="snippet-name">
                <FolderOutlined class="folder-icon" />
                <input
                  ref="groupInputRef"
                  v-model="editingGroupName"
                  class="group-name-input"
                  :placeholder="$t('common.command_group') || 'Group Name'"
                  @keyup.enter="confirmGroupEdit"
                  @keyup.esc="cancelGroupEdit"
                  @blur="handleGroupInputBlur"
                />
              </span>
            </div>
            <div class="edit-actions">
              <a-tooltip :title="$t('common.ok')">
                <div
                  class="action-btn confirm"
                  @click="confirmGroupEdit"
                >
                  <CheckOutlined />
                </div>
              </a-tooltip>
              <a-tooltip :title="$t('common.cancel')">
                <div
                  class="action-btn cancel"
                  @click="cancelGroupEdit"
                >
                  <CloseOutlined />
                </div>
              </a-tooltip>
            </div>
          </div>

          <!-- Normal Group Cards -->
          <div
            v-for="group in groups"
            :key="group.uuid"
          >
            <div
              v-if="editingGroupId !== group.id"
              class="snippet-item group-folder"
              @click="selectedGroupUuid = group.uuid"
              @contextmenu.prevent="handleGroupContextMenu($event, group)"
            >
              <div class="snippet-info">
                <span class="snippet-name">
                  <FolderOutlined class="folder-icon" />
                  {{ group.group_name }}
                </span>
              </div>
              <div class="group-count">
                <img
                  :src="snippetIcon"
                  class="count-icon"
                />
                {{ getGroupCommandCount(group.uuid) }}
              </div>
            </div>
          </div>
        </template>

        <div
          v-for="cmd in filteredCommands"
          :key="cmd.id"
        >
          <div
            class="snippet-item"
            @click="handleClick(cmd)"
            @contextmenu.prevent="handleContextMenu($event, cmd)"
          >
            <div class="snippet-info">
              <span class="snippet-name">
                <img
                  :src="snippetIcon"
                  class="snippet-icon"
                />
                {{ cmd.snippet_name }}
              </span>
              <span class="snippet-preview">{{ cmd.snippet_content }}</span>
            </div>
            <div
              class="snippet-actions"
              @click.stop
            >
              <a-tooltip :title="$t('common.run') || 'Run'">
                <div
                  class="action-btn"
                  @click.stop="runScript(cmd, true)"
                >
                  <PlayCircleOutlined />
                </div>
              </a-tooltip>
              <a-tooltip :title="$t('common.paste') || 'Paste'">
                <div
                  class="action-btn"
                  @click.stop="runScript(cmd, false)"
                >
                  <CopyOutlined />
                </div>
              </a-tooltip>
            </div>
          </div>
        </div>
        <v-contextmenu
          ref="contextMenu"
          popover-class="snippet-context-menu"
        >
          <v-contextmenu-item @click="handleRunInAllTabs">
            <PlayCircleOutlined style="margin-right: 8px" /> {{ $t('common.runInAllTabs') || 'Run in all tabs' }}
          </v-contextmenu-item>
          <v-contextmenu-item @click="handleEditCommandFromMenu">
            <EditOutlined style="margin-right: 8px" /> {{ $t('common.edit') }}
          </v-contextmenu-item>
          <v-contextmenu-item @click="handleRemoveCommandFromMenu">
            <DeleteOutlined style="margin-right: 8px" /> {{ $t('common.delete') }}
          </v-contextmenu-item>
        </v-contextmenu>
        <div
          v-if="quickCommands.length === 0"
          class="empty-state"
        >
          {{ $t('common.noData') }}
        </div>
      </template>
    </div>

    <!-- Group Context Menu -->
    <v-contextmenu
      ref="groupContextMenu"
      popover-class=" snippet-context-menu"
    >
      <v-contextmenu-item @click="handleEditGroupFromMenu"> <EditOutlined style="margin-right: 8px" /> {{ $t('common.edit') }} </v-contextmenu-item>
      <v-contextmenu-item @click="handleRemoveGroupFromMenu">
        <DeleteOutlined style="margin-right: 8px" /> {{ $t('common.delete') }}
      </v-contextmenu-item>
    </v-contextmenu>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  FolderOutlined,
  FolderAddOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons-vue'
import snippetIcon from '@/assets/menu/snippet.svg'
import { executeScript } from '../../Ssh/commandScript'
import { inputManager } from '../../Ssh/termInputManager'

const { t } = useI18n()

interface QuickCommand {
  id: number
  uuid: string
  snippet_name: string
  snippet_content: string
  group_uuid?: string | null
  create_at?: string
  update_at?: string
}

interface SnippetGroup {
  id: number
  uuid: string
  group_name: string
}

const quickCommands = ref<QuickCommand[]>([])
const groups = ref<SnippetGroup[]>([])
const selectedGroupUuid = ref<string | null>(null)
const editingCommand = ref(false)
const newCommandLabel = ref('')
const newCommandValue = ref('')
const newCommandGroupUuid = ref<string | undefined>(undefined)
const selectedCommandId = ref<number | null>(null)
const isEditMode = ref(false)

// Group Inline Editing State
const editingGroupId = ref<number | null | undefined>(undefined) // undefined = not editing, null = adding new, number = editing existing
const editingGroupName = ref('')
const groupInputRef = ref()
const groupContextMenu = ref()
const currentContextGroup = ref<SnippetGroup | null>(null)
const showHelp = ref(false)
const copySuccess = ref(false)
const contextMenu = ref()
const currentContextCommand = ref<QuickCommand | null>(null)
const searchQuery = ref('')
const isSearchActive = ref(false)
const searchInputRef = ref()

const filteredCommands = computed(() => {
  let cmds = quickCommands.value

  // If searching, search everything and ignore groups structure
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    return cmds.filter((cmd) => cmd.snippet_name.toLowerCase().includes(query) || cmd.snippet_content.toLowerCase().includes(query))
  }

  // If inside a group, show only that group's commands
  if (selectedGroupUuid.value !== null) {
    return cmds.filter((c) => c.group_uuid === selectedGroupUuid.value)
  }

  // If at root, show only commands with no group
  return cmds.filter((c) => !c.group_uuid)
})

const currentGroupName = computed(() => {
  if (!selectedGroupUuid.value) return ''
  const g = groups.value.find((g) => g.uuid === selectedGroupUuid.value)
  return g ? g.group_name : ''
})

// Get command count for a specific group
const getGroupCommandCount = (groupUuid: string) => {
  return quickCommands.value.filter((cmd) => cmd.group_uuid === groupUuid).length
}

const api = (window as any).api

const refresh = async () => {
  const { data } = await api.userSnippetOperation({ operation: 'list' })
  quickCommands.value = data.snippets || []

  const { data: groupData } = await api.userSnippetOperation({ operation: 'listGroups' })
  groups.value = groupData.groups || []
}

const toggleSearch = () => {
  isSearchActive.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

const handleSearchBlur = () => {
  if (!searchQuery.value) {
    isSearchActive.value = false
  }
}

const closeContextMenu = () => {
  if (contextMenu.value && typeof contextMenu.value.hide === 'function') {
    contextMenu.value.hide()
  }
  if (groupContextMenu.value && typeof groupContextMenu.value.hide === 'function') {
    groupContextMenu.value.hide()
  }
}

onMounted(async () => {
  await refresh()
  window.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu)
})

const openAddCommandDialog = () => {
  newCommandLabel.value = ''
  newCommandValue.value = ''
  newCommandGroupUuid.value = selectedGroupUuid.value ?? undefined // Default to selected group
  editingCommand.value = true
  isEditMode.value = false
  selectedCommandId.value = null
}

const handleEditCommand = async (id: number | null) => {
  if (id === null) return
  const cmd = quickCommands.value.find((item) => item.id === id)
  if (!cmd) return
  newCommandLabel.value = cmd.snippet_name
  newCommandValue.value = cmd.snippet_content
  newCommandGroupUuid.value = cmd.group_uuid || undefined
  isEditMode.value = true
  editingCommand.value = true
  selectedCommandId.value = id
}

const handleRemoveCommand = async (id: number | null) => {
  if (id === null) return

  // Remove confirmation dialog, directly delete as per request
  // But wait, the previous request said "Remove the delete confirmation dialog".
  // The user's current request implies "modification ... to right-click menu".
  // I will keep the direct delete or maybe add a simpler confirmation if needed?
  // The user said "Removing the delete confirmation dialog" in previous turn.
  // So I will just call removeCommand.
  await removeCommand(id)
}

const handleContextMenu = (e: MouseEvent, cmd: QuickCommand) => {
  // Close group context menu first to ensure only one menu is shown
  if (groupContextMenu.value && typeof groupContextMenu.value.hide === 'function') {
    groupContextMenu.value.hide()
  }

  currentContextCommand.value = cmd
  selectedCommandId.value = cmd.id // Set selectedCommandId for menu actions
  contextMenu.value?.show(e)

  // Manually add class to the context menu element as a fallback
  // because v-contextmenu might not support class prop on the root element correctly
  setTimeout(() => {
    const menus = document.querySelectorAll('.v-contextmenu')
    menus.forEach((menu) => {
      const htmlMenu = menu as HTMLElement
      if (htmlMenu.style.display !== 'none') {
        htmlMenu.classList.add('snippet-context-menu')
      }
    })
  }, 0)
}

const handleEditCommandFromMenu = () => {
  if (currentContextCommand.value) {
    handleEditCommand(currentContextCommand.value.id)
  }
}

const handleRemoveCommandFromMenu = () => {
  if (currentContextCommand.value) {
    handleRemoveCommand(currentContextCommand.value.id)
  }
  closeContextMenu()
}

const handleRunInAllTabs = () => {
  if (currentContextCommand.value) {
    runScriptInAllTabs(currentContextCommand.value, true)
  }
  closeContextMenu()
}

const addQuickCommand = async () => {
  if (newCommandLabel.value && newCommandValue.value) {
    const cmd = {
      snippet_name: newCommandLabel.value,
      snippet_content: newCommandValue.value,
      group_uuid: newCommandGroupUuid.value
    }
    if (isEditMode.value && selectedCommandId.value !== null) {
      const existingCommand = quickCommands.value.find((item) => item.id === selectedCommandId.value)
      if (!existingCommand) {
        console.error('Command not found for editing')
        return
      }
      await editCommand({ id: selectedCommandId.value, uuid: existingCommand.uuid, ...cmd })
    } else {
      await addCommand(cmd)
    }
    cancelEditCommand()
  }
}

// Cancel editing command
const cancelEditCommand = () => {
  editingCommand.value = false
  isEditMode.value = false
  selectedCommandId.value = null
  newCommandLabel.value = ''
  newCommandValue.value = ''
  newCommandGroupUuid.value = undefined
}

// Group Operations
const startAddGroup = () => {
  editingGroupId.value = null // null means adding new
  editingGroupName.value = ''
  nextTick(() => {
    groupInputRef.value?.focus()
  })
}

const startEditGroup = (group: SnippetGroup) => {
  editingGroupId.value = group.id
  editingGroupName.value = group.group_name
  nextTick(() => {
    groupInputRef.value?.focus()
    groupInputRef.value?.select()
  })
}

const confirmGroupEdit = async () => {
  if (!editingGroupName.value.trim()) {
    cancelGroupEdit()
    return
  }

  if (editingGroupId.value === null) {
    // Adding new group
    await api.userSnippetOperation({
      operation: 'createGroup',
      params: { group_name: editingGroupName.value }
    })
  } else {
    // Editing existing group
    const group = groups.value.find((g) => g.id === editingGroupId.value)
    if (group) {
      await api.userSnippetOperation({
        operation: 'updateGroup',
        params: { uuid: group.uuid, group_name: editingGroupName.value }
      })
    }
  }

  editingGroupId.value = undefined
  editingGroupName.value = ''
  await refresh()
}

const cancelGroupEdit = () => {
  editingGroupId.value = undefined
  editingGroupName.value = ''
}

const handleGroupInputBlur = () => {
  // Delay to allow click events on buttons to fire first
  setTimeout(() => {
    if (editingGroupId.value !== undefined) {
      cancelGroupEdit()
    }
  }, 200)
}

const handleGroupContextMenu = (e: MouseEvent, group: SnippetGroup) => {
  // Close command context menu first to ensure only one menu is shown
  if (contextMenu.value && typeof contextMenu.value.hide === 'function') {
    contextMenu.value.hide()
  }

  currentContextGroup.value = group
  groupContextMenu.value?.show(e)
}

const handleEditGroupFromMenu = () => {
  if (currentContextGroup.value) {
    startEditGroup(currentContextGroup.value)
  }
}

const handleRemoveGroupFromMenu = async () => {
  if (currentContextGroup.value) {
    // 首先删除该组下的所有命令
    const groupCommands = quickCommands.value.filter((cmd) => cmd.group_uuid === currentContextGroup.value!.uuid)
    for (const cmd of groupCommands) {
      await api.userSnippetOperation({
        operation: 'delete',
        params: { id: cmd.id }
      })
    }

    // 然后删除组本身
    await api.userSnippetOperation({
      operation: 'deleteGroup',
      params: { uuid: currentContextGroup.value.uuid }
    })
    if (selectedGroupUuid.value === currentContextGroup.value.uuid) {
      selectedGroupUuid.value = null
    }
    await refresh()
  }
}

const runScript = (cmd: QuickCommand, autoExecute: boolean) => {
  const terminal = {
    write: (data: string) => {
      inputManager.sendToActiveTerm(data)
    }
  }
  executeScript(cmd.snippet_content, terminal, autoExecute)
}

const runScriptInAllTabs = (cmd: QuickCommand, autoExecute: boolean) => {
  const terminal = {
    write: (data: string) => {
      inputManager.globalSend(data)
    }
  }
  executeScript(cmd.snippet_content, terminal, autoExecute)
}

const handleClick = (cmd: QuickCommand) => {
  runScript(cmd, true)
}

const toggleHelp = () => {
  showHelp.value = !showHelp.value
}

const copyExample = async () => {
  const exampleText = `# System monitoring
ls -la
sleep==2000
# Navigate to log directory
cd /var/log
pwd
sleep==1000
# Check service status
sudo systemctl status nginx
# Interrupt after 3 seconds
sleep==3000
ctrl+c`

  try {
    await navigator.clipboard.writeText(exampleText)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (err) {
    console.error(t('quickCommand.copyFailed'), err)
  }
}

// Add new command
const addCommand = async (params) => {
  await api.userSnippetOperation({
    operation: 'create',
    params
  })
  await refresh()
}

// Edit command
const editCommand = async (params: QuickCommand) => {
  await api.userSnippetOperation({
    operation: 'update',
    params
  })
  await refresh()
}

// Delete command
const removeCommand = async (id: number) => {
  await api.userSnippetOperation({
    operation: 'delete',
    params: { id }
  })
  await refresh()
}
</script>

<style scoped lang="less">
.snippets-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  color: var(--text-color);

  .panel-header {
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 57px; // Ensure consistent height

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .group-title {
      font-weight: 600;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 150px;
    }

    .title {
      font-weight: 600;
      font-size: 14px;
    }

    .add-button {
      color: var(--text-secondary-color);
      display: flex;
      align-items: center;

      &:hover {
        color: var(--text-color);
        background-color: var(--hover-bg-color);
      }

      .header-icon {
        width: 14px;
        height: 14px;
        object-fit: contain;
        margin-right: 6px;
        filter: var(--icon-filter);
      }
    }

    .back-button,
    .icon-btn {
      color: var(--text-secondary-color);
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      &:hover {
        color: var(--text-color);
        background-color: var(--hover-bg-color);
      }
    }

    .back-button {
      font-size: 16px;
      margin-left: -4px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .search-container {
      width: 100%;

      :deep(.ant-input-affix-wrapper) {
        background-color: var(--bg-color-secondary);
        border-color: var(--border-color);
        color: var(--text-color);

        input.ant-input {
          background-color: transparent;
          color: var(--text-color);

          &::placeholder {
            color: var(--text-secondary-color);
          }
        }

        .anticon {
          color: var(--text-secondary-color);
        }
      }
    }
  }

  .snippets-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .edit-panel {
    padding: 8px;

    .edit-panel-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    :deep(.ant-input) {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color);
      color: var(--text-color);

      &::placeholder {
        color: var(--text-secondary-color);
      }

      &:hover {
        border-color: var(--border-color);
      }

      &:focus {
        background-color: var(--bg-color-secondary);
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
      }
    }

    :deep(.ant-select) {
      .ant-select-selector {
        background-color: var(--bg-color-secondary);
        border-color: var(--border-color);
        color: var(--text-color);
      }

      &:hover .ant-select-selector {
        border-color: var(--border-color);
      }

      &.ant-select-focused .ant-select-selector {
        background-color: var(--bg-color-secondary);
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
      }

      .ant-select-arrow {
        color: var(--text-secondary-color);
      }
    }

    :deep(.ant-input-textarea) {
      .ant-input {
        background-color: var(--bg-color-secondary);
        border-color: var(--border-color);
        color: var(--text-color);

        &::placeholder {
          color: var(--text-secondary-color);
        }

        &:hover {
          border-color: var(--border-color);
        }

        &:focus {
          background-color: var(--bg-color-secondary);
          border-color: #1890ff;
          box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
        }
      }
    }

    .script-help {
      margin-bottom: 16px;
    }
  }

  .edit-panel-actions {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    padding: 8px;
    margin-top: 16px;

    :deep(.ant-btn) {
      &.ant-btn-default {
        background-color: var(--bg-color-secondary);
        border-color: var(--border-color);
        color: var(--text-color);

        &:hover {
          background-color: var(--hover-bg-color);
          border-color: #1890ff;
          color: #1890ff;
        }
      }

      &.ant-btn-primary {
        background-color: #1890ff;
        border-color: #1890ff;
        color: #fff;

        &:hover {
          background-color: #40a9ff;
          border-color: #40a9ff;
        }
      }
    }
  }

  .snippet-item {
    padding: 10px 12px;
    margin-bottom: 8px;
    background-color: var(--bg-color-secondary);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    transition: all 0.2s ease;
    border: 1px solid transparent;

    &:hover {
      background-color: var(--hover-bg-color);
      border-color: var(--border-color);
    }

    &.editing {
      border-color: #1890ff;
      background-color: var(--bg-color);
      cursor: default;

      &:hover {
        background-color: var(--bg-color);
        border-color: #1890ff;
      }
    }

    .snippet-info {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .snippet-name {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;

      .snippet-icon {
        width: 1.1em;
        height: 1.1em;
        object-fit: contain;
        filter: var(--icon-filter);
      }

      .folder-icon {
        font-size: 20px;
        color: var(--text-secondary-color);
        margin-right: 6px;
      }

      .group-name-input {
        flex: 1;
        background-color: transparent;
        border: none;
        outline: none;
        color: var(--text-color);
        font-size: 13px;
        font-weight: 500;
        padding: 0;

        &::placeholder {
          color: var(--text-secondary-color);
        }
      }
    }

    .snippet-preview {
      font-size: 11px;
      color: var(--text-secondary-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: monospace;
    }

    .group-count {
      font-size: 12px;
      color: var(--text-secondary-color);
      padding: 2px 8px;
      background-color: var(--bg-color);
      border-radius: 12px;
      min-width: 24px;
      text-align: center;
      align-self: center;
      display: flex;
      align-items: center;
      gap: 4px;

      .count-icon {
        width: 12px;
        height: 12px;
        object-fit: contain;
        filter: var(--icon-filter);
        opacity: 0.7;
      }
    }

    .snippet-actions {
      opacity: 0;
      transition: opacity 0.2s ease;
      color: var(--text-secondary-color);
      display: flex;
      align-items: center;
      gap: 8px;

      .action-btn {
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.01s;

        &:hover {
          background-color: var(--hover-bg-color);
          color: #1890ff;
        }

        &:active {
          transform: scale(0.9);
        }
      }
    }

    .edit-actions {
      display: flex;
      align-items: center;
      gap: 6px;

      .action-btn {
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--text-secondary-color);

        &.confirm {
          &:hover {
            background-color: #f6ffed;
            color: #52c41a;
          }
        }

        &.cancel {
          &:hover {
            background-color: #fff2e8;
            color: #ff7a45;
          }
        }

        &:active {
          transform: scale(0.9);
        }
      }
    }

    &:hover .snippet-actions {
      opacity: 1;
    }
  }

  .empty-state {
    text-align: center;
    padding: 40px 0;
    color: var(--text-secondary-color);
    font-size: 13px;
  }
}

// Theme adaptation for modal components
.commandDialog {
  :deep(.ant-modal-content) {
    background-color: var(--bg-color);
    color: var(--text-color);
  }

  :deep(.ant-modal-header) {
    background-color: var(--bg-color);
    border-bottom-color: var(--border-color);
  }

  :deep(.ant-modal-title) {
    color: var(--text-color);
  }

  :deep(.ant-modal-close) {
    color: var(--text-secondary-color);

    &:hover {
      color: var(--text-color);
    }
  }

  :deep(.ant-modal-body) {
    background-color: var(--bg-color);
  }

  :deep(.ant-modal-footer) {
    background-color: var(--bg-color);
    border-top-color: var(--border-color);
  }

  // Input theme
  :deep(.ant-input) {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    color: var(--text-color);

    &::placeholder {
      color: var(--text-secondary-color);
    }

    &:hover {
      border-color: var(--border-color);
    }

    &:focus {
      background-color: var(--bg-color-secondary);
      border-color: #1890ff;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
    }
  }

  // Textarea theme
  :deep(.ant-input-textarea) {
    .ant-input {
      background-color: var(--bg-color-secondary);
      border-color: var(--border-color);
      color: var(--text-color);

      &::placeholder {
        color: var(--text-secondary-color);
      }

      &:hover {
        border-color: var(--border-color);
      }

      &:focus {
        background-color: var(--bg-color-secondary);
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
      }
    }
  }

  // Button theme
  :deep(.ant-btn-default) {
    background-color: var(--bg-color-secondary);
    border-color: var(--border-color);
    color: var(--text-color);

    &:hover {
      background-color: var(--hover-bg-color);
      border-color: #1890ff;
      color: #1890ff;
    }
  }

  :deep(.ant-btn-primary) {
    background-color: #1890ff;
    border-color: #1890ff;
    color: #fff;

    &:hover {
      background-color: #40a9ff;
      border-color: #40a9ff;
    }
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
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .help-left {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color, #e1e1e1);
  }

  .help-right {
    padding-top: 0;
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
    color: var(--text-color, #333);
    padding: 12px 2px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    line-height: 1.6;
    margin: 0;
    overflow-x: auto;
    white-space: pre;
    border: 1px solid var(--border-color, #e1e1e1);
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

<style lang="less">
.snippet-context-menu,
.v-contextmenu.snippet-context-menu {
  min-width: 100px !important;
  width: auto !important;
  padding: 4px !important;

  .v-contextmenu-item {
    padding: 5px 8px !important;
    min-height: 26px;
    line-height: 1.5;
  }
}

// Theme adaptation for modals and dropdowns
.ant-modal-wrap {
  .ant-modal {
    .ant-modal-content {
      background-color: var(--bg-color);
      color: var(--text-color);
    }

    .ant-modal-header {
      background-color: var(--bg-color);
      border-bottom-color: var(--border-color);
    }

    .ant-modal-title {
      color: var(--text-color);
    }

    .ant-modal-close {
      color: var(--text-secondary-color);

      &:hover {
        color: var(--text-color);
      }
    }

    .ant-modal-body {
      background-color: var(--bg-color);
    }

    .ant-modal-footer {
      background-color: var(--bg-color);
      border-top-color: var(--border-color);
    }
  }
}
</style>
