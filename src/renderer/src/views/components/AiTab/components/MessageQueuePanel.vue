<template>
  <div
    v-if="items.length > 0"
    class="message-queue-panel"
    data-testid="message-queue-panel"
  >
    <div
      class="queue-header"
      data-testid="message-queue-toggle"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
      @keydown.enter.prevent="collapsed = !collapsed"
      @keydown.space.prevent="collapsed = !collapsed"
    >
      <span class="queue-title">{{ $t('ai.queuedMessages', { count: items.length }) }}</span>
      <DownOutlined
        class="queue-chevron"
        :class="{ collapsed }"
      />
    </div>
    <div
      v-if="!collapsed"
      class="queue-list"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="queue-item"
        :class="{ injecting: item.injecting, 'drag-over': dragOverId === item.id }"
        data-testid="message-queue-item"
        :draggable="!item.injecting"
        @dragstart="handleDragStart($event, item.id)"
        @dragover.prevent="dragOverId = item.id"
        @dragleave="dragOverId = null"
        @drop.prevent="handleDrop(item.id)"
        @dragend="resetDrag"
      >
        <HolderOutlined
          class="queue-drag-handle"
          :aria-label="$t('ai.queueDragHandle')"
        />
        <span
          class="queue-text"
          :title="item.content"
          >{{ item.content }}</span
        >
        <div class="queue-actions">
          <button
            type="button"
            class="queue-action send-now"
            data-testid="message-queue-send-now"
            :disabled="item.injecting"
            @click="emit('send-now', item.id)"
          >
            <EnterOutlined class="send-now-icon" />
            <span>{{ $t('ai.queueSendNow') }}</span>
          </button>
          <button
            type="button"
            class="queue-action icon-only"
            data-testid="message-queue-remove"
            :aria-label="$t('ai.queueRemove')"
            :disabled="item.injecting"
            @click="emit('remove', item.id)"
          >
            <DeleteOutlined />
          </button>
          <a-dropdown
            :trigger="['click']"
            :disabled="item.injecting"
          >
            <button
              type="button"
              class="queue-action icon-only"
              data-testid="message-queue-more"
              :aria-label="$t('ai.queueMore')"
              :disabled="item.injecting"
            >
              <EllipsisOutlined />
            </button>
            <template #overlay>
              <a-menu>
                <a-menu-item
                  key="edit"
                  data-testid="message-queue-edit"
                  @click="emit('edit', item.id)"
                >
                  {{ $t('ai.queueEdit') }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { DeleteOutlined, DownOutlined, EllipsisOutlined, EnterOutlined, HolderOutlined } from '@ant-design/icons-vue'
import type { QueuedMessage } from '../composables/useSessionState'

defineProps<{
  items: QueuedMessage[]
}>()

const emit = defineEmits<{
  (e: 'send-now', id: string): void
  (e: 'remove', id: string): void
  (e: 'edit', id: string): void
  (e: 'move', fromId: string, toId: string): void
}>()

const collapsed = ref(false)
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

const handleDragStart = (event: DragEvent, id: string) => {
  draggingId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const resetDrag = () => {
  draggingId.value = null
  dragOverId.value = null
}

const handleDrop = (targetId: string) => {
  if (draggingId.value) {
    emit('move', draggingId.value, targetId)
  }
  resetDrag()
}
</script>

<style scoped lang="less">
.message-queue-panel {
  display: flex;
  flex-direction: column;
  width: calc(100% - 16px);
  margin: 4px 8px 0 8px;
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-color);
  overflow: hidden;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  color: var(--text-color-secondary);
  cursor: pointer;
  user-select: none;
}

.queue-chevron {
  font-size: 10px;
  transition: transform 0.2s ease;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.queue-list {
  display: flex;
  flex-direction: column;
  max-height: 160px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color-light);
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 2px solid transparent;

  &.drag-over {
    border-top-color: var(--button-active-bg);
  }

  &.injecting {
    opacity: 0.55;
  }

  &:hover:not(.injecting) {
    background-color: var(--hover-bg-color);
  }
}

.queue-drag-handle {
  flex-shrink: 0;
  color: var(--text-color-tertiary);
  cursor: grab;
}

.queue-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.queue-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: var(--hover-bg-color);
    color: var(--text-color);
  }

  &:disabled {
    cursor: default;
  }
}

.send-now-icon {
  transform: scaleX(-1);
}
</style>
