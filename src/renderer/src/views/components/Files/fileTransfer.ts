import { ref, computed } from 'vue'

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
  fromId?: string
  toId?: string
}

export const transferTasks = ref<Record<string, Task>>({})
const api = (window as any).api

export const initTransferListener = () => {
  api.onTransferProgress((payload: any) => {
    const { taskKey, type, bytes = 0, total = 0, remotePath = '', destPath, id, fromId, toId } = payload || {}

    if (!taskKey) return

    const cleanPath = String(remotePath).replace(/\/+/g, '/')

    if (!transferTasks.value[taskKey]) {
      const baseName = cleanPath.split('/').pop() || ''
      transferTasks.value[taskKey] = {
        id: String(id ?? fromId ?? toId ?? ''),
        taskKey,
        name: baseName,
        remotePath: cleanPath,
        destPath: destPath ? String(destPath).replace(/\/+/g, '/') : undefined,
        progress: 0,
        speed: '0 KB/s',
        type: (type as Task['type']) || 'download',
        lastBytes: bytes,
        lastTime: Date.now(),
        fromId,
        toId
      }
    }

    const task = transferTasks.value[taskKey]
    const now = Date.now()
    const sec = (now - task.lastTime) / 1000

    if (sec >= 1) {
      const diff = bytes - task.lastBytes
      task.speed = diff > 1024 * 1024 ? `${(diff / 1024 / 1024).toFixed(2)} MB/s` : `${(diff / 1024).toFixed(2)} KB/s`
      task.lastBytes = bytes
      task.lastTime = now
    }

    task.progress = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0

    if (task.progress === 100) {
      setTimeout(() => delete transferTasks.value[taskKey], 3000)
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
    const key = `${t.fromId ?? 'unknown'} → ${t.toId ?? 'unknown'}`
    ;(groups[key] ||= []).push(t)
  }
  return groups
})
