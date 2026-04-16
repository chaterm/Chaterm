//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { execa } from 'execa'
import { platform } from 'os'
const logger = createLogger('agent')

interface NotificationOptions {
  title?: string
  subtitle?: string
  message: string
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
}

function escapeForPowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeForXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

async function showMacOSNotification(options: NotificationOptions): Promise<void> {
  const { title, subtitle = '', message } = options

  const safeMessage = escapeForAppleScript(message)
  const safeTitle = escapeForAppleScript(title || '')
  const safeSubtitle = escapeForAppleScript(subtitle)
  const script = `display notification "${safeMessage}" with title "${safeTitle}" subtitle "${safeSubtitle}" sound name "Tink"`

  try {
    await execa('osascript', ['-e', script])
  } catch (error) {
    throw new Error(`Failed to show macOS notification: ${error}`)
  }
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
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Cline").Show($toast)
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
    const { title = 'Cline', message, subtitle = '' } = options

    if (!message) {
      throw new Error('Message is required')
    }
    switch (platform()) {
      case 'darwin':
        await showMacOSNotification({ title, subtitle, message })
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
    logger.error('Could not show system notification', { error: error })
  }
}
