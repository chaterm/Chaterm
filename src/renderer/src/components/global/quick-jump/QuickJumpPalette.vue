<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="quick-jump-overlay"
      @mousedown.self="close(true)"
      @keydown="handleKeydown"
    >
      <div class="quick-jump-panel">
        <input
          ref="inputRef"
          v-model="query"
          class="quick-jump-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('quickJump.placeholder')"
          :aria-label="t('quickJump.placeholder')"
        />
        <div
          ref="listRef"
          class="quick-jump-list"
          role="tree"
        >
          <div
            v-for="row in rows"
            :key="row.id"
            class="quick-jump-row"
            :class="{
              'is-header': row.kind === 'header',
              'is-tree': isTreeRow(row),
              'is-collapsible': isCollapsibleRow(row),
              'is-active': row.id === activeId
            }"
            :style="row.kind === 'header' ? undefined : { '--depth': row.depth }"
            role="treeitem"
            :aria-level="row.kind === 'header' ? 1 : row.depth + 2"
            :aria-expanded="isCollapsibleRow(row) ? row.expanded : undefined"
            :aria-selected="row.id === activeId"
            :data-row-id="row.id"
            @mousemove="handleRowMouseMove($event, row)"
            @click="activate(row)"
          >
            <template v-if="row.kind === 'header'">
              <component
                :is="row.expanded ? DownOutlined : RightOutlined"
                v-if="row.collapsible"
                class="quick-jump-chevron"
              />
              <span class="quick-jump-group-title">{{ groupTitle(row.group) }}</span>
            </template>
            <template v-else-if="row.kind === 'dir'">
              <component
                :is="row.expanded ? CaretDownFilled : CaretRightFilled"
                v-if="row.collapsible"
                class="quick-jump-switcher"
              />
              <span
                v-else
                class="quick-jump-switcher"
              ></span>
              <component
                :is="row.expanded ? FolderOpenOutlined : FolderOutlined"
                class="quick-jump-node-icon"
              />
              <span class="quick-jump-title">{{ row.title }}</span>
            </template>
            <template v-else>
              <template v-if="isTreeRow(row)">
                <span class="quick-jump-switcher"></span>
                <FileOutlined class="quick-jump-node-icon" />
              </template>
              <span class="quick-jump-title">{{ row.item.title }}</span>
              <span
                v-if="row.item.subtitle"
                class="quick-jump-subtitle"
                >{{ row.item.subtitle }}</span
              >
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import {
  CaretDownFilled,
  CaretRightFilled,
  DownOutlined,
  FileOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  RightOutlined
} from '@ant-design/icons-vue'
import eventBus from '@/utils/eventBus'
import { executeScript } from '@views/components/Ssh/utils/commandScript'
import {
  buildQuickJumpRows,
  collectKnowledgeTree,
  findDefaultRowId,
  isCollapsibleRow,
  isSelectableRow,
  moveRowId,
  parentRowId,
  type QuickJumpGroupKey,
  type QuickJumpHostNode,
  type QuickJumpKnowledgeNode,
  type QuickJumpRow,
  type QuickJumpSnippet,
  type QuickJumpTab
} from './quickJumpItems'

const logger = createRendererLogger('quickJump')

interface Props {
  visible: boolean
  tabs: QuickJumpTab[]
  activeTerminalTabId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void
  (e: 'selectTab', tabId: string): void
}>()

const { t } = useI18n()
const api = window.api

const knowledgeEnabled =
  String(import.meta.env.RENDERER_KB_SEARCH_ENABLED || '')
    .trim()
    .toLowerCase() !== 'false'

const query = ref('')
const expandedGroups = ref<Set<QuickJumpGroupKey>>(new Set(['recent']))
const activeId = ref<string | null>(null)
const hostTrees = ref<QuickJumpHostNode[][]>([])
const snippets = ref<QuickJumpSnippet[]>([])
const knowledgeTree = ref<QuickJumpKnowledgeNode[]>([])
const expandedKnowledgeDirs = ref<Set<string>>(new Set())
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const rows = computed(() =>
  buildQuickJumpRows(
    query.value,
    { hostTrees: hostTrees.value, tabs: props.tabs, snippets: snippets.value, knowledgeTree: knowledgeTree.value },
    expandedGroups.value,
    expandedKnowledgeDirs.value
  )
)

const isTreeRow = (row: QuickJumpRow): boolean => row.kind === 'dir' || (row.kind === 'item' && row.group === 'knowledge')

const groupTitle = (group: QuickJumpGroupKey): string => {
  switch (group) {
    case 'recent':
      return t('common.recentConnections')
    case 'hosts':
      return t('quickJump.hosts')
    case 'tabs':
      return t('quickJump.tabs')
    case 'snippets':
      return t('common.quickCommand')
    case 'knowledge':
      return t('knowledgeCenter.title')
  }
}

// Bumped on every open and close so a slow source cannot write into a later session.
let loadToken = 0
// Until the user moves the highlight it keeps following the default row, so rows that
// arrive after the palette opened (hosts load asynchronously) still get picked.
let highlightMoved = false

const loadSources = (): void => {
  const token = ++loadToken
  const isCurrent = () => token === loadToken && props.visible

  const loadTree = async (param: string): Promise<QuickJumpHostNode[]> => {
    const res = await api.getLocalAssetRoute({ searchType: 'tree', params: [param] })
    return res?.data?.routers || []
  }
  Promise.all([loadTree('person'), loadTree('organization')])
    .then((trees) => {
      if (isCurrent()) hostTrees.value = trees
    })
    .catch((error) => logger.error('Failed to load hosts', { error }))

  api
    .userSnippetOperation({ operation: 'list' })
    .then((res) => {
      if (isCurrent()) snippets.value = res?.data?.snippets || []
    })
    .catch((error) => logger.error('Failed to load snippets', { error }))

  if (knowledgeEnabled) {
    collectKnowledgeTree((relDir) => api.kbListDir(relDir))
      .then((tree) => {
        if (isCurrent()) knowledgeTree.value = tree
      })
      .catch((error) => logger.error('Failed to load knowledge files', { error }))
  }
}

const resetSources = (): void => {
  loadToken++
  hostTrees.value = []
  snippets.value = []
  knowledgeTree.value = []
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      resetSources()
      return
    }
    query.value = ''
    expandedGroups.value = new Set(['recent'])
    expandedKnowledgeDirs.value = new Set()
    activeId.value = null
    highlightMoved = false
    loadSources()
    nextTick(() => inputRef.value?.focus())
  },
  { immediate: true }
)

watch(
  [rows, query],
  ([nextRows], [, previousQuery]) => {
    if (previousQuery !== undefined && previousQuery !== query.value) highlightMoved = false
    if (!highlightMoved || !nextRows.some((row) => row.id === activeId.value)) {
      activeId.value = findDefaultRowId(nextRows)
    }
  },
  { immediate: true }
)

watch(activeId, (id) => {
  if (id === null) return
  nextTick(() => {
    const target = Array.from(listRef.value?.children || []).find((el) => (el as HTMLElement).dataset.rowId === id)
    target?.scrollIntoView?.({ block: 'nearest' })
  })
})

const close = (refocusTerminal: boolean): void => {
  emit('update:visible', false)
  if (refocusTerminal && props.activeTerminalTabId) {
    eventBus.emit('focusActiveTerminal', props.activeTerminalTabId)
  }
}

const withMember = <T,>(set: ReadonlySet<T>, value: T, present: boolean): Set<T> => {
  const next = new Set(set)
  if (present) {
    next.add(value)
  } else {
    next.delete(value)
  }
  return next
}

const setExpanded = (row: Extract<QuickJumpRow, { collapsible: boolean }>, expanded: boolean): void => {
  if (row.kind === 'header') {
    expandedGroups.value = withMember(expandedGroups.value, row.group, expanded)
  } else {
    expandedKnowledgeDirs.value = withMember(expandedKnowledgeDirs.value, row.relPath, expanded)
  }
}

const activate = (row: QuickJumpRow): void => {
  if (!isSelectableRow(row)) return
  highlightMoved = true
  activeId.value = row.id
  if (row.kind !== 'item') {
    if (isCollapsibleRow(row)) setExpanded(row, !row.expanded)
    return
  }

  const action = row.item.action
  switch (action.type) {
    case 'connect':
      eventBus.emit('currentClickServer', action.node)
      eventBus.emit('getAllOpenedHosts')
      close(false)
      break
    case 'switchTab':
      emit('selectTab', action.tabId)
      close(false)
      break
    case 'openKnowledge':
      eventBus.emit('openUserTab', {
        key: 'KnowledgeCenterEditor',
        title: action.file.name,
        id: `kb:${action.file.relPath}`,
        props: { relPath: action.file.relPath }
      })
      close(false)
      break
    case 'runSnippet': {
      const tabId = props.activeTerminalTabId
      if (!tabId) {
        message.warning(t('macro.noActiveTerminal'))
        return
      }
      close(true)
      void executeScript(
        action.snippet.snippet_content,
        { write: (data: string) => eventBus.emit('autoExecuteCode', { command: data, tabId }) },
        true
      )
      break
    }
  }
}

const handleRowMouseMove = (event: MouseEvent, row: QuickJumpRow): void => {
  // Layout shifts make the browser replay mousemove with no movement, which would steal the highlight.
  if (event.movementX === 0 && event.movementY === 0) return
  if (!isSelectableRow(row)) return
  highlightMoved = true
  activeId.value = row.id
}

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.isComposing || event.keyCode === 229) return

  const activeRow = rows.value.find((row) => row.id === activeId.value)
  const searching = query.value.trim() !== ''

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      close(true)
      break
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault()
      highlightMoved = true
      activeId.value = moveRowId(rows.value, activeId.value, event.key === 'ArrowDown' ? 1 : -1)
      break
    case 'Enter':
      event.preventDefault()
      if (activeRow) activate(activeRow)
      break
    case 'ArrowRight':
    case 'ArrowLeft': {
      // While searching the arrows keep moving the caret in the input.
      if (searching || !activeRow) break
      event.preventDefault()
      highlightMoved = true
      if (event.key === 'ArrowRight') {
        if (isCollapsibleRow(activeRow) && !activeRow.expanded) setExpanded(activeRow, true)
      } else if (isCollapsibleRow(activeRow) && activeRow.expanded) {
        setExpanded(activeRow, false)
      } else if (activeRow.kind !== 'header') {
        activeId.value = parentRowId(activeRow)
      }
      break
    }
  }
}
</script>

<style scoped lang="less">
.quick-jump-overlay {
  position: fixed;
  inset: 0;
  z-index: 1005;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}

.quick-jump-panel {
  width: 560px;
  max-width: calc(100vw - 32px);
  // --bg-color-secondary turns translucent under a custom background image and lets the terminal behind show through.
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 12px;
  box-shadow: var(--box-shadow);
  color: var(--text-color);
  overflow: hidden;
}

.quick-jump-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-color-light);
  outline: none;
  color: var(--text-color);
  font-size: 14px;

  &::placeholder {
    color: var(--text-color-quaternary);
  }
}

.quick-jump-list {
  max-height: 50vh;
  overflow-y: auto;
  padding: 6px;
}

.quick-jump-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;

  &.is-header {
    align-items: center;
    color: var(--text-color-tertiary);
    font-size: 12px;
    cursor: default;

    &.is-collapsible {
      cursor: pointer;
    }
  }

  // Folder and file rows follow the knowledge base list: caret, icon, name, indented by depth.
  &.is-tree {
    align-items: center;
    padding-left: calc(10px + var(--depth, 0) * 16px);

    .quick-jump-title {
      flex: 1;
      max-width: none;
      min-width: 0;
    }
  }

  &.is-active {
    background: var(--active-bg-color);
  }
}

.quick-jump-switcher {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  color: var(--text-color-tertiary);
  font-size: 10px;
}

.quick-jump-node-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.quick-jump-chevron {
  font-size: 10px;
}

.quick-jump-title {
  flex-shrink: 0;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-jump-subtitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color-tertiary);
  font-size: 12px;
}
</style>
