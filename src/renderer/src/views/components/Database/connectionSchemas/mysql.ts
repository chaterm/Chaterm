import type { DbConnectionSchema } from './index'

export const mysqlConnectionSchema: DbConnectionSchema = {
  dbType: 'MySQL',
  defaultPort: 3306,
  fields: [
    { key: 'name', kind: 'text', labelKey: 'database.fields.name', required: true },
    { key: 'host', kind: 'text', labelKey: 'database.fields.host', required: true },
    { key: 'port', kind: 'number', labelKey: 'database.fields.port', required: true },
    { key: 'user', kind: 'text', labelKey: 'database.fields.user', required: true },
    { key: 'password', kind: 'password', labelKey: 'database.fields.password' },
    { key: 'database', kind: 'text', labelKey: 'database.fields.database' },
    { key: 'url', kind: 'text', labelKey: 'database.fields.url' }
  ]
}
