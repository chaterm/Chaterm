import { ref, computed } from 'vue'

export type TaskStatus = 'running' | 'success' | 'failed' | 'error'

export interface Task {
  id: string
  taskKey: string
  name: string
  progress: number
  remotePath: string
  destPath?: string
  speed: string
  type: 'upload' | 'download' | 'r2r'
  lastBytes: number
  lastTime: number

  status: TaskStatus

  // stage for UI (e.g. 'scanning' | 'transferring' | 'init')
  stage?: string

  // optional ids
  fromId?: string
  toId?: string

  // optional host/ip labels from main process
  host?: string
  fromHost?: string
  toHost?: string

  // optional error message
  message?: string
}

export const transferTasks = ref<Record<string, Task>>({})
const api = (window as any).api

export const initTransferListener = () => {
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
      stage
    } = payload || {}
    if (!taskKey) return

    const cleanRemotePath = String(remotePath).replace(/\\+/g, '/')

    if (!transferTasks.value[taskKey]) {
      const baseName = cleanRemotePath.split('/').pop() || ''
      transferTasks.value[taskKey] = {
        id: String(id ?? fromId ?? toId ?? ''),
        taskKey,
        name: baseName,
        remotePath: cleanRemotePath,
        destPath: destPath ? String(destPath).replace(/\\+/g, '/') : undefined,
        progress: 0,
        speed: '0 KB/s',
        type: (type as Task['type']) || 'download',
        lastBytes: bytes,
        lastTime: Date.now(),
        status: (status as TaskStatus) || 'running',
        stage: stage ? String(stage) : undefined,
        message: message ? String(message) : undefined,
        fromId,
        toId,
        host: host ? String(host) : undefined,
        fromHost: fromHost ? String(fromHost) : undefined,
        toHost: toHost ? String(toHost) : undefined
      }
    }

    const task = transferTasks.value[taskKey]

    // Update meta
    if (typeof status === 'string') task.status = status as TaskStatus
    if (typeof stage === 'string') task.stage = stage
    if (message) task.message = String(message)

    // If scanning, show a stable label instead of fake speed
    if (task.stage === 'scanning') {
      task.speed = 'scanning'
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

    // Progress
    task.progress = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0

    if (task.status === 'success') {
      setTimeout(() => delete transferTasks.value[taskKey], 2500)
      return
    }
    if (task.status === 'failed' || task.status === 'error') {
      setTimeout(() => delete transferTasks.value[taskKey], 8000)
      return
    }

    if (task.progress === 100 && task.status === 'running') {
      task.status = 'success'
      setTimeout(() => delete transferTasks.value[taskKey], 2500)
    }
  })
}

export const downloadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'download'))
export const uploadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'upload'))
export const r2rList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'r2r'))

export const r2rGroups = computed(() => {
  const groups: Record<string, Task[]> = {}
  for (const t of Object.values(transferTasks.value)) {
    if (t.type !== 'r2r') continue
    const left = t.fromHost ?? t.fromId ?? 'unknown'
    const right = t.toHost ?? t.toHost ?? t.toId ?? 'unknown'
    const key = `${left} → ${right}`
    ;(groups[key] ||= []).push(t)
  }
  return groups
})
