function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.prototype.toString.call(value) === '[object Object]'
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }

  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key])
    }
    return sorted
  }

  return value
}

/**
 * Deterministic JSON serialization for sync payload/hash comparison.
 * Recursively sorts object keys while preserving array order.
 */
export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}
