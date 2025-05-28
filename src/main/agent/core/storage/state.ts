import type { BrowserWindow } from 'electron'
import type { GlobalStateKey, SecretKey, ApiConfiguration } from './types'

let mainWindow: BrowserWindow | null = null

export function initializeStorageMain(window: BrowserWindow): void {
  mainWindow = window
  console.log('[Main] Storage initialized - using executeJavaScript.')
}

// 主进程API函数 - 通过executeJavaScript调用renderer的storage函数
export async function getGlobalState(key: GlobalStateKey): Promise<any> {
  if (!mainWindow) throw new Error('Main window not initialized')
  
  const script = `
    (async () => {
      // 使用全局变量访问存储函数
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

// Test function
export async function testStorageFromMain(): Promise<void> {
  if (!mainWindow) {
    console.warn('[Main Storage Test] mainWindow is not initialized. Skipping test.');
    return;
  }
  // Check if webContents is available and not loading, with a retry mechanism
  if (mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    console.warn('[Main Storage Test] mainWindow destroyed or webContents is loading. Retrying in 1 second...');
    setTimeout(testStorageFromMain, 1000);
    return;
  }

  console.log('[Main Storage Test] Running comprehensive storage tests...');

  try {
    // Test getGlobalState and updateGlobalState
    const globalStateKey = 'apiProvider' as GlobalStateKey; // Example key
    console.log(`[Main Storage Test] Attempting to call getGlobalState('${globalStateKey}')`);
    let globalStateValue = await getGlobalState(globalStateKey);
    console.log(`[Main Storage Test] Initial getGlobalState('${globalStateKey}') result:`, globalStateValue);

    const newProvider = 'testProviderFromMainAgentStorage'; // Example value
    console.log(`[Main Storage Test] Attempting to call updateGlobalState('${globalStateKey}', '${newProvider}')`);
    await updateGlobalState(globalStateKey, newProvider);
    console.log(`[Main Storage Test] updateGlobalState('${globalStateKey}', '${newProvider}') called`);

    console.log(`[Main Storage Test] Attempting to call getGlobalState('${globalStateKey}') after update`);
    globalStateValue = await getGlobalState(globalStateKey);
    console.log(`[Main Storage Test] getGlobalState('${globalStateKey}') after update:`, globalStateValue);
    if (globalStateValue !== newProvider) {
        console.error(`[Main Storage Test] FAILED: updateGlobalState did not persist. Expected ${newProvider}, got ${globalStateValue}`);
    } else {
        console.log(`[Main Storage Test] PASSED: updateGlobalState for ${globalStateKey}`);
    }

    // Test getAllExtensionState
    console.log('[Main Storage Test] Attempting to call getAllExtensionState()');
    const allState = await getAllExtensionState();
    // console.log('[Main Storage Test] getAllExtensionState result:', JSON.stringify(allState, null, 2)); // Avoid overly long output in normal runs
    console.log('[Main Storage Test] getAllExtensionState() call completed. Result keys:', allState ? Object.keys(allState) : 'null/undefined');


    // Test storeSecret and getSecret
    const secretKey = 'testSecretKeyFromMainAgentStorage' as SecretKey;
    const secretValue = 'mySuperSecretValueFromMainAgentStorage';
    console.log(`[Main Storage Test] Attempting to call storeSecret('${secretKey}', '********')`);
    await storeSecret(secretKey, secretValue);
    console.log(`[Main Storage Test] storeSecret('${secretKey}', '********') called`);

    console.log(`[Main Storage Test] Attempting to call getSecret('${secretKey}')`);
    const retrievedSecret = await getSecret(secretKey);
    console.log(`[Main Storage Test] getSecret('${secretKey}') result:`, retrievedSecret);
    if (retrievedSecret !== secretValue) {
        console.error(`[Main Storage Test] FAILED: storeSecret/getSecret did not work as expected. Expected ${secretValue}, got ${retrievedSecret}`);
    } else {
        console.log(`[Main Storage Test] PASSED: storeSecret/getSecret for ${secretKey}`);
    }

    // Cleanup test secret
    console.log(`[Main Storage Test] Attempting to call storeSecret('${secretKey}', undefined) to delete it`);
    await storeSecret(secretKey, undefined);
    const deletedSecret = await getSecret(secretKey);
    console.log(`[Main Storage Test] getSecret('${secretKey}') after deletion attempt:`, deletedSecret);
    if (deletedSecret) {
        console.error(`[Main Storage Test] FAILED: Secret '${secretKey}' was not deleted.`);
    } else {
        console.log(`[Main Storage Test] PASSED: Secret '${secretKey}' deleted successfully.`);
    }

    console.log('[Main Storage Test] All tests completed!');

  } catch (error) {
    console.error('[Main Storage Test] Error during storage tests:', error);
  }
}
