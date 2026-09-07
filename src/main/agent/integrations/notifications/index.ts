//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { execa } from 'execa'
import { platform } from 'os'
import { app, BrowserWindow, Notification } from 'electron'
const logger = createLogger('agent')
const activeMacOSNotifications = new Set<Notification>()

interface NotificationOptions {
  title?: string
  subtitle?: string
  message: string
  taskId?: string
}

function escapeForPowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
}

function escapeForXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function isChatermWindowActive(): boolean {
  return BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isVisible() && window.isFocused())
}

async function showMacOSNotification(options: NotificationOptions): Promise<void> {
  const { title, subtitle = '', message, taskId } = options

  // Electron's native Notification API is unavailable in a few environments
  // (for example an unsigned development bundle). Keep the AppleScript path as
  // a fallback so approval notifications are still delivered by macOS.
  if (!app.isReady()) {
    await app.whenReady()
  }

  // Electron notifications can silently disappear in unpackaged development
  // runs on macOS. Use AppleScript there; packaged builds use the native API
  // so the banner is attributed to Chaterm and supports click handling.
  if (app.isPackaged && Notification.isSupported()) {
    try {
      const notification = new Notification({
        title: title || 'Chaterm',
        subtitle,
        body: message,
        sound: 'default'
      })

      notification.on('click', () => {
        const targetWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
        if (targetWindow) {
          if (targetWindow.isMinimized()) targetWindow.restore()
          targetWindow.show()
          targetWindow.focus()
          if (taskId) {
            for (const window of BrowserWindow.getAllWindows()) {
              if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
                window.webContents.send('main-to-webview', { type: 'notificationClicked', taskId })
              }
            }
          }
        }
        app.focus({ steal: true })
        activeMacOSNotifications.delete(notification)
      })
      notification.on('close', () => activeMacOSNotifications.delete(notification))
      notification.once('failed', (_event, error) => {
        activeMacOSNotifications.delete(notification)
        logger.warn('Native macOS notification failed; falling back to osascript', { error })
        const safeMessage = escapeForAppleScript(message)
        const safeTitle = escapeForAppleScript(title || 'Chaterm')
        const safeSubtitle = escapeForAppleScript(subtitle)
        const script = `display notification "${safeMessage}" with title "${safeTitle}" subtitle "${safeSubtitle}" sound name "Tink"`
        void execa('osascript', ['-e', script]).catch((fallbackError) => {
          logger.error('macOS AppleScript notification fallback failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          })
        })
      })
      activeMacOSNotifications.add(notification)
      notification.show()
      return
    } catch (error) {
      logger.warn('Native macOS notification failed; falling back to osascript', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const safeMessage = escapeForAppleScript(message)
  const safeTitle = escapeForAppleScript(title || 'Chaterm')
  const safeSubtitle = escapeForAppleScript(subtitle)
  const script = `display notification "${safeMessage}" with title "${safeTitle}" subtitle "${safeSubtitle}" sound name "Tink"`
  await execa('osascript', ['-e', script])
}

async function showWindowsNotification(options: NotificationOptions): Promise<void> {
  const { subtitle, message } = options
  const subtitleForXml = escapeForXml(subtitle || '')
  const messageForXml = escapeForXml(message)

  const script = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
    <toast>
        <visual>
            <binding template="ToastText02">
                <text id="1">${subtitleForXml}</text>
                <text id="2">${messageForXml}</text>
            </binding>
        </visual>
    </toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Chaterm").Show($toast)
    `

  try {
    await execa('powershell', ['-Command', script])
  } catch (error) {
    throw new Error(`Failed to show Windows notification: ${error}`)
  }
}

async function showLinuxNotification(options: NotificationOptions): Promise<void> {
  const { title = '', subtitle = '', message } = options

  // Combine subtitle and message if subtitle exists
  const fullMessage = subtitle ? `${subtitle}\n${message}` : message

  try {
    await execa('notify-send', [title, fullMessage])
  } catch (error) {
    throw new Error(`Failed to show Linux notification: ${error}`)
  }
}

export async function showSystemNotification(options: NotificationOptions): Promise<void> {
  try {
    const { title = 'Chaterm', message, subtitle = '' } = options

    if (!message) {
      throw new Error('Message is required')
    }
    if (isChatermWindowActive()) {
      return
    }
    switch (platform()) {
      case 'darwin':
        await showMacOSNotification({ title, subtitle, message, taskId: options.taskId })
        break
      case 'win32':
        await showWindowsNotification({
          title: escapeForPowerShellSingleQuoted(title),
          subtitle: escapeForPowerShellSingleQuoted(subtitle),
          message: escapeForPowerShellSingleQuoted(message)
        })
        break
      case 'linux':
        await showLinuxNotification({ title, subtitle, message })
        break
      default:
        throw new Error('Unsupported platform')
    }
  } catch (error) {
    logger.error('Could not show system notification', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
