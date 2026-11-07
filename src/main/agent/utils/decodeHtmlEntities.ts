const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

export const decodeHtmlEntities = (value: string): string => {
  if (!value.includes('&')) return value
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);?/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16)
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10)
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    }
    const mapped = HTML_ENTITY_MAP[entity]
    return mapped !== undefined ? mapped : match
  })
}
