/**
 * Default timeout for internal MCP data requests in milliseconds.
 * This is not the same as the user facing timeout stored as DEFAULT_MCP_TIMEOUT_SECONDS.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5000

/**
 * Default timeout for HTTP MCP server connection in milliseconds.
 * This is used when establishing initial connection to HTTP-based MCP servers.
 * Set to 30 seconds to accommodate slow networks or distant servers.
 */
export const DEFAULT_HTTP_CONNECT_TIMEOUT_MS = 10000

/**
 * Custom error message for better user feedback when server type validation fails.
 */
export const TYPE_ERROR_MESSAGE = "Server type must be one of: 'stdio' or 'http'"

/**
 * Maximum number of reconnection attempts for HTTP-based MCP servers.
 * After this many failed reconnection attempts, the server will remain disconnected.
 */
export const MAX_RECONNECT_ATTEMPTS = 5

/**
 * Initial delay in milliseconds before the first reconnection attempt.
 * This delay doubles with each subsequent attempt (exponential backoff).
 */
export const INITIAL_RECONNECT_DELAY_MS = 1000

/**
 * Maximum delay in milliseconds between reconnection attempts.
 * Even with exponential backoff, the delay will never exceed this value.
 */
export const MAX_RECONNECT_DELAY_MS = 30000
