// Schema-driven configuration for the "new database connection" modal.
// Every supported DBMS declares its default port, visible fields, and any
// discrete option lists so the single DatabaseConnectionModal component can
// render the right form without branching per dbType.

import type { DatabaseType } from '../types'
import { mysqlConnectionSchema } from './mysql'
import { postgresqlConnectionSchema } from './postgresql'

export type ConnectionFieldKind = 'text' | 'password' | 'number' | 'select'

export interface ConnectionSelectOption {
  value: string
  label: string
}

export interface ConnectionField {
  // Draft property this field writes to.
  key: 'name' | 'host' | 'port' | 'user' | 'password' | 'database' | 'url' | 'sslMode'
  kind: ConnectionFieldKind
  // i18n key for the field label (resolved by the modal via $t()).
  labelKey: string
  required?: boolean
  // For select fields only.
  options?: ConnectionSelectOption[]
}

export interface DbConnectionSchema {
  dbType: DatabaseType
  defaultPort: number
  // Fields rendered in the modal body (order matters).
  fields: ConnectionField[]
}

const SCHEMAS: Partial<Record<DatabaseType, DbConnectionSchema>> = {
  MySQL: mysqlConnectionSchema,
  PostgreSQL: postgresqlConnectionSchema
}

export function getConnectionSchema(dbType: DatabaseType): DbConnectionSchema | null {
  return SCHEMAS[dbType] ?? null
}
