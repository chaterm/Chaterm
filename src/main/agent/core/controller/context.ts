import * as vscode from 'vscode'
import { Uri, ExtensionMode } from 'vscode'

export class ExtensionContextImpl implements vscode.ExtensionContext {
  readonly _subscriptions: { dispose(): any }[] = []
  readonly _workspaceState: vscode.Memento
  readonly _globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void }
  readonly _secrets: vscode.SecretStorage
  readonly _extensionUri: Uri
  readonly _extensionPath: string
  readonly _environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection
  readonly _storageUri: Uri | undefined
  readonly _storagePath: string | undefined
  readonly _globalStorageUri: Uri
  readonly _globalStoragePath: string
  readonly _logUri: Uri
  readonly _logPath: string
  readonly _extensionMode: ExtensionMode
  readonly _extension: vscode.Extension<any>
  private _languageModelAccessInformation: vscode.LanguageModelAccessInformation
  private _storage: Map<string, any>

  constructor(
    workspaceState: vscode.Memento,
    globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void },
    secrets: vscode.SecretStorage,
    extensionUri: Uri,
    environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection,
    storageUri: Uri | undefined,
    globalStorageUri: Uri,
    logUri: Uri,
    extensionMode: ExtensionMode,
    extension: vscode.Extension<any>,
    languageModelAccessInformation: vscode.LanguageModelAccessInformation
  ) {
    this._workspaceState = workspaceState
    this._globalState = globalState
    this._secrets = secrets
    this._extensionUri = extensionUri
    this._extensionPath = extensionUri.fsPath
    this._environmentVariableCollection = environmentVariableCollection
    this._storageUri = storageUri
    this._storagePath = storageUri?.fsPath
    this._globalStorageUri = globalStorageUri
    this._globalStoragePath = globalStorageUri.fsPath
    this._logUri = logUri
    this._logPath = logUri.fsPath
    this._extensionMode = extensionMode
    this._extension = extension
    this._languageModelAccessInformation = languageModelAccessInformation
    this._storage = new Map<string, any>()
  }

  get subscriptions(): { dispose(): any }[] {
    return this._subscriptions
  }

  get workspaceState(): vscode.Memento {
    return this._workspaceState
  }

  get globalState(): vscode.Memento & { setKeysForSync(keys: readonly string[]): void } {
    return this._globalState
  }

  get secrets(): vscode.SecretStorage {
    return this._secrets
  }

  get extensionUri(): Uri {
    return this._extensionUri
  }

  get extensionPath(): string {
    return this._extensionPath
  }

  get environmentVariableCollection(): vscode.GlobalEnvironmentVariableCollection {
    return this._environmentVariableCollection
  }

  get storageUri(): Uri | undefined {
    return this._storageUri
  }

  get storagePath(): string | undefined {
    return this._storagePath
  }

  get globalStorageUri(): Uri {
    return this._globalStorageUri
  }

  get globalStoragePath(): string {
    return this._globalStoragePath
  }

  get logUri(): Uri {
    return this._logUri
  }

  get logPath(): string {
    return this._logPath
  }

  get extensionMode(): ExtensionMode {
    return this._extensionMode
  }

  get extension(): vscode.Extension<any> {
    return this._extension
  }

  get languageModelAccessInformation(): vscode.LanguageModelAccessInformation {
    return this._languageModelAccessInformation
  }

  asAbsolutePath(relativePath: string): string {
    return Uri.joinPath(this._extensionUri, relativePath).fsPath
  }

  update(key: string, value: any): Promise<void> {
    return new Promise<void>((resolve) => {
      this._storage.set(key, value)
      resolve()
    })
  }
}

// Implement a truly usable Memento class
class MementoImpl implements vscode.Memento {
  private storage: Map<string, any>

  constructor() {
    this.storage = new Map<string, any>()
  }

  get<T>(key: string): T | undefined {
    return this.storage.get(key) as T | undefined
  }

  update(key: string, value: any): Promise<void> {
    return new Promise<void>((resolve) => {
      this.storage.set(key, value)
      resolve()
    })
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys())
  }
}

// Implement the Memento class for global state
class GlobalMementoImpl extends MementoImpl {
  setKeysForSync(keys: readonly string[]): void {
    // Implement synchronization logic
    console.log('Keys to sync:', keys)
  }
}

// Example: how to instantiate ExtensionContextImpl
export const createExtensionContext = () => {
  // Create necessary Uri objects
  const extensionUri = Uri.file('/path/to/extension')
  const storageUri = Uri.file('/path/to/storage')
  const globalStorageUri = Uri.file('/path/to/global/storage')
  const logUri = Uri.file('/path/to/logs')

  // Create Memento objects
  const workspaceState = new MementoImpl()
  const globalState = new GlobalMementoImpl()

  // Create SecretStorage object
  const secrets: vscode.SecretStorage = {
    get: (key: string) => Promise.resolve(undefined),
    store: (key: string, value: string) => Promise.resolve(),
    delete: (key: string) => Promise.resolve(),
    onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
  }

  // Create EnvironmentVariableCollection object
  const environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection = {
    persistent: true,
    replace: (variable: string, value: string) => {},
    append: (variable: string, value: string) => {},
    prepend: (variable: string, value: string) => {},
    get: (variable: string) => undefined,
    forEach: (
      callback: (variable: string, mutator: vscode.EnvironmentVariableMutator, collection: vscode.EnvironmentVariableCollection) => any
    ) => {},
    delete: (variable: string) => {},
    clear: () => {},
    getScoped: (scope: vscode.EnvironmentVariableScope) => environmentVariableCollection,
    description: 'Example Environment Variables'
  }

  // Create Extension object
  const extension: vscode.Extension<any> = {
    id: 'example.extension',
    extensionUri: extensionUri,
    extensionPath: extensionUri.fsPath,
    isActive: true,
    packageJSON: {},
    exports: {},
    activate: () => Promise.resolve({})
  }

  // Create LanguageModelAccessInformation object
  const languageModelAccessInformation: vscode.LanguageModelAccessInformation = {
    onDidChange: new vscode.EventEmitter<void>().event,
    canSendRequest: (chat: vscode.LanguageModelChat) => true
  }

  // Instantiate ExtensionContextImpl
  const context = new ExtensionContextImpl(
    workspaceState,
    globalState,
    secrets,
    extensionUri,
    environmentVariableCollection,
    storageUri,
    globalStorageUri,
    logUri,
    ExtensionMode.Production,
    extension,
    languageModelAccessInformation
  )

  return context
}
