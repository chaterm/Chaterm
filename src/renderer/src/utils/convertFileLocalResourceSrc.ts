/**
 * Maps file:// URLs to the Electron custom protocol used for <img src> in the renderer.
 * Must preserve an absolute path with a leading slash so the URL is not parsed as
 * local-resource://Users/... (host "Users", wrong pathname).
 */
export function convertFileLocalResourceSrc(path: string | null): string {
  if (!path || path.startsWith('http') || path.startsWith('data:')) {
    return path || ''
  }
  if (!path.startsWith('file:')) {
    return path
  }
  try {
    const url = new URL(path)
    let pathname = url.pathname
    try {
      pathname = decodeURIComponent(pathname)
    } catch {
      // Keep encoded pathname if decode fails (e.g. stray % in filenames)
    }
    return `local-resource://${encodeURI(pathname)}`
  } catch {
    return ''
  }
}
