<template>
  <div class="db-sidebar">
    <div class="db-sidebar__header">
      <span class="db-sidebar__title">{{ t('database.title') }}</span>
      <div class="db-sidebar__add">
        <button
          ref="addBtnRef"
          class="db-sidebar__add-btn"
          :title="t('database.newConnection')"
          @click.stop="toggleAddMenu"
        >
          <PlusOutlined />
        </button>
        <button
          class="db-sidebar__add-btn"
          :title="t('database.refreshConnected')"
          :disabled="isRefreshing"
          @click.stop="handleRefreshConnected"
        >
          <ReloadOutlined :spin="isRefreshing" />
        </button>
      </div>
    </div>
    <div class="db-sidebar__search">
      <a-input
        :value="keyword"
        class="transparent-Input"
        :placeholder="t('database.searchPlaceholder')"
        allow-clear
        @update:value="(v: string) => emit('update:keyword', v)"
      >
        <template #suffix>
          <SearchOutlined />
        </template>
      </a-input>
    </div>
    <div class="db-sidebar__tree">
      <DatabaseTree
        :nodes="nodes"
        :selected-id="selectedId"
        :connection-statuses="connectionStatuses"
        :editing-group-id="editingGroupId ?? null"
        @toggle="(id) => emit('toggle', id)"
        @select="(id) => emit('select', id)"
        @open-table="(id) => emit('openTable', id)"
        @connect="(id) => emit('connect', id)"
        @disconnect="(id) => emit('disconnect', id)"
        @group-context="handleGroupContext"
        @commit-group-rename="(id, cur, next) => emit('commit-group-rename', id, cur, next)"
        @cancel-group-rename="() => emit('cancel-group-rename')"
      />
    </div>
    <Teleport to="body">
      <div
        v-if="groupMenu"
        ref="groupMenuRef"
        class="db-sidebar__group-menu db-sidebar__menu-overlay"
        :style="{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }"
        @click.stop
        @contextmenu.stop.prevent
      >
        <ul class="ant-dropdown-menu">
          <li
            class="ant-dropdown-menu-item db-sidebar__ctx-item--submenu"
            @mouseenter="openSubmenu('connection', $event)"
          >
            <span class="db-sidebar__group-submenu-trigger--connection">
              {{ t('database.newConnection') }}
            </span>
            <span class="db-sidebar__ctx-arrow">›</span>
          </li>
          <li
            class="ant-dropdown-menu-item"
            @mouseenter="closeSubmenu"
            @click="handleContextNewGroup"
          >
            {{ t('database.newGroup') }}
          </li>
          <li
            class="ant-dropdown-menu-item"
            @mouseenter="closeSubmenu"
            @click="handleContextRename"
          >
            {{ t('common.rename') }}
          </li>
          <li
            class="ant-dropdown-menu-item"
            @mouseenter="closeSubmenu"
            @click="handleContextCopyName"
          >
            {{ t('database.copyName') }}
          </li>
          <li
            class="ant-dropdown-menu-item db-sidebar__ctx-item--submenu"
            @mouseenter="openSubmenu('move', $event)"
          >
            <span class="db-sidebar__group-submenu-trigger--move">
              {{ t('database.moveTo') }}
            </span>
            <span class="db-sidebar__ctx-arrow">›</span>
          </li>
          <li
            class="ant-dropdown-menu-item db-sidebar__group-menu-item--danger"
            @mouseenter="closeSubmenu"
            @click="handleContextDelete"
          >
            {{ t('database.deleteGroup') }}
          </li>
        </ul>
        <div
          v-show="activeSubmenu === 'connection'"
          class="db-sidebar__menu-overlay db-sidebar__ctx-subpopup"
          :style="{ top: `${submenuTop}px` }"
          @mouseenter="openSubmenu('connection')"
        >
          <ul class="ant-dropdown-menu">
            <DbTypeMenuItems
              key-prefix="ctx-conn"
              class-prefix="db-sidebar__context-db-type-option--"
              variant="plain"
              @select="handleContextNewConnection"
            />
          </ul>
        </div>
        <div
          v-show="activeSubmenu === 'move'"
          class="db-sidebar__menu-overlay db-sidebar__ctx-subpopup"
          :style="{ top: `${submenuTop}px` }"
          @mouseenter="openSubmenu('move')"
        >
          <ul class="ant-dropdown-menu">
            <li
              class="ant-dropdown-menu-item db-sidebar__move-target--root"
              @click="handleMoveGroup(null)"
            >
              {{ t('database.rootGroup') }}
            </li>
            <li
              v-for="target in moveTargets"
              :key="`ctx-move-${target.id}`"
              :class="['ant-dropdown-menu-item', `db-sidebar__move-target--${target.id}`]"
              @click="handleMoveGroup(target.id)"
            >
              {{ target.name }}
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="addMenu"
        ref="addMenuRef"
        class="db-sidebar__group-menu db-sidebar__menu-overlay"
        :style="{ left: `${addMenu.x}px`, top: `${addMenu.y}px` }"
        @click.stop
      >
        <ul class="ant-dropdown-menu">
          <li
            class="ant-dropdown-menu-item"
            @mouseenter="closeSubmenu"
            @click="handleAddGroup"
          >
            {{ t('database.newGroup') }}
          </li>
          <li
            class="ant-dropdown-menu-item db-sidebar__ctx-item--submenu"
            @mouseenter="openSubmenu('connection', $event)"
          >
            <span class="db-sidebar__add-menu-trigger--connection">
              {{ t('database.newConnection') }}
            </span>
            <span class="db-sidebar__ctx-arrow">›</span>
          </li>
        </ul>
        <div
          v-show="activeSubmenu === 'connection'"
          class="db-sidebar__menu-overlay db-sidebar__ctx-subpopup"
          :style="{ top: `${submenuTop}px` }"
          @mouseenter="openSubmenu('connection')"
        >
          <ul class="ant-dropdown-menu">
            <DbTypeMenuItems
              key-prefix="add-conn"
              class-prefix="db-sidebar__db-type-option--"
              variant="plain"
              @select="handleAddConnection"
            />
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import DatabaseTree from './DatabaseTree.vue'
import DbTypeMenuItems from './DbTypeMenuItems.vue'
import type { DatabaseTreeNode, DatabaseType } from '../types'

const DEFAULT_GROUP_ID = 'group-default'

const { t } = useI18n()

const props = defineProps<{
  nodes: DatabaseTreeNode[]
  selectedId: string | null
  keyword: string
  connectionStatuses?: Record<string, 'idle' | 'testing' | 'connected' | 'failed'>
  editingGroupId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:keyword', value: string): void
  (e: 'add-connection', dbType: DatabaseType): void
  (e: 'add-connection-to-group', dbType: DatabaseType, groupId: string): void
  (e: 'add-group'): void
  (e: 'add-group-child', groupId: string): void
  (e: 'move-group', groupId: string, parentId: string | null): void
  (e: 'rename-group', groupId: string, currentName: string): void
  (e: 'commit-group-rename', groupId: string, currentName: string, nextName: string): void
  (e: 'cancel-group-rename'): void
  (e: 'delete-group', groupId: string, currentName: string): void
  (e: 'copy-group-name', value: string): void
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'openTable', id: string): void
  (e: 'connect', id: string): void
  (e: 'disconnect', id: string): void
  (e: 'refresh-connected'): void
}>()

// Only group context menu needs manual positioning; main add menu is now
// handled by a-dropdown.
const groupMenu = ref<{ id: string; name: string; x: number; y: number } | null>(null)
// Ref to the teleported menu root so we can do DOM-containment hit tests
// on pointermove. Using containment rather than mouseleave avoids the class
// of bugs where intermediate elements (e.g. the splitpanes gutter) break
// enter/leave event pairing while the cursor is still visually inside the
// menu rectangle.
const groupMenuRef = ref<HTMLElement | null>(null)
// Header "+" menu. Shares the same structure as groupMenu so we can reuse
// the hover/submenu machinery. Only one of the two can be open at a time.
const addMenu = ref<{ x: number; y: number } | null>(null)
const addMenuRef = ref<HTMLElement | null>(null)
const addBtnRef = ref<HTMLButtonElement | null>(null)
// Manually controlled sub-panel inside the context menu. antd's a-sub-menu
// does not reliably apply popup-class-name in a bare a-menu, so we render a
// plain div panel and own the hover state ourselves.
const activeSubmenu = ref<'connection' | 'move' | null>(null)
// Vertical offset of the active sub-panel, measured against the context menu
// outer container. Computed from the triggering <li>'s offsetTop on hover so
// the sub-panel's top edge lines up with the parent item, not with the top of
// the whole menu.
const submenuTop = ref(0)
// Delay handle used to bridge the micro-gap the cursor crosses when moving
// from a submenu trigger <li> to its popup. Without the delay, hovering a
// sibling <li> or transiting pixel-thin padding would close the popup
// mid-traversal and make it feel like the submenu is flickering.
let submenuCloseTimer: ReturnType<typeof setTimeout> | null = null
const SUBMENU_CLOSE_DELAY_MS = 120

function cancelSubmenuClose(): void {
  if (submenuCloseTimer) {
    clearTimeout(submenuCloseTimer)
    submenuCloseTimer = null
  }
}

function openSubmenu(name: 'connection' | 'move', event?: MouseEvent): void {
  cancelSubmenuClose()
  activeSubmenu.value = name
  const target = event?.currentTarget as HTMLElement | undefined
  if (target) {
    // offsetTop is relative to the nearest positioned ancestor (the fixed
    // outer .db-sidebar__group-menu), which is exactly the coordinate space
    // the absolutely-positioned sub-panel uses.
    submenuTop.value = target.offsetTop
  }
}

function closeSubmenu(): void {
  cancelSubmenuClose()
  submenuCloseTimer = setTimeout(() => {
    activeSubmenu.value = null
    submenuCloseTimer = null
  }, SUBMENU_CLOSE_DELAY_MS)
}

function findGroupNode(nodes: DatabaseTreeNode[], id: string): DatabaseTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findGroupNode(node.children ?? [], id)
    if (found) return found
  }
  return undefined
}

function collectDescendantGroupIds(node: DatabaseTreeNode | undefined, out = new Set<string>()): Set<string> {
  if (!node) return out
  for (const child of node.children ?? []) {
    if (child.type === 'group') {
      out.add(child.id)
      collectDescendantGroupIds(child, out)
    }
  }
  return out
}

const moveTargets = computed<Array<{ id: string; name: string }>>(() => {
  const all: Array<{ id: string; name: string }> = []
  const walk = (nodes: DatabaseTreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'group') {
        all.push({ id: node.id, name: node.name })
        walk(node.children ?? [])
      }
    }
  }
  walk(props.nodes)
  const currentId = groupMenu.value?.id
  if (!currentId) return all.filter((target) => target.id !== DEFAULT_GROUP_ID)
  const descendants = collectDescendantGroupIds(findGroupNode(props.nodes, currentId))
  return all.filter((target) => target.id !== DEFAULT_GROUP_ID && target.id !== currentId && !descendants.has(target.id))
})

const handleAddConnection = (dbType: DatabaseType): void => {
  emit('add-connection', dbType)
  hideAddMenu()
}

// Refresh button state. Parent owns the actual reload; we just flip the
// icon into a spinning state while the emitted promise is in flight.
const isRefreshing = ref(false)
const handleRefreshConnected = async (): Promise<void> => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    emit('refresh-connected')
  } finally {
    // Release after a short tick so a synchronous emit still shows feedback.
    // Parent work is awaited via its own state; the tick only covers the
    // visual flash of the icon.
    setTimeout(() => {
      isRefreshing.value = false
    }, 400)
  }
}

const handleAddGroup = (): void => {
  emit('add-group')
  hideAddMenu()
}

const hideGroupMenu = (): void => {
  groupMenu.value = null
  activeSubmenu.value = null
}

const hideAddMenu = (): void => {
  addMenu.value = null
  activeSubmenu.value = null
}

// Position the "+" dropdown immediately under the button, right-aligned so
// the menu's right edge lines up with the button (same visual as antd's
// original `placement: bottomRight`).
const toggleAddMenu = (): void => {
  if (addMenu.value) {
    hideAddMenu()
    return
  }
  hideGroupMenu()
  const btn = addBtnRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const MENU_WIDTH = 108
  const OFFSET_Y = 4
  addMenu.value = {
    x: Math.max(4, rect.right - MENU_WIDTH),
    y: rect.bottom + OFFSET_Y
  }
}

const handleGroupContext = (payload: { id: string; name: string; x: number; y: number }): void => {
  hideAddMenu()
  groupMenu.value = payload
}

const handleContextNewConnection = (dbType: DatabaseType): void => {
  if (!groupMenu.value) return
  emit('add-connection-to-group', dbType, groupMenu.value.id)
  hideGroupMenu()
}

const handleContextNewGroup = (): void => {
  if (!groupMenu.value) return
  emit('add-group-child', groupMenu.value.id)
  hideGroupMenu()
}

const handleContextRename = (): void => {
  if (!groupMenu.value) return
  emit('rename-group', groupMenu.value.id, groupMenu.value.name)
  hideGroupMenu()
}

const handleContextCopyName = (): void => {
  if (!groupMenu.value) return
  emit('copy-group-name', groupMenu.value.name)
  hideGroupMenu()
}

const handleMoveGroup = (parentId: string | null): void => {
  if (!groupMenu.value) return
  emit('move-group', groupMenu.value.id, parentId)
  hideGroupMenu()
}

const handleContextDelete = (): void => {
  if (!groupMenu.value) return
  emit('delete-group', groupMenu.value.id, groupMenu.value.name)
  hideGroupMenu()
}

// Close the submenu when the cursor leaves the menu DOM subtree. We listen at
// the document level and check containment directly, so transient elements
// under the cursor (such as the splitpanes gutter) do not interfere with
// standard enter/leave pairing.
const handlePointerMove = (event: PointerEvent): void => {
  if (!activeSubmenu.value) return
  const target = event.target as Node | null
  if (!target) return
  const inGroupMenu = !!groupMenuRef.value && groupMenuRef.value.contains(target)
  const inAddMenu = !!addMenuRef.value && addMenuRef.value.contains(target)
  if (inGroupMenu || inAddMenu) {
    cancelSubmenuClose()
    return
  }
  closeSubmenu()
}

const hideAllMenus = (): void => {
  hideGroupMenu()
  hideAddMenu()
}

onMounted(() => {
  window.addEventListener('click', hideAllMenus)
  document.addEventListener('pointermove', handlePointerMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', hideAllMenus)
  document.removeEventListener('pointermove', handlePointerMove)
  cancelSubmenuClose()
})
</script>

<style lang="less" scoped>
.db-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-right: 1px solid var(--border-color);

  &__header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    // Unified background across header / search / tree so no harsh divider
    // splits the sidebar into bands.
    background: var(--bg-color-secondary);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
  }

  &__add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-color);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg-color);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &:disabled:hover {
      background: transparent;
    }
  }

  &__add {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  &__search {
    padding: 8px 10px;
    background: var(--bg-color-secondary);
  }

  &__tree {
    flex: 1;
    overflow: auto;
    background: var(--bg-color-secondary);
  }

  &__group-menu {
    position: fixed;
    z-index: 20;
    min-width: 108px;
  }

  &__group-menu-item--danger {
    color: #ef4444;
  }
}
</style>

<style lang="less">
// Shared overlay + menu skin. a-dropdown / a-sub-menu overlays teleport to
// body, so these rules live in a non-scoped block and target a dedicated
// overlay class hook.
.db-sidebar__menu-overlay {
  &.ant-dropdown,
  &.ant-menu-submenu-popup {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  > .ant-dropdown-menu,
  > .ant-menu,
  > .ant-menu-sub {
    min-width: 108px;
    padding: 6px;
    background: var(--bg-color-secondary, #1f2937);
    border: 1px solid var(--border-color, rgb(255 255 255 / 10%));
    border-radius: 12px;
    box-shadow: 0 16px 40px rgb(0 0 0 / 32%);
    color: var(--text-color);
  }

  .ant-dropdown-menu-item,
  .ant-menu-item,
  .ant-menu-submenu-title {
    height: 36px;
    line-height: 36px;
    padding: 0 12px;
    margin: 0;
    border-radius: 8px;
    color: var(--text-color);
    transition: background-color 0.15s ease;

    &:hover,
    &.ant-dropdown-menu-item-active,
    &.ant-menu-item-active,
    &.ant-menu-submenu-active > .ant-menu-submenu-title,
    &.ant-menu-submenu-open > .ant-menu-submenu-title {
      background: var(--hover-bg-color, rgb(255 255 255 / 8%));
      color: var(--text-color);
    }
  }

  .ant-menu-submenu-arrow,
  .ant-dropdown-menu-submenu-arrow {
    color: var(--text-color-secondary, #8a94a6);
  }

  .ant-menu-item-disabled,
  .ant-dropdown-menu-item-disabled {
    color: var(--text-color-secondary, #8a94a6) !important;
    cursor: not-allowed;
  }

  .db-sidebar__group-menu-item--danger {
    color: #ef4444 !important;

    &:hover {
      background: rgb(239 68 68 / 10%) !important;
      color: #ef4444 !important;
    }
  }

  .db-sidebar__db-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }

  .db-sidebar__db-option-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .db-sidebar__db-option-name {
    line-height: 1;
  }

  .db-sidebar__db-option--disabled {
    cursor: not-allowed !important;

    .db-sidebar__db-option-icon {
      filter: grayscale(1) opacity(0.5);
    }

    .db-sidebar__db-option-name {
      opacity: 0.5;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-menu popup (teleported separately from the parent overlay). When antd
// renders the nested `a-sub-menu` popup, it keeps our custom class via the
// `popup-class-name` prop, but the popup root itself is a distinct DOM node
// with different antd classes (`.ant-menu-submenu-popup`), so the rules above
// that qualify with `.ant-dropdown` / nested `.ant-menu` sometimes miss it.
// Duplicate the skin here, keyed only by our class — that way the sub-menu
// matches even when the outer overlay selectors don't.
.db-sidebar__submenu-overlay {
  &.ant-menu-submenu-popup {
    min-width: 220px;
    padding: 6px !important;
    background: var(--bg-color-secondary, #1f2937) !important;
    border: 1px solid var(--border-color, rgb(255 255 255 / 10%)) !important;
    border-radius: 12px !important;
    box-shadow: 0 16px 40px rgb(0 0 0 / 32%) !important;
    backdrop-filter: none !important;
  }

  background: transparent !important;
  box-shadow: none !important;
  border: none !important;

  // The popup root draws the only card chrome. Any nested menu containers must
  // stay transparent/borderless, otherwise rc-menu nested wrappers can produce
  // a visible second border.
  > .ant-menu,
  > .ant-menu-sub {
    min-width: 180px;
    padding: 0;
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    color: var(--text-color) !important;
  }

  .ant-menu,
  .ant-menu-sub {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  .ant-menu-item,
  .ant-menu-submenu-title {
    height: 36px;
    line-height: 36px;
    padding: 0 12px !important;
    margin: 0 !important;
    border-radius: 8px !important;
    color: var(--text-color) !important;
    background: transparent !important;
    transition: background-color 0.15s ease;

    &:hover,
    &.ant-menu-item-active,
    &.ant-menu-submenu-active > .ant-menu-submenu-title,
    &.ant-menu-submenu-open > .ant-menu-submenu-title {
      background: var(--hover-bg-color, rgb(255 255 255 / 8%)) !important;
      color: var(--text-color) !important;
    }
  }

  .ant-menu-submenu-arrow {
    color: var(--text-color-secondary, #8a94a6) !important;
  }

  .ant-menu-item-disabled {
    color: var(--text-color-secondary, #8a94a6) !important;
    cursor: not-allowed;
  }

  .db-sidebar__db-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }

  .db-sidebar__db-option-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .db-sidebar__db-option--disabled {
    cursor: not-allowed !important;

    .db-sidebar__db-option-icon {
      filter: grayscale(1) opacity(0.5);
    }

    .db-sidebar__db-option-name {
      opacity: 0.5;
    }
  }
}

.db-sidebar__submenu-overlay {
  min-width: 220px;

  > .ant-menu,
  > .ant-menu-sub {
    min-width: 220px;
  }
}

// Context menu is rendered as plain HTML but re-uses the shared overlay skin
// (.db-sidebar__menu-overlay .ant-dropdown-menu / .ant-dropdown-menu-item) so
// it looks identical to the top-right `+` dropdown. The `.db-sidebar__group-menu`
// wrapper only handles positioning — the visual card is drawn by the inner
// `.ant-dropdown-menu` element, same as in the antd-rendered dropdown.

.db-sidebar__ctx-item--submenu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: visible;
}

// The ant-dropdown-menu card normally clips its content; we need sub-popups
// (positioned via `left: 100%`) to escape the card.
.db-sidebar__group-menu .ant-dropdown-menu {
  overflow: visible;
}

.db-sidebar__ctx-arrow {
  color: var(--text-color-secondary, #8a94a6);
  font-size: 14px;
  line-height: 1;
}

// Sub-panel container. Rendered as a sibling of the outer <ul> so it shares
// the positioning context of the fixed `.db-sidebar__group-menu`. `top` is
// computed per-trigger from the row's offsetTop so the popup always lines up
// with the hovered <li>. `padding-left` acts as a transparent hover bridge
// that keeps the cursor over the overlay while crossing the gap.
.db-sidebar__ctx-subpopup {
  position: absolute;
  left: 100%;
  padding-left: 4px;
  z-index: 21;
}

// Danger tone for destructive actions in the context menu. Scoped under
// `.db-sidebar__group-menu` so it doesn't leak to other overlays.
.db-sidebar__group-menu .ant-dropdown-menu-item.db-sidebar__group-menu-item--danger {
  color: #ef4444;

  &:hover {
    background: rgb(239 68 68 / 10%);
    color: #ef4444;
  }
}
</style>
