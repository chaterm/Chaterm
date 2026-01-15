import { describe, it, expect, afterEach } from 'vitest'
import { capabilityRegistry, type BastionDefinition } from '../capabilityRegistry'

describe('CapabilityRegistry.registerBastionDefinition', () => {
  afterEach(() => {
    capabilityRegistry.clearBastions()
  })

  it('rejects non-standard assetTypePrefix', () => {
    const definition: BastionDefinition = {
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-custom',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    }

    expect(() => capabilityRegistry.registerBastionDefinition(definition)).toThrow(
      /assetTypePrefix/i
    )
  })
})
