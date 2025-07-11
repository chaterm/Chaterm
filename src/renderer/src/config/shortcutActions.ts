import eventBus from '@/utils/eventBus'
import type { ShortcutAction } from '@/services/shortcutService'

/**
 * 集中定义了应用中所有的快捷键操作。
 * 每个操作包含一个唯一的 `id`，一个用于国际化的 `nameKey`，
 * 默认的快捷键 `defaultKey` (区分Mac和非Mac平台)，
 * 以及一个 `handler` 函数来执行具体操作。
 */
export const shortcutActions: Omit<ShortcutAction, 'name'>[] = [
  {
    id: 'openSettings',
    nameKey: 'shortcuts.actions.openSettings',
    defaultKey: {
      mac: 'Command+,',
      other: 'Ctrl+,'
    },
    handler: () => {
      eventBus.emit('openUserTab', 'userConfig')
    }
  },
  {
    id: 'toggleLeftSidebar',
    nameKey: 'shortcuts.actions.toggleLeftSidebar',
    defaultKey: {
      mac: 'Command+B',
      other: 'Ctrl+B'
    },
    handler: () => {
      eventBus.emit('toggleSideBar', 'left')
    }
  },
  {
    id: 'toggleRightSidebar',
    nameKey: 'shortcuts.actions.toggleRightSidebar',
    defaultKey: {
      mac: 'Command+Option+B',
      other: 'Ctrl+Alt+B'
    },
    handler: () => {
      eventBus.emit('toggleSideBar', 'right')
    }
  }
]
