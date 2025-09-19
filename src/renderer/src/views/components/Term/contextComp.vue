<template>
  <div>
    <!-- Basic Operations Group -->
    <v-contextmenu-item @click="onContextMenuAction('copy')">
      {{ $t('common.copy') }}
      <span class="shortcut-key">{{ copyShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('paste')">
      {{ $t('common.paste') }}
      <span class="shortcut-key">{{ pasteShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('search')">
      {{ $t('common.search') }}
      <span class="shortcut-key">{{ searchShortcut }}</span>
    </v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Connection Management Group -->
    <v-contextmenu-item
      v-if="props.isConnect"
      @click="onContextMenuAction('disconnect')"
      >{{ $t('common.disconnect') }}
      <span class="shortcut-key">{{ disconnectShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item
      v-if="!props.isConnect"
      @click="onContextMenuAction('reconnect')"
      >{{ $t('common.reconnect') }}
      <span class="shortcut-key">{{ reconnectShortcut }}</span>
    </v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Terminal Control Group -->
    <v-contextmenu-item @click="onContextMenuAction('newTerminal')">
      {{ $t('common.newTerminal') }}
      <span class="shortcut-key">{{ newTerminalShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('close')">
      {{ $t('common.closeTerminal') }}
      <span class="shortcut-key">{{ closeShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('clearTerm')">
      {{ $t('common.clearTerm') }}
      <span class="shortcut-key">{{ clearTermShortcut }}</span>
    </v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Split Screen Group -->
    <v-contextmenu-item @click="onContextMenuAction('splitRight')">
      {{ $t('common.splitRight') }}
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('splitDown')">
      {{ $t('common.splitDown') }}
    </v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Feature Toggle Group -->
    <v-contextmenu-item @click="onContextMenuAction('openAllExecuted')">{{
      isGlobalInput ? $t('common.globalExecOn') : $t('common.globalExec')
    }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('registerSyncInput')">{{
      props.isSyncInput ? $t('common.syncInputOn') : $t('common.syncInput')
    }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('quickCommand')">{{
      isShowQuickCommand ? $t('common.quickCommandOn') : $t('common.quickCommand')
    }}</v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Tools Group -->
    <v-contextmenu-item @click="onContextMenuAction('fileManager')">
      {{ $t('common.fileManager') }}
      <span class="shortcut-key">{{ fileManagerShortcut }}</span>
    </v-contextmenu-item>
    <!-- <v-contextmenu-item @click="onContextMenuAction('shrotenName')">{{ $t('common.shrotenName') }}</v-contextmenu-item> -->

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Display Settings Group -->
    <v-contextmenu-submenu :title="$t('common.fontsize')">
      <v-contextmenu-item @click="onContextMenuAction('fontsizeLargen')">
        {{ $t('common.largen') }}
        <span class="shortcut-key">{{ fontsizeLargenShortcut }}</span>
      </v-contextmenu-item>
      <v-contextmenu-item @click="onContextMenuAction('fontsizeSmaller')">
        {{ $t('common.smaller') }}
        <span class="shortcut-key">{{ fontsizeSmallerShortcut }}</span>
      </v-contextmenu-item>
    </v-contextmenu-submenu>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { isGlobalInput, isShowQuickCommand } from '../Ssh/termInputManager'
import {
  getCopyShortcut,
  getPasteShortcut,
  getCloseShortcut,
  getSearchShortcut,
  getClearTermShortcut,
  getFileManagerShortcut
} from '@/utils/shortcuts'
import eventBus from '@/utils/eventBus'
import { getNewTabShortcut } from '@/utils/shortcuts'
import { shortcutService } from '@/services/shortcutService'

// Reactive variables
const copyShortcut = ref('')
const pasteShortcut = ref('')
const closeShortcut = ref('')
const searchShortcut = ref('')
const newTerminalShortcut = ref('')
const clearTermShortcut = ref('')
const fileManagerShortcut = ref('')
const disconnectShortcut = ref('Ctrl+D')
const reconnectShortcut = ref('Enter')
const fontsizeLargenShortcut = ref('')
const fontsizeSmallerShortcut = ref('')

const emit = defineEmits(['contextAct'])
const props = defineProps({
  wsInstance: {
    type: Object
  },
  termInstance: { type: Object, required: true },
  copyText: { type: String, required: true },
  terminalId: { type: String, required: true },
  isConnect: { type: Boolean, default: true },
  isSyncInput: {
    type: Boolean,
    default: false
  },
  tabInfo: {
    type: Object,
    default: () => ({})
  }
})
const onContextMenuAction = (action) => {
  switch (action) {
    case 'copy':
      navigator.clipboard.writeText(props.copyText)
      break
    case 'paste':
      emit('contextAct', 'paste')
      break
    case 'saveAsConfig':
      break
    case 'activityNotification':
      break
    case 'focusAllTabs':
      break
    case 'disconnect':
      emit('contextAct', 'disconnect')
      break
    case 'reconnect':
      emit('contextAct', 'reconnect')
      break
    case 'openSftpPanel':
      break
    case 'newTerminal':
      emit('contextAct', 'newTerminal')
      break
    case 'newByConfig':
      break
    case 'close':
      emit('contextAct', 'close')
      break
    case 'clearTerm':
      emit('contextAct', 'clearTerm')
      break
    case 'shrotenName':
      emit('contextAct', 'shrotenName')
      break
    case 'fontsizeLargen':
      emit('contextAct', 'fontsizeLargen')
      break
    case 'fontsizeSmaller':
      emit('contextAct', 'fontsizeSmaller')
      break
    case 'registerSyncInput':
      emit('contextAct', 'registerSyncInput')
      break
    case 'openAllExecuted':
      isGlobalInput.value = !isGlobalInput.value
      break
    case 'quickCommand':
      isShowQuickCommand.value = !isShowQuickCommand.value
      break
    case 'fileManager':
      emit('contextAct', 'fileManager')
      break
    case 'search':
      // Trigger search through event bus to open search interface
      eventBus.emit('openSearch')
      break
    case 'splitRight':
      // Use the complete tabInfo object as the base, ensuring it has all required fields
      const currentTabInfoRight = {
        ...props.tabInfo,
        title: props.tabInfo.title || 'Terminal',
        content: props.tabInfo.content || props.terminalId,
        type: props.tabInfo.type || 'term',
        organizationId: props.tabInfo.organizationId || '',
        ip: props.tabInfo.ip || '',
        data: props.tabInfo.data || props.tabInfo
      }
      eventBus.emit('createSplitTab', currentTabInfoRight)
      break
    case 'splitDown':
      // Use the complete tabInfo object as the base, ensuring it has all required fields
      const currentTabInfoDown = {
        ...props.tabInfo,
        title: props.tabInfo.title || 'Terminal',
        content: props.tabInfo.content || props.terminalId,
        type: props.tabInfo.type || 'term',
        organizationId: props.tabInfo.organizationId || '',
        ip: props.tabInfo.ip || '',
        data: props.tabInfo.data || props.tabInfo
      }
      eventBus.emit('createVerticalSplitTab', currentTabInfoDown)
      break
    default:
      break
  }
}

// Initialize shortcuts
onMounted(async () => {
  try {
    // Initialize shortcuts
    copyShortcut.value = await getCopyShortcut()
    pasteShortcut.value = await getPasteShortcut()
    closeShortcut.value = await getCloseShortcut()
    searchShortcut.value = await getSearchShortcut()
    newTerminalShortcut.value = await getNewTabShortcut()
    clearTermShortcut.value = await getClearTermShortcut()
    fileManagerShortcut.value = await getFileManagerShortcut()

    // Get shortcuts from shortcutService to ensure consistency with settings
    const shortcuts = shortcutService.getShortcuts()
    if (shortcuts) {
      // Update font size shortcuts
      const fontSizeIncreaseShortcut = shortcuts.fontSizeIncrease
      const fontSizeDecreaseShortcut = shortcuts.fontSizeDecrease

      if (fontSizeIncreaseShortcut) {
        fontsizeLargenShortcut.value = shortcutService.formatShortcut(fontSizeIncreaseShortcut, 'fontSizeIncrease')
      }
      if (fontSizeDecreaseShortcut) {
        fontsizeSmallerShortcut.value = shortcutService.formatShortcut(fontSizeDecreaseShortcut, 'fontSizeDecrease')
      }

      // Update other shortcuts to ensure consistency
      const newTabShortcut = shortcuts.newTab
      const clearTerminalShortcut = shortcuts.clearTerminal
      const openFileManagerShortcut = shortcuts.openFileManager

      if (newTabShortcut) {
        newTerminalShortcut.value = shortcutService.formatShortcut(newTabShortcut, 'newTab')
      }
      if (clearTerminalShortcut) {
        clearTermShortcut.value = shortcutService.formatShortcut(clearTerminalShortcut, 'clearTerminal')
      }
      if (openFileManagerShortcut) {
        fileManagerShortcut.value = shortcutService.formatShortcut(openFileManagerShortcut, 'openFileManager')
      }
    }
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
    // Fallback display
    copyShortcut.value = 'Ctrl+C'
    pasteShortcut.value = 'Ctrl+V'
    closeShortcut.value = 'Ctrl+W'
    searchShortcut.value = 'Ctrl+F'
    newTerminalShortcut.value = 'Ctrl+N'
    clearTermShortcut.value = 'Ctrl+P'
    fileManagerShortcut.value = 'Ctrl+M'
    fontsizeLargenShortcut.value = 'Ctrl+='
    fontsizeSmallerShortcut.value = 'Ctrl+-'
  }
})
</script>
<style scoped lang="less">
.context-menu-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--border-color) 50%, transparent 100%);
  margin: 3px 12px;
  opacity: 0.4;
}

/* Override v-contextmenu default styles */
:deep(.v-contextmenu) {
  background-color: var(--bg-color) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.15),
    0 2px 8px rgba(0, 0, 0, 0.1) !important;
  padding: 4px !important;
  min-width: 180px;
  backdrop-filter: blur(10px);
}

:deep(.v-contextmenu-item) {
  height: auto !important;
  min-height: 28px;
  padding: 6px 12px !important;
  margin: 1px 0;
  color: var(--text-color) !important;
  border-radius: 6px !important;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  position: relative;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;

  &:hover {
    background-color: var(--hover-bg-color) !important;
    color: var(--text-color) !important;
    transform: translateX(2px);
  }

  &:active {
    background-color: var(--active-bg-color) !important;
    transform: translateX(2px) scale(0.98);
  }
}

.shortcut-key {
  font-size: 11px;
  color: var(--text-secondary-color, #888);
  background-color: var(--shortcut-bg-color, rgba(0, 0, 0, 0.1));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-weight: 400;
  opacity: 0.8;
}

:deep(.v-contextmenu-submenu) {
  .v-contextmenu-submenu-title {
    height: auto !important;
    min-height: 28px;
    padding: 6px 12px !important;
    margin: 1px 0;
    color: var(--text-color) !important;
    border-radius: 6px !important;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    position: relative;
    user-select: none;

    &:hover {
      background-color: var(--hover-bg-color) !important;
      color: var(--text-color) !important;
      transform: translateX(2px);
    }

    &:active {
      background-color: var(--active-bg-color) !important;
      transform: translateX(2px) scale(0.98);
    }
  }
}

:deep(.v-contextmenu-submenu-content) {
  background-color: var(--bg-color) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.15),
    0 2px 8px rgba(0, 0, 0, 0.1) !important;
  padding: 4px !important;
  backdrop-filter: blur(10px);
}
</style>
