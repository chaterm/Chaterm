import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Quantifies what happens to the middle terminal while the right AI sidebar
 * splitter is dragged.
 *
 * Symptom under investigation: dragging the AI sidebar splitter makes the
 * terminal in the middle pane stutter instead of following the cursor smoothly.
 *
 * What the runs so far establish:
 *  - Frame health is fine on its own. With wrapped scrollback and no AI panel
 *    content, the drag holds ~59fps with zero long tasks.
 *  - The terminal grid does not track the drag at all. The pane width updates
 *    every frame while the rendered terminal width changes once, so the grid
 *    trails the pane by up to ~230px and only fits after mouseup.
 *  - Mid-drag the grid ends up wider than its pane, so terminal content is
 *    clipped while the drag is in flight.
 *  - AI panel content only becomes a frame-rate problem without the containment
 *    the app already applies; see the two synthetic panel cases below.
 *
 * The numbers this test prints are the baseline for any optimization work.
 */

const APP_ROOT = path.join(__dirname, '../..')
const APP_MAIN = path.join(APP_ROOT, 'out/main/index.js')

const DRAG_STEPS = 48
const DRAG_STEP_PX = 4
// Real dragging emits mousemove far faster than one per frame; 4ms keeps several
// moves inside every frame, which is what the app actually has to cope with.
const DRAG_STEP_DELAY_MS = 4

let app: ElectronApplication
let win: Page

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

  // Without focus the first synthesized mousedown only activates the window and
  // the splitter drag never starts.
  await win.bringToFront()
}

/**
 * Fill the scrollback with long lines that each wrap across several rows.
 *
 * Wrapping is what makes an xterm resize expensive: every width change reflows
 * the wrapped lines in the whole buffer. Short unwrapped output only changes
 * the grid width, which is the cheap case and not what a working session looks
 * like. The buffer caps at the configured scrollback (1000 rows by default), so
 * a few thousand wrapped rows is enough to saturate it.
 */
async function fillWrappedScrollback(lines: number): Promise<void> {
  await win.click('.xterm-screen', { position: { x: 40, y: 40 } })
  await win.waitForTimeout(400)
  // Each emitted line is ~450 chars, so it wraps into roughly 5 rows.
  const body = `for (i = 0; i < 8; i++) printf "the-quick-brown-fox-jumps-over-the-lazy-dog-0123456789-"`
  await win.keyboard.type(`seq 1 ${lines} | awk '{printf "%05d ", $1; ${body}; printf "\\n"}'`)
  await win.keyboard.press('Enter')
  await win.waitForTimeout(12000)
}

/** Confirm the visible buffer really is made of wrapped full-width rows. */
async function measureWrapping(): Promise<{ visibleRows: number; fullWidthRows: number; avgLen: number; maxLen: number }> {
  return win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.xterm-rows > div'))
    const lens = rows.map((r) => (r.textContent || '').replace(/\s+$/, '').length)
    const maxLen = Math.max(0, ...lens)
    return {
      visibleRows: rows.length,
      // A wrapped line leaves no trailing gap, so its rows run to the far edge.
      fullWidthRows: maxLen > 0 ? lens.filter((l) => l >= maxLen - 2).length : 0,
      avgLen: Number((lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length)).toFixed(1)),
      maxLen
    }
  })
}

/** Open a local shell tab so the middle pane holds a live xterm instance. */
async function openLocalTerminal(): Promise<boolean> {
  for (let round = 0; round < 3; round++) {
    await win.evaluate(() => {
      document.querySelectorAll('.ant-tree-switcher_close').forEach((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    })
    await win.waitForTimeout(1200)
  }

  // The row click handlers live on .title-with-icon, not on the tree node itself.
  const opened = await win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.ant-tree-treenode'))
    const target = rows.find((row) => /shell|bash|zsh/i.test(row.textContent || '') && !!row.querySelector('.hostname-text'))
    const title = target?.querySelector('.title-with-icon')
    if (!title) return false
    title.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    return true
  })

  if (!opened) return false
  await win.waitForTimeout(8000)
  return win.evaluate(() => !!document.querySelector('.xterm-screen'))
}

/**
 * Stand in for a long working chat by injecting markdown-shaped content into the
 * AI panel: prose that rewraps plus code blocks that scroll horizontally.
 *
 * Layout cost depends on the rendered DOM, not on which code produced it, so
 * this covers what an empty sidebar cannot. A real session needs model
 * credentials the test environment does not have, so results from this path are
 * reported as synthetic.
 */
const CHAT_HOST_SELECTOR = '.chat-response, .tab-content-wrapper'

/**
 * Apply the containment the real app puts on `.user-assistant-pair-message`
 * (`index.less`), so the synthetic content is measured on equal footing with a
 * real chat instead of overstating reflow cost.
 */
async function applyPairContainment(): Promise<number> {
  return win.evaluate(() => {
    const pairs = Array.from(document.querySelectorAll('.e2e-synthetic-pair')) as HTMLElement[]
    for (const pair of pairs) {
      pair.style.contain = 'layout style'
      pair.style.contentVisibility = 'auto'
      pair.style.containIntrinsicSize = 'auto 200px'
    }
    return pairs.length
  })
}

/** Put the terminal pane back to full width so every measured drag starts equal. */
async function resetToWideTerminal(): Promise<void> {
  const splitter = await findAiSplitter()
  if (!splitter) return
  await win.mouse.move(splitter.x, splitter.y)
  await win.mouse.down()
  for (let i = 0; i <= DRAG_STEPS; i++) {
    await win.mouse.move(splitter.x + i * DRAG_STEP_PX, splitter.y)
    await win.waitForTimeout(2)
  }
  await win.mouse.up()
  await win.waitForTimeout(800)
}

async function injectChatContent(pairs: number): Promise<number> {
  return win.evaluate((count) => {
    // A real chat area only renders for a signed-in session, so fall back to the
    // AI tab body, which lives inside the same resized pane.
    const host = document.querySelector('.chat-response, .tab-content-wrapper') as HTMLElement | null
    if (!host) return -1
    host.style.overflowY = 'auto'
    const prose =
      'The agent inspected the running containers and found that the health probe kept failing because the service binds to localhost instead of 0.0.0.0, so the kubelet could never reach it from outside the pod network namespace.'
    const snippet = [
      'const server = http.createServer(app)',
      "server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => {",
      "  logger.info('listening', { port: server.address().port, event: 'startup' })",
      '})'
    ].join('\n')
    const frag = document.createDocumentFragment()
    for (let i = 0; i < count; i++) {
      const pair = document.createElement('div')
      pair.className = 'e2e-synthetic-pair'
      for (let p = 0; p < 3; p++) {
        const para = document.createElement('p')
        para.textContent = `${i}.${p} ${prose}`
        pair.appendChild(para)
      }
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = snippet
      pre.appendChild(code)
      pair.appendChild(pre)
      frag.appendChild(pair)
    }
    host.appendChild(frag)
    return host.querySelectorAll('.e2e-synthetic-pair').length
  }, pairs)
}

/** Node count and scroll height of the AI panel, to prove content is present. */
async function measureChatContent(): Promise<Record<string, unknown>> {
  return win.evaluate((selector) => {
    const host = document.querySelector(selector) as HTMLElement | null
    if (!host) return { pairs: -1 }
    const first = host.querySelector('.e2e-synthetic-pair') as HTMLElement | null
    const firstRect = first?.getBoundingClientRect()
    return {
      pairs: host.querySelectorAll('.e2e-synthetic-pair').length,
      nodes: host.querySelectorAll('*').length,
      scrollHeight: host.scrollHeight,
      hostClass: host.className,
      hostRect: `${host.getBoundingClientRect().width.toFixed(0)}x${host.getBoundingClientRect().height.toFixed(0)}`,
      hostDisplay: getComputedStyle(host).display,
      firstRect: firstRect ? `${firstRect.width.toFixed(0)}x${firstRect.height.toFixed(0)}` : 'none'
    }
  }, CHAT_HOST_SELECTOR)
}

async function ensureAiSidebarOpen(): Promise<boolean> {
  const alreadyOpen = await win.evaluate(() => !!document.querySelector('.rigth-sidebar'))
  if (!alreadyOpen) {
    await win.click('[data-onboarding-id="right-ai-toggle"]')
    await win.waitForTimeout(2500)
  }
  return win.evaluate(() => !!document.querySelector('.rigth-sidebar'))
}

/** The splitter between the terminal pane and the AI sidebar. */
async function findAiSplitter(): Promise<{ x: number; y: number } | null> {
  return win.evaluate(() => {
    const container = document.querySelector('.main-split-container')
    if (!container) return null
    const splitter = Array.from(container.children).find((el) => el.classList.contains('splitpanes__splitter'))
    if (!splitter) return null
    const rect = splitter.getBoundingClientRect()
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    return document.elementFromPoint(cx, cy) === splitter ? { x: cx, y: cy } : null
  })
}

interface FrameStats {
  frames: number
  durationMs: number
  fps: number
  p50: number
  p95: number
  max: number
  over33: number
  over50: number
  over100: number
  longTasks: number
  longTaskTotalMs: number
  longTaskMaxMs: number
  termWidthCount: number
  termWidthChanges: number
  paneWidthCount: number
  paneWidthChanges: number
  maxDivergence: number
  meanDivergence: number
  scrollJumps: number
  timeline: Array<{ t: number; pane: number; term: number }>
}

/** Start rAF + long-task sampling in the page. */
async function startSampling(): Promise<void> {
  await win.evaluate(() => {
    const state: any = {
      intervals: [] as number[],
      longTasks: [] as number[],
      termWidths: new Set<number>(),
      termWidthChanges: 0,
      paneWidths: new Set<number>(),
      paneWidthChanges: 0,
      divergences: [] as number[],
      timeline: [] as Array<{ t: number; pane: number; term: number }>,
      scrollTops: new Set<number>(),
      scrollJumps: 0,
      startedAt: performance.now(),
      stopped: false,
      observer: null as PerformanceObserver | null
    }
    ;(window as any).__dragPerf = state

    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration)
      })
      state.observer.observe({ entryTypes: ['longtask'] })
    } catch {
      state.observer = null
    }

    let last = performance.now()
    let lastTermWidth: number | null = null
    let lastPaneWidth: number | null = null
    let lastScrollTop: number | null = null
    const sample = () => {
      if (state.stopped) return
      const now = performance.now()
      state.intervals.push(now - last)
      last = now

      // Re-query every frame: the terminal element can be replaced on reflow.
      const screen = document.querySelector('.xterm-screen') as HTMLElement | null
      const termPane = document.querySelector('.main-split-container > .splitpanes__pane') as HTMLElement | null

      if (screen && termPane) {
        const termWidth = Number(screen.getBoundingClientRect().width.toFixed(1))
        const paneWidth = Number(termPane.getBoundingClientRect().width.toFixed(1))
        state.termWidths.add(termWidth)
        state.paneWidths.add(paneWidth)
        if (lastTermWidth !== null && termWidth !== lastTermWidth) state.termWidthChanges++
        if (lastPaneWidth !== null && paneWidth !== lastPaneWidth) state.paneWidthChanges++
        lastTermWidth = termWidth
        lastPaneWidth = paneWidth
        // How far the rendered terminal trails the pane it is supposed to fill.
        state.divergences.push(Number(Math.abs(paneWidth - termWidth).toFixed(1)))
        state.timeline.push({ t: Number((now - state.startedAt).toFixed(0)), pane: paneWidth, term: termWidth })

        // A reflow can move the viewport, which is what "scrolling feels broken"
        // looks like from the outside.
        const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
        if (viewport) {
          const top = Math.round(viewport.scrollTop)
          state.scrollTops.add(top)
          if (lastScrollTop !== null && top !== lastScrollTop) state.scrollJumps++
          lastScrollTop = top
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

async function stopSampling(): Promise<FrameStats> {
  return win.evaluate(() => {
    const state = (window as any).__dragPerf
    state.stopped = true
    state.observer?.disconnect()
    const durationMs = performance.now() - state.startedAt
    // Drop the first interval: it spans the gap before sampling settled.
    const intervals: number[] = state.intervals.slice(1)
    const sorted = [...intervals].sort((a, b) => a - b)
    const pick = (q: number) => (sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(2)) : 0)
    const longTasks: number[] = state.longTasks
    return {
      frames: intervals.length,
      durationMs: Number(durationMs.toFixed(1)),
      fps: Number((intervals.length / (durationMs / 1000)).toFixed(1)),
      p50: pick(0.5),
      p95: pick(0.95),
      max: Number(Math.max(0, ...intervals).toFixed(2)),
      over33: intervals.filter((v) => v > 33).length,
      over50: intervals.filter((v) => v > 50).length,
      over100: intervals.filter((v) => v > 100).length,
      longTasks: longTasks.length,
      longTaskTotalMs: Number(longTasks.reduce((a, b) => a + b, 0).toFixed(1)),
      longTaskMaxMs: Number(Math.max(0, ...longTasks).toFixed(1)),
      termWidthCount: (state.termWidths as Set<number>).size,
      termWidthChanges: state.termWidthChanges,
      paneWidthCount: (state.paneWidths as Set<number>).size,
      paneWidthChanges: state.paneWidthChanges,
      maxDivergence: Number(Math.max(0, ...(state.divergences as number[])).toFixed(1)),
      meanDivergence: Number(
        ((state.divergences as number[]).reduce((a, b) => a + b, 0) / Math.max(1, (state.divergences as number[]).length)).toFixed(1)
      ),
      scrollJumps: state.scrollJumps,
      // Thin the timeline so the log stays readable.
      timeline: (state.timeline as Array<{ t: number; pane: number; term: number }>).filter((_, i) => i % 4 === 0)
    }
  })
}

/**
 * After mouseup, how long until the terminal grid fits its pane again.
 * `settledGapPx` is the idle-state gap (padding + scrollbar + partial cell), so
 * "fitted" means back within a cell width of that, not an exact match.
 */
async function measureCatchUp(settledGapPx: number, timeoutMs = 3000): Promise<number> {
  return win.evaluate(
    ({ settledGap, limit }) => {
      return new Promise<number>((resolve) => {
        const started = performance.now()
        const check = () => {
          const screen = document.querySelector('.xterm-screen') as HTMLElement | null
          const pane = document.querySelector('.main-split-container > .splitpanes__pane') as HTMLElement | null
          if (!screen || !pane) return resolve(-1)
          const diff = Math.abs(pane.getBoundingClientRect().width - screen.getBoundingClientRect().width)
          if (diff <= settledGap + 12) return resolve(Number((performance.now() - started).toFixed(1)))
          if (performance.now() - started > limit) return resolve(-1)
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      })
    },
    { settledGap: settledGapPx, limit: timeoutMs }
  )
}

/** The splitter between the left sidebar and everything right of it. */
async function findLeftSplitter(): Promise<{ x: number; y: number } | null> {
  return win.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('.left-sidebar-container'))
    for (const container of containers) {
      const splitter = Array.from(container.children).find((el) => el.classList.contains('splitpanes__splitter'))
      if (!splitter) continue
      const rect = splitter.getBoundingClientRect()
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      if (document.elementFromPoint(cx, cy) === splitter) return { x: cx, y: cy }
    }
    return null
  })
}

/** Drag a splitter `direction * DRAG_STEPS * DRAG_STEP_PX` px and release there. */
async function dragSplitter(origin: { x: number; y: number }, direction: 1 | -1): Promise<void> {
  const maxOffset = DRAG_STEPS * DRAG_STEP_PX
  await win.mouse.move(origin.x, origin.y)
  await win.mouse.down()
  for (let i = 0; i <= DRAG_STEPS; i++) {
    await win.mouse.move(origin.x + direction * i * DRAG_STEP_PX, origin.y)
    await win.waitForTimeout(DRAG_STEP_DELAY_MS)
  }
  await win.mouse.up()
}

/** Widen the AI sidebar, i.e. shrink the terminal pane, and release at the end. */
async function dragAiSplitter(origin: { x: number; y: number }): Promise<void> {
  await dragSplitter(origin, -1)
}

/**
 * Narrow the AI sidebar, i.e. widen the terminal pane. Worth measuring
 * separately: widening un-wraps buffered lines, which is the costlier reflow
 * direction in xterm.
 */
async function dragAiSplitterExpand(origin: { x: number; y: number }): Promise<void> {
  await dragSplitter(origin, +1)
}

/**
 * Hold the drag halfway and capture what the user actually sees at that moment,
 * plus how the xterm canvas relates to the pane it should be filling.
 */
async function captureMidDrag(origin: { x: number; y: number }, file: string): Promise<Record<string, unknown>> {
  await win.mouse.move(origin.x, origin.y)
  await win.mouse.down()
  for (let i = 0; i <= DRAG_STEPS / 2; i++) {
    await win.mouse.move(origin.x - i * DRAG_STEP_PX, origin.y)
    await win.waitForTimeout(DRAG_STEP_DELAY_MS)
  }

  const state = await win.evaluate(() => {
    const pane = document.querySelector('.main-split-container > .splitpanes__pane') as HTMLElement | null
    const screen = document.querySelector('.xterm-screen') as HTMLElement | null
    const canvas = document.querySelector('.xterm-screen canvas') as HTMLCanvasElement | null
    const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
    const px = (el: Element | null) => (el ? Number(el.getBoundingClientRect().width.toFixed(1)) : -1)
    return {
      paneWidth: px(pane),
      screenWidth: px(screen),
      canvasCssWidth: px(canvas),
      canvasBackingWidth: canvas ? canvas.width : -1,
      viewportWidth: px(viewport),
      // DOM renderer vs canvas/webgl changes how expensive a resize is.
      renderer: document.querySelector('.xterm-screen canvas') ? 'canvas' : 'dom',
      renderedRows: document.querySelectorAll('.xterm-rows > div').length,
      domNodesInTerminal: document.querySelectorAll('.xterm-rows *').length,
      // Empty strip between the terminal grid and the splitter.
      unpaintedStripPx: Number((px(pane) - px(screen)).toFixed(1))
    }
  })

  await win.screenshot({ path: file })
  await win.mouse.up()
  await win.waitForTimeout(600)
  return state
}

function report(label: string, stats: FrameStats): void {
  console.log(`\n===== ${label} =====`)
  console.log(`duration        : ${stats.durationMs} ms`)
  console.log(`frames          : ${stats.frames}  (avg ${stats.fps} fps)`)
  console.log(`frame p50 / p95 : ${stats.p50} / ${stats.p95} ms`)
  console.log(`frame max       : ${stats.max} ms`)
  console.log(`frames >33ms    : ${stats.over33} (${((stats.over33 / Math.max(1, stats.frames)) * 100).toFixed(1)}%)`)
  console.log(`frames >50ms    : ${stats.over50}`)
  console.log(`frames >100ms   : ${stats.over100}`)
  console.log(`long tasks      : ${stats.longTasks} (total ${stats.longTaskTotalMs} ms, max ${stats.longTaskMaxMs} ms)`)
  console.log(`pane width      : ${stats.paneWidthCount} distinct, ${stats.paneWidthChanges} changes`)
  console.log(`term width      : ${stats.termWidthCount} distinct, ${stats.termWidthChanges} changes`)
  console.log(`pane-vs-term gap: mean ${stats.meanDivergence} px, max ${stats.maxDivergence} px`)
  console.log(`viewport scroll : ${stats.scrollJumps} jumps`)
  console.log(`timeline (t: pane -> term):`)
  console.log(stats.timeline.map((s) => `  ${s.t}ms: ${s.pane} -> ${s.term}`).join('\n'))
}

test.describe('AI sidebar drag performance', () => {
  test.beforeAll(async () => {
    await launchApp()
  })

  test.afterAll(async () => {
    await app?.close()
  })

  test('measures terminal frame health while dragging the AI sidebar splitter', async () => {
    test.setTimeout(180000)

    const hasTerminal = await openLocalTerminal()
    test.skip(!hasTerminal, 'could not open a local shell terminal in this environment')

    await fillWrappedScrollback(2000)

    const wrap = await measureWrapping()
    console.log('buffer wrapping:', JSON.stringify(wrap))
    expect(wrap.maxLen, 'terminal should hold long wrapped lines').toBeGreaterThan(60)

    const sidebarOpen = await ensureAiSidebarOpen()
    expect(sidebarOpen, 'AI sidebar should be open').toBe(true)

    const splitter = await findAiSplitter()
    expect(splitter, 'AI splitter should be hit-testable').not.toBeNull()

    const preState = await win.evaluate(() => {
      const screen = document.querySelector('.xterm-screen') as HTMLElement | null
      const rows = document.querySelector('.xterm-rows')
      const panes = Array.from(document.querySelectorAll('.main-split-container > .splitpanes__pane')).map((p) =>
        Number(p.getBoundingClientRect().width.toFixed(1))
      )
      return {
        screenCount: document.querySelectorAll('.xterm-screen').length,
        screenWidth: screen ? Number(screen.getBoundingClientRect().width.toFixed(1)) : -1,
        rowCount: rows ? rows.childElementCount : -1,
        firstRowCols: rows?.firstElementChild ? rows.firstElementChild.childElementCount : -1,
        rowsText: rows ? (rows.textContent || '').trim().slice(0, 40) : '',
        mainPaneWidths: panes,
        splitterCount: document.querySelectorAll('.main-split-container > .splitpanes__splitter').length
      }
    })

    console.log('pre-drag state:', JSON.stringify(preState))

    // Idle baseline: same sampler, no drag. Establishes the floor for comparison.
    await startSampling()
    await win.waitForTimeout(2000)
    const idle = await stopSampling()
    report('IDLE baseline (no drag)', idle)

    // Shrink the terminal pane (AI sidebar grows).
    await startSampling()
    await dragAiSplitter(splitter!)
    const catchUpMs = await measureCatchUp(idle.maxDivergence)
    const drag = await stopSampling()
    report('DRAG right AI splitter - shrink terminal', drag)

    console.log(`catch-up after mouseup : ${catchUpMs} ms  (-1 = never within timeout)`)
    console.log('wrapping after shrink:', JSON.stringify(await measureWrapping()))

    await win.waitForTimeout(1500)

    // Widen the terminal pane back (AI sidebar shrinks). Un-wrapping buffered
    // lines is the more expensive reflow direction.
    const splitterAfter = await findAiSplitter()
    if (splitterAfter) {
      await startSampling()
      await dragAiSplitterExpand(splitterAfter)
      const expandCatchUp = await measureCatchUp(idle.maxDivergence)
      const expandDrag = await stopSampling()
      report('DRAG right AI splitter - widen terminal', expandDrag)

      console.log(`catch-up after mouseup : ${expandCatchUp} ms`)
    }

    await win.waitForTimeout(1500)

    // Same drag again, now with a loaded AI panel. Dragging the right splitter
    // changes the AI sidebar width, so all of this content rewraps per frame.
    const injected = await injectChatContent(2000)
    console.log('injected chat pairs:', injected)
    console.log('chat content:', JSON.stringify(await measureChatContent()))
    await resetToWideTerminal()

    // Without containment: shows what the panel would cost unprotected.
    const splitterNoContain = await findAiSplitter()
    if (splitterNoContain) {
      await startSampling()
      await dragAiSplitter(splitterNoContain)
      const noContainCatchUp = await measureCatchUp(idle.maxDivergence)
      const noContainDrag = await stopSampling()
      report('DRAG right splitter - loaded panel, NO containment (synthetic)', noContainDrag)
      console.log(`catch-up after mouseup : ${noContainCatchUp} ms`)
    }

    // With the containment the real app applies: the fair comparison.
    const contained = await applyPairContainment()
    console.log('pairs given app containment:', contained)
    await resetToWideTerminal()

    const splitterContained = await findAiSplitter()
    if (splitterContained) {
      await startSampling()
      await dragAiSplitter(splitterContained)
      const containedCatchUp = await measureCatchUp(idle.maxDivergence)
      const containedDrag = await stopSampling()
      report('DRAG right splitter - loaded panel, app containment (synthetic)', containedDrag)
      console.log(`catch-up after mouseup : ${containedCatchUp} ms`)
      console.log('chat content after drag:', JSON.stringify(await measureChatContent()))
    }

    await win.waitForTimeout(1500)

    // Visual evidence of the gap, held open mid-drag.
    const splitterForShot = await findAiSplitter()
    if (splitterForShot) {
      const midDrag = await captureMidDrag(splitterForShot, 'tests/test-results/ai-drag-mid.png')
      console.log('mid-drag geometry:', JSON.stringify(midDrag))
    }

    await win.waitForTimeout(1500)

    // Control: the left splitter resizes the same terminal pane but keeps the AI
    // sidebar at a fixed pixel width, so its content does not reflow.
    const leftSplitter = await findLeftSplitter()
    if (leftSplitter) {
      await startSampling()
      await dragSplitter(leftSplitter, +1)
      const leftCatchUp = await measureCatchUp(idle.maxDivergence)
      const leftDrag = await stopSampling()
      report('DRAG left splitter - loaded AI panel (control)', leftDrag)

      console.log(`catch-up after mouseup : ${leftCatchUp} ms`)
    }

    // Regression guards. Thresholds sit well clear of both the measured
    // post-fix values and the pre-fix baseline, so they catch a return of the
    // trailing-only debounce without tripping on run-to-run noise.
    //
    //                         pre-fix      post-fix
    //   term width changes    1            12-13
    //   pane-vs-term max      158-228 px   34-53 px
    //   catch-up              113-127 ms   3-11 ms
    expect(drag.frames, 'sampler should have collected frames').toBeGreaterThan(20)
    expect(drag.termWidthChanges, 'terminal grid should track the drag, not snap after mouseup').toBeGreaterThan(5)
    expect(drag.maxDivergence, 'terminal should stay close to its pane while dragging').toBeLessThan(80)
    expect(catchUpMs, 'terminal should already fit when the drag ends').toBeLessThan(40)
  })
})
