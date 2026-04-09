//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { ApiHandler } from '@api/index'
// import { OpenAiHandler } from '@api/providers/openai'

/**
 * Gets context window information for the given API handler
 *
 * @param api The API handler to get context window information for
 * @returns An object containing the raw context window size and the effective max allowed size
 */
export function getContextWindowInfo(api: ApiHandler) {
  let contextWindow = api.getModel().info.contextWindow || 128_000
  // FIXME: hack to get anyone using openai compatible with deepseek to have the proper context window instead of the default 128k. We need a way for the user to specify the context window for models they input through openai compatible

  //   // Handle special cases like DeepSeek
  //   if (api instanceof OpenAiHandler && api.getModel().id.toLowerCase().includes('deepseek')) {
  //     contextWindow = 64_000
  //   }

  // DEBUG: Uncomment the next line to force truncation after ~5k tokens (for testing)
  // return { contextWindow, maxAllowedSize: 20_000 }

  let maxAllowedSize: number
  switch (contextWindow) {
    case 64_000: // deepseek models
      maxAllowedSize = contextWindow - 27_000
      break
    case 128_000: // most models
      maxAllowedSize = contextWindow - 30_000
      break
    case 200_000: // claude models
      maxAllowedSize = contextWindow - 40_000
      break
    default:
      maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)
  }

  return { contextWindow, maxAllowedSize }
}
