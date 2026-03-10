import { ref, computed } from 'vue'

export type TaskStatus = 'running' | 'success' | 'failed' | 'error'
export type TaskType = 'upload' | 'download' | 'r2r'
export type GroupKind = 'directory' | 'file'
let taskSeq = 0
export interface Task {
  id: string
  taskKey: string
  name: string
  progress: number
  remotePath: string
  destPath?: string
  speed: string
  type: TaskType
  lastBytes: number
  lastTime: number

  status: TaskStatus
  stage?: string

  fromId?: string
  toId?: string
  host?: string
  fromHost?: string
  toHost?: string
  message?: string

  parentTaskKey?: string
  isGroup?: boolean
  groupKind?: GroupKind

  totalFiles?: number
  finishedFiles?: number
  failedFiles?: number

  createdAt: number
  sortIndex: number
}

export const transferTasks = ref<Record<string, Task>>({})
const api = (window as any).api

let inited = false
const removeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearRemoveTimer(taskKey: string) {
  const t = removeTimers.get(taskKey)
  if (t) {
    clearTimeout(t)
    removeTimers.delete(taskKey)
  }
}

function scheduleRemove(task: Task) {
  clearRemoveTimer(task.taskKey)

  const delay = task.isGroup ? (task.status === 'success' ? 8000 : 10000) : task.status === 'success' ? 2500 : 8000

  const timer = setTimeout(() => {
    delete transferTasks.value[task.taskKey]
    removeTimers.delete(task.taskKey)
  }, delay)

  removeTimers.set(task.taskKey, timer)
}

function normalizePath(p?: string) {
  return p ? String(p).replace(/\\+/g, '/') : undefined
}

function pickName(remotePath: string, destPath?: string, isGroup?: boolean) {
  const base = (destPath || remotePath || '').split('/').pop() || ''
  return base || (isGroup ? destPath || remotePath || '' : '')
}

export function ensureTransferListener() {
  if (inited) return false
  inited = true

  api.onTransferProgress((payload: any) => {
    const {
      taskKey,
      type,
      bytes = 0,
      total = 0,
      remotePath = '',
      destPath,
      id,
      fromId,
      toId,
      host,
      fromHost,
      toHost,
      status,
      message,
      stage,
      parentTaskKey,
      isGroup,
      groupKind,
      totalFiles,
      finishedFiles,
      failedFiles
    } = payload || {}

    if (!taskKey) return

    const cleanRemotePath = normalizePath(remotePath) || ''
    const cleanDestPath = normalizePath(destPath)

    if (!transferTasks.value[taskKey]) {
      const now = Date.now()
      transferTasks.value[taskKey] = {
        id: String(id ?? fromId ?? toId ?? ''),
        taskKey: String(taskKey),
        name: pickName(cleanRemotePath, cleanDestPath, !!isGroup),
        remotePath: cleanRemotePath,
        destPath: cleanDestPath,
        progress: 0,
        speed: stage === 'scanning' ? 'scanning' : stage === 'pending' ? 'pending' : '0 KB/s',
        type: (type as TaskType) || 'download',
        lastBytes: bytes,
        lastTime: now,
        status: (status as TaskStatus) || 'running',
        stage: stage ? String(stage) : undefined,
        message: message ? String(message) : undefined,
        fromId: fromId ? String(fromId) : undefined,
        toId: toId ? String(toId) : undefined,
        host: host ? String(host) : undefined,
        fromHost: fromHost ? String(fromHost) : undefined,
        toHost: toHost ? String(toHost) : undefined,
        parentTaskKey: parentTaskKey ? String(parentTaskKey) : undefined,
        isGroup: !!isGroup,
        groupKind: groupKind ? (String(groupKind) as GroupKind) : undefined,
        totalFiles: typeof totalFiles === 'number' ? totalFiles : undefined,
        finishedFiles: typeof finishedFiles === 'number' ? finishedFiles : undefined,
        failedFiles: typeof failedFiles === 'number' ? failedFiles : undefined,

        createdAt: now,
        sortIndex: ++taskSeq
      }
    }
    const task = transferTasks.value[taskKey]

    task.remotePath = cleanRemotePath
    task.destPath = cleanDestPath
    task.name = pickName(cleanRemotePath, cleanDestPath, task.isGroup)

    if (typeof status === 'string') task.status = status as TaskStatus
    if (typeof stage === 'string') task.stage = stage
    if (message) task.message = String(message)

    if (typeof parentTaskKey === 'string') task.parentTaskKey = parentTaskKey
    if (typeof isGroup === 'boolean') task.isGroup = isGroup
    if (typeof groupKind === 'string') task.groupKind = groupKind as GroupKind
    if (typeof totalFiles === 'number') task.totalFiles = totalFiles
    if (typeof finishedFiles === 'number') task.finishedFiles = finishedFiles
    if (typeof failedFiles === 'number') task.failedFiles = failedFiles

    if (task.stage === 'scanning') {
      task.speed = 'scanning'
    } else if (task.stage === 'pending') {
      task.speed = 'pending'
    } else {
      const now = Date.now()
      const sec = (now - task.lastTime) / 1000
      if (sec >= 1) {
        const diff = bytes - task.lastBytes
        task.speed = diff > 1024 * 1024 ? `${(diff / 1024 / 1024).toFixed(2)} MB/s` : `${(diff / 1024).toFixed(2)} KB/s`
        task.lastBytes = bytes
        task.lastTime = now
      }
    }

    task.progress = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0

    clearRemoveTimer(task.taskKey)

    if (task.status === 'success' || task.status === 'failed' || task.status === 'error') {
      scheduleRemove(task)
      return
    }

    if (task.progress === 100 && task.status === 'running' && task.stage !== 'scanning' && task.stage !== 'pending') {
      task.status = 'success'
      scheduleRemove(task)
    }
  })

  return true
}

// export function isTransferListenerInited() {
//   return inited
// }

function sortParents(tasks: Task[]) {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt)
}

function sortChildren(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.sortIndex - b.sortIndex)
}

function buildGroupedList(type: TaskType) {
  const all = Object.values(transferTasks.value).filter((t) => t.type === type)

  const parents = all.filter((t) => t.isGroup || !t.parentTaskKey)

  return sortParents(parents).map((parent) => {
    const children = sortChildren(all.filter((t) => t.parentTaskKey === parent.taskKey))
    return { parent, children }
  })
}

export const downloadGroups = computed(() => buildGroupedList('download'))
export const uploadGroups = computed(() => buildGroupedList('upload'))
export const r2rTaskGroups = computed(() => buildGroupedList('r2r'))

export const downloadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'download' && !t.parentTaskKey))
export const uploadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'upload' && !t.parentTaskKey))
export const r2rList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'r2r' && !t.parentTaskKey))
