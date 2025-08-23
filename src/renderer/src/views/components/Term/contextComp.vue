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
      >{{ $t('common.disconnect') }}</v-contextmenu-item
    >
    <v-contextmenu-item
      v-if="!props.isConnect"
      @click="onContextMenuAction('reconnect')"
      >{{ $t('common.reconnect') }}</v-contextmenu-item
    >

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Terminal Control Group -->
    <v-contextmenu-item @click="onContextMenuAction('newTerminal')">{{ $t('common.newTerminal') }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('close')">
      {{ $t('common.closeTerminal') }}
      <span class="shortcut-key">{{ closeShortcut }}</span>
    </v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('clearTerm')">{{ $t('common.clearTerm') }}</v-contextmenu-item>

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
    <v-contextmenu-item @click="onContextMenuAction('fileManager')">{{ $t('common.fileManager') }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('shrotenName')">{{ $t('common.shrotenName') }}</v-contextmenu-item>

    <!-- Divider -->
    <div class="context-menu-divider"></div>

    <!-- Display Settings Group -->
    <v-contextmenu-submenu :title="$t('common.fontsize')">
      <v-contextmenu-item @click="onContextMenuAction('fontsizeLargen')">{{ $t('common.largen') }}</v-contextmenu-item>
      <v-contextmenu-item @click="onContextMenuAction('fontsizeSmaller')">{{ $t('common.smaller') }}</v-contextmenu-item>
    </v-contextmenu-submenu>
  </div>
</template>

<script setup lang="ts">
import { defineProps, ref, onMounted } from 'vue'
import { isGlobalInput, isShowQuickCommand } from '../Ssh/termInputManager'
import { getCopyShortcut, getPasteShortcut, getCloseShortcut, getSearchShortcut } from '@/utils/shortcuts'
import eventBus from '@/utils/eventBus'

// Reactive variables
const copyShortcut = ref('')
const pasteShortcut = ref('')
const closeShortcut = ref('')
const searchShortcut = ref('')

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
  } catch (error) {
    console.error('Failed to load shortcuts:', error)
    // Fallback display
    copyShortcut.value = 'Ctrl+C'
    pasteShortcut.value = 'Ctrl+V'
    closeShortcut.value = 'Ctrl+D'
    searchShortcut.value = 'Ctrl+F'
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
