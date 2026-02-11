import * as os from 'os'
import { execSync } from 'child_process'

import { createLogger } from '@logging'

const logger = createLogger('sync')

const formatMachineIdAsUuid = (value: string): string => {
  const trimmed = value.trim()
  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`
  }
  return trimmed
}

const getSystemUUID = (): string => {
  const platform = os.platform()
  let uuid = ''

  try {
    switch (platform) {
      case 'win32': {
        // 1. Prefer WMIC
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
          // 2. Fallback to PowerShell
          try {
            const output = execSync('powershell -Command "(Get-WmiObject Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', timeout: 5000 })
            uuid = output.trim()
          } catch {}
        }
        break
      }

      case 'darwin': {
        // Prefer ioreg (faster)
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
        // Try /etc/machine-id first (no root required, 128-bit unique ID)
        try {
          const machineId = formatMachineIdAsUuid(execSync('cat /etc/machine-id', { encoding: 'utf8', timeout: 5000 }))
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(machineId)) {
            uuid = machineId
            break
          }
        } catch {}

        // Fallback to other methods (require root)
        const cmds = [
          'cat /var/lib/dbus/machine-id', // Older systems fallback
          'cat /sys/class/dmi/id/product_uuid',
          'dmidecode -s system-uuid'
        ]
        for (const cmd of cmds) {
          try {
            uuid = formatMachineIdAsUuid(execSync(cmd, { encoding: 'utf8', timeout: 5000 }))
            if (uuid && !uuid.toLowerCase().includes('permission denied')) break
          } catch {}
        }
        break
      }

      default:
        logger.warn(`[System UUID] Unsupported platform: ${platform}`)
        break
    }
  } catch (error) {
    logger.error('[System UUID] Error obtaining UUID', { error: error instanceof Error ? error.message : String(error) })
  }

  // UUID format validation
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return uuid.toLowerCase()
  }

  logger.warn(`[System UUID] Invalid or empty UUID: ${uuid}`)
  return ''
}

const generateFallbackDeviceId = (): string => {
  try {
    const combined = `${os.platform()}-${os.arch()}-${os.hostname()}-${os.userInfo().username}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i)
      hash |= 0 // Convert to 32-bit
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
