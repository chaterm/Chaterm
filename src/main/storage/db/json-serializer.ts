/**
 * Safe JSON serialization utility
 * Uses superjson to handle special types: Date, undefined, NaN, Infinity, circular references, RegExp, Set, Map, BigInt, etc.
 */

interface SerializationOptions {
  /** Whether strict mode (throws error when encountering non-serializable values) */
  strict?: boolean
}

interface SerializationResult {
  success: boolean
  data?: string
  error?: string
}

// Lazy load superjson (use dynamic import to solve ESM/CommonJS compatibility issues)
let superjsonInstance: any = null

async function getSuperjson() {
  if (!superjsonInstance) {
    // Dynamically import ESM module
    const module = await import('superjson')
    superjsonInstance = module.default || module
  }
  return superjsonInstance
}

/**
 * Safe serialization
 *
 * Supported special types:
 * - Date objects
 * - undefined, NaN, Infinity, -Infinity
 * - RegExp regular expressions
 * - Set, Map collections
 * - BigInt large integers
 * - TypedArray (Uint8Array, etc.)
 * - Error objects
 * - Circular references
 *
 * @param value Value to serialize
 * @param options Serialization options
 * @returns Serialization result
 */
export async function safeStringify(value: any, options: SerializationOptions = {}): Promise<SerializationResult> {
  const { strict = false } = options

  try {
    const superjson = await getSuperjson()
    const data = superjson.stringify(value)
    return { success: true, data }
  } catch (error: any) {
    if (strict) {
      throw error
    }
    return {
      success: false,
      error: error.message || 'JSON serialization failed'
    }
  }
}

/**
 * Safe deserialization
 *
 * Automatically restores special types:
 * - Date objects
 * - undefined, NaN, Infinity, -Infinity
 * - RegExp regular expressions
 * - Set, Map collections
 * - BigInt large integers
 * - TypedArray (Uint8Array, etc.)
 * - Error objects
 * - Circular references
 *
 * @param jsonString JSON string
 * @returns Deserialized object, returns null on failure
 */
export async function safeParse<T = any>(jsonString: string): Promise<T | null> {
  try {
    const superjson = await getSuperjson()
    return superjson.parse(jsonString) as T
  } catch (error) {
    console.error('JSON parse failed:', error)
    return null
  }
}
