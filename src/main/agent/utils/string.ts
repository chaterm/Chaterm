//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

/**
 * Fixes incorrectly escaped HTML entities in AI model outputs
 * @param text String potentially containing incorrectly escaped HTML entities from AI models
 * @returns String with HTML entities converted back to normal characters
 */
export function fixModelHtmlEscaping(text: string): string {
  const entityMap: Record<string, string> = {
    '&gt;': '>',
    '&lt;': '<',
    '&quot;': '"',
    '&amp;': '&',
    '&apos;': "'"
  }

  return text.replace(/&(gt|lt|quot|amp|apos);/g, (entity) => entityMap[entity] || entity)
}

/**
 * Removes invalid characters (like the replacement character �) from a string
 * @param text String potentially containing invalid characters
 * @returns String with invalid characters removed
 */
export function removeInvalidChars(text: string): string {
  return text.replace(/\uFFFD/g, '')
}
