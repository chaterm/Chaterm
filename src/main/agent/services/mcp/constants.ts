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
