<template>
  <div
    class="kb-sidebar-root"
    @dragover.prevent
    @drop.prevent="handleDropImport"
  >
    <div class="panel_header">
      <span class="panel_title">{{ $t('knowledgeCenter.title') }}</span>
    </div>
    <div class="kb-toolbar">
      <a-input
        v-model:value="nameSearch"
        class="transparent-Input"
        :placeholder="$t('common.search')"
      >
        <template #suffix>
          <SearchOutlined />
        </template>
      </a-input>
      <a-dropdown :trigger="['hover']">
        <a-button
          size="small"
          class="kb-add-button"
        >
          <template #icon><PlusOutlined /></template>
        </a-button>
        <template #overlay>
          <a-menu @click="handleMenuClick">
            <a-menu-item key="upload">
              <CloudUploadOutlined />
              <span class="menu-text">{{ $t('knowledgeCenter.uploadFile') }}</span>
            </a-menu-item>
            <a-menu-item key="newFile">
              <FileAddOutlined />
              <span class="menu-text">{{ $t('knowledgeCenter.newFile') }}</span>
            </a-menu-item>
            <a-menu-item key="newFolder">
              <FolderAddOutlined />
              <span class="menu-text">{{ $t('knowledgeCenter.newFolder') }}</span>
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="refresh">
              <RedoOutlined />
              <span class="menu-text">{{ $t('knowledgeCenter.refresh') }}</span>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>

    <a-dropdown :trigger="['contextmenu']">
      <div
        class="kb-tree-wrapper"
        :class="{
          'scrollbar-visible': isTreeScrolling,
          'has-context-menu': isContextMenuOpen
        }"
        @click="handleTreeBlankClick"
        @scroll="handleTreeScroll"
        @contextmenu="handleWrapperContextMenu"
      >
        <a-directory-tree
          v-model:expanded-keys="expandedKeys"
          v-model:selected-keys="selectedKeys"
          multiple
          class="kb-tree"
          block-node
          draggable
          :tree-data="filteredTreeData"
          @select="onSelect"
          @drop="onDrop"
        >
          <template #title="{ dataRef }">
            <a-dropdown
              :trigger="['contextmenu']"
              placement="bottomLeft"
              @visible-change="
                (visible) => {
                  if (visible) {
                    menuKey = dataRef.key
                  } else if (menuKey === dataRef.key) {
                    menuKey = null
                  }
                }
              "
            >
              <div
                class="kb-tree-title"
                :class="{ 'context-menu-active': menuKey === dataRef.key }"
                @contextmenu.stop="(event) => handleNodeContextMenu(event, dataRef)"
              >
                <span
                  v-if="editingKey !== dataRef.key"
                  class="kb-title-text"
                  >{{ dataRef.title }}</span
                >
                <a-input
                  v-else
                  ref="inputRef"
                  v-model:value="editingName"
                  size="small"
                  class="kb-rename-input"
                  @keydown.enter="confirmRename"
                  @keydown.esc="cancelRename"
                  @keydown.stop
                  @blur="handleBlur"
                  @contextmenu.stop
                />
              </div>
              <template #overlay>
                <a-menu @click="({ key }) => onContextAction(String(key), dataRef)">
                  <template v-if="selectedKeys.length > 1 && selectedKeys.includes(dataRef.relPath)">
                    <a-menu-item
                      v-if="hasSelectedFile"
                      key="addToChat"
                    >
                      {{ $t('knowledgeCenter.addToChat') }}
                    </a-menu-item>
                    <a-menu-item
                      v-if="hasSelectedFile"
                      key="copyPath"
                    >
                      {{ $t('knowledgeCenter.copyPath') }}
                    </a-menu-item>
                    <a-menu-item
                      key="copy"
                      class="kb-menu-item-with-shortcut"
                    >
                      <span>{{ $t('common.copy') }}</span>
                      <span class="shortcut-hint">{{ modifierKey }}C</span>
                    </a-menu-item>
                    <a-menu-item
                      key="cut"
                      class="kb-menu-item-with-shortcut"
                    >
                      <span>{{ $t('knowledgeCenter.cut') }}</span>
                      <span class="shortcut-hint">{{ modifierKey }}X</span>
                    </a-menu-item>
                    <a-menu-item key="delete">{{ $t('common.delete') }}</a-menu-item>
                  </template>
                  <template v-else>
                    <a-menu-item
                      v-if="dataRef.type === 'file'"
                      key="addToChat"
                    >
                      {{ $t('knowledgeCenter.addToChat') }}
                    </a-menu-item>
                    <a-menu-item
                      v-if="dataRef.type === 'dir'"
                      key="newFile"
                    >
                      {{ $t('knowledgeCenter.newFile') }}
                    </a-menu-item>
                    <a-menu-item
                      v-if="dataRef.type === 'dir'"
                      key="newFolder"
                    >
                      {{ $t('knowledgeCenter.newFolder') }}
                    </a-menu-item>
                    <a-menu-divider v-if="dataRef.type === 'dir'" />
                    <a-menu-item key="rename">{{ $t('common.rename') }}</a-menu-item>
                    <a-menu-item key="delete">{{ $t('common.delete') }}</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item
                      v-if="dataRef.type === 'file'"
                      key="copyPath"
                    >
                      {{ $t('knowledgeCenter.copyPath') }}
                    </a-menu-item>
                    <a-menu-item
                      key="copy"
                      class="kb-menu-item-with-shortcut"
                    >
                      <span>{{ $t('common.copy') }}</span>
                      <span class="shortcut-hint">{{ modifierKey }}C</span>
                    </a-menu-item>
                    <a-menu-item
                      key="cut"
                      class="kb-menu-item-with-shortcut"
                    >
                      <span>{{ $t('knowledgeCenter.cut') }}</span>
                      <span class="shortcut-hint">{{ modifierKey }}X</span>
                    </a-menu-item>
                    <a-menu-item
                      v-if="clipboard"
                      key="paste"
                      class="kb-menu-item-with-shortcut"
                    >
                      <span>{{ $t('common.paste') }}</span>
                      <span class="shortcut-hint">{{ modifierKey }}V</span>
                    </a-menu-item>
                  </template>
                </a-menu>
              </template>
            </a-dropdown>
          </template>
        </a-directory-tree>
      </div>
      <template #overlay>
        <a-menu @click="({ key }) => onBlankContextAction(String(key))">
          <a-menu-item key="newFile">{{ $t('knowledgeCenter.newFile') }}</a-menu-item>
          <a-menu-item key="newFolder">{{ $t('knowledgeCenter.newFolder') }}</a-menu-item>
          <a-menu-item
            key="paste"
            :disabled="!clipboard"
            class="kb-menu-item-with-shortcut"
          >
            <span>{{ $t('common.paste') }}</span>
            <span class="shortcut-hint">{{ modifierKey }}V</span>
          </a-menu-item>
          <a-menu-item key="refresh">{{ $t('knowledgeCenter.refresh') }}</a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>

    <div
      v-if="Object.keys(importJobs).length"
      class="kb-transfer"
    >
      <div
        v-for="job in importJobList"
        :key="job.jobId"
        class="kb-transfer-item"
      >
        <div class="kb-transfer-title">{{ job.destRelPath }}</div>
        <a-progress
          :percent="job.percent"
          size="small"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { CloudUploadOutlined, FileAddOutlined, FolderAddOutlined, PlusOutlined, RedoOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { getModifierSymbol, isShortcutEvent } from './utils/kbShortcuts'
import { getImageMediaType, isImageFile } from '../AiTab/utils'

type KbNodeType = 'file' | 'dir'
type TreeNode = {
  key: string
  title: string
  type: KbNodeType
  relPath: string
  isLeaf: boolean
  children?: TreeNode[]
}

const api = window.api

const expandedKeys = ref<string[]>([])
const selectedKeys = ref<string[]>([])
const treeData = ref<TreeNode[]>([])
const nameSearch = ref('')

const editingKey = ref<string | null>(null)
const editingName = ref('')
const editingOriginalName = ref('')
const inputRef = ref<{ focus: () => void } | null>(null)

const clipboard = ref<{ mode: 'copy' | 'cut'; sources: string[] } | null>(null)
const createDraft = ref<null | { kind: 'file' | 'folder'; parentRelDir: string; tempKey: string }>(null)

const isTreeScrolling = ref(false)
let treeScrollTimer: any = null
const handleTreeScroll = () => {
  isTreeScrolling.value = true
  if (treeScrollTimer) clearTimeout(treeScrollTimer)
  treeScrollTimer = setTimeout(() => {
    isTreeScrolling.value = false
  }, 3000)
}

const menuKey = ref<string | null>(null) // right click selected item key
const isContextMenuOpen = computed(() => !!menuKey.value)

const hasSelectedFile = computed(() => {
  return selectedKeys.value.some((relPath) => treeNodeType(relPath) === 'file')
})

// Modifier key symbol for shortcut hints in context menu
const modifierKey = computed(() => getModifierSymbol())

function toTreeNodes(entries: Array<{ name: string; relPath: string; type: KbNodeType }>): TreeNode[] {
  return entries.map((e) => ({
    key: e.relPath,
    relPath: e.relPath,
    title: e.name,
    type: e.type,
    isLeaf: e.type === 'file',
    children: e.type === 'dir' ? [] : undefined
  }))
}

// Recursively load all directories and files
async function loadFullTree(relDir: string): Promise<TreeNode[]> {
  const list = await api.kbListDir(relDir)
  const nodes = toTreeNodes(list)

  // Recursively load children for all directories
  for (const node of nodes) {
    if (node.type === 'dir') {
      node.children = await loadFullTree(node.relPath)
    }
  }

  return nodes
}

async function refreshDir(relDir: string) {
  if (!relDir) {
    // Load entire tree from root
    treeData.value = await loadFullTree('')
    return
  }

  // Refresh specific directory
  const children = await loadFullTree(relDir)

  const update = (nodes: TreeNode[]): boolean => {
    for (const n of nodes) {
      if (n.relPath === relDir && n.type === 'dir') {
        n.children = children
        return true
      }
      if (n.children && update(n.children)) return true
    }
    return false
  }
  update(treeData.value)
}

const filteredTreeData = computed(() => {
  const q = nameSearch.value.trim().toLowerCase()
  if (!q) return treeData.value

  const filter = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map((n) => {
        const hit = n.title.toLowerCase().includes(q)
        if (hit) return { ...n }
        if (n.children && n.children.length) {
          const children = filter(n.children)
          if (children.length) return { ...n, children }
        }
        return null
      })
      .filter(Boolean) as TreeNode[]
  }
  return filter(treeData.value)
})

function getDirOf(relPath: string): string {
  const parts = relPath.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function getAncestorDirs(relPath: string): string[] {
  const parts = relPath.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const dirs: string[] = []
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join('/'))
  }
  return dirs
}

function syncSelectionFromTab(relPath: string) {
  if (!relPath) return
  selectedKeys.value = [relPath]
  // Ancestor directories to expand for visibility
  const ancestors = getAncestorDirs(relPath)
  if (ancestors.length === 0) return
  const nextExpanded = new Set<string>(expandedKeys.value)
  for (const dir of ancestors) {
    nextExpanded.add(dir)
  }
  expandedKeys.value = Array.from(nextExpanded)
}

// Sync tree selection with active editor tab
const handleActiveKbTab = (payload: { relPath: string }) => {
  syncSelectionFromTab(payload.relPath)
}

// Handle refresh event (triggered when pasting images in Markdown)
const handleRefresh = async (payload: { relDir: string }) => {
  await refreshDir(payload.relDir)
}

// Handle refresh and open event (triggered when pasting images)
const handleRefreshAndOpen = async (payload: { relPath: string }) => {
  const dir = getDirOf(payload.relPath)
  await refreshDir(dir)
  openFileInMainPane(payload.relPath)
  syncSelectionFromTab(payload.relPath)
}

function findTreeNode(relPath: string): TreeNode | null {
  const find = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.relPath === relPath) return n
      if (n.children) {
        const hit = find(n.children)
        if (hit) return hit
      }
    }
    return null
  }
  return relPath ? find(treeData.value) : null
}

function treeNodeType(relPath: string): KbNodeType | null {
  return findTreeNode(relPath)?.type ?? null
}

function openFileInMainPane(relPath: string) {
  const fileName = relPath.split('/').pop() || relPath
  eventBus.emit('openUserTab', {
    key: 'KnowledgeCenterEditor',
    title: fileName,
    id: `kb:${relPath}`,
    props: { relPath }
  })
}

type TreeSelectInfo = {
  node?: TreeNode
  nativeEvent?: MouseEvent
}

const onSelect = async (keys: string[], info: TreeSelectInfo) => {
  const node = info?.node
  if (!node) return

  if (menuKey.value) menuKey.value = null

  if (node.type === 'file') {
    if (keys.length !== 1) return
    openFileInMainPane(node.relPath)
  }
}

const handleNodeContextMenu = (event: MouseEvent, node: TreeNode) => {
  event.preventDefault()
  const next = computeContextSelection(selectedKeys.value, node.relPath)
  if (next !== selectedKeys.value) {
    selectedKeys.value = next
  }
}

function computeContextSelection(current: string[], target: string): string[] {
  if (!target) return current
  const isSelected = current.includes(target)
  if (current.length <= 1) {
    return isSelected ? current : [target]
  }
  return isSelected ? current : [target]
}

const handleTreeBlankClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('.ant-tree-treenode')) return
  if (selectedKeys.value.length === 0) return
  selectedKeys.value = []
  if (menuKey.value) menuKey.value = null
}

const handleWrapperContextMenu = () => {
  // const target = event.target as HTMLElement | null
  // if (target?.closest('.ant-tree-treenode')) {
  //   event.stopPropagation()
  //   return
  // }
  if (selectedKeys.value.length > 0) {
    selectedKeys.value = []
  }
}

async function onBlankContextAction(action: string) {
  switch (action) {
    case 'newFile':
      await openCreateInline('file')
      break
    case 'newFolder':
      await openCreateInline('folder')
      break
    case 'paste':
      if (clipboard.value) {
        // Paste into root
        await onContextAction('paste', { relPath: '', type: 'dir' } as TreeNode)
      }
      break
    case 'refresh':
      await refreshCurrentDir()
      break
  }
}

async function refreshCurrentDir() {
  const current = selectedKeys.value[0] || ''
  const dir = current ? (current.endsWith('/') ? current.slice(0, -1) : current) : ''
  const relDir = treeNodeType(current) === 'dir' ? dir : getDirOf(dir)
  await refreshDir(relDir)
}

async function startRename(node: TreeNode) {
  editingKey.value = node.key
  editingName.value = node.title
  editingOriginalName.value = node.title
  await nextTick()
  inputRef.value?.focus()
}

function removeNodeByRelPath(relPath: string) {
  const remove = (nodes: TreeNode[]): boolean => {
    const idx = nodes.findIndex((n) => n.relPath === relPath)
    if (idx !== -1) {
      nodes.splice(idx, 1)
      return true
    }
    for (const n of nodes) {
      if (n.children && remove(n.children)) return true
    }
    return false
  }
  remove(treeData.value)
}

const emitKbEntriesRemoved = (entries: Array<{ relPath: string; isDir: boolean }>) => {
  if (entries.length === 0) return
  eventBus.emit('kbEntriesRemoved', { entries })
}

async function confirmRename() {
  const key = editingKey.value
  const newName = editingName.value.trim()
  if (!key || !newName) {
    cancelRename()
    return
  }

  // Inline create flow (VSCode-like)
  if (createDraft.value && createDraft.value.tempKey === key) {
    const draft = createDraft.value
    try {
      const parentRelDir = draft.parentRelDir
      if (draft.kind === 'folder') {
        await api.kbMkdir(parentRelDir, newName)
      } else {
        const res = await api.kbCreateFile(parentRelDir, newName, '')
        openFileInMainPane(res.relPath)
      }
      createDraft.value = null
      editingKey.value = null
      editingName.value = ''
      editingOriginalName.value = ''
      await refreshDir(parentRelDir)
    } catch (e: unknown) {
      const error = e as Error
      message.error(error?.message || String(e))
    }
    return
  }

  // Check if name actually changed
  if (newName === editingOriginalName.value) {
    // Name unchanged, just exit editing mode
    editingKey.value = null
    editingName.value = ''
    editingOriginalName.value = ''
    return
  }

  try {
    const res = await api.kbRename(key, newName)
    editingKey.value = null
    editingName.value = ''
    editingOriginalName.value = ''
    await refreshDir(getDirOf(key))
    // Notify tab system to update title and relPath
    eventBus.emit('kbFileRenamed', { oldRelPath: key, newRelPath: res.relPath, newName })
  } catch (e: unknown) {
    const error = e as Error
    message.error(error?.message || String(e))
  }
}

function cancelRename() {
  if (createDraft.value && editingKey.value === createDraft.value.tempKey) {
    const tempKey = createDraft.value.tempKey
    const parentRelDir = createDraft.value.parentRelDir
    createDraft.value = null
    removeNodeByRelPath(tempKey)
    refreshDir(parentRelDir).catch(() => {})
  }
  editingKey.value = null
  editingName.value = ''
  editingOriginalName.value = ''
}

function handleBlur() {
  // Cancel on blur for both creating and renaming (consistent with VSCode behavior)
  cancelRename()
}

async function removeNode(node: TreeNode) {
  Modal.confirm({
    title: 'Delete',
    content: node.type === 'dir' ? 'Delete folder and its contents?' : 'Delete file?',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.kbDelete(node.relPath, node.type === 'dir')
        await refreshDir(getDirOf(node.relPath))
        emitKbEntriesRemoved([{ relPath: node.relPath, isDir: node.type === 'dir' }])
      } catch (e: unknown) {
        const error = e as Error
        message.error(error?.message || String(e))
      }
    }
  })
}

function insertTempNode(parentRelDir: string, node: TreeNode) {
  if (!parentRelDir) {
    treeData.value = [node, ...treeData.value]
    return
  }
  const insert = (nodes: TreeNode[]): boolean => {
    for (const n of nodes) {
      if (n.relPath === parentRelDir && n.type === 'dir') {
        n.children = n.children || []
        n.children.unshift(node)
        return true
      }
      if (n.children && insert(n.children)) return true
    }
    return false
  }
  if (!insert(treeData.value)) {
    refreshDir(parentRelDir)
      .then(() => insert(treeData.value))
      .catch(() => {})
  }
}

async function openCreateInline(kind: 'file' | 'folder') {
  nameSearch.value = ''

  const target = selectedKeys.value[0] || ''
  const t = treeNodeType(target)
  const parentRelDir = t === 'dir' ? target : getDirOf(target)

  if (createDraft.value) cancelRename()

  if (parentRelDir && !expandedKeys.value.includes(parentRelDir)) {
    expandedKeys.value = [...expandedKeys.value, parentRelDir]
  }

  const tempKey = `.draft/${Date.now()}`
  createDraft.value = { kind, parentRelDir, tempKey }
  const tempNode: TreeNode = {
    key: tempKey,
    relPath: tempKey,
    title: kind === 'folder' ? 'New Folder' : 'New File',
    type: kind === 'folder' ? 'dir' : 'file',
    // Mark as leaf to prevent lazy loading for temporary nodes
    isLeaf: true,
    children: kind === 'folder' ? [] : undefined
  }
  insertTempNode(parentRelDir, tempNode)
  editingKey.value = tempKey
  editingName.value = ''
  await nextTick()
  inputRef.value?.focus()
}

// Copy/cut/paste handlers - used by both keyboard shortcuts and context menu
function handleCopy(sources?: string[]) {
  const targets = sources || [...selectedKeys.value]
  if (targets.length === 0) return
  clipboard.value = { mode: 'copy', sources: targets }
}

function handleCut(sources?: string[]) {
  const targets = sources || [...selectedKeys.value]
  if (targets.length === 0) return
  clipboard.value = { mode: 'cut', sources: targets }
}

async function handlePaste(targetNode?: TreeNode) {
  // Determine destination directory from targetNode or selectedKeys
  let dstRelDir: string
  if (targetNode) {
    dstRelDir = targetNode.type === 'dir' ? targetNode.relPath : getDirOf(targetNode.relPath)
  } else {
    const target = selectedKeys.value[0] || ''
    const targetType = target ? treeNodeType(target) : null
    dstRelDir = targetType === 'dir' ? target : getDirOf(target)
  }

  // Handle internal clipboard (copy/cut within knowledge base)
  if (clipboard.value) {
    const mode = clipboard.value.mode
    const sources = clipboard.value.sources.slice()

    const dirsToRefresh = new Set<string>([dstRelDir])
    const removedEntries: Array<{ relPath: string; isDir: boolean }> = []
    let lastOpenedFileRelPath = ''

    try {
      for (const src of sources) {
        const srcType = treeNodeType(src)
        let res: { relPath: string }
        if (mode === 'copy') {
          res = await api.kbCopy(src, dstRelDir)
        } else {
          res = await api.kbMove(src, dstRelDir)
          dirsToRefresh.add(getDirOf(src))
          removedEntries.push({ relPath: src, isDir: srcType === 'dir' })
        }
        if (srcType === 'file') lastOpenedFileRelPath = res.relPath
      }
      if (mode === 'cut') {
        clipboard.value = null
      }
      for (const d of dirsToRefresh) {
        await refreshDir(d)
      }
      if (lastOpenedFileRelPath) {
        openFileInMainPane(lastOpenedFileRelPath)
      }
      if (mode === 'cut') {
        emitKbEntriesRemoved(removedEntries)
      }
    } catch (e: unknown) {
      const error = e as Error
      message.error(error?.message || String(e))
    }
    return
  }

  // Handle system clipboard (paste images from external sources)
  await handleSystemClipboardPaste(dstRelDir)
}

// Paste image from system clipboard to target directory
async function handleSystemClipboardPaste(dstRelDir: string) {
  try {
    const clipboardItems = await navigator.clipboard.read()
    for (const item of clipboardItems) {
      // Check if item contains image
      const imageType = item.types.find((type) => type.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        const base64 = await blobToBase64(blob)

        const ext = imageType.split('/')[1] || 'png'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `pasted-image-${timestamp}.${ext}`

        const res = await api.kbCreateImage(dstRelDir, fileName, base64)
        await refreshDir(dstRelDir)
        openFileInMainPane(res.relPath)
        return
      }
    }
  } catch (e: unknown) {
    // Clipboard API may fail due to permissions or empty clipboard
    const error = e as Error
    if (error?.name !== 'NotAllowedError' && error?.message !== 'No valid data on clipboard.') {
      message.error(`Failed to paste image: ${error?.message || String(e)}`)
    }
  }
}

// Convert Blob to base64 string (without data URL prefix)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64Data = result.split(',')[1]
      resolve(base64Data)
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

function isInEditableElement(): boolean {
  const activeEl = document.activeElement
  if (!activeEl) return false

  // Check for standard input elements
  if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
    return true
  }

  // Check for contenteditable elements (e.g., Monaco Editor)
  if (activeEl.getAttribute('contenteditable') === 'true') {
    return true
  }

  // Check if any parent has contenteditable (Monaco Editor structure)
  let parent = activeEl.parentElement
  while (parent) {
    if (parent.getAttribute('contenteditable') === 'true') {
      return true
    }
    // Check for Monaco Editor specific class
    if (parent.classList.contains('monaco-editor')) {
      return true
    }
    parent = parent.parentElement
  }

  return false
}

function handleKeyDown(e: KeyboardEvent) {
  // Skip if editing (rename input is focused)
  if (editingKey.value) return

  // Skip if focus is in editable elements (input, textarea, contenteditable, Monaco Editor)
  if (isInEditableElement()) {
    return
  }

  if (isShortcutEvent(e, 'copy')) {
    handleCopy()
    e.preventDefault()
  } else if (isShortcutEvent(e, 'cut')) {
    handleCut()
    e.preventDefault()
  } else if (isShortcutEvent(e, 'paste')) {
    handlePaste()
    e.preventDefault()
  }
}

async function onContextAction(action: string, node: TreeNode) {
  const isBatch = selectedKeys.value.length > 1 && selectedKeys.value.includes(node.relPath)
  const targets = isBatch ? [...selectedKeys.value] : [node.relPath]
  switch (action) {
    case 'addToChat': {
      const fileTargets = targets.filter((target) => treeNodeType(target) === 'file')
      if (fileTargets.length === 0) return

      // Separate image files from document files
      const imageTargets = fileTargets.filter((relPath) => isImageFile(relPath))
      const docTargets = fileTargets.filter((relPath) => !isImageFile(relPath))

      // Handle document files
      if (docTargets.length > 0) {
        const docs = docTargets.map((relPath) => {
          const targetNode = findTreeNode(relPath)
          const name = targetNode?.title || relPath.split('/').pop() || relPath
          return { relPath, name }
        })
        eventBus.emit('kbAddDocToChatRequest', docs)
      }

      // Handle image files - read content and emit with image data
      for (const relPath of imageTargets) {
        try {
          const res = await api.kbReadFile(relPath, 'base64')
          const mediaType = getImageMediaType(relPath)
          eventBus.emit('kbAddImageToChatRequest', {
            mediaType,
            data: res.content
          })
        } catch (e: unknown) {
          const error = e as Error
          message.error(error?.message || String(e))
        }
      }
      return
    }
    case 'newFile':
      selectedKeys.value = [node.relPath]
      await openCreateInline('file')
      return
    case 'newFolder':
      selectedKeys.value = [node.relPath]
      await openCreateInline('folder')
      return
    case 'rename':
      await startRename(node)
      return
    case 'copyPath': {
      const fileTargets = targets.filter((target) => treeNodeType(target) === 'file')
      if (fileTargets.length === 0) return
      const content = fileTargets.join('\n')
      try {
        await navigator.clipboard.writeText(content)
      } catch (e: unknown) {
        const error = e as Error
        message.error(error?.message || String(e))
      }
      return
    }
    case 'delete':
      if (!isBatch) {
        await removeNode(node)
        return
      }
      Modal.confirm({
        title: 'Delete',
        content: `Delete ${targets.length} items?`,
        okType: 'danger',
        onOk: async () => {
          try {
            // Delete deeper paths first to reduce parent/child conflicts
            const sortedTargets = targets.slice().sort((a, b) => b.split('/').filter(Boolean).length - a.split('/').filter(Boolean).length)
            const removedEntries = sortedTargets.map((relPath) => ({
              relPath,
              isDir: treeNodeType(relPath) === 'dir'
            }))

            for (const relPath of sortedTargets) {
              const t = treeNodeType(relPath)
              const isDir = t === 'dir'
              await api.kbDelete(relPath, isDir)
            }

            selectedKeys.value = []
            await refreshDir('')
            emitKbEntriesRemoved(removedEntries)
          } catch (e: unknown) {
            const error = e as Error
            message.error(error?.message || String(e))
          }
        }
      })
      return
    case 'copy':
      handleCopy(targets)
      return
    case 'cut':
      handleCut(targets)
      return
    case 'paste':
      await handlePaste(node)
      return
  }
}

async function onDrop(info: { dragNode?: TreeNode; node?: TreeNode; dropToGap?: boolean; dropPosition?: number }) {
  const dragNode = info?.dragNode
  const node = info?.node
  if (!dragNode || !node) return

  const srcRelPath = dragNode.relPath
  const dropToGap = !!info.dropToGap
  const dropPosition = info.dropPosition ?? 0

  let dstRelDir = ''

  // Determine target directory based on drop position and node type
  if (!dropToGap) {
    // Dropped on node content - only valid for directories
    if (node.type === 'dir') {
      dstRelDir = node.relPath
    } else {
      message.warning('Cannot drop into a file')
      return
    }
  } else if (node.type === 'dir' && (node.children || []).length > 0 && expandedKeys.value.includes(node.relPath) && dropPosition === 1) {
    // Dropped at bottom gap of expanded folder with children
    dstRelDir = node.relPath
  } else {
    // Dropped at gap - move to parent directory
    dstRelDir = getDirOf(node.relPath)
  }

  // Check if moving to same directory
  const srcParent = getDirOf(srcRelPath)
  if (srcParent === dstRelDir) {
    message.info('File is already in this directory')
    return
  }

  try {
    await api.kbMove(srcRelPath, dstRelDir)
    await refreshDir(srcParent)
    emitKbEntriesRemoved([{ relPath: srcRelPath, isDir: dragNode.type === 'dir' }])
    if (srcParent !== dstRelDir) {
      await refreshDir(dstRelDir)
    }
  } catch (e: unknown) {
    const error = e as Error
    message.error(error?.message || String(e))
  }
}

const importJobs = reactive<Record<string, { jobId: string; destRelPath: string; transferred: number; total: number }>>({})
const importJobList = computed(() => {
  return Object.values(importJobs).map((j) => ({
    ...j,
    percent: j.total ? Math.floor((j.transferred / j.total) * 100) : 0
  }))
})

const unsubscribeProgress = ref<(() => void) | null>(null)

async function importOneFile(srcAbsPath: string, dstRelDir: string) {
  try {
    const res = await api.kbImportFile(srcAbsPath, dstRelDir)
    importJobs[res.jobId] = { jobId: res.jobId, destRelPath: res.relPath, transferred: 0, total: 1 }
    await refreshDir(dstRelDir)
    openFileInMainPane(res.relPath)
  } catch (e: unknown) {
    const error = e as Error
    message.error(`Failed to import file: ${error?.message || String(e)}`)
  }
}
async function importOneFolder(srcAbsPath: string, dstRelDir: string) {
  try {
    const res = await api.kbImportFolder(srcAbsPath, dstRelDir)
    importJobs[res.jobId] = { jobId: res.jobId, destRelPath: res.relPath, transferred: 0, total: 0 }
    await refreshDir(dstRelDir)
  } catch (e: unknown) {
    const error = e as Error
    message.error(`Failed to import folder: ${error?.message || String(e)}`)
  }
}

async function pickAndImport() {
  const target = selectedKeys.value[0] || ''
  const t = treeNodeType(target)
  const dstRelDir = t === 'dir' ? target : getDirOf(target)

  const result = await api.showOpenDialog({
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      {
        name: 'All Supported',
        extensions: ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'log', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
      },
      { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'log', 'csv'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }
    ]
  })
  if (result?.canceled) return
  const filePaths: string[] = result?.filePaths || []

  for (const p of filePaths) {
    const pathInfo = await api.kbCheckPath(p)
    if (pathInfo.isDirectory) {
      await importOneFolder(p, dstRelDir)
    } else if (pathInfo.isFile) {
      await importOneFile(p, dstRelDir)
    }
  }
}

function handleMenuClick({ key }: { key: string }) {
  switch (key) {
    case 'newFile':
      openCreateInline('file')
      break
    case 'newFolder':
      openCreateInline('folder')
      break
    case 'upload':
      pickAndImport()
      break
    case 'refresh':
      refreshCurrentDir()
      break
  }
}

async function handleDropImport(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const target = selectedKeys.value[0] || ''
  const t = treeNodeType(target)
  const dstRelDir = t === 'dir' ? target : getDirOf(target)
  for (const f of Array.from(files)) {
    const p = (f as File & { path: string }).path
    if (p) {
      const pathInfo = await api.kbCheckPath(p)
      if (pathInfo.isDirectory) {
        await importOneFolder(p, dstRelDir)
      } else if (pathInfo.isFile) {
        await importOneFile(p, dstRelDir)
      }
    }
  }
}

onMounted(async () => {
  await api.kbEnsureRoot()
  await refreshDir('')
  eventBus.on('kbActiveFileChanged', handleActiveKbTab)
  eventBus.on('kbRefresh', handleRefresh)
  eventBus.on('kbRefreshAndOpen', handleRefreshAndOpen)
  document.addEventListener('keydown', handleKeyDown)
  unsubscribeProgress.value = api.onKbTransferProgress((data) => {
    const job = importJobs[data.jobId]
    if (!job) {
      importJobs[data.jobId] = { jobId: data.jobId, destRelPath: data.destRelPath, transferred: data.transferred, total: data.total }
      if (data.total === 0) {
        window.setTimeout(() => {
          delete importJobs[data.jobId]
        }, 1500)
      }
      return
    }
    job.transferred = data.transferred
    job.total = data.total
    if (data.total > 0 && data.transferred >= data.total) {
      window.setTimeout(() => {
        delete importJobs[data.jobId]
      }, 1500)
    }
  })
})

onBeforeUnmount(() => {
  eventBus.off('kbActiveFileChanged', handleActiveKbTab)
  eventBus.off('kbRefresh', handleRefresh)
  eventBus.off('kbRefreshAndOpen', handleRefreshAndOpen)
  document.removeEventListener('keydown', handleKeyDown)
  if (unsubscribeProgress.value) unsubscribeProgress.value()
  if (treeScrollTimer) clearTimeout(treeScrollTimer)
})
</script>

<style scoped lang="less">
// Local variables for consistent theme management
@kb-primary-color: #1890ff;
@kb-primary-hover: #40a9ff;

// Mixin for common input styles in Knowledge Center
.kb-transparent-input() {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;

  :deep(.ant-input) {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color) !important;
    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }
}

.kb-sidebar-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.panel_header {
  padding: 16px 16px 8px 16px;
  flex-shrink: 0;
}

.panel_title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.kb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 10px 12px;
}

.transparent-Input {
  flex: 1;
  min-width: 0;
  .kb-transparent-input();

  :deep(.ant-input-suffix) {
    color: var(--text-color-tertiary) !important;
  }
}

.kb-add-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px !important;
  height: 30px;
  padding: 0;
  border-radius: 4px;
  background: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-color) !important;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover,
  &:focus {
    background: var(--hover-bg-color) !important;
    border-color: @kb-primary-color !important;
    color: @kb-primary-color !important;
  }

  &:active {
    background: var(--active-bg-color) !important;
  }
}

.menu-text {
  margin-left: 8px;
}

.kb-tree-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 4px;
  padding-bottom: 25px;

  /* Scrollbar styles - align with Workspace */
  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: 0;
    transition: background-color 0.3s;
  }

  &.scrollbar-visible::-webkit-scrollbar-thumb {
    background-color: var(--border-color-light);
  }

  &.scrollbar-visible::-webkit-scrollbar-thumb:hover {
    background-color: var(--text-color-tertiary);
  }

  /* Firefox scrollbar styles */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s;

  &.scrollbar-visible {
    scrollbar-color: var(--border-color-light) transparent;
  }
}

.kb-tree {
  background: transparent;
  padding: 0;
}

:deep(.kb-tree) {
  background-color: transparent;

  // DirectoryTree uses ::before for selected background; override it here
  &.ant-tree.ant-tree-directory {
    .ant-tree-treenode-selected::before,
    .ant-tree-treenode-selected:hover::before {
      background: none !important;
    }
  }

  .ant-tree-node-content-wrapper,
  .ant-tree-title {
    color: var(--text-color) !important;
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .ant-tree-switcher {
    color: var(--text-color-tertiary) !important;
  }

  .ant-tree-treenode {
    width: 100%;
    // border-radius: 4px;
    border: 1px solid transparent;
    padding: 0 !important;

    &:hover {
      background-color: var(--hover-bg-color);
    }

    // Disable hover when context menu is open
    .kb-tree-wrapper.has-context-menu &:hover {
      background-color: transparent;
    }

    // Node content wrapper styles
    .ant-tree-node-content-wrapper {
      width: 100%;
      border-radius: 4px;
      padding: 0;

      &:hover {
        color: var(--text-color) !important;
        background-color: transparent;
      }
    }

    // Selected or active context menu node style
    &.ant-tree-treenode-selected,
    &:has(.context-menu-active) {
      background-color: rgba(24, 143, 255, 0.154) !important;
      box-shadow: inset 0 0 0 1px rgba(24, 144, 255, 0.1);
      border-color: rgba(24, 143, 255, 0.75);
    }
  }

  .ant-tree-node-selected {
    background-color: transparent;
    .ant-tree-node-content-wrapper {
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
  }

  .ant-tree-indent {
    display: flex !important;
  }
}

.kb-tree-title {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  width: 100%;
  overflow: hidden;
  cursor: pointer;
}

.kb-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.kb-rename-input {
  flex: 1;
  min-width: 100px;
  .kb-transparent-input();
}

.kb-transfer {
  border-top: 1px solid var(--border-color);
  padding: 8px;
  max-height: 160px;
  overflow-y: auto;
  overflow-x: hidden;

  /* Hide scrollbar for this small area */
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
  scrollbar-width: none;
}

.kb-transfer-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.kb-transfer-title {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

// Context menu shortcut hint styles
:deep(.kb-menu-item-with-shortcut) {
  // Override Ant Design's menu item content wrapper
  .ant-dropdown-menu-title-content {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .shortcut-hint {
    margin-left: 16px;
    color: var(--text-color-tertiary);
    font-size: 12px;
    flex-shrink: 0;
  }
}
</style>
