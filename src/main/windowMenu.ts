import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { WindowCreationResult } from './windowManager'

export interface RegisterWindowMenuOptions {
  createAppWindow: () => Promise<WindowCreationResult | void>
  platform?: NodeJS.Platform
  locale?: string
}

const isChineseLocale = (locale: string): boolean => locale.toLowerCase().startsWith('zh')

const createWindowClickHandler = (createAppWindow: () => Promise<WindowCreationResult | void>) => {
  return () => {
    void createAppWindow()
  }
}

export function registerWindowMenu(options: RegisterWindowMenuOptions): void {
  const platform = options.platform ?? process.platform
  const locale = options.locale ?? app.getLocale()
  const isChinese = isChineseLocale(locale)
  const newWindowLabel = isChinese ? '新建窗口' : 'New Window'
  const fileLabel = isChinese ? '文件' : 'File'
  const createWindow = createWindowClickHandler(options.createAppWindow)

  const fileMenu: MenuItemConstructorOptions = {
    label: fileLabel,
    submenu: [
      {
        label: newWindowLabel,
        accelerator: 'CommandOrControl+Shift+N',
        click: createWindow
      },
      { type: 'separator' },
      platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  if (platform === 'darwin') {
    app.dock?.setMenu(
      Menu.buildFromTemplate([
        {
          label: newWindowLabel,
          accelerator: 'CommandOrControl+Shift+N',
          click: createWindow
        }
      ])
    )
  }
}
