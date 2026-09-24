/** The fallback chain Chaterm shipped before the font became configurable. */
const FALLBACK_FAMILIES = ['Menlo', 'Monaco', 'Courier New', 'Consolas', 'Courier']

const cssQuote = (family: string): string =>
  /^[A-Za-z][A-Za-z0-9-]*$/.test(family) ? family : `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const buildStack = (families: string[]): string => [...families.map(cssQuote), 'monospace'].join(', ')

/** The stack to use when the user has expressed no font preference. */
export const DEFAULT_TERMINAL_FONT_STACK = buildStack(FALLBACK_FAMILIES)

/**
 * Turn a stored font setting into a CSS font-family list.
 *
 * - blank/invalid -> the default stack
 * - bare name -> that family first, then the fallback chain
 */
export const resolveTerminalFontFamily = (fontFamily: unknown): string => {
  const raw = typeof fontFamily === 'string' ? fontFamily.trim() : ''
  if (!raw) return DEFAULT_TERMINAL_FONT_STACK

  if (raw.includes(',')) {
    const families = raw
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/^["']|["']$/g, '')
          .trim()
      )
      .filter(Boolean)
    if (!families.length) return DEFAULT_TERMINAL_FONT_STACK

    const stack = families.map(cssQuote).join(', ')
    const hasGeneric = /(^|,)\s*(monospace|ui-monospace)\s*$/i.test(stack)
    return hasGeneric ? stack : `${stack}, monospace`
  }

  const primary = raw.replace(/^["']|["']$/g, '').trim()
  if (!primary) return DEFAULT_TERMINAL_FONT_STACK

  const rest = FALLBACK_FAMILIES.filter((family) => family.toLowerCase() !== primary.toLowerCase())
  return buildStack([primary, ...rest])
}
