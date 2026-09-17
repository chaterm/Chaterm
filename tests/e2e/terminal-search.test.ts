import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Regression test for Cmd+F / Ctrl+F search in the terminal.
 *
 * Two defects were fixed:
 *
 * 1. sshConnect.vue registered the pane with inputManager from a
 *    setTimeout(100) that could fire before `connectionId` was assigned. The
 *    instance was then keyed on '' and activeTermId stayed empty forever, so
 *    every shortcut guarded by `activeTerm.id === connectionId.value` silently
 *    did nothing -- including the Cmd+F that opens this search bar.
 *
 * 2. searchComp.vue read the private `_searchResults` field of
 *    @xterm/addon-search, which no longer exists in 0.16.0, so the match
 *    counter was always 0/0 and the prev/next buttons stayed disabled.
 *
 * These tests assert the bar opens on the shortcut and that the counter shows
 * real match counts driven by the addon's public onDidChangeResults event.
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
 * Open a local shell tab. getShellsLocal() names the entry (e.g. "zsh Shell
 * (Default)") and the workspace tree appends its group last, below every server
 * asset, so the virtual list has to be scrolled to the bottom to render it.
 */
async function openLocalTerminal(): Promise<boolean> {
  const shellTitle = await win.evaluate(async () => {
    const shells = await (window as any).api?.getShellsLocal?.()
    return (shells?.children?.[0]?.title as string | undefined) ?? null
  })
  if (!shellTitle) return false

  let visible = false
  for (let i = 0; i < 40; i++) {
    visible = await win.evaluate((title) => {
      const holder = document.querySelector('.ant-tree-list-holder')
      if (holder) holder.scrollTop = holder.scrollHeight
      return Array.from(document.querySelectorAll('.ant-tree-treenode')).some((el) => (el.textContent ?? '').includes(title))
    }, shellTitle)
    if (visible) break
    await win.waitForTimeout(400)
  }
  if (!visible) return false

  // A real mouse click is required; a synthesized MouseEvent does not open the
  // tab (ant-tree binds through its own handlers).
  const box = await win.evaluate((title) => {
    const node = Array.from(document.querySelectorAll('.ant-tree-treenode')).find((el) => (el.textContent ?? '').includes(title))
    const target = (node?.querySelector('.ant-tree-node-content-wrapper') ?? node) as HTMLElement | undefined
    if (!target) return null
    const r = target.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, shellTitle)
  if (!box) return false

  await win.mouse.click(box.x, box.y)

  // Wait for xterm to attach and the shell prompt to render.
  await win.waitForTimeout(8000)
  return win.evaluate(() => !!document.querySelector('.xterm-screen'))
}

/** Type into the focused terminal so the buffer has searchable content. */
async function seedTerminalOutput(): Promise<void> {
  await win.click('.xterm-screen')
  await win.waitForTimeout(300)
  // Three occurrences of a distinctive token, one per line.
  await win.keyboard.type('echo CHATERMNEEDLE; echo CHATERMNEEDLE; echo CHATERMNEEDLE')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(2500)
}

async function searchBarVisible(): Promise<boolean> {
  return win.evaluate(() => !!document.querySelector('.search-bar'))
}

async function readCounter(): Promise<string | null> {
  return win.evaluate(() => document.querySelector('.search-bar .results-text')?.textContent?.trim() ?? null)
}

test.describe('Terminal Cmd+F search', () => {
  test.beforeAll(async () => {
    await launchApp()
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('shortcut opens the search bar and the counter reports real matches', async () => {
    const hasTerminal = await openLocalTerminal()
    test.skip(!hasTerminal, 'could not open a terminal in this profile')

    await seedTerminalOutput()

    // The regression: this shortcut was a silent no-op because activeTermId
    // never matched connectionId.
    expect(await searchBarVisible(), 'search bar should be closed before the shortcut').toBe(false)
    await win.keyboard.press(`${modifier}+f`)
    await win.waitForTimeout(800)
    expect(await searchBarVisible(), 'Cmd+F should open the search bar').toBe(true)

    // The input is focused on mount, so typing goes straight to it.
    await win.keyboard.type('CHATERMNEEDLE')
    await win.waitForTimeout(1200)

    // Before the fix this stayed hidden because searchResultsCount was always 0.
    const counter = await readCounter()
    expect(counter, 'match counter should be rendered').not.toBeNull()
    const match = /^(\d+)\/(\d+)$/.exec(counter ?? '')
    expect(match, `counter should read "n/m", got "${counter}"`).not.toBeNull()

    const [, indexText, totalText] = match!
    expect(Number(totalText), 'should find the seeded matches').toBeGreaterThanOrEqual(3)
    expect(Number(indexText)).toBeGreaterThanOrEqual(1)
    expect(Number(indexText)).toBeLessThanOrEqual(Number(totalText))
  })

  test('next and previous move the active match', async () => {
    test.skip(!(await searchBarVisible()), 'search bar not open; previous test skipped or failed')

    const startCounter = await readCounter()
    const startIndex = Number(/^(\d+)\//.exec(startCounter ?? '')?.[1] ?? 0)
    const total = Number(/\/(\d+)$/.exec(startCounter ?? '')?.[1] ?? 0)
    expect(total).toBeGreaterThanOrEqual(3)

    // Buttons were permanently disabled before the fix (searchResultsCount === 0).
    const nextDisabled = await win.evaluate(
      () => (document.querySelectorAll('.search-bar .search-button')[1] as HTMLButtonElement | undefined)?.disabled ?? true
    )
    expect(nextDisabled, 'next button should be enabled when matches exist').toBe(false)

    await win.click('.search-bar .search-controls .search-button:nth-of-type(2)')
    await win.waitForTimeout(600)
    const afterNext = Number(/^(\d+)\//.exec((await readCounter()) ?? '')?.[1] ?? 0)
    expect(afterNext).not.toBe(startIndex)

    await win.click('.search-bar .search-controls .search-button:nth-of-type(1)')
    await win.waitForTimeout(600)
    const afterPrev = Number(/^(\d+)\//.exec((await readCounter()) ?? '')?.[1] ?? 0)
    expect(afterPrev).toBe(startIndex)
  })

  test('escape closes the search bar', async () => {
    test.skip(!(await searchBarVisible()), 'search bar not open; previous test skipped or failed')

    await win.keyboard.press('Escape')
    await win.waitForTimeout(600)
    expect(await searchBarVisible()).toBe(false)
  })

  test('escape closes the search bar after focus moves back to the terminal', async () => {
    await win.keyboard.press(`${modifier}+f`)
    await win.waitForTimeout(800)
    expect(await searchBarVisible(), 'search bar should reopen').toBe(true)

    // Clicking the terminal moves focus to .xterm-helper-textarea. Escape maps
    // to \x1b there, so xterm used to handle it and stopPropagation before the
    // window-level handler could see it -- leaving the bar stuck open.
    await win.click('.xterm-screen')
    await win.waitForTimeout(500)
    const focused = await win.evaluate(() => document.activeElement?.className?.toString() ?? '')
    expect(focused, 'focus should have left the search input').toContain('xterm-helper-textarea')
    expect(await searchBarVisible(), 'bar should stay open when focus leaves it').toBe(true)

    await win.keyboard.press('Escape')
    await win.waitForTimeout(600)
    expect(await searchBarVisible(), 'Escape should close the bar from the terminal').toBe(false)
  })

  test('escape still reaches the shell once the search bar is closed', async () => {
    expect(await searchBarVisible(), 'search bar should be closed for this case').toBe(false)

    // Guards the fix against swallowing Escape wholesale, which would break
    // vim and any other shell consumer of \x1b.
    await win.click('.xterm-screen')
    await win.waitForTimeout(400)
    await win.keyboard.type('echo ESCPASSTHROUGH')
    await win.keyboard.press('Escape')
    await win.waitForTimeout(400)
    await win.keyboard.press('Enter')
    await win.waitForTimeout(1800)

    const sawOutput = await win.evaluate(() => (document.querySelector('.xterm-screen')?.textContent ?? '').includes('ESCPASSTHROUGH'))
    expect(sawOutput, 'the shell should still have processed the line').toBe(true)
  })
})
