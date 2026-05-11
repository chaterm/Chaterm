// list_schemas: enumerate schemas within a database. PostgreSQL-only in
// practice. MySQL has no schema layer and returns []; the tool notes that
// explicitly so the model does not re-ask for schemas in a loop.

import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError } from './shared'

export interface ListSchemasInput {
  database?: string
}

export interface ListSchemasResult {
  schemas: string[]
  /** Message hint for the model; non-empty when the engine has no schema layer. */
  note?: string
}

export async function runListSchemas(session: DbAiActiveSession, input: ListSchemasInput): Promise<DbToolResult<ListSchemasResult>> {
  // `database` is optional when the session already carries `databaseName`.
  let database: string | undefined = input.database
  if (database === undefined) {
    const fromSession = session.databaseName
    if (!fromSession) {
      const required = requireStringParam(input.database, 'database')
      if (!required.ok) return required
      database = required.value
    } else {
      database = fromSession
    }
  } else {
    const validated = optionalStringParam(input.database, 'database')
    if (!validated.ok) return validated
    database = validated.value ?? session.databaseName
  }
  if (!database) {
    return { ok: false, errorCode: 'E_MISSING_PARAM', errorMessage: 'Missing required parameter: database.' }
  }
  try {
    const schemas = await session.listSchemas(database)
    if (schemas.length === 0 && session.dbType === 'mysql') {
      return {
        ok: true,
        data: {
          schemas: [],
          note: 'MySQL has no schema layer; use list_tables directly with the database name.'
        }
      }
    }
    return { ok: true, data: { schemas } }
  } catch (error) {
    return unexpectedError(error)
  }
}
