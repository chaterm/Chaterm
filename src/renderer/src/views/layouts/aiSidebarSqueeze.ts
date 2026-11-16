export interface LeftSidebarSqueezeInput {
  /** Pointer x while dragging the AI sidebar splitter */
  pointerX: number
  /** Left edge of the left sidebar container */
  containerLeft: number
  /** Width of the left sidebar container (left sidebar + main split area) */
  containerWidth: number
  /** Current left sidebar width in px */
  leftWidthPx: number
  /** Main terminal pane min-size, as a percentage of the main split area */
  mainMinSizePercent: number
  /** Narrowest width the left sidebar can render at while open */
  leftMinWidthPx: number
  /** Extra pointer travel past the min-width point before the sidebar collapses */
  resistancePx: number
}

/**
 * Width the left sidebar must shrink to so the AI sidebar splitter can follow the pointer
 * once the main terminal pane has reached its min-size.
 *
 * Returns null when no squeeze is needed, 0 when the sidebar has to collapse, otherwise the
 * new width in px. The main pane keeps its min-size percentage of the main split area, so
 * solving mainMin * (W - L) = pointerX - containerLeft - L for L gives the widest left
 * sidebar that still lets the splitter sit under the pointer.
 *
 * Like VS Code's sash snapping, the sidebar holds at its min width while the pointer moves
 * on, and only collapses once the pointer is resistancePx past the point where it hit the
 * min width. During that stretch the splitter stops, which tells the user it is as narrow
 * as it gets.
 */
export const getSqueezedLeftSidebarWidthPx = (input: LeftSidebarSqueezeInput): number | null => {
  const { pointerX, containerLeft, containerWidth, leftWidthPx, mainMinSizePercent, leftMinWidthPx, resistancePx } = input
  if (leftWidthPx <= 0 || containerWidth <= 0) return null

  const mainMinRatio = mainMinSizePercent / 100
  const maxLeftWidthPx = (pointerX - containerLeft - mainMinRatio * containerWidth) / (1 - mainMinRatio)
  if (maxLeftWidthPx >= leftWidthPx) return null
  if (maxLeftWidthPx >= leftMinWidthPx) return maxLeftWidthPx

  // Pointer x at which the left sidebar reaches its min width
  const minWidthPointerX = containerLeft + leftMinWidthPx + mainMinRatio * (containerWidth - leftMinWidthPx)
  return pointerX < minWidthPointerX - resistancePx ? 0 : leftMinWidthPx
}
