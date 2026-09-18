import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Regression test for the left-sidebar drag jitter bug.
 *
 * Dragging the left sidebar splitter used to shift the whole host list up and
 * down by 7px on almost every frame. Cause: ant-design-vue transiently inserts
 * .ant-tabs-nav-operations (the overflow "more" button) while the tab bar is
 * being measured during a resize. That button was taller than the tab row, so
 * each insertion grew .ant-tabs-nav and pushed everything below it down.
 *
 * These tests assert the geometry stays stable across a real mouse drag.
 */

const APP_ROOT = path.join(__dirname, '../..')
const APP_MAIN = path.join(APP_ROOT, 'out/main/index.js')

// A drag of this many steps crosses enough width thresholds to trigger the
// original bug reliably (it reproduced at every step rate from 10ms to 80ms).
const DRAG_STEPS = 15
const DRAG_STEP_PX = 10
const DRAG_STEP_DELAY_MS = 20

interface DragMeasurement {
  /** Distinct .workspace-tabs-container heights observed during the drag. */
  tabsHeights: number[]
  /** Distinct Y positions of the host tree's virtual list during the drag. */
  treeYPositions: number[]
  /** Number of times the tree's Y position changed. */
  treeYChanges: number
  /** Number of times the tab bar height changed. */
  tabsHeightChanges: number
  /** How many times the overflow button was inserted (may be non-zero; harmless). */
  overflowButtonInsertions: number
  framesSampled: number
  /** Sidebar width before the drag started. */
  paneWidthBefore: number
  /** Sidebar width at the far end of the drag, to prove the drag did something. */
  paneWidthAtMax: number
}

let app: ElectronApplication
let win: Page

async function launchApp(): Promise<void> {
  if (!fs.existsSync(APP_MAIN)) {
    throw new Error(`Electron app not built at: ${APP_MAIN}. Run "npm run build:cn" first.`)
  }
  app = await electron.launch({
    args: [APP_MAIN],
    // loadEditionConfig() resolves build/edition-config/<edition>.json from cwd.
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

  // Enter as guest when the login gate is shown.
  const onLoginGate = await win.evaluate(() => !!document.querySelector('.skip-login'))
  if (onLoginGate) {
    await win.click('.skip-login .skip-link')
    await win.waitForTimeout(8000)
  }
}

/**
 * Resolve the live left splitter. Two .left-sidebar-container elements exist
 * (agents mode and terminal mode); only one is actually on top and clickable.
 */
async function findLiveSplitter(): Promise<{ x: number; y: number; containerIndex: number } | null> {
  return win.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('.left-sidebar-container'))
    for (let i = 0; i < containers.length; i++) {
      const splitter = Array.from(containers[i].children).find((el) => el.classList.contains('splitpanes__splitter'))
      if (!splitter) continue
      const rect = splitter.getBoundingClientRect()
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      if (document.elementFromPoint(cx, cy) === splitter) {
        return { x: cx, y: cy, containerIndex: i }
      }
    }
    return null
  })
}

/** Width of the sidebar pane, i.e. the pane immediately left of the splitter. */
async function readPaneWidth(containerIndex: number): Promise<number> {
  return win.evaluate((index) => {
    const container = document.querySelectorAll('.left-sidebar-container')[index]
    const pane = container?.querySelector('.splitpanes__pane')
    return pane ? Number(pane.getBoundingClientRect().width.toFixed(2)) : -1
  }, containerIndex)
}

async function expandTreeGroups(): Promise<number> {
  for (let round = 0; round < 3; round++) {
    const collapsed = await win.evaluate(() => {
      const switchers = Array.from(document.querySelectorAll('.ant-tree-switcher_close'))
      switchers.forEach((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      return switchers.length
    })
    await win.waitForTimeout(1000)
    if (collapsed === 0) break
  }
  return win.evaluate(() => document.querySelectorAll('.hostname-text').length)
}

/** Drag the splitter right then back, sampling geometry every frame. */
async function measureDrag(origin: { x: number; y: number; containerIndex: number }): Promise<DragMeasurement> {
  const paneWidthBefore = await readPaneWidth(origin.containerIndex)

  await win.evaluate(() => {
    const tabsContainer = document.querySelector('.workspace-tabs-container')
    const nav = document.querySelector('.ant-tabs-nav')
    const treeInner = document.querySelector('.ant-tree-list-holder-inner')
    if (!tabsContainer || !nav || !treeInner) {
      throw new Error('sidebar elements not found')
    }

    const state = {
      tabsHeights: new Set<number>(),
      treeYPositions: new Set<number>(),
      treeYChanges: 0,
      tabsHeightChanges: 0,
      overflowButtonInsertions: 0,
      framesSampled: 0,
      stopped: false,
      stop: () => {}
    }
    ;(window as any).__jitter = state

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && (node as Element).classList?.contains('ant-tabs-nav-operations')) {
            state.overflowButtonInsertions++
          }
        })
      }
    })
    observer.observe(nav, { childList: true })

    let lastHeight: number | null = null
    let lastTreeY: number | null = null
    const sample = () => {
      if (state.stopped) return
      const height = Number(tabsContainer.getBoundingClientRect().height.toFixed(2))
      const treeY = Number(treeInner.getBoundingClientRect().y.toFixed(2))
      state.tabsHeights.add(height)
      state.treeYPositions.add(treeY)
      if (lastHeight !== null && height !== lastHeight) state.tabsHeightChanges++
      if (lastTreeY !== null && treeY !== lastTreeY) state.treeYChanges++
      lastHeight = height
      lastTreeY = treeY
      state.framesSampled++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)

    state.stop = () => {
      state.stopped = true
      observer.disconnect()
    }
  })

  const maxOffset = DRAG_STEPS * DRAG_STEP_PX
  await win.mouse.move(origin.x, origin.y)
  await win.mouse.down()
  for (let px = origin.x; px <= origin.x + maxOffset; px += DRAG_STEP_PX) {
    await win.mouse.move(px, origin.y)
    await win.waitForTimeout(DRAG_STEP_DELAY_MS)
  }
  const paneWidthAtMax = await readPaneWidth(origin.containerIndex)
  for (let px = origin.x + maxOffset; px >= origin.x; px -= DRAG_STEP_PX) {
    await win.mouse.move(px, origin.y)
    await win.waitForTimeout(DRAG_STEP_DELAY_MS)
  }
  await win.mouse.up()
  await win.waitForTimeout(500)

  const sampled = await win.evaluate(() => {
    const state = (window as any).__jitter
    state.stop()
    return {
      tabsHeights: Array.from(state.tabsHeights as Set<number>).sort((a, b) => a - b),
      treeYPositions: Array.from(state.treeYPositions as Set<number>).sort((a, b) => a - b),
      treeYChanges: state.treeYChanges,
      tabsHeightChanges: state.tabsHeightChanges,
      overflowButtonInsertions: state.overflowButtonInsertions,
      framesSampled: state.framesSampled
    }
  })

  return { ...sampled, paneWidthBefore, paneWidthAtMax }
}

test.describe('Left sidebar resize stability', () => {
  test.beforeAll(async () => {
    await launchApp()
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('host list does not shift vertically while dragging the sidebar', async () => {
    const hostRows = await expandTreeGroups()
    // The assertions below measure the host tree, so they need a profile that
    // actually has hosts. Skip visibly rather than fail on an empty profile.
    test.skip(hostRows === 0, 'no hosts in this profile; nothing to measure')

    const splitter = await findLiveSplitter()
    expect(splitter, 'live left splitter should be hit-testable').not.toBeNull()

    const result = await measureDrag(splitter!)

    // Sanity: the drag actually resized the sidebar and frames were sampled.
    // Without this a no-op drag would trivially "pass" the assertions below.
    expect(result.framesSampled).toBeGreaterThan(30)
    expect(result.paneWidthAtMax - result.paneWidthBefore).toBeGreaterThan(DRAG_STEPS * DRAG_STEP_PX * 0.5)

    // The regression: the tab bar must keep a single height, so nothing below
    // it moves. Before the fix this reported [32, 39] with ~30 changes.
    expect(result.tabsHeights).toHaveLength(1)
    expect(result.tabsHeightChanges).toBe(0)

    // The visible symptom: the host list must not move at all.
    expect(result.treeYPositions).toHaveLength(1)
    expect(result.treeYChanges).toBe(0)
  })

  test('host name text stays inside its container so the ellipsis is visible', async () => {
    const rows = await win.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.hostname-text'))
      return nodes
        .map((el) => {
          const parent = el.closest('.title-with-icon')
          if (!parent) return null
          const elRect = el.getBoundingClientRect()
          const parentRect = parent.getBoundingClientRect()
          return { overflowPx: Number((elRect.right - parentRect.right).toFixed(1)) }
        })
        .filter((r): r is { overflowPx: number } => r !== null)
    })

    test.skip(rows.length === 0, 'no hosts in this profile; nothing to measure')

    // A truncated name must not spill past its parent, otherwise the ellipsis
    // is painted outside the clipped region and the text is hard-cut.
    // Before the fix this was +15px (the width of the leading icon).
    for (const row of rows) {
      expect(row.overflowPx).toBeLessThanOrEqual(1)
    }
  })
})
