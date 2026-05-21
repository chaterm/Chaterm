declare module 'oracledb' {
  export interface ExecuteOptions {
    outFormat?: number
    autoCommit?: boolean
    maxRows?: number
  }

  export interface ExecuteResult<T = unknown> {
    rows?: T[]
    metaData?: Array<{ name?: string }>
    rowsAffected?: number
  }

  export interface Connection {
    callTimeout?: number
    execute<T = unknown>(sql: string, binds?: unknown[] | Record<string, unknown>, options?: ExecuteOptions): Promise<ExecuteResult<T>>
    close(): Promise<void>
    commit(): Promise<void>
    rollback(): Promise<void>
    break?(): Promise<void>
  }

  export interface GetConnectionOptions {
    user?: string
    password?: string
    connectString?: string
    configDir?: string
    connectionIdPrefix?: string
  }

  export interface InitOracleClientOptions {
    libDir?: string
    configDir?: string
    errorUrl?: string
    driverName?: string
  }

  export const OUT_FORMAT_OBJECT: number
  export const CLOB: unknown
  export const NCLOB: unknown
  export const BLOB: unknown
  export let fetchAsString: unknown[]
  export let fetchAsBuffer: unknown[]
  export const thin: boolean
  export const versionString: string

  export function getConnection(options: GetConnectionOptions): Promise<Connection>
  export function initOracleClient(options?: InitOracleClientOptions): void
}
