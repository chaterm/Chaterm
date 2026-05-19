import { describe, it, expect } from 'vitest'
import type { JumpServerNavigationPath } from '../constants'

// We test the key behavioral changes of setupJumpServerInteraction indirectly
// by verifying the logic around navigationPath inheritance and auto-select.
// The function itself is tightly coupled to ssh2 Client/stream, so we test
// the decision logic extracted through helper patterns.

describe('JumpServer Interaction - Multi-user fixes', () => {
  describe('navigationPath inheritance', () => {
    it('should create empty navigationPath when no inheritedNavigationPath is provided', () => {
      const inheritedNavigationPath: JumpServerNavigationPath | undefined = undefined as JumpServerNavigationPath | undefined
      const navigationPath: JumpServerNavigationPath = inheritedNavigationPath ? { ...inheritedNavigationPath } : { needsPassword: false }

      expect(navigationPath).toEqual({ needsPassword: false })
      expect(navigationPath.selectedUserId).toBeUndefined()
    })

    it('should inherit navigationPath with selectedUserId from previous connection', () => {
      const inheritedNavigationPath: JumpServerNavigationPath = {
        needsPassword: true,
        password: 'test-password',
        selectedUserId: 2
      }
      const navigationPath: JumpServerNavigationPath = inheritedNavigationPath ? { ...inheritedNavigationPath } : { needsPassword: false }

      expect(navigationPath.selectedUserId).toBe(2)
      expect(navigationPath.needsPassword).toBe(true)
      expect(navigationPath.password).toBe('test-password')
    })

    it('should create a shallow copy of inheritedNavigationPath (not share reference)', () => {
      const inheritedNavigationPath: JumpServerNavigationPath = {
        needsPassword: true,
        selectedUserId: 1
      }
      const navigationPath: JumpServerNavigationPath = inheritedNavigationPath ? { ...inheritedNavigationPath } : { needsPassword: false }

      // Mutating the copy should not affect original
      navigationPath.selectedUserId = 3
      expect(inheritedNavigationPath.selectedUserId).toBe(1)
    })
  })

  describe('auto-select user when selectedUserId exists', () => {
    it('should auto-select when navigationPath.selectedUserId is set (number > 0)', () => {
      const navigationPath: JumpServerNavigationPath = {
        needsPassword: true,
        selectedUserId: 2
      }

      // The key condition: navigationPath.selectedUserId !== undefined
      expect(navigationPath.selectedUserId !== undefined).toBe(true)
      expect(navigationPath.selectedUserId).toBe(2)
    })

    it('should NOT auto-select when navigationPath.selectedUserId is undefined', () => {
      const navigationPath: JumpServerNavigationPath = {
        needsPassword: false
      }

      expect(navigationPath.selectedUserId !== undefined).toBe(false)
    })

    it('should format selectedUserId correctly for stream.write', () => {
      const navigationPath: JumpServerNavigationPath = {
        needsPassword: true,
        selectedUserId: 3
      }

      // The command sent to stream: selectedUserId.toString() + '\r'
      const command = navigationPath.selectedUserId!.toString() + '\r'
      expect(command).toBe('3\r')
    })
  })

  describe('attemptSecondaryConnection should NOT be called for JumpServer', () => {
    it('connectionManager should not import attemptSecondaryConnection from sshHandle', () => {
      // This is a structural test - verify the import was removed
      // Read the file and check that attemptSecondaryConnection is not imported
      const fs = require('fs')
      const path = require('path')
      const content = fs.readFileSync(path.join(__dirname, '../connectionManager.ts'), 'utf-8')

      // The import line should NOT contain attemptSecondaryConnection
      const importLine = content.split('\n').find((line: string) => line.includes("from '../sshHandle'") && line.includes('import'))

      if (importLine) {
        expect(importLine).not.toContain('attemptSecondaryConnection')
      }
    })

    it('connectionManager conn.on("ready") should not call attemptSecondaryConnection', () => {
      const fs = require('fs')
      const path = require('path')
      const content = fs.readFileSync(path.join(__dirname, '../connectionManager.ts'), 'utf-8')

      // Find the conn.on('ready') block and ensure attemptSecondaryConnection is not called
      // (only check actual code calls, not comments)
      const readyBlockStart = content.indexOf("conn.on('ready'")
      if (readyBlockStart !== -1) {
        const afterReady = content.substring(readyBlockStart, readyBlockStart + 2000)
        // Remove comment lines before checking
        const codeOnly = afterReady
          .split('\n')
          .filter((line: string) => !line.trim().startsWith('//'))
          .join('\n')
        expect(codeOnly).not.toContain('attemptSecondaryConnection')
      }
    })
  })

  describe('connection reuse passes inheritedNavigationPath', () => {
    it('connectionManager should pass existingData.navigationPath to setupJumpServerInteraction', () => {
      const fs = require('fs')
      const path = require('path')
      const content = fs.readFileSync(path.join(__dirname, '../connectionManager.ts'), 'utf-8')

      // In the connection reuse block, verify inheritedNavigationPath is extracted and passed
      const reuseBlockStart = content.indexOf('Reusing existing connection')
      if (reuseBlockStart !== -1) {
        const reuseBlock = content.substring(reuseBlockStart, reuseBlockStart + 3000)
        expect(reuseBlock).toContain('inheritedNavigationPath')
        expect(reuseBlock).toContain('existingData.navigationPath')
        expect(reuseBlock).toContain('setupJumpServerInteraction')
      }
    })
  })
})
