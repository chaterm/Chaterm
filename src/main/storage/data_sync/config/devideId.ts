import * as os from 'os'
import { execSync } from 'child_process'

const getSystemUUID = (): string => {
  const platform = os.platform()
  let uuid = ''

  try {
    switch (platform) {
      case 'win32': {
        // 1. 优先用 WMIC
        try {
          const output = execSync('wmic csproduct get UUID', { encoding: 'utf8', timeout: 5000 })
          const lines = output
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
          if (lines.length >= 2) {
            uuid = lines[1]
          }
        } catch {
          // 2. 兼容 PowerShell
          try {
            const output = execSync('powershell -Command "(Get-WmiObject Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', timeout: 5000 })
            uuid = output.trim()
          } catch {}
        }
        break
      }

      case 'darwin': {
        // 优先 ioreg（快）
        try {
          uuid = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ {print $3}'", { encoding: 'utf8', timeout: 5000 })
            .replace(/"/g, '')
            .trim()
        } catch {
          try {
            uuid = execSync("system_profiler SPHardwareDataType | awk '/Hardware UUID/ {print $3}'", { encoding: 'utf8', timeout: 5000 }).trim()
          } catch {}
        }
        break
      }

      case 'linux': {
        const cmds = [
          'cat /sys/class/dmi/id/product_uuid', // 最常用，普通用户可读
          'dmidecode -s system-uuid' // 需要 root
        ]
        for (const cmd of cmds) {
          try {
            uuid = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim()
            if (uuid && !uuid.toLowerCase().includes('permission denied')) break
          } catch {}
        }
        break
      }

      default:
        console.warn(`[System UUID] Unsupported platform: ${platform}`)
        break
    }
  } catch (error) {
    console.error('[System UUID] Error obtaining UUID:', error)
  }

  // UUID 格式校验
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return uuid.toLowerCase()
  }

  console.warn(`[System UUID] Invalid or empty UUID: ${uuid}`)
  return ''
}

const generateFallbackDeviceId = (): string => {
  try {
    const combined = `${os.platform()}-${os.arch()}-${os.hostname()}-${os.userInfo().username}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i)
      hash |= 0 // 转 32 位
    }
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0')
    return `device-fallback-${hashStr}`
  } catch {
    return 'device-unknown'
  }
}

const getDeviceId = (): string => {
  const systemUUID = getSystemUUID()
  if (systemUUID) {
    return `device-${systemUUID}`
  }
  return generateFallbackDeviceId()
}
export { getDeviceId }
