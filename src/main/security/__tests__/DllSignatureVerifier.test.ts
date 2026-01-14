/**
 * Unit tests for DLL Signature Verifier
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { verifyCriticalDlls, verifyCriticalDllsOrThrow, checkDllInAppDirectory } from '../DllSignatureVerifier'

// Mock modules
vi.mock('child_process', () => ({
  execSync: vi.fn()
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn()
  },
  existsSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/mock/app/path'
  }
}))

describe('DllSignatureVerifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('verifyCriticalDlls', () => {
    it('should return empty array on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      })

      const results = verifyCriticalDlls()
      expect(results).toEqual([])
    })

    it('should verify DLLs on Windows platform', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          Status: 'Valid',
          SignerCertificate: {}
        })
      )

      const results = verifyCriticalDlls([
        {
          dllName: 'ffmpeg.dll',
          requireSignature: true
        }
      ])

      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle missing DLL gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const results = verifyCriticalDlls([
        {
          dllName: 'nonexistent.dll',
          requireSignature: true
        }
      ])

      expect(results[0].isValid).toBe(true) // Not found is treated as valid
      expect(results[0].dllPath).toBeUndefined()
    })

    it('should detect invalid signature', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          Status: 'NotSigned',
          SignerCertificate: null
        })
      )

      const results = verifyCriticalDlls([
        {
          dllName: 'ffmpeg.dll',
          requireSignature: true,
          allowUnsigned: false
        }
      ])

      expect(results[0].isValid).toBe(false)
      expect(results[0].error).toBeDefined()
    })

    it('should allow unsigned DLLs when configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          Status: 'NotSigned',
          SignerCertificate: null
        })
      )

      const results = verifyCriticalDlls([
        {
          dllName: 'ffmpeg.dll',
          requireSignature: true,
          allowUnsigned: true
        }
      ])

      expect(results[0].isValid).toBe(true)
    })

    it('should handle PowerShell execution errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('PowerShell execution failed')
      })

      const results = verifyCriticalDlls([
        {
          dllName: 'ffmpeg.dll',
          requireSignature: true
        }
      ])

      // Should fall back to signtool or return error
      expect(results[0]).toBeDefined()
    })
  })

  describe('verifyCriticalDllsOrThrow', () => {
    it('should not throw when all DLLs are valid', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          Status: 'Valid',
          SignerCertificate: {}
        })
      )

      expect(() => {
        verifyCriticalDllsOrThrow([
          {
            dllName: 'ffmpeg.dll',
            requireSignature: true
          }
        ])
      }).not.toThrow()
    })

    it('should throw when DLL verification fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          Status: 'NotSigned',
          SignerCertificate: null
        })
      )

      expect(() => {
        verifyCriticalDllsOrThrow([
          {
            dllName: 'ffmpeg.dll',
            requireSignature: true,
            allowUnsigned: false
          }
        ])
      }).toThrow('Critical DLL signature verification failed')
    })
  })

  describe('checkDllInAppDirectory', () => {
    it('should return false on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      })

      const result = checkDllInAppDirectory('ffmpeg.dll')
      expect(result).toBe(false)
    })

    it('should return true when DLL exists in app directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = checkDllInAppDirectory('ffmpeg.dll')
      expect(result).toBe(true)
    })

    it('should return false when DLL does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = checkDllInAppDirectory('ffmpeg.dll')
      expect(result).toBe(false)
    })
  })
})
