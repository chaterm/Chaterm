<template>
  <div class="db-tabs">
    <div class="db-tabs__scroller">
      <div
        class="db-tabs__list"
        role="tablist"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :ref="(el) => registerItemRef(tab.id, el as Element | null)"
          class="db-tabs__item"
          :class="{ 'db-tabs__item--active': tab.id === activeTabId }"
          role="tab"
          :aria-selected="tab.id === activeTabId"
          @click="emit('select', tab.id)"
        >
          <span
            v-if="tab.kind !== 'overview'"
            class="db-tabs__icon"
            :class="`db-tabs__icon--${tab.kind}`"
          >
            <TableOutlined v-if="tab.kind === 'data'" />
            <PlayCircleOutlined v-else-if="tab.kind === 'sql'" />
          </span>
          <span class="db-tabs__title">{{ tab.title }}</span>
          <button
            v-if="tab.kind !== 'overview'"
            class="db-tabs__close"
            :aria-label="`close ${tab.title}`"
            @click.stop="emit('close', tab.id)"
          >
            <CloseOutlined />
          </button>
        </div>
        <button
          class="db-tabs__add"
          :aria-label="$t('database.addTab')"
          :title="$t('database.addTab')"
          @click="emit('add')"
        >
          <PlusOutlined />
        </button>
      </div>
    </div>
    <!-- Overflow menu: pinned right, lists every tab so users can jump to
         any tab when the bar overflows horizontally. Always rendered so the
         affordance doesn't "shift" when tabs cross the overflow threshold. -->
    <a-dropdown
      trigger="click"
      placement="bottomRight"
    >
      <button
        class="db-tabs__overflow"
        :aria-label="$t('database.addTab')"
        :title="$t('database.addTab')"
        @click.stop
      >
        <DownOutlined />
      </button>
      <template #overlay>
        <a-menu
          class="db-tabs__overflow-menu"
          :selected-keys="[activeTabId]"
          @click="({ key }: { key: string }) => onOverflowSelect(key)"
        >
          <a-menu-item
            v-for="tab in tabs"
            :key="tab.id"
          >
            {{ tab.title }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { CloseOutlined, DownOutlined, PlayCircleOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons-vue'
import type { DatabaseWorkspaceTab } from '../types'

const props = defineProps<{
  tabs: DatabaseWorkspaceTab[]
  activeTabId: string
  aiPaneOpen: boolean
  canToggleAiPane: boolean
}>()

const emit = defineEmits<{
  (e: 'select', tabId: string): void
  (e: 'close', tabId: string): void
  (e: 'add'): void
}>()

const itemRefs = new Map<string, Element>()

function registerItemRef(tabId: string, el: Element | null): void {
  if (el) itemRefs.set(tabId, el)
  else itemRefs.delete(tabId)
}

/**
 * When the active tab changes (e.g. via the overflow dropdown or via
 * openTableDataTab on a table deep in the tree), scroll the tab strip so
 * the active tab is visible. Uses `nearest` inline so an already-visible
 * tab is not re-centered — avoids jitter on every click.
 */
watch(
  () => props.activeTabId,
  async (id) => {
    if (!id) return
    await nextTick()
    const el = itemRefs.get(id)
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
)

function onOverflowSelect(tabId: string): void {
  emit('select', tabId)
}
</script>

<style lang="less" scoped>
.db-tabs {
  display: flex;
  align-items: stretch;
  height: 32px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  // Root container no longer scrolls — the inner scroller handles overflow
  // so the overflow-menu button stays pinned on the right.
  overflow: hidden;

  &__scroller {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    // Hide the horizontal scrollbar while keeping scroll behavior. The
    // overflow dropdown is the intended affordance for navigation; users
    // can still wheel-scroll or drag within the strip.
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__list {
    display: inline-flex;
    align-items: stretch;
    height: 100%;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;
    border-right: 1px solid var(--border-color);
    user-select: none;
    white-space: nowrap;

    &:hover {
      background: var(--hover-bg-color);
    }

    &--active {
      color: var(--text-color);
      background: var(--bg-color);
      border-bottom: 2px solid var(--primary-color, #3b82f6);
    }
  }

  &__title {
    white-space: nowrap;
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    line-height: 1;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;

    &:hover {
      background: var(--active-bg-color);
    }
  }

  &__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 100%;
    flex: 0 0 auto;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border-color);
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }
  }

  &__ai-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 100%;
    flex: 0 0 auto;
    background: transparent;
    border: none;
    border-left: 1px solid var(--border-color);
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--active {
      color: var(--primary-color, #3b82f6);
      background: var(--active-bg-color);
    }
  }

  &__overflow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 100%;
    flex: 0 0 auto;
    background: transparent;
    border: none;
    border-left: 1px solid var(--border-color);
    color: var(--text-color-secondary, #8a94a6);
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
      color: var(--text-color);
    }
  }
}
</style>
