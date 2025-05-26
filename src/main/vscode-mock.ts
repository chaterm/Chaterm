// vscode-mock.ts - VSCode API mock for Electron environment

// 导出现有的 vscode 类型定义
export * from './api/providers/types'

// Thenable 类型定义
export interface Thenable<T> extends PromiseLike<T> {}

// EventEmitter 实现
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = []

  get event() {
    return (listener: (e: T) => void) => {
      this.listeners.push(listener)
      return {
        dispose: () => {
          const index = this.listeners.indexOf(listener)
          if (index > -1) {
            this.listeners.splice(index, 1)
          }
        }
      }
    }
  }

  fire(event: T): void {
    this.listeners.forEach((listener) => listener(event))
  }

  dispose(): void {
    this.listeners = []
  }
}

// CancellationToken 实现
export interface CancellationToken {
  isCancellationRequested: boolean
  onCancellationRequested: (listener: () => void) => { dispose(): void }
}

export class CancellationTokenSource {
  private _token: CancellationToken
  private _cancelled = false
  private _listeners: Array<() => void> = []

  constructor() {
    this._token = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        this._listeners.push(listener)
        return {
          dispose: () => {
            const index = this._listeners.indexOf(listener)
            if (index > -1) {
              this._listeners.splice(index, 1)
            }
          }
        }
      }
    }
  }

  get token(): CancellationToken {
    return this._token
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true
      this._token.isCancellationRequested = true
      this._listeners.forEach((listener) => listener())
    }
  }

  dispose(): void {
    this.cancel()
    this._listeners = []
  }
}

export class CancellationError extends Error {
  constructor(message?: string) {
    super(message || 'Cancelled')
    this.name = 'CancellationError'
  }
}

// Uri 实现
export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string
  ) {}

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '')
  }

  static parse(value: string): Uri {
    // 简单的 URL 解析实现
    const url = new URL(value)
    return new Uri(
      url.protocol.slice(0, -1),
      url.hostname,
      url.pathname,
      url.search.slice(1),
      url.hash.slice(1)
    )
  }

  static joinPath(base: Uri, ...paths: string[]): Uri {
    const joined = paths.reduce((acc, path) => acc + '/' + path, base.path).replace(/\/+/g, '/')
    return new Uri(base.scheme, base.authority, joined, base.query, base.fragment)
  }

  get fsPath(): string {
    return this.path
  }

  with(change: {
    scheme?: string
    authority?: string
    path?: string
    query?: string
    fragment?: string
  }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    )
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}${this.query ? '?' + this.query : ''}${this.fragment ? '#' + this.fragment : ''}`
  }
}

// ExtensionMode 枚举
export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3
}

// 基本接口定义
export interface Memento {
  keys(): readonly string[]
  get<T>(key: string): T | undefined
  update(key: string, value: any): Thenable<void>
}

export interface SecretStorage {
  get(key: string): Thenable<string | undefined>
  store(key: string, value: string): Thenable<void>
  delete(key: string): Thenable<void>
  onDidChange: (listener: (e: SecretStorageChangeEvent) => void) => { dispose(): void }
}

export interface SecretStorageChangeEvent {
  key: string
}

export interface EnvironmentVariableMutator {
  readonly type: EnvironmentVariableMutatorType
  readonly value: string
  readonly options?: EnvironmentVariableMutatorOptions
}

export enum EnvironmentVariableMutatorType {
  Replace = 1,
  Append = 2,
  Prepend = 3
}

export interface EnvironmentVariableMutatorOptions {
  applyAtProcessCreation?: boolean
  applyAtShellIntegration?: boolean
}

export interface EnvironmentVariableScope {
  workspaceFolder?: WorkspaceFolder
}

export interface WorkspaceFolder {
  readonly uri: Uri
  readonly name: string
  readonly index: number
}

export interface EnvironmentVariableCollection {
  persistent: boolean
  replace(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void
  append(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void
  prepend(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void
  get(variable: string): EnvironmentVariableMutator | undefined
  forEach(
    callback: (
      variable: string,
      mutator: EnvironmentVariableMutator,
      collection: EnvironmentVariableCollection
    ) => any
  ): void
  delete(variable: string): void
  clear(): void
}

export interface GlobalEnvironmentVariableCollection extends EnvironmentVariableCollection {
  getScoped(scope: EnvironmentVariableScope): EnvironmentVariableCollection
  description: string | undefined
}

export interface Extension<T> {
  readonly id: string
  readonly extensionUri: Uri
  readonly extensionPath: string
  readonly isActive: boolean
  readonly packageJSON: any
  readonly exports: T
  activate(): Thenable<T>
}

export interface ExtensionContext {
  readonly subscriptions: { dispose(): any }[]
  readonly workspaceState: Memento
  readonly globalState: Memento & { setKeysForSync(keys: readonly string[]): void }
  readonly secrets: SecretStorage
  readonly extensionUri: Uri
  readonly extensionPath: string
  readonly environmentVariableCollection: GlobalEnvironmentVariableCollection
  readonly storageUri: Uri | undefined
  readonly storagePath: string | undefined
  readonly globalStorageUri: Uri
  readonly globalStoragePath: string
  readonly logUri: Uri
  readonly logPath: string
  readonly extensionMode: ExtensionMode
  readonly extension: Extension<any>
  asAbsolutePath(relativePath: string): string
}

// Environment API mock
export const env = {
  machineId: 'mock-machine-id-' + Math.random().toString(36).substr(2, 9),
  sessionId: 'mock-session-id-' + Math.random().toString(36).substr(2, 9),
  language: 'en',
  appName: 'Chaterm',
  appRoot: process.cwd(),
  uriScheme: 'chaterm',
  clipboard: {
    readText: async () => '',
    writeText: async (text: string) => {}
  },
  shell: process.platform === 'win32' ? 'cmd' : 'bash',
  remoteName: undefined,
  isNewAppInstall: false,
  isTelemetryEnabled: true,
  logLevel: 1, // Info
  appHost: 'desktop'
}

// Workspace API mock
export const workspace = {
  onDidChangeConfiguration: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  getConfiguration: (section?: string) => {
    return {
      get: (key: string, defaultValue?: any) => defaultValue,
      update: (key: string, value: any) => Promise.resolve(),
      has: (key: string) => false,
      inspect: (key: string) => undefined
    }
  },
  workspaceFolders: [] as WorkspaceFolder[],
  rootPath: undefined as string | undefined
}

// Language Model API mock (基于之前提供的文件中的定义)
export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2
}

export enum LanguageModelChatToolMode {
  Auto = 1,
  Required = 2
}

export class LanguageModelTextPart {
  constructor(public value: string) {}
}

export class LanguageModelToolCallPart {
  constructor(
    public callId: string,
    public name: string,
    public input: object
  ) {}
}

export class LanguageModelPromptTsxPart {
  constructor(public value: unknown) {}
}

export class LanguageModelToolResultPart {
  constructor(
    public callId: string,
    public content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart | unknown>
  ) {}
}

export class LanguageModelChatMessage {
  static User(
    content: string | Array<LanguageModelTextPart | LanguageModelToolResultPart>,
    name?: string
  ): LanguageModelChatMessage {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.User, content, name)
  }

  static Assistant(
    content: string | Array<LanguageModelTextPart | LanguageModelToolCallPart>,
    name?: string
  ): LanguageModelChatMessage {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, content, name)
  }

  constructor(
    public role: LanguageModelChatMessageRole,
    public content:
      | string
      | Array<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart>,
    public name?: string
  ) {}
}

// Language Model mock
export const lm = {
  selectChatModels: async (selector?: any) => {
    // 返回一个模拟的语言模型
    return [
      {
        id: 'mock-model',
        name: 'Mock Language Model',
        vendor: 'mock',
        family: 'mock',
        version: '1.0',
        maxInputTokens: 8192,
        sendRequest: async (messages: any[], options?: any, token?: CancellationToken) => {
          return {
            stream: (async function* () {
              yield new LanguageModelTextPart('Mock response from language model')
            })(),
            text: (async function* () {
              yield 'Mock response from language model'
            })()
          }
        },
        countTokens: async () => 0
      }
    ]
  }
}

// 在文件末尾添加window对象的模拟
export interface TextEditorDecorationType {
  key: string
  dispose(): void
}

export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character)
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character <= other.character)
  }

  isAfter(other: Position): boolean {
    return this.line > other.line || (this.line === other.line && this.character > other.character)
  }

  isAfterOrEqual(other: Position): boolean {
    return this.line > other.line || (this.line === other.line && this.character >= other.character)
  }

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character
  }

  compareTo(other: Position): number {
    if (this.line < other.line) return -1
    if (this.line > other.line) return 1
    if (this.character < other.character) return -1
    if (this.character > other.character) return 1
    return 0
  }

  translate(lineDelta: number = 0, characterDelta: number = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta)
  }

  with(line?: number, character?: number): Position {
    return new Position(line ?? this.line, character ?? this.character)
  }
}

export class Range {
  constructor(
    public start: Position,
    public end: Position
  ) {}

  get isEmpty(): boolean {
    return this.start.isEqual(this.end)
  }

  get isSingleLine(): boolean {
    return this.start.line === this.end.line
  }

  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Position) {
      return this.start.isBeforeOrEqual(positionOrRange) && this.end.isAfterOrEqual(positionOrRange)
    } else {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end)
    }
  }

  intersection(range: Range): Range | undefined {
    const start = this.start.isAfter(range.start) ? this.start : range.start
    const end = this.end.isBefore(range.end) ? this.end : range.end
    if (start.isAfter(end)) {
      return undefined
    }
    return new Range(start, end)
  }

  union(other: Range): Range {
    const start = this.start.isBefore(other.start) ? this.start : other.start
    const end = this.end.isAfter(other.end) ? this.end : other.end
    return new Range(start, end)
  }

  with(start?: Position, end?: Position): Range {
    return new Range(start ?? this.start, end ?? this.end)
  }
}

export interface TextDocument {
  uri: Uri
  fileName: string
  isUntitled: boolean
  languageId: string
  version: number
  isDirty: boolean
  isClosed: boolean
  save(): Thenable<boolean>
  eol: EndOfLine
  lineCount: number
  getText(range?: Range): string
  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined
  validateRange(range: Range): Range
  validatePosition(position: Position): Position
  offsetAt(position: Position): number
  positionAt(offset: number): Position
}

export enum EndOfLine {
  LF = 1,
  CRLF = 2
}

export interface TextEditor {
  document: TextDocument
  selection: Selection
  selections: Selection[]
  visibleRanges: Range[]
  options: TextEditorOptions
  viewColumn?: ViewColumn
  edit(
    callback: (editBuilder: TextEditorEdit) => void,
    options?: { undoStopBefore: boolean; undoStopAfter: boolean }
  ): Thenable<boolean>
  insertSnippet(
    snippet: SnippetString,
    location?: Position | Range | Position[] | Range[],
    options?: { undoStopBefore: boolean; undoStopAfter: boolean }
  ): Thenable<boolean>
  setDecorations(
    decorationType: TextEditorDecorationType,
    rangesOrOptions: Range[] | DecorationOptions[]
  ): void
  revealRange(range: Range, revealType?: TextEditorRevealType): void
  show(column?: ViewColumn): void
  hide(): void
}

export class Selection extends Range {
  constructor(
    public anchor: Position,
    public active: Position
  ) {
    super(anchor, active)
  }

  get isReversed(): boolean {
    return this.anchor.isAfter(this.active)
  }
}

export interface TextEditorOptions {
  tabSize?: number | string
  insertSpaces?: boolean | string
  cursorStyle?: TextEditorCursorStyle
  lineNumbers?: TextEditorLineNumbersStyle
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9
}

export interface TextEditorEdit {
  replace(location: Position | Range | Selection, value: string): void
  insert(location: Position, value: string): void
  delete(location: Range | Selection): void
  setEndOfLine(endOfLine: EndOfLine): void
}

export class SnippetString {
  constructor(public value?: string) {}

  appendText(string: string): SnippetString {
    this.value = (this.value || '') + string
    return this
  }

  appendTabstop(number?: number): SnippetString {
    this.value = (this.value || '') + `$${number || 0}`
    return this
  }

  appendPlaceholder(
    value: string | ((snippet: SnippetString) => any),
    number?: number
  ): SnippetString {
    if (typeof value === 'string') {
      this.value = (this.value || '') + `\${${number || 0}:${value}}`
    }
    return this
  }

  appendChoice(values: string[], number?: number): SnippetString {
    this.value = (this.value || '') + `\${${number || 0}|${values.join(',')}|}`
    return this
  }

  appendVariable(
    name: string,
    defaultValue?: string | ((snippet: SnippetString) => any)
  ): SnippetString {
    if (typeof defaultValue === 'string') {
      this.value = (this.value || '') + `\${${name}:${defaultValue}}`
    } else {
      this.value = (this.value || '') + `$${name}`
    }
    return this
  }
}

export interface DecorationOptions {
  range: Range
  hoverMessage?: string | string[]
  renderOptions?: DecorationInstanceRenderOptions
}

export interface DecorationInstanceRenderOptions {
  before?: ThemableDecorationAttachmentRenderOptions
  after?: ThemableDecorationAttachmentRenderOptions
}

export interface ThemableDecorationAttachmentRenderOptions {
  contentText?: string
  contentIconPath?: string | Uri
  border?: string
  borderColor?: string | ThemeColor
  fontStyle?: string
  fontWeight?: string
  textDecoration?: string
  color?: string | ThemeColor
  backgroundColor?: string | ThemeColor
  margin?: string
  width?: string
  height?: string
}

export interface ThemeColor {
  id: string
}

export enum TextEditorCursorStyle {
  Line = 1,
  Block = 2,
  Underline = 3,
  LineThin = 4,
  BlockOutline = 5,
  UnderlineThin = 6
}

export enum TextEditorLineNumbersStyle {
  Off = 0,
  On = 1,
  Relative = 2
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3
}

export interface TabInputText {
  uri: Uri
}

export interface Tab {
  input: TabInputText | any
  isDirty: boolean
}

export interface TabGroup {
  tabs: Tab[]
}

// Window API mock
export const window = {
  createTextEditorDecorationType: (options: any): TextEditorDecorationType => {
    return {
      key: 'mock-decoration-' + Math.random().toString(36).substr(2, 9),
      dispose: () => {}
    }
  },
  showTextDocument: async (
    document: TextDocument | Uri,
    column?:
      | ViewColumn
      | { viewColumn?: ViewColumn; preserveFocus?: boolean; preview?: boolean; selection?: Range }
  ): Promise<TextEditor> => {
    // 返回一个模拟的TextEditor
    const mockDocument: TextDocument =
      document instanceof Uri
        ? {
            uri: document,
            fileName: document.fsPath,
            isUntitled: false,
            languageId: 'plaintext',
            version: 1,
            isDirty: false,
            isClosed: false,
            save: async () => true,
            eol: EndOfLine.LF,
            lineCount: 1,
            getText: () => '',
            getWordRangeAtPosition: () => undefined,
            validateRange: (range: Range) => range,
            validatePosition: (position: Position) => position,
            offsetAt: () => 0,
            positionAt: () => new Position(0, 0)
          }
        : document

    return {
      document: mockDocument,
      selection: new Range(new Position(0, 0), new Position(0, 0)) as Selection,
      selections: [],
      visibleRanges: [],
      options: {},
      edit: async () => true,
      insertSnippet: async () => true,
      setDecorations: () => {},
      revealRange: () => {},
      show: () => {},
      hide: () => {}
    }
  },
  activeTextEditor: undefined as TextEditor | undefined,
  visibleTextEditors: [] as TextEditor[],
  onDidChangeActiveTextEditor: (listener: (e: TextEditor | undefined) => void) => {
    return { dispose: () => {} }
  },
  onDidChangeVisibleTextEditors: (listener: (e: TextEditor[]) => void) => {
    return { dispose: () => {} }
  },
  onDidChangeTextEditorSelection: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  onDidChangeTextEditorVisibleRanges: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  onDidChangeTextEditorOptions: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  onDidChangeTextEditorViewColumn: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  showInformationMessage: async (message: string, ...items: string[]) => {
    console.log('Info:', message)
    return items[0]
  },
  showWarningMessage: async (message: string, ...items: string[]) => {
    console.warn('Warning:', message)
    return items[0]
  },
  showErrorMessage: async (message: string, ...items: string[]) => {
    console.error('Error:', message)
    return items[0]
  },
  showQuickPick: async (items: any[], options?: any) => {
    return items[0]
  },
  showInputBox: async (options?: any) => {
    return ''
  },
  createStatusBarItem: (alignment?: any, priority?: number) => {
    return {
      text: '',
      tooltip: '',
      color: undefined,
      backgroundColor: undefined,
      command: undefined,
      alignment: alignment,
      priority: priority,
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }
  },
  createOutputChannel: (name: string) => {
    return {
      name,
      append: (value: string) => console.log(value),
      appendLine: (value: string) => console.log(value),
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }
  },
  createTerminal: (options?: any) => {
    return {
      name: options?.name || 'Terminal',
      processId: Promise.resolve(1234),
      creationOptions: options,
      exitStatus: undefined,
      state: { isInteractedWith: false },
      sendText: (text: string, addNewLine?: boolean) => {
        console.log('Terminal:', text)
      },
      show: (preserveFocus?: boolean) => {},
      hide: () => {},
      dispose: () => {}
    }
  },
  terminals: [] as any[],
  onDidOpenTerminal: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  onDidCloseTerminal: (listener: (e: any) => void) => {
    return { dispose: () => {} }
  },
  tabGroups: {
    all: [] as TabGroup[],
    close: async (tab: Tab) => true,
    onDidChangeTabs: (listener: (e: any) => void) => {
      return { dispose: () => {} }
    },
    onDidChangeTabGroups: (listener: (e: any) => void) => {
      return { dispose: () => {} }
    }
  }
}

// Commands API mock
export const commands = {
  executeCommand: async (command: string, ...rest: any[]) => {
    console.log('Executing command:', command, rest)
    return undefined
  },
  registerCommand: (command: string, callback: (...args: any[]) => any) => {
    return { dispose: () => {} }
  },
  registerTextEditorCommand: (
    command: string,
    callback: (textEditor: TextEditor, edit: TextEditorEdit, ...args: any[]) => void
  ) => {
    return { dispose: () => {} }
  },
  getCommands: async (filterInternal?: boolean) => {
    return []
  }
}

// Languages API mock
export const languages = {
  getDiagnostics: (resource?: Uri) => {
    return [] as [Uri, any[]][]
  },
  createDiagnosticCollection: (name?: string) => {
    return {
      name: name || 'default',
      set: (uri: Uri, diagnostics: any[]) => {},
      delete: (uri: Uri) => {},
      clear: () => {},
      forEach: (callback: (uri: Uri, diagnostics: any[], collection: any) => any) => {},
      get: (uri: Uri) => [],
      has: (uri: Uri) => false,
      dispose: () => {}
    }
  },
  registerHoverProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerCompletionItemProvider: (
    selector: any,
    provider: any,
    ...triggerCharacters: string[]
  ) => {
    return { dispose: () => {} }
  },
  registerDefinitionProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerReferenceProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerDocumentSymbolProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerWorkspaceSymbolProvider: (provider: any) => {
    return { dispose: () => {} }
  },
  registerCodeActionsProvider: (selector: any, provider: any, metadata?: any) => {
    return { dispose: () => {} }
  },
  registerCodeLensProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerDocumentFormattingEditProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerDocumentRangeFormattingEditProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerOnTypeFormattingEditProvider: (
    selector: any,
    provider: any,
    firstTriggerCharacter: string,
    ...moreTriggerCharacter: string[]
  ) => {
    return { dispose: () => {} }
  },
  registerSignatureHelpProvider: (selector: any, provider: any, ...triggerCharacters: string[]) => {
    return { dispose: () => {} }
  },
  registerRenameProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerDocumentLinkProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerColorProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerFoldingRangeProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerSelectionRangeProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerCallHierarchyProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerTypeHierarchyProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerDocumentSemanticTokensProvider: (selector: any, provider: any, legend: any) => {
    return { dispose: () => {} }
  },
  registerDocumentRangeSemanticTokensProvider: (selector: any, provider: any, legend: any) => {
    return { dispose: () => {} }
  },
  registerInlineValuesProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerInlayHintsProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  registerLinkedEditingRangeProvider: (selector: any, provider: any) => {
    return { dispose: () => {} }
  },
  setLanguageConfiguration: (language: string, configuration: any) => {
    return { dispose: () => {} }
  },
  getLanguages: async () => {
    return []
  },
  setTextDocumentLanguage: async (document: TextDocument, languageId: string) => {
    return document
  },
  match: (selector: any, document: TextDocument) => {
    return 0
  }
}

// 更新默认导出
export default {
  Uri,
  ExtensionMode,
  EventEmitter,
  CancellationTokenSource,
  CancellationError,
  Position,
  Range,
  Selection,
  EndOfLine,
  ViewColumn,
  TextEditorCursorStyle,
  TextEditorLineNumbersStyle,
  TextEditorRevealType,
  SnippetString,
  env,
  workspace,
  window,
  commands,
  languages,
  lm,
  LanguageModelChatMessageRole,
  LanguageModelChatToolMode,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelPromptTsxPart,
  LanguageModelToolResultPart,
  LanguageModelChatMessage
}
