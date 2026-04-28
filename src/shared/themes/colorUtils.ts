// src/shared/themes/colorUtils.ts
//
// Pure color math used by preset derivation. No DOM / no framework deps.

export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to2 = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Mix two hex colors by ratio of b into a (0 = pure a, 1 = pure b)
export function mix(a: string, b: string, ratio: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex({
    r: A.r * (1 - ratio) + B.r * ratio,
    g: A.g * (1 - ratio) + B.g * ratio,
    b: A.b * (1 - ratio) + B.b * ratio
  })
}

// Lighten/darken by blending toward white or black.
export function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount)
}
export function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount)
}
