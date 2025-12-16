import { notification, Progress } from 'ant-design-vue'
import { InfoCircleOutlined, CloseCircleOutlined, WarningOutlined, CheckCircleOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { h } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import './index.less'

type NoticeType = 'success' | 'error' | 'warning' | 'info'

interface NoticeOptions {
  id?: string
  type?: NoticeType
  title?: string
  description: string
  duration?: number
  placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  showCloseIcon?: boolean
  btns?: Array<{
    text: string
    class?: 'notice-btn' | 'notice-btn-withe'
    action: () => void
  }>
}

interface NoticeProgressOptions extends NoticeOptions {
  progress: number
}

const queue: Array<NoticeOptions | NoticeProgressOptions> = []
const activeKeys = new Set<string>()

function getIcon(type: NoticeType = 'info') {
  const colorMap: Record<NoticeType, string> = {
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    info: '#1677ff'
  }
  const iconMap = {
    success: CheckCircleOutlined,
    error: CloseCircleOutlined,
    warning: WarningOutlined,
    info: InfoCircleOutlined
  }
  return h(iconMap[type], {
    style: `color: ${colorMap[type]};`
  })
}

function doOpen(opts: NoticeOptions | NoticeProgressOptions) {
  const { id, type = 'info', title = '', description, duration = 4, btns, placement, showCloseIcon = true } = opts as NoticeOptions
  const key = id ?? `notice-${uuidv4()}`

  activeKeys.add(key)
  const children: any[] = []

  children.push(h('div', { class: 'notice-description' }, description))

  if ('progress' in opts) {
    children.push(
      h('div', { class: 'notice-progress' }, [
        h(Progress, {
          percent: (opts as NoticeProgressOptions).progress,
          size: 'small',
          showInfo: false
        })
      ])
    )
  }
  if (btns && btns.length > 0) {
    children.push(
      h(
        'div',
        { class: 'notice-btn-wrap' },
        btns.map((btn) =>
          h(
            'button',
            {
              class: btn.class || 'notice-btn',
              onClick: btn.action
            },
            btn.text
          )
        )
      )
    )
  }

  const descVNode = h('div', { class: 'notice-desc' }, children)
  const closeIcon = h(CloseOutlined, {
    class: 'notice-close'
  })
  const notificationClass = `notification ${showCloseIcon ? '' : 'no-closeIcon'}`
  notification.open({
    key,
    icon: h('span', { class: 'notice-icon' }, getIcon(type)),
    message: h('span', { class: 'notice-title' }, title),
    description: descVNode,
    closeIcon,
    class: notificationClass,
    placement: placement || 'bottomRight',
    duration,
    onClose: () => {
      activeKeys.delete(key)
      showNext()
    }
  })
}

function showNext() {
  if (queue.length === 0) return
  // Limit to maximum 3 displayed simultaneously
  if (activeKeys.size >= 3) return

  const opts = queue.shift()!

  doOpen(opts)
}

function openImmediate(opts: NoticeOptions | NoticeProgressOptions) {
  doOpen(opts)
}

export const Notice = {
  open(opts: NoticeOptions) {
    // Open immediately if there are buttons, otherwise enter queue
    if (opts.btns) {
      openImmediate(opts)
    } else {
      queue.push(opts)
      showNext()
    }
  },

  progress(opts: NoticeProgressOptions) {
    openImmediate(opts)
  },

  clearAll() {
    queue.length = 0
    notification.destroy()
  },

  close(id: string) {
    notification.close(id)
  }
}
