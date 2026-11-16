import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Dragging the AI sidebar splitter wider used to stop once the main terminal pane hit its
 * min-size. With the left sidebar open, the drag now squeezes the left sidebar and, past
 * its drag floor, collapses it.
 */

const APP_ROOT = path.join(__dirname, '../..')
const APP_MAIN = path.join(APP_ROOT, 'out/main/index.js')

let app: ElectronApplication
let win: Page

async function launchApp(): Promise<void> {
  if (!fs.existsSync(APP_MAIN)) {
    throw new Error(`Electron app not built at: ${APP_MAIN}. Run "npm run build:cn" first.`)
  }
  app = await electron.launch({
    args: [APP_MAIN],
    cwd: APP_ROOT,
    env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_DEV: '0', CHATERM_E2E: '1', APP_EDITION: 'cn' },
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
  await win.bringToFront()
}

async function readLayout() {
  return win.evaluate(() => {
    const root = document.querySelector('.terminal-mode-layout .left-sidebar-container') as HTMLElement | null
    const left = root?.querySelector(':scope > .splitpanes__pane') as HTMLElement | null
    const main = root?.querySelector('.main-split-container') as HTMLElement | null
    const splitter = main
      ? (Array.from(main.children).find((el) => el.classList.contains('splitpanes__splitter')) as HTMLElement | undefined)
      : undefined
    const rect = splitter?.getBoundingClientRect()
    return {
      leftWidth: left ? left.getBoundingClientRect().width : -1,
      splitterX: rect ? rect.x + rect.width / 2 : -1,
      splitterY: rect ? rect.y + rect.height / 2 : -1,
      hasAi: !!document.querySelector('.terminal-mode-layout .rigth-sidebar')
    }
  })
}

async function ensureAiSidebarOpen(): Promise<void> {
  if ((await readLayout()).hasAi) return
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+L' : 'Control+L')
  await win.waitForTimeout(1500)
}

async function dragAiSplitterTo(targetX: number, steps = 40): Promise<void> {
  const start = await readLayout()
  await win.mouse.move(start.splitterX, start.splitterY)
  await win.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(start.splitterX + ((targetX - start.splitterX) * i) / steps, start.splitterY)
    await win.waitForTimeout(10)
  }
  await win.mouse.up()
  await win.waitForTimeout(600)
}

test.describe('AI sidebar drag squeezes the left sidebar', () => {
  test.beforeAll(async () => {
    await launchApp()
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('squeezes, then collapses the open left sidebar', async () => {
    await ensureAiSidebarOpen()
    const before = await readLayout()
    expect(before.hasAi).toBe(true)
    expect(before.leftWidth).toBeGreaterThan(150)

    // Drag partway past the old stop point: the left sidebar shrinks but stays open
    const container = await win.evaluate(() => {
      const r = (document.querySelector('.terminal-mode-layout .left-sidebar-container') as HTMLElement).getBoundingClientRect()
      return { left: r.left, width: r.width }
    })
    // Old stop point: left sidebar + 30% of the rest. Aim 40px beyond it
    const oldStop = container.left + before.leftWidth + 0.3 * (container.width - before.leftWidth)
    await dragAiSplitterTo(oldStop - 40)
    const squeezed = await readLayout()
    console.log('before', before, 'squeezed', squeezed)
    expect(squeezed.leftWidth).toBeLessThan(before.leftWidth - 20)
    expect(squeezed.leftWidth).toBeGreaterThan(110)
    expect(Math.abs(squeezed.splitterX - (oldStop - 40))).toBeLessThan(15)

    // Pointer x where the left sidebar reaches its 120px floor
    const minPointX = container.left + 120 + 0.3 * (container.width - 120)

    // Inside the resistance zone the sidebar holds at its floor and the splitter stops
    await dragAiSplitterTo(minPointX - 40)
    const resisting = await readLayout()
    console.log('resisting', resisting)
    expect(Math.abs(resisting.leftWidth - 120)).toBeLessThan(2)
    expect(Math.abs(resisting.splitterX - minPointX)).toBeLessThan(10)

    // Past the resistance zone (60px) the left sidebar collapses
    await dragAiSplitterTo(minPointX - 80)
    const collapsed = await readLayout()
    console.log('collapsed', collapsed)
    expect(collapsed.leftWidth).toBeLessThan(2)
    expect(collapsed.hasAi).toBe(true)
  })
})
