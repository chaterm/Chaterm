import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const logger = createLogger('k8s')

export interface TemporaryKubeconfig {
  path: string
  cleanup: () => void
}

/** Create credentials in a unique, owner-only directory; never reuse an existing file or symlink. */
export function createTemporaryKubeconfig(content: string): TemporaryKubeconfig {
  // mkdtemp creates the directory atomically with mode 0700 on POSIX.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chaterm-kube-'))
  const kubeconfigPath = path.join(directory, 'kubeconfig.yaml')
  const cleanup = () => {
    try {
      fs.rmSync(directory, { recursive: true, force: true })
    } catch {
      logger.warn('Failed to remove temporary kubeconfig directory', { event: 'k8s.kubeconfig.cleanup.failed' })
    }
  }

  try {
    fs.writeFileSync(kubeconfigPath, content, { encoding: 'utf-8', mode: 0o600, flag: 'wx' })
    return { path: kubeconfigPath, cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}
