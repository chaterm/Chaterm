// Database type options shown in the sidebar "new connection" dropdown.
// Order is aligned with chat2db's databaseMap for consistency.
//
// Only enabled entries are actionable today; the remaining items are shown
// as disabled placeholders until their drivers land.

import type { DatabaseType } from '../types'

import mysqlIcon from '../assets/db-icons/mysql.svg'
import h2Icon from '../assets/db-icons/h2.svg'
import oracleIcon from '../assets/db-icons/oracle.svg'
import postgresqlIcon from '../assets/db-icons/postgresql.svg'
import sqlserverIcon from '../assets/db-icons/sqlserver.svg'
import sqliteIcon from '../assets/db-icons/sqlite.svg'
import mariadbIcon from '../assets/db-icons/mariadb.svg'
import clickhouseIcon from '../assets/db-icons/clickhouse.svg'
import dmIcon from '../assets/db-icons/dm.svg'
import prestoIcon from '../assets/db-icons/presto.svg'
import db2Icon from '../assets/db-icons/db2.svg'
import oceanbaseIcon from '../assets/db-icons/oceanbase.svg'
import hiveIcon from '../assets/db-icons/hive.svg'
import kingbaseIcon from '../assets/db-icons/kingbase.svg'
import mongodbIcon from '../assets/db-icons/mongodb.svg'
import timeplusIcon from '../assets/db-icons/timeplus.svg'

export interface DatabaseTypeOption {
  code: DatabaseType
  name: string
  iconUrl: string
  enabled: boolean
}

export const DATABASE_TYPE_OPTIONS: readonly DatabaseTypeOption[] = [
  { code: 'MySQL', name: 'MySQL', iconUrl: mysqlIcon, enabled: true },
  { code: 'H2', name: 'H2', iconUrl: h2Icon, enabled: false },
  { code: 'Oracle', name: 'Oracle', iconUrl: oracleIcon, enabled: false },
  { code: 'PostgreSQL', name: 'PostgreSQL', iconUrl: postgresqlIcon, enabled: true },
  { code: 'SQLServer', name: 'SQLServer', iconUrl: sqlserverIcon, enabled: false },
  { code: 'SQLite', name: 'SQLite', iconUrl: sqliteIcon, enabled: false },
  { code: 'MariaDB', name: 'MariaDB', iconUrl: mariadbIcon, enabled: false },
  { code: 'ClickHouse', name: 'ClickHouse', iconUrl: clickhouseIcon, enabled: false },
  { code: 'DM', name: 'DM', iconUrl: dmIcon, enabled: false },
  { code: 'Presto', name: 'Presto', iconUrl: prestoIcon, enabled: false },
  { code: 'DB2', name: 'DB2', iconUrl: db2Icon, enabled: false },
  { code: 'OceanBase', name: 'OceanBase', iconUrl: oceanbaseIcon, enabled: false },
  { code: 'Hive', name: 'Hive', iconUrl: hiveIcon, enabled: false },
  { code: 'KingBase', name: 'KingBase', iconUrl: kingbaseIcon, enabled: false },
  { code: 'MongoDB', name: 'MongoDB', iconUrl: mongodbIcon, enabled: false },
  { code: 'Timeplus', name: 'Timeplus', iconUrl: timeplusIcon, enabled: false }
] as const

export function getDatabaseTypeOption(code: DatabaseType): DatabaseTypeOption | undefined {
  return DATABASE_TYPE_OPTIONS.find((opt) => opt.code === code)
}
