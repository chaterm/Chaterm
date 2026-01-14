/**
 * DLL Signature Verifier for Windows Platform
 *
 * This module provides DLL signature verification to prevent DLL hijacking attacks.
 * It verifies that critical DLLs (like ffmpeg.dll) are properly signed and haven't been tampered with.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface DllVerificationResult {
  isValid: boolean
  error?: string
  dllPath?: string
  signatureStatus?: string
}

export interface DllVerificationConfig {
  dllName: string
  expectedPublisher?: string
  requireSignature: boolean
  allowUnsigned?: boolean
}

/**
 * Default list of critical DLLs that should be verified
 */
const CRITICAL_DLLS: DllVerificationConfig[] = [
  {
    dllName: 'ffmpeg.dll',
    requireSignature: true,
    allowUnsigned: false
  }
]

/**
 * Verify DLL signature using Windows PowerShell Get-AuthenticodeSignature cmdlet
 *
 * @param dllPath - Full path to the DLL file
 * @returns Verification result
 */
function verifyDllSignature(dllPath: string): DllVerificationResult {
  try {
    if (!fs.existsSync(dllPath)) {
      return {
        isValid: false,
        error: `DLL file not found: ${dllPath}`,
        dllPath
      }
    }

    // Use PowerShell to check the signature
    const psCommand = `Get-AuthenticodeSignature -FilePath "${dllPath}" | ConvertTo-Json -Compress`

    try {
      const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 10000
      })

      const signatureInfo = JSON.parse(result.trim())
      const status = signatureInfo.Status?.toString() || 'Unknown'

      // Valid statuses: Valid, Valid (but expired), HashMismatch, NotSigned, NotTrusted
      const isValid = status === 'Valid' || status === 'Valid (but expired)'

      return {
        isValid,
        dllPath,
        signatureStatus: status,
        error: isValid ? undefined : `DLL signature status: ${status}`
      }
    } catch (execError: any) {
      // If PowerShell command fails, try alternative method using signtool
      return verifyDllSignatureWithSigntool(dllPath)
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: `Failed to verify DLL signature: ${error.message}`,
      dllPath
    }
  }
}

/**
 * Alternative verification method using signtool.exe (if available)
 */
function verifyDllSignatureWithSigntool(dllPath: string): DllVerificationResult {
  try {
    // Try to find signtool.exe in common locations
    const windowsKits = [
      process.env['ProgramFiles(x86)'] + '\\Windows Kits\\10\\bin',
      process.env.ProgramFiles + '\\Windows Kits\\10\\bin',
      process.env['ProgramFiles(x86)'] + '\\Windows Kits\\8.1\\bin',
      process.env.ProgramFiles + '\\Windows Kits\\8.1\\bin'
    ]

    let signtoolPath: string | null = null
    for (const kitPath of windowsKits) {
      if (kitPath && fs.existsSync(kitPath)) {
        const archDirs = ['x64', 'x86', 'arm64']
        for (const arch of archDirs) {
          const candidate = path.join(kitPath, arch, 'signtool.exe')
          if (fs.existsSync(candidate)) {
            signtoolPath = candidate
            break
          }
        }
        if (signtoolPath) break
      }
    }

    if (!signtoolPath) {
      return {
        isValid: false,
        error: 'Signature verification tools not available',
        dllPath
      }
    }

    const result = execSync(`"${signtoolPath}" verify /pa "${dllPath}"`, { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })

    // signtool returns 0 on success
    const isValid = result.includes('Successfully verified') || result.includes('Number of files: 1')

    return {
      isValid,
      dllPath,
      signatureStatus: isValid ? 'Valid' : 'Verification failed',
      error: isValid ? undefined : 'DLL signature verification failed'
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: `Signtool verification failed: ${error.message}`,
      dllPath
    }
  }
}

/**
 * Find DLL file in application directory and common search paths
 */
function findDllFile(dllName: string): string | null {
  const searchPaths: string[] = []

  // Application directory (where the executable is)
  if (app.isPackaged) {
    searchPaths.push(path.dirname(process.execPath))
    searchPaths.push(path.join(path.dirname(process.execPath), 'resources'))
  } else {
    // Development mode
    searchPaths.push(process.cwd())
    searchPaths.push(path.join(process.cwd(), 'resources'))
  }

  // Current working directory
  searchPaths.push(process.cwd())

  // System directories (for reference, but we should not load from here)
  if (process.env.SYSTEMROOT) {
    searchPaths.push(path.join(process.env.SYSTEMROOT, 'System32'))
    searchPaths.push(path.join(process.env.SYSTEMROOT, 'SysWOW64'))
  }

  for (const searchPath of searchPaths) {
    const dllPath = path.join(searchPath, dllName)
    if (fs.existsSync(dllPath)) {
      return dllPath
    }
  }

  return null
}

/**
 * Verify a single DLL according to its configuration
 */
function verifyDll(config: DllVerificationConfig): DllVerificationResult {
  const dllPath = findDllFile(config.dllName)

  if (!dllPath) {
    // DLL not found - this might be acceptable if it's optional
    return {
      isValid: true, // Not found is not necessarily an error
      dllPath: undefined,
      signatureStatus: 'Not found'
    }
  }

  if (!config.requireSignature) {
    // If signature is not required, just check if file exists
    return {
      isValid: true,
      dllPath,
      signatureStatus: 'Not required'
    }
  }

  const result = verifyDllSignature(dllPath)

  if (!result.isValid && config.allowUnsigned) {
    // If unsigned DLLs are allowed, treat as valid
    return {
      isValid: true,
      dllPath,
      signatureStatus: result.signatureStatus || 'Unsigned (allowed)'
    }
  }

  return result
}

/**
 * Verify all critical DLLs
 *
 * @param customConfigs - Optional custom DLL configurations to verify
 * @returns Array of verification results
 */
export function verifyCriticalDlls(customConfigs?: DllVerificationConfig[]): DllVerificationResult[] {
  if (process.platform !== 'win32') {
    // DLL verification is only relevant on Windows
    return []
  }

  const configs = customConfigs || CRITICAL_DLLS
  const results: DllVerificationResult[] = []

  for (const config of configs) {
    const result = verifyDll(config)
    results.push(result)
  }

  return results
}

/**
 * Verify critical DLLs and throw error if any are invalid
 * This should be called early in the application startup
 *
 * @param customConfigs - Optional custom DLL configurations to verify
 * @throws Error if any critical DLL verification fails
 */
export function verifyCriticalDllsOrThrow(customConfigs?: DllVerificationConfig[]): void {
  const results = verifyCriticalDlls(customConfigs)
  const failures = results.filter((r) => !r.isValid)

  if (failures.length > 0) {
    const errorMessages = failures.map((f) => `DLL verification failed for ${f.dllPath || 'unknown'}: ${f.error || 'Unknown error'}`)

    throw new Error(`Critical DLL signature verification failed. Security risk detected!\n${errorMessages.join('\n')}`)
  }
}

/**
 * Check if a DLL file exists in the application directory
 * This can be used to detect potential DLL hijacking attempts
 */
export function checkDllInAppDirectory(dllName: string): boolean {
  if (process.platform !== 'win32') {
    return false
  }

  const appDir = app.isPackaged ? path.dirname(process.execPath) : process.cwd()

  const dllPath = path.join(appDir, dllName)
  return fs.existsSync(dllPath)
}
