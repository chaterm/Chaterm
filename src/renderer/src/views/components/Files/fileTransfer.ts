import { ref, computed } from 'vue'

export interface Task {
  id: string
  taskKey: string
  name: string
  progress: number
  remotePath: string
  speed: string
  type: 'upload' | 'download'
  lastBytes: number
  lastTime: number
}

export const transferTasks = ref<Record<string, Task>>({})
const api = (window as any).api

export const initTransferListener = () => {
  api.onTransferProgress(({ id, taskKey, remotePath, bytes, total, type }) => {
    const cleanPath = remotePath.replace(/\/+/g, '/')

    // Upon receiving progress for the first time, automatically create one
    if (!transferTasks.value[taskKey]) {
      transferTasks.value[taskKey] = {
        id: String(id),
        taskKey: taskKey,
        name: cleanPath.split('/').pop() || '',
        remotePath: cleanPath,
        progress: 0,
        speed: '0 KB/s',
        type,
        lastBytes: bytes,
        lastTime: Date.now()
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
    task.progress = Math.round((bytes / total) * 100)

    if (task.progress === 100) {
      setTimeout(() => delete transferTasks.value[taskKey], 3000)
    }
  })
}

export const downloadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'download'))
export const uploadList = computed(() => Object.values(transferTasks.value).filter((t) => t.type === 'upload'))
