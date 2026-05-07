// list_databases: enumerate database names visible to the current session.
// Drivers without `listDatabases` support (e.g. some managed services)
// return `[]`; callers should handle that by surfacing a UI hint rather
// than treating it as an error.

import type { DbAiActiveSession, DbToolResult } from './shared'
import { unexpectedError } from './shared'

export interface ListDatabasesResult {
  databases: string[]
}

/** Run the list_databases tool. Takes no parameters. */
export async function runListDatabases(session: DbAiActiveSession): Promise<DbToolResult<ListDatabasesResult>> {
  try {
    const databases = await session.listDatabases()
    return { ok: true, data: { databases } }
  } catch (error) {
    return unexpectedError(error)
  }
}
