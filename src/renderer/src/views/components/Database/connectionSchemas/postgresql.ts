import type { DbConnectionSchema } from './index'

// PostgreSQL's libpq sslmode spectrum. "prefer" is the libpq default; we
// expose the chat2db-style subset relevant to our MVP driver path.
export const POSTGRES_SSL_MODES = ['disable', 'require', 'verify-ca', 'verify-full'] as const

export const postgresqlConnectionSchema: DbConnectionSchema = {
  dbType: 'PostgreSQL',
  defaultPort: 5432,
  fields: [
    { key: 'name', kind: 'text', labelKey: 'database.fields.name', required: true },
    { key: 'host', kind: 'text', labelKey: 'database.fields.host', required: true },
    { key: 'port', kind: 'number', labelKey: 'database.fields.port', required: true },
    { key: 'user', kind: 'text', labelKey: 'database.fields.user', required: true },
    { key: 'password', kind: 'password', labelKey: 'database.fields.password' },
    { key: 'database', kind: 'text', labelKey: 'database.fields.database' },
    {
      key: 'sslMode',
      kind: 'select',
      labelKey: 'database.fields.sslMode',
      options: POSTGRES_SSL_MODES.map((m) => ({ value: m, label: m }))
    },
    { key: 'url', kind: 'text', labelKey: 'database.fields.url' }
  ]
}
