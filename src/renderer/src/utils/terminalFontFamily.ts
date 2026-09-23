/** The fallback chain Chaterm shipped before the font became configurable. */
const FALLBACK_FAMILIES = ['Menlo', 'Monaco', 'Courier New', 'Consolas', 'Courier']

/** Quote families whose names would otherwise break the CSS font-family list. */
const cssQuote = (family: string): string => (/^[A-Za-z][A-Za-z0-9-]*$/.test(family) ? family : `"${family.replace(/"/g, '\\"')}"`)

const buildStack = (families: string[]): string => [...families.map(cssQuote), 'monospace'].join(', ')

/** The stack to use when the user has expressed no font preference. */
export const DEFAULT_TERMINAL_FONT_STACK = buildStack(FALLBACK_FAMILIES)

/**
 * Turn a stored font setting into a CSS font-family list.
 *
 * - blank/invalid -> the default stack
 * - already a list (legacy stored values contain a comma) -> passed through,
 *   with `monospace` appended if it is missing
 * - bare name -> that family first, then the fallback chain
 */
export const resolveTerminalFontFamily = (fontFamily: unknown): string => {
  const raw = typeof fontFamily === 'string' ? fontFamily.trim() : ''
  if (!raw) return DEFAULT_TERMINAL_FONT_STACK

  if (raw.includes(',')) {
    const hasGeneric = /(^|,)\s*(monospace|ui-monospace)\s*$/i.test(raw)
    return hasGeneric ? raw : `${raw}, monospace`
  }

  const primary = raw.replace(/^["']|["']$/g, '').trim()
  if (!primary) return DEFAULT_TERMINAL_FONT_STACK

  const rest = FALLBACK_FAMILIES.filter((family) => family.toLowerCase() !== primary.toLowerCase())
  return buildStack([primary, ...rest])
}
