import { onMounted, onUnmounted } from 'vue'
import { Notice } from '@/views/components/Notice'

/**
 * Composable to listen for notification messages from main process
 * Automatically displays notifications using the Notice component
 */
export function useNotificationListener() {
  let removeListener: (() => void) | undefined

  onMounted(() => {
    removeListener = window.api.onMainMessage((message: any) => {
      // Listen for notification messages
      if (message?.type === 'notification' && message.notification) {
        const { type, title, description, duration } = message.notification

        Notice.open({
          type: type || 'info',
          title: title || 'Notification',
          description: description,
          duration: duration || 4
        })
      }
    })
  })

  onUnmounted(() => {
    if (typeof removeListener === 'function') {
      removeListener()
    }
  })
}
