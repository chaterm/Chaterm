import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const runtimeRequire = createRequire(import.meta.url)

export async function importResolvedModule<T>(specifier: string): Promise<T> {
  const resolvedPath = runtimeRequire.resolve(specifier)

  try {
    const required = runtimeRequire(resolvedPath)
    return (required.default || required) as T
  } catch {
    const module = await import(pathToFileURL(resolvedPath).href)
    return (module.default || module) as T
  }
}
