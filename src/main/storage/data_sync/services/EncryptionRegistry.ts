import { EnvelopeEncryptionService } from '../envelope_encryption/service'

// Singleton registry for sharing the EnvelopeEncryptionService instance across data_sync
let encryptionServiceInstance: EnvelopeEncryptionService | null = null

export function setEncryptionService(service: EnvelopeEncryptionService): void {
  encryptionServiceInstance = service
}

export function getEncryptionService(): EnvelopeEncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EnvelopeEncryptionService()
  }
  return encryptionServiceInstance
}
