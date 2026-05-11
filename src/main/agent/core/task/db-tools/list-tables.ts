// list_tables: enumerate tables in a (database, schema) scope.

import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError } from './shared'

export interface ListTablesInput {
  database: string
  schema?: string
}

export interface ListTablesResult {
  tables: string[]
}

export async function runListTables(session: DbAiActiveSession, input: ListTablesInput): Promise<DbToolResult<ListTablesResult>> {
  const db = requireStringParam(input.database, 'database')
  if (!db.ok) return db
  const sc = optionalStringParam(input.schema, 'schema')
  if (!sc.ok) return sc
  try {
    // When the engine has a schema layer (PG) and the caller supplied one,
    // validate schema membership via hasSchema (internal first-miss refresh).
    if (sc.value) {
      const knownSchemas = await session.listSchemas(db.value)
      if (knownSchemas.length > 0 && !(await session.hasSchema(db.value, sc.value))) {
        return { ok: false, errorCode: 'E_UNKNOWN_SCHEMA', errorMessage: 'Schema does not exist.' }
      }
    }
    const tables = await session.listTables(db.value, sc.value)
    return { ok: true, data: { tables } }
  } catch (error) {
    return unexpectedError(error)
  }
}
