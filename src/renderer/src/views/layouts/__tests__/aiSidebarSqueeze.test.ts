import { describe, it, expect } from 'vitest'
import { getSqueezedLeftSidebarWidthPx } from '../aiSidebarSqueeze'

// 1000px container starting at x=40, main terminal min-size 30%, drag floor 120px.
// The sidebar reaches 120px at pointer x = 40 + 120 + 0.3 * 880 = 424
const base = { containerLeft: 40, containerWidth: 1000, mainMinSizePercent: 30, leftMinWidthPx: 120, resistancePx: 60 }

describe('getSqueezedLeftSidebarWidthPx', () => {
  it('leaves the left sidebar alone while the main pane can still shrink', () => {
    // Main pane min edge sits at 40 + 250 + 0.3 * 750 = 515
    expect(getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 250, pointerX: 600 })).toBeNull()
  })

  it('shrinks the left sidebar so the splitter stays under the pointer', () => {
    const width = getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 250, pointerX: 480 })
    expect(width).toBeCloseTo(200)
    // Splitter lands at left edge + sidebar + main min-size share of the rest
    expect(40 + width! + 0.3 * (1000 - width!)).toBeCloseTo(480)
  })

  it('holds the left sidebar at its min width within the resistance zone', () => {
    expect(getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 250, pointerX: 420 })).toBe(120)
    expect(getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 120, pointerX: 365 })).toBe(120)
  })

  it('collapses the left sidebar once the pointer passes the resistance zone', () => {
    expect(getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 120, pointerX: 363 })).toBe(0)
  })

  it('does nothing when the left sidebar is already closed', () => {
    expect(getSqueezedLeftSidebarWidthPx({ ...base, leftWidthPx: 0, pointerX: 100 })).toBeNull()
  })
})
