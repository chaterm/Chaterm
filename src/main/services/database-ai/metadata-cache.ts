// Per-session metadata cache for DB-AI tools. See docs/database_ai.md §9.6.1.
//
// Responsibilities:
//   - Three-layer cache (schemas / tables / columns) keyed by scope
//   - TTL-based freshness check (default 30s, configurable 0 – 300s)
//   - Inflight-promise deduplication so concurrent callers share one fetch
//   - Session-scoped lifetime: dropped when the owning session closes
//   - First-miss re-fetch policy is delegated to the caller (exposes
//     `opts.refresh = true` so a tool can retry after a failed membership
//     check without having to reach into cache internals)
//
// Logging invariants (§10.3): we only record `cacheHit`, a `cacheKey` hash
// and `freshnessMs`. Schema / database / table names never enter logs.

import { createHash } from 'crypto'

const logger = createLogger('db-ai')

/**
 * Minimum and maximum TTL values allowed by the config. `0` is a valid
 * opt-out (every call misses and hits the driver). 300_000 = 5 minutes.
 */
export const TTL_MIN_MS = 0
export const TTL_MAX_MS = 300_000
/** Default TTL when the caller does not supply a config value. */
export const TTL_DEFAULT_MS = 30_000

/** Clamp an incoming TTL value into the accepted range. */
export function normalizeTtlMs(ttl: number | undefined): number {
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) return TTL_DEFAULT_MS
  if (ttl < TTL_MIN_MS) return TTL_MIN_MS
  if (ttl > TTL_MAX_MS) return TTL_MAX_MS
  return Math.floor(ttl)
}

interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

/**
 * A single cache slot. Tracks both the resolved data and a potentially
 * in-flight fetch promise so that concurrent readers share a single
 * driver round trip. The invariant is:
 *   - `entry !== null` ⇒ data is available (possibly stale)
 *   - `inflight !== null` ⇒ a fetch is in progress; wait on this promise
 * Both may be set at once (a refresh that preempts a stale entry); callers
 * consult `inflight` first when `refresh: true`, otherwise consult `entry`.
 */
interface Slot<T> {
  entry: CacheEntry<T> | null
  inflight: Promise<T> | null
}

function makeSlot<T>(): Slot<T> {
  return { entry: null, inflight: null }
}

/** Stable short hash used for cache-key log fields. SHA-1 is cheap and not used for security. */
function hashKey(key: string): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 10)
}

/**
 * Per-session metadata cache. Instantiated by `buildSession()` and closed
 * over by each of the `list*` methods on `DbAiActiveSession`. The TTL is
 * captured at construction time because the runtime config source lives
 * outside this module (injected via the factory).
 */
export class DbAiMetadataCache {
  private readonly ttlMs: number

  // databases slot. Keyed by a dummy string because there is exactly one
  // "list all databases" answer per session.
  private databases: Slot<string[]> = makeSlot<string[]>()
  // schemas is keyed by database name only. MySQL returns [] (no schema
  // layer) so the slot is still useful for consistency.
  private readonly schemas = new Map<string, Slot<string[]>>()
  // tables keyed by `${database}::${schema ?? ''}`
  private readonly tables = new Map<string, Slot<string[]>>()
  // columns keyed by `${database}::${schema ?? ''}::${table}`
  private readonly columns = new Map<string, Slot<ColumnInfoCacheValue[]>>()

  constructor(ttlMs: number) {
    this.ttlMs = normalizeTtlMs(ttlMs)
  }

  schemaKey(database: string): string {
    return database
  }

  tableKey(database: string, schema?: string): string {
    return `${database}::${schema ?? ''}`
  }

  columnKey(database: string, table: string, schema?: string): string {
    return `${database}::${schema ?? ''}::${table}`
  }

  /** Single-instance slot for the `listDatabases()` response. */
  getDatabases(): Slot<string[]> {
    return this.databases
  }

  getSchemas(key: string): Slot<string[]> {
    let slot = this.schemas.get(key)
    if (!slot) {
      slot = makeSlot<string[]>()
      this.schemas.set(key, slot)
    }
    return slot
  }

  getTables(key: string): Slot<string[]> {
    let slot = this.tables.get(key)
    if (!slot) {
      slot = makeSlot<string[]>()
      this.tables.set(key, slot)
    }
    return slot
  }

  getColumns(key: string): Slot<ColumnInfoCacheValue[]> {
    let slot = this.columns.get(key)
    if (!slot) {
      slot = makeSlot<ColumnInfoCacheValue[]>()
      this.columns.set(key, slot)
    }
    return slot
  }

  /** Drop all entries. Called on session close and on `/db-refresh`. */
  invalidateAll(): void {
    this.databases = makeSlot<string[]>()
    this.schemas.clear()
    this.tables.clear()
    this.columns.clear()
  }

  /**
   * Run a cached fetch. Behaviour:
   *   - `refresh: true` ⇒ bypass `entry`; if an inflight fetch exists, wait
   *     on it; otherwise start a new one.
   *   - fresh entry (age < ttl) ⇒ return it, `cacheHit: true`.
   *   - stale entry ⇒ start a new fetch (or wait on the inflight one), then
   *     update the entry.
   *   - ttl = 0 ⇒ always miss, but still dedupe inflight fetches.
   *
   * The caller supplies the `slot` and a `fetcher` because the three cache
   * tiers have different value types (hence a free-function form rather
   * than a method).
   */
  async run<T>(slot: Slot<T>, cacheKey: string, refresh: boolean, event: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const fresh = slot.entry && now - slot.entry.fetchedAt < this.ttlMs
    if (!refresh && fresh && slot.entry) {
      logger.debug('db-ai metadata cache hit', {
        event,
        cacheHit: true,
        cacheKey: hashKey(cacheKey),
        freshnessMs: now - slot.entry.fetchedAt
      })
      return slot.entry.data
    }
    if (slot.inflight) {
      // Coalesce concurrent callers onto the same fetch — the doc's
      // "avoid 10 tools each running listTables" case.
      logger.debug('db-ai metadata cache join-inflight', {
        event,
        cacheHit: false,
        cacheKey: hashKey(cacheKey),
        freshnessMs: null
      })
      return slot.inflight
    }
    const p = (async (): Promise<T> => {
      try {
        const data = await fetcher()
        slot.entry = { data, fetchedAt: Date.now() }
        return data
      } finally {
        slot.inflight = null
      }
    })()
    slot.inflight = p
    logger.debug('db-ai metadata cache miss', {
      event,
      cacheHit: false,
      cacheKey: hashKey(cacheKey),
      freshnessMs: null
    })
    return p
  }
}

/** Cache value for columns. Matches `ColumnInfo` from `./types.ts`. */
export interface ColumnInfoCacheValue {
  name: string
  type?: string
  nullable?: boolean
  comment?: string
}

/** Test-only surface. */
export const __testing = { hashKey }
