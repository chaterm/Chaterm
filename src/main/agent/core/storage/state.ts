//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import type { BrowserWindow } from 'electron'
import type { GlobalStateKey, SecretKey, ApiConfiguration } from './types'

import { createLogger } from '@logging'

const logger = createLogger('agent')

export interface ModelOption {
  id: string
  name: string
  checked: boolean
  type: string
  apiProvider: string
}

let mainWindow: BrowserWindow | null = null

export function initializeStorageMain(window: BrowserWindow): void {
  mainWindow = window
  logger.info('[Main] Storage initialized - using executeJavaScript.')
}

// Main process API function - calls renderer's storage function via executeJavaScript
export async function getGlobalState(key: GlobalStateKey): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      // Use global variable to access storage function
      if (window.storageAPI && window.storageAPI.getGlobalState) {
        return await window.storageAPI.getGlobalState('${key}');
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  return await mainWindow.webContents.executeJavaScript(script)
}

export async function updateGlobalState(key: GlobalStateKey, value: any): Promise<void> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.updateGlobalState) {
        await window.storageAPI.updateGlobalState('${key}', ${JSON.stringify(value)});
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  await mainWindow.webContents.executeJavaScript(script)
}

export async function getSecret(key: SecretKey): Promise<string | undefined> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.getSecret) {
        return await window.storageAPI.getSecret('${key}');
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  return await mainWindow.webContents.executeJavaScript(script)
}

export async function storeSecret(key: SecretKey, value?: string): Promise<void> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.storeSecret) {
        await window.storageAPI.storeSecret('${key}', ${value ? `'${value}'` : 'undefined'});
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  await mainWindow.webContents.executeJavaScript(script)
}

export async function getWorkspaceState(key: string): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.getWorkspaceState) {
        return await window.storageAPI.getWorkspaceState('${key}');
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  return await mainWindow.webContents.executeJavaScript(script)
}

export async function updateWorkspaceState(key: string, value: any): Promise<void> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.updateWorkspaceState) {
        await window.storageAPI.updateWorkspaceState('${key}', ${JSON.stringify(value)});
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  await mainWindow.webContents.executeJavaScript(script)
}

export async function getAllExtensionState(): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.getAllExtensionState) {
        return await window.storageAPI.getAllExtensionState();
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  return await mainWindow.webContents.executeJavaScript(script)
}

export async function updateApiConfiguration(config: ApiConfiguration): Promise<void> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.updateApiConfiguration) {
        await window.storageAPI.updateApiConfiguration(${JSON.stringify(config)});
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  await mainWindow.webContents.executeJavaScript(script)
}

export async function resetExtensionState(): Promise<void> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.resetExtensionState) {
        await window.storageAPI.resetExtensionState();
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  await mainWindow.webContents.executeJavaScript(script)
}

// Get user information
export async function getUserId(): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
    (async () => {
      if (window.storageAPI && window.storageAPI.getUserId) {
        return await window.storageAPI.getUserId();
      } else {
        throw new Error('Storage API not available in renderer');
      }
    })()
  `

  return await mainWindow.webContents.executeJavaScript(script)
}

// Get user config from renderer process
export async function getUserConfig(): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')

  const script = `
      (async () => {
        if (window.storageAPI && window.storageAPI.getUserConfig) {
          return await window.storageAPI.getUserConfig();
        } else {
          throw new Error('Storage API not available in renderer');
        }
      })()
    `

  return await mainWindow.webContents.executeJavaScript(script)
}

/**
 * Get model options from renderer process global state
 * @param excludeThinking - Whether to exclude models with "-Thinking" suffix
 * @returns Array of model options
 */
export async function getModelOptions(excludeThinking = false): Promise<ModelOption[]> {
  try {
    if (!mainWindow) {
      logger.error('Main window not initialized')
      return []
    }

    const script = `
      (async () => {
        if (window.storageAPI && window.storageAPI.getGlobalState) {
          return await window.storageAPI.getGlobalState('modelOptions') || [];
        }
        return [];
      })()
    `
    const modelOptions = await mainWindow.webContents.executeJavaScript(script)

    if (!Array.isArray(modelOptions)) {
      return []
    }

    // Filter out thinking models if requested
    if (excludeThinking) {
      return modelOptions.filter((model: ModelOption) => !model.name.endsWith('-Thinking'))
    }

    return modelOptions
  } catch (error) {
    logger.error('Failed to get model options', { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

// Test function
export async function testStorageFromMain(): Promise<void> {
  // if (!mainWindow) {
  //   logger.warn('[Main Storage Test] mainWindow is not initialized. Skipping test.');
  //   return;
  // }
  // // Check if webContents is available and not loading, with a retry mechanism
  // if (mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
  //   logger.warn('[Main Storage Test] mainWindow destroyed or webContents is loading. Retrying in 1 second...');
  //   setTimeout(testStorageFromMain, 1000);
  //   return;
  // }
  // logger.info('[Main Storage Test] Running comprehensive storage tests...');
  // try {
  //   // Test getGlobalState and updateGlobalState
  //   const globalStateKey = 'apiProvider' as GlobalStateKey; // Example key
  //   logger.info(`[Main Storage Test] Attempting to call getGlobalState('${globalStateKey}')`);
  //   let globalStateValue = await getGlobalState(globalStateKey);
  //   logger.info(`[Main Storage Test] Initial getGlobalState('${globalStateKey}') result`, { value: globalStateValue });
  //   const newProvider = 'testProviderFromMainAgentStorage'; // Example value
  //   logger.info(`[Main Storage Test] Attempting to call updateGlobalState('${globalStateKey}', '${newProvider}')`);
  //   await updateGlobalState(globalStateKey, newProvider);
  //   logger.info(`[Main Storage Test] updateGlobalState('${globalStateKey}', '${newProvider}') called`);
  //   logger.info(`[Main Storage Test] Attempting to call getGlobalState('${globalStateKey}') after update`);
  //   globalStateValue = await getGlobalState(globalStateKey);
  //   logger.info(`[Main Storage Test] getGlobalState('${globalStateKey}') after update`, { value: globalStateValue });
  //   if (globalStateValue !== newProvider) {
  //       logger.error(`[Main Storage Test] FAILED: updateGlobalState did not persist. Expected ${newProvider}, got ${globalStateValue}`);
  //   } else {
  //       logger.info(`[Main Storage Test] PASSED: updateGlobalState for ${globalStateKey}`);
  //   }
  //   // Test getAllExtensionState
  //   logger.info('[Main Storage Test] Attempting to call getAllExtensionState()');
  //   const allState = await getAllExtensionState();
  //   // logger.info('[Main Storage Test] getAllExtensionState result', { value: JSON.stringify(allState, null, 2 })); // Avoid overly long output in normal runs
  //   logger.info('[Main Storage Test] getAllExtensionState() call completed. Result keys:', allState ? Object.keys(allState) : 'null/undefined');
  //   // Test storeSecret and getSecret
  //   const secretKey = 'testSecretKeyFromMainAgentStorage' as SecretKey;
  //   const secretValue = 'mySuperSecretValueFromMainAgentStorage';
  //   logger.info(`[Main Storage Test] Attempting to call storeSecret('${secretKey}', '********')`);
  //   await storeSecret(secretKey, secretValue);
  //   logger.info(`[Main Storage Test] storeSecret('${secretKey}', '********') called`);
  //   logger.info(`[Main Storage Test] Attempting to call getSecret('${secretKey}')`);
  //   const retrievedSecret = await getSecret(secretKey);
  //   logger.info(`[Main Storage Test] getSecret('${secretKey}') result`, { value: retrievedSecret });
  //   if (retrievedSecret !== secretValue) {
  //       logger.error(`[Main Storage Test] FAILED: storeSecret/getSecret did not work as expected. Expected ${secretValue}, got ${retrievedSecret}`);
  //   } else {
  //       logger.info(`[Main Storage Test] PASSED: storeSecret/getSecret for ${secretKey}`);
  //   }
  //   // Cleanup test secret
  //   logger.info(`[Main Storage Test] Attempting to call storeSecret('${secretKey}', undefined) to delete it`);
  //   await storeSecret(secretKey, undefined);
  //   const deletedSecret = await getSecret(secretKey);
  //   logger.info(`[Main Storage Test] getSecret('${secretKey}') after deletion attempt`, { value: deletedSecret });
  //   if (deletedSecret) {
  //       logger.error(`[Main Storage Test] FAILED: Secret '${secretKey}' was not deleted.`);
  //   } else {
  //       logger.info(`[Main Storage Test] PASSED: Secret '${secretKey}' deleted successfully.`);
  //   }
  //   logger.info('[Main Storage Test] All tests completed!');
  // } catch (error) {
  //   logger.error('[Main Storage Test] Error during storage tests', { error: error instanceof Error ? error.message : String(error) });
  // }
}
