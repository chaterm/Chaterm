import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Regression test for select-all inside the terminal pane.
 *
 * sshConnect.vue claims Cmd/Ctrl+A for the terminal whenever the keyboard
 * target sits anywhere inside `.terminal-container`. The AI command dialog and
 * the search bar are rendered inside that same container, so their own text
 * fields had their select-all preventDefault'd and the whole terminal
 * scrollback was selected instead of the field's value.
 *
 * These tests assert the shortcut selects the field when a field owns the
 * focus, and still selects the terminal when the terminal owns it.
 */

const APP_ROOT = path.join(__dirname, '../..')
const APP_MAIN = path.join(APP_ROOT, 'out/main/index.js')

let app: ElectronApplication
let win: Page
let modifier: 'Meta' | 'Control'

async function launchApp(): Promise<void> {
  if (!fs.existsSync(APP_MAIN)) {
    throw new Error(`Electron app not built at: ${APP_MAIN}. Run "npm run build:cn" first.`)
  }
  app = await electron.launch({
    args: [APP_MAIN],
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_IS_DEV: '0',
      CHATERM_E2E: '1',
      APP_EDITION: 'cn'
    },
    timeout: 120000
  })
  win = await app.firstWindow({ timeout: 120000 })
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(6000)

  const onLoginGate = await win.evaluate(() => !!document.querySelector('.skip-login'))
  if (onLoginGate) {
    await win.click('.skip-login .skip-link')
    await win.waitForTimeout(8000)
  }

  modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
}

/**
 * Open a local shell tab.
 *
 * The shell entry can sit anywhere in the workspace tree -- under its own group
 * below every server asset, or at the top once it is a recent connection -- and
 * the list is virtualized, so the tree is swept from the top instead of being
 * scrolled straight to the bottom.
 */
async function openLocalTerminal(): Promise<boolean> {
  const shellTitle = await win.evaluate(async () => {
    const shells = await (window as any).api?.getShellsLocal?.()
    return (shells?.children?.[0]?.title as string | undefined) ?? null
  })
  if (!shellTitle) return false

  const findNodeBox = async (title: string) =>
    win.evaluate((t) => {
      const node = Array.from(document.querySelectorAll('.ant-tree-treenode')).find((el) => (el.textContent ?? '').includes(t))
      const target = (node?.querySelector('.ant-tree-node-content-wrapper') ?? node) as HTMLElement | undefined
      if (!target) return null
      const r = target.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, title)

  let box = await findNodeBox(shellTitle)

  // Not rendered at the current scroll offset: page down through the list.
  for (let i = 0; !box && i < 40; i++) {
    const atEnd = await win.evaluate(() => {
      const holder = document.querySelector('.ant-tree-list-holder') as HTMLElement | null
      if (!holder) return true
      const before = holder.scrollTop
      holder.scrollTop = before + holder.clientHeight
      return holder.scrollTop === before
    })
    await win.waitForTimeout(400)
    box = await findNodeBox(shellTitle)
    if (!box && atEnd) break
  }
  if (!box) return false

  // A real mouse click is required; a synthesized MouseEvent does not open the
  // tab (ant-tree binds through its own handlers).
  await win.mouse.click(box.x, box.y)

  // Wait for xterm to attach and the shell prompt to render.
  await win.waitForTimeout(8000)
  return win.evaluate(() => !!document.querySelector('.xterm-screen'))
}

/** Put a distinctive line in the buffer so a terminal selection is observable. */
async function seedTerminalOutput(): Promise<void> {
  await win.click('.xterm-screen')
  await win.waitForTimeout(300)
  await win.keyboard.type('echo SELECTALLNEEDLE')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(2500)
}

/**
 * Whether the terminal itself has a selection.
 *
 * The WebGL renderer paints the selection into a canvas, so there is no DOM to
 * read and the Terminal instance is not reachable from the page. The Chat to AI
 * button is the observable proxy: updateSelectionButtonPosition() shows it only
 * while hasSelection() holds and the selected text is non-empty.
 */
async function terminalHasSelection(): Promise<boolean> {
  return win.evaluate(() => {
    const button = document.querySelector('.terminal-container .select-button') as HTMLElement | null
    if (!button) return false
    return button.style.display !== 'none' && button.offsetParent !== null
  })
}

/** Selection state of the focused field: its value and the selected span. */
async function fieldSelection(selector: string): Promise<{ value: string; selected: string } | null> {
  return win.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) return null
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    return { value: el.value, selected: el.value.slice(start, end) }
  }, selector)
}

test.describe('Terminal select-all shortcut', () => {
  test.beforeAll(async () => {
    await launchApp()
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('select-all in the AI command dialog selects only its own text', async () => {
    const hasTerminal = await openLocalTerminal()
    test.skip(!hasTerminal, 'could not open a terminal in this profile')

    await seedTerminalOutput()

    await win.keyboard.press(`${modifier}+k`)
    await win.waitForTimeout(1000)
    const dialogOpen = await win.evaluate(() => !!document.querySelector('.command-input-widget .command-textarea'))
    expect(dialogOpen, 'Cmd+K should open the command dialog').toBe(true)

    // The dialog is inside .terminal-container, which is what made the terminal
    // claim this keystroke.
    await win.click('.command-input-widget .command-textarea')
    await win.waitForTimeout(200)
    await win.keyboard.type('check disk status')
    await win.waitForTimeout(400)

    await win.keyboard.press(`${modifier}+a`)
    await win.waitForTimeout(600)

    const field = await fieldSelection('.command-input-widget .command-textarea')
    expect(field, 'dialog textarea should still be mounted').not.toBeNull()
    expect(field!.value).toBe('check disk status')
    // The regression: nothing was selected here and the scrollback was instead.
    expect(field!.selected, 'select-all should cover the whole prompt text').toBe('check disk status')
    expect(await terminalHasSelection(), 'the terminal must not be selected').toBe(false)

    await win.keyboard.press('Escape')
    await win.waitForTimeout(500)
  })

  test('select-all in the search bar selects only its own text', async () => {
    await win.keyboard.press(`${modifier}+f`)
    await win.waitForTimeout(800)
    expect(await win.evaluate(() => !!document.querySelector('.search-bar')), 'Cmd+F should open the search bar').toBe(true)

    await win.keyboard.type('NEEDLE')
    await win.waitForTimeout(600)

    await win.keyboard.press(`${modifier}+a`)
    await win.waitForTimeout(600)

    const field = await fieldSelection('.search-bar .search-input')
    expect(field, 'search input should still be mounted').not.toBeNull()
    expect(field!.value).toBe('NEEDLE')
    expect(field!.selected, 'select-all should cover the whole search term').toBe('NEEDLE')
    expect(await terminalHasSelection(), 'the terminal must not be selected').toBe(false)

    await win.keyboard.press('Escape')
    await win.waitForTimeout(600)
  })

  test('select-all still selects the scrollback when the terminal has focus', async () => {
    // Guards the fix against disabling terminal select-all wholesale.
    await win.click('.xterm-screen')
    await win.waitForTimeout(400)
    const focused = await win.evaluate(() => document.activeElement?.className?.toString() ?? '')
    expect(focused, 'focus should be on the xterm helper textarea').toContain('xterm-helper-textarea')

    expect(await terminalHasSelection(), 'nothing should be selected yet').toBe(false)

    await win.keyboard.press(`${modifier}+a`)
    await win.waitForTimeout(600)

    expect(await terminalHasSelection(), 'the terminal should select its own content').toBe(true)
  })
})
