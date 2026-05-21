import type { DbConnectionSchema } from './index'

export const oracleConnectionSchema: DbConnectionSchema = {
  dbType: 'Oracle',
  defaultPort: 1521,
  fields: [
    { key: 'name', kind: 'text', labelKey: 'database.fields.name', required: true },
    { key: 'host', kind: 'text', labelKey: 'database.fields.host' },
    { key: 'port', kind: 'number', labelKey: 'database.fields.port' },
    { key: 'user', kind: 'text', labelKey: 'database.fields.user', required: true },
    { key: 'password', kind: 'password', labelKey: 'database.fields.password' },
    { key: 'database', kind: 'text', labelKey: 'database.fields.oracleService' },
    { key: 'url', kind: 'text', labelKey: 'database.fields.oracleConnectString' }
  ]
}
