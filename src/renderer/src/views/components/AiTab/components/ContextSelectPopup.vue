<template>
  <teleport to="body">
    <div
      v-if="showContextPopup"
      class="context-select-popup"
      :class="popupClass"
      :style="popupStyle"
    >
      <!-- Header: Back button + Search -->
      <div class="popup-header">
        <LeftOutlined
          v-if="currentMenuLevel !== 'main'"
          class="back-icon"
          @click.stop="goBack"
        />
        <a-input
          ref="searchInputRef"
          v-model:value="searchValue"
          :placeholder="searchPlaceholder"
          size="small"
          class="popup-search-input"
          :class="{ 'has-back': currentMenuLevel !== 'main' }"
          allow-clear
          @keydown="handleSearchKeyDownWithInput"
        />
      </div>

      <!-- Level 1: Main Menu -->
      <div
        v-if="currentMenuLevel === 'main'"
        class="main-menu-list"
      >
        <div
          v-for="(item, index) in mainMenuItems"
          :key="item.key"
          class="menu-item"
          :class="{ 'keyboard-selected': keyboardSelectedIndex === index }"
          @click.stop="goToLevel2(item.key)"
          @mouseover="handleMenuMouseOver(index)"
        >
          <component
            :is="item.icon"
            class="menu-icon"
          />
          <span class="menu-label">{{ $t(item.labelKey) }}</span>
          <RightOutlined class="arrow-icon" />
        </div>
      </div>

      <!-- Level 2: Hosts List -->
      <div
        v-else-if="currentMenuLevel === 'hosts'"
        class="select-list"
      >
        <template
          v-for="(item, index) in filteredHostOptions"
          :key="item.value"
        >
          <!-- Jumpserver parent node -->
          <div
            v-if="isBastionHostType(item.type)"
            class="select-item select-group"
            :class="{
              hovered: hovered === item.value,
              'keyboard-selected': keyboardSelectedIndex === index,
              expanded: item.expanded
            }"
            @mouseover="handleMouseOver(item.value, index)"
            @mouseleave="hovered = null"
            @click="toggleJumpserverExpand(item.key)"
          >
            <span class="item-label group-label">{{ item.label }}</span>
            <span class="group-badge">{{ item.childrenCount || 0 }}</span>
            <span class="group-toggle">
              <DownOutlined
                v-if="item.expanded"
                class="toggle-icon"
              />
              <RightOutlined
                v-else
                class="toggle-icon"
              />
            </span>
          </div>
          <!-- Normal selectable host items -->
          <div
            v-else
            class="select-item"
            :class="{
              hovered: hovered === item.value,
              'keyboard-selected': keyboardSelectedIndex === index,
              'select-child': item.level === 1
            }"
            :style="{ paddingLeft: item.level === 1 ? '24px' : '6px' }"
            @mouseover="handleMouseOver(item.value, index)"
            @mouseleave="hovered = null"
            @click="handleHostClick(item)"
          >
            <span class="item-label">{{ item.label }}</span>
            <CheckOutlined
              v-if="isHostSelected(item)"
              class="selected-icon"
            />
          </div>
        </template>
        <div
          v-if="hostOptionsLoading && filteredHostOptions.length > 0"
          class="select-loading"
        >
          {{ $t('ai.loading') }}...
        </div>
        <div
          v-if="filteredHostOptions.length === 0 && !hostOptionsLoading"
          class="select-empty"
        >
          {{ $t('ai.noMatchingHosts') }}
        </div>
      </div>

      <!-- Level 2: Docs List -->
      <div
        v-else-if="currentMenuLevel === 'docs'"
        class="select-list"
      >
        <div
          v-for="(doc, index) in filteredDocsOptions"
          :key="doc.absPath"
          class="select-item"
          :class="{
            hovered: hovered === doc.absPath,
            'keyboard-selected': keyboardSelectedIndex === index
          }"
          @mouseover="handleMouseOver(doc.absPath, index)"
          @mouseleave="hovered = null"
          @click="onDocClick(doc)"
        >
          <FolderOutlined
            v-if="doc.type === 'dir'"
            class="item-icon"
          />
          <FileTextOutlined
            v-else
            class="item-icon"
          />
          <span class="item-label">{{ doc.name }}</span>
          <CheckOutlined
            v-if="isDocSelected(doc)"
            class="selected-icon"
          />
        </div>
        <div
          v-if="docsOptionsLoading"
          class="select-loading"
        >
          {{ $t('ai.loading') }}...
        </div>
        <div
          v-if="filteredDocsOptions.length === 0 && !docsOptionsLoading"
          class="select-empty"
        >
          {{ $t('ai.noMatchingDocs') }}
        </div>
      </div>

      <!-- Level 2: Chats List -->
      <div
        v-else-if="currentMenuLevel === 'chats'"
        class="select-list"
      >
        <div
          v-for="(chat, index) in filteredChatsOptions"
          :key="chat.id"
          class="select-item"
          :class="{
            hovered: hovered === chat.id,
            'keyboard-selected': keyboardSelectedIndex === index
          }"
          @mouseover="handleMouseOver(chat.id, index)"
          @mouseleave="hovered = null"
          @click="onChatClick(chat)"
        >
          <MessageOutlined class="item-icon" />
          <span class="item-label">{{ chat.title }}</span>
          <CheckOutlined
            v-if="isChatSelected(chat)"
            class="selected-icon"
          />
        </div>
        <div
          v-if="chatsOptionsLoading"
          class="select-loading"
        >
          {{ $t('ai.loading') }}...
        </div>
        <div
          v-if="filteredChatsOptions.length === 0 && !chatsOptionsLoading"
          class="select-empty"
        >
          {{ $t('ai.noMatchingChats') }}
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, inject, type Component } from 'vue'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LeftOutlined,
  RightOutlined,
  DownOutlined,
  LaptopOutlined,
  FileTextOutlined,
  FolderOutlined,
  MessageOutlined,
  CheckOutlined
} from '@ant-design/icons-vue'
import { contextInjectionKey } from '../composables/useContext'
import type { ContextMenuLevel, HostOption } from '../types'
import { isBastionHostType } from '../types'

interface Props {
  mode?: 'create' | 'edit'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'create'
})

const { t } = useI18n()

// Inject context from parent component (InputSendContainer)
const context = inject(contextInjectionKey)
if (!context) {
  throw new Error('ContextSelectPopup must be used within a component that provides context')
}

const {
  showContextPopup,
  currentMenuLevel,
  searchValue,
  hovered,
  keyboardSelectedIndex,
  popupPosition,
  popupReady,
  currentMode,
  searchInputRef,
  chatTypeValue,
  // Hosts
  filteredHostOptions,
  hostOptionsLoading,
  isHostSelected,
  onHostClick,
  toggleJumpserverExpand,
  // Docs
  filteredDocsOptions,
  docsOptionsLoading,
  isDocSelected,
  onDocClick,
  // Chats
  filteredChatsOptions,
  chatsOptionsLoading,
  isChatSelected,
  onChatClick,
  // Handlers
  handleSearchKeyDown,
  handleMouseOver,
  goToLevel2,
  goBack
} = context

// Wrapper for keyboard handling
const handleSearchKeyDownWithInput = (e: KeyboardEvent) => {
  void handleSearchKeyDown(e)
}

const handleHostClick = (item: HostOption) => {
  onHostClick(item)
}

const handleMenuMouseOver = (index: number) => {
  keyboardSelectedIndex.value = index
}

const popupStyle = computed<CSSProperties>(() => {
  if (!popupPosition.value) {
    return {}
  }
  const style: CSSProperties = {
    left: `${popupPosition.value.left}px`
  }
  // createMode uses bottom positioning (expands upward), editMode uses top
  if (popupPosition.value.bottom !== undefined) {
    style.bottom = `${popupPosition.value.bottom}px`
  } else if (popupPosition.value.top !== undefined) {
    style.top = `${popupPosition.value.top}px`
  }
  return style
})

const popupClass = computed(() => ({
  'is-edit-mode': currentMode.value === 'edit',
  'is-positioning': !popupReady.value
}))

interface MainMenuItem {
  key: Exclude<ContextMenuLevel, 'main'>
  labelKey: string
  icon: Component
}

const showHostsMenuItem = computed(() => chatTypeValue.value === 'agent')

const mainMenuItems = computed<MainMenuItem[]>(() => {
  const items: MainMenuItem[] = []
  if (showHostsMenuItem.value) {
    items.push({ key: 'hosts', labelKey: 'ai.hosts', icon: LaptopOutlined })
  }
  items.push({ key: 'docs', labelKey: 'ai.docs', icon: FileTextOutlined })
  items.push({ key: 'chats', labelKey: 'ai.pastChats', icon: MessageOutlined })
  return items
})

const searchPlaceholder = computed(() => {
  switch (currentMenuLevel.value) {
    case 'hosts':
      return t('ai.searchHost')
    case 'docs':
      return t('ai.searchDocs')
    case 'chats':
      return t('ai.searchChats')
    default:
      return t('ai.search')
  }
})

// Sync mode with parent and suppress unused var warning for template refs
void props.mode
void searchInputRef
</script>

<style lang="less" scoped>
.context-select-popup {
  width: 260px;
  background: var(--bg-color);
  border-radius: 6px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  max-height: 280px;
  z-index: 1000;
  position: fixed;
  overflow: hidden;

  &.is-edit-mode {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    transition: opacity 0.05s ease-in;
  }

  &.is-positioning {
    opacity: 0;
    pointer-events: none;
    transition: none;
  }
}

.popup-header {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  gap: 6px;

  .back-icon {
    cursor: pointer;
    color: var(--text-color-secondary);
    font-size: 12px;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
    flex-shrink: 0;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }
  }

  .popup-search-input {
    flex: 1;
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color) !important;

    :deep(.ant-input) {
      height: 24px !important;
      font-size: 12px !important;
      background-color: var(--bg-color-secondary) !important;
      color: var(--text-color-secondary) !important;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }
    }
  }
}

.main-menu-list {
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 13px;
  transition: all 0.15s;

  &:hover,
  &.keyboard-selected {
    background: var(--hover-bg-color);
  }

  &.keyboard-selected {
    outline: 2px solid rgba(24, 144, 255, 0.4);
    outline-offset: -2px;
  }

  .menu-icon {
    font-size: 14px;
    color: var(--text-color-secondary);
    margin-right: 10px;
  }

  .menu-label {
    flex: 1;
  }

  .arrow-icon {
    font-size: 10px;
    color: var(--text-color-tertiary);
  }
}

.select-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-color-quinary) var(--bg-color-senary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    border-radius: 3px;

    &:hover {
      background-color: var(--scrollbar-thumb-hover);
    }
  }
}

.select-item {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  line-height: 18px;
  transition: all 0.15s;
  display: flex;
  align-items: center;

  .item-icon {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-right: 8px;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-icon {
    font-size: 10px;
    color: #52c41a;
    margin-left: 6px;
    flex-shrink: 0;
  }

  &.hovered,
  &:hover {
    background: var(--hover-bg-color);
  }

  &.keyboard-selected {
    background: var(--hover-bg-color);
    outline: 2px solid rgba(24, 144, 255, 0.4);
    outline-offset: -2px;
  }

  &.select-group {
    background-color: var(--bg-color-secondary);
    font-weight: 500;

    .group-label {
      flex: 1;
      color: var(--text-color);
      margin-right: 6px;
    }

    .group-badge {
      font-size: 10px;
      padding: 0 6px;
      background-color: var(--bg-color-quaternary);
      border-radius: 10px;
      color: var(--text-color-secondary);
      margin-left: 6px;
      line-height: 16px;
      min-width: 24px;
      text-align: center;
    }

    .group-toggle {
      width: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;

      .toggle-icon {
        font-size: 10px;
        color: var(--text-color-tertiary);
        transition: transform 0.2s ease;
      }
    }
  }

  &.select-child {
    border-left: 2px solid var(--border-color-light);
    margin-left: 12px;
    border-radius: 0 4px 4px 0;

    &:hover,
    &.hovered {
      border-left-color: #1890ff;
    }
  }
}

.select-empty,
.select-loading {
  color: var(--text-color-tertiary);
  text-align: center;
  padding: 16px 12px;
  font-size: 12px;
}
</style>
