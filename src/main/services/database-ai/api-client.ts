// DB-AI api-client. Resolves an `ApiHandler` per DB-AI request so that
// per-provider state buffered inside the handler (e.g. usage counters, SDK
// stream references) cannot leak between concurrent requests. See
// docs/database_ai.md §6.2. Phase 4 will layer a handler pool on top of this.

import type { ApiHandler } from '@api/index'
import { buildApiHandler } from '@api/index'
import type { ApiConfiguration } from '@shared/api'
import { getAllExtensionState } from '@core/storage/state'
import type { DbAiModelMetadata } from './types'

const logger = createLogger('db-ai')

/**
 * Build a fresh `ApiHandler` for a DB-AI request. `modelOverride` (when
 * provided) SHOULD be resolved by the caller before invoking this function;
 * the client itself just forwards the configuration to `buildApiHandler`.
 */
export async function createDbAiApiHandler(options: { modelOverride?: string }): Promise<{ handler: ApiHandler; metadata: DbAiModelMetadata }> {
  const extState = await getAllExtensionState()
  const apiConfiguration: ApiConfiguration = extState?.apiConfiguration
  if (!apiConfiguration) {
    throw new Error('api configuration not available')
  }
  // Apply model override without mutating the shared state. We defensively
  // only override the default provider's model id; the full per-provider
  // model-override flow is handled by Controller.buildApiConfigurationForModel
  // upstream and can be wired in later.
  const effective: ApiConfiguration = options.modelOverride ? { ...apiConfiguration, defaultModelId: options.modelOverride } : apiConfiguration
  const handler = buildApiHandler(effective)
  const model = handler.getModel()
  const metadata: DbAiModelMetadata = {
    provider: effective.apiProvider ?? 'default',
    modelId: model.id
  }
  logger.debug('db-ai api handler built', {
    event: 'db-ai.api.handler.built',
    provider: metadata.provider,
    modelId: metadata.modelId,
    hasModelOverride: Boolean(options.modelOverride)
  })
  return { handler, metadata }
}
