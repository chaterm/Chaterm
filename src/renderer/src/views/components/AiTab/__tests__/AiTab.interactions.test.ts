import { computed, defineComponent, h, mergeProps, ref, nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiTab from '../index.vue'
import type { ChatTab } from '../composables/useSessionState'
import type { HistoryItem } from '../types'

const mocks = vi.hoisted(() => ({
  state: {} as ReturnType<typeof createMockState>,
  eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  contextMenuShow: vi.fn(),
  contextMenuHide: vi.fn(),
  unsubscribeExplainResponse: vi.fn(),
  getGlobalState: vi.fn()
}))

vi.mock('../composables/useSessionState', () => ({ useSessionState: () => mocks.state.session }))
vi.mock('../composables/useAutoScroll', () => ({ useAutoScroll: () => mocks.state.autoScroll }))
vi.mock('../composables/useAiChatSearch', () => ({ useAiChatSearch: () => mocks.state.aiChatSearch }))
vi.mock('../composables/useChatNavRail', () => ({ useChatNavRail: () => mocks.state.chatNavRail }))
vi.mock('../composables/useChatHistory', () => ({ useChatHistory: () => mocks.state.chatHistory }))
vi.mock('../composables/useChatMessages', () => ({ useChatMessages: () => mocks.state.chatMessages }))
vi.mock('../composables/useCommandInteraction', () => ({ useCommandInteraction: () => mocks.state.commandInteraction }))
vi.mock('../composables/useEventBusListeners', () => ({ useEventBusListeners: vi.fn() }))
vi.mock('../composables/useHostState', () => ({ useHostState: () => mocks.state.hostState }))
vi.mock('../composables/useMessageOptions', () => ({ useMessageOptions: () => mocks.state.messageOptions }))
vi.mock('../composables/useModelConfiguration', () => ({ useModelConfiguration: () => mocks.state.modelConfiguration }))
vi.mock('../composables/useStateSnapshot', () => ({ useStateSnapshot: () => mocks.state.stateSnapshot }))
vi.mock('../composables/useTabManagement', () => ({ useTabManagement: () => mocks.state.tabManagement }))
vi.mock('../composables/useTodo', () => ({ useTodo: () => mocks.state.todo }))
vi.mock('../composables/useWatchers', () => ({ useWatchers: vi.fn() }))
vi.mock('../composables/useExportChat', () => ({ useExportChat: () => mocks.state.exportChat }))
vi.mock('@/composables/useInteractiveInput', () => ({ useInteractiveInput: () => mocks.state.interactiveInput }))
vi.mock('@/utils/domUtils', () => ({ isFocusInAiTab: vi.fn(() => true) }))
vi.mock('@/utils/eventBus', () => ({ default: mocks.eventBus }))
vi.mock('@/utils/perf', () => ({ mark: vi.fn() }))
vi.mock('@/locales', () => ({ default: { global: { t: (key: string) => (key === 'ai.favorite' ? 'Favorites' : key) } } }))
vi.mock('@renderer/agent/storage/state', () => ({ getGlobalState: mocks.getGlobalState }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../components/InputSendContainer.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/AiChatSearchBar.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/ChatNavRail.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/format/markdownRenderer.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/DbQueryResultCard.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/todo/TodoInlineDisplay.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('../components/message/UserMessage.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('@/components/agent/CommandInteractionInput.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('@views/components/Database/components/ConnectionPicker.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('@views/components/Database/components/DatabasePicker.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('@views/components/Database/components/SchemaPicker.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }))
vi.mock('@ant-design/icons-vue', () => {
  const Icon = defineComponent({ setup: () => () => h('span') })
  return {
    BookOutlined: Icon,
    CheckCircleFilled: Icon,
    CheckCircleOutlined: Icon,
    CheckOutlined: Icon,
    CloseOutlined: Icon,
    CompressOutlined: Icon,
    CopyOutlined: Icon,
    DeleteOutlined: Icon,
    DislikeOutlined: Icon,
    EditOutlined: Icon,
    EllipsisOutlined: Icon,
    ExportOutlined: Icon,
    LikeOutlined: Icon,
    PlayCircleOutlined: Icon,
    ReloadOutlined: Icon,
    SearchOutlined: Icon,
    StarFilled: Icon,
    StarOutlined: Icon,
    ThunderboltOutlined: Icon
  }
})

const childStub = defineComponent({ setup: () => () => h('div') })
const contextMenuStub = defineComponent({
  setup(_, { expose, slots }) {
    expose({ show: mocks.contextMenuShow, hide: mocks.contextMenuHide })
    return () => h('div', { class: 'v-contextmenu' }, slots.default?.())
  }
})
const contextMenuItemStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, class: 'context-menu-item' }, slots.default?.())
  }
})
const tabsStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', { class: 'tabs-stub' }, [slots.default?.(), slots.rightExtra?.()])
  }
})
const tabPaneStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('section', { class: 'tab-pane-stub' }, [slots.tab?.(), slots.default?.()])
  }
})
const inputStub = defineComponent({
  inheritAttrs: false,
  props: ['value', 'modelValue', 'size'],
  emits: ['update:value', 'pressEnter'],
  setup(props, { attrs, slots, emit, expose }) {
    const input = ref<HTMLInputElement | null>(null)
    expose({ focus: () => input.value?.focus() })
    return () =>
      h('span', [
        slots.prefix?.(),
        h(
          'input',
          mergeProps(attrs, {
            ref: input,
            value: props.value ?? props.modelValue,
            onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') emit('pressEnter', event)
            }
          })
        )
      ])
  }
})
const buttonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, [slots.default?.(), slots.icon?.()])
  }
})
const dropdownStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.overlay?.()])
  }
})
const menuStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})
const menuItemStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  }
})
const tooltipStub = defineComponent({
  setup(_, { slots }) {
    return () => h('span', slots.default?.())
  }
})

const createSession = (): ChatTab['session'] => ({
  chatHistory: [],
  lastChatMessageId: '',
  responseLoading: false,
  showRetryButton: false,
  showSendButton: true,
  buttonsDisabled: false,
  isExecutingCommand: false,
  lastStreamMessage: null,
  lastPartialMessage: null,
  lastStateChatermMessages: null,
  shouldStickToBottom: true,
  isCancelled: false
})

const createMockState = () => {
  const tab: ChatTab = {
    id: 'tab-1',
    title: 'Chat 1',
    hosts: [],
    chatType: 'agent',
    autoUpdateHost: true,
    session: createSession(),
    modelValue: 'test-model',
    welcomeTip: 'Welcome'
  }
  const chatTabs = ref([tab])
  const currentChatId = ref('tab-1')
  const currentTab = computed(() => chatTabs.value[0])
  const currentSession = computed(() => currentTab.value.session)
  const session = {
    chatTabs,
    currentChatId,
    currentTab,
    currentSession,
    isEmptyTab: vi.fn(() => true),
    isLastMessage: vi.fn(() => false),
    messageFeedbacks: ref({}),
    buttonsDisabled: ref(false),
    shouldStickToBottom: ref(true),
    getTabUserAssistantPairs: vi.fn(() => []),
    getTabHasOlderHistory: vi.fn(() => false),
    getTabChatTypeValue: vi.fn(() => 'agent'),
    getTabLastChatMessageId: vi.fn(() => ''),
    getTabResponseLoading: vi.fn(() => false)
  }

  const autoScroll = {
    chatContainer: ref(null),
    chatResponse: ref(null),
    historyTopSentinel: ref(null),
    scrollToBottom: vi.fn(),
    scrollToBottomWithRetry: vi.fn(),
    initializeAutoScroll: vi.fn(),
    handleTabSwitch: vi.fn(),
    getMessagePairStyle: vi.fn(() => ({}))
  }
  const aiChatSearch = {
    isSearchOpen: ref(false),
    searchTerm: ref(''),
    matchCount: ref(0),
    currentMatchIndex: ref(0),
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn()
  }
  const chatNavRail = {
    markers: ref([]),
    isVisible: ref(false),
    activePairIndex: ref(-1),
    jumpTo: vi.fn()
  }
  const historyOne: HistoryItem = {
    chatContent: [],
    id: 'history-1',
    chatTitle: 'History 1',
    isFavorite: false,
    isEditing: false,
    editingTitle: 'History 1'
  }
  const historyTwo: HistoryItem = {
    chatContent: [],
    id: 'history-2',
    chatTitle: 'History 2',
    isFavorite: true,
    isEditing: true,
    editingTitle: 'History 2 edited'
  }
  const historyGroup = { dateLabel: 'Favorites', items: [historyOne, historyTwo] }
  const refreshHistoryList = vi.fn()
  const loadMoreHistory = vi.fn()
  const editHistory = vi.fn((history: HistoryItem) => {
    history.isEditing = true
  })
  const saveHistoryTitle = vi.fn((history: HistoryItem) => {
    history.isEditing = false
  })
  const cancelEdit = vi.fn((history: HistoryItem) => {
    history.isEditing = false
  })
  const toggleFavorite = vi.fn((history: HistoryItem) => {
    history.isFavorite = !history.isFavorite
  })
  const chatHistory = {
    historySearchValue: ref(''),
    showOnlyFavorites: ref(false),
    isLoadingMore: ref(false),
    groupedPaginatedHistory: ref([historyGroup]),
    hasMoreHistory: ref(true),
    loadMoreHistory,
    handleIntersection: vi.fn(),
    editHistory,
    saveHistoryTitle,
    cancelEdit,
    deleteHistory: vi.fn(),
    toggleFavorite,
    loadHistoryList: vi.fn(),
    refreshHistoryList
  }
  const chatMessages = {
    markdownRendererRefs: ref({}),
    sendMessage: vi.fn(),
    sendMessageWithContent: vi.fn(),
    setMarkdownRendererRef: vi.fn(),
    formatParamValue: vi.fn((value: unknown) => value),
    handleFeedback: vi.fn(),
    getMessageFeedback: vi.fn(),
    handleTruncateAndSend: vi.fn(),
    handleSummarizeToKnowledge: vi.fn(),
    handleSummarizeToSkill: vi.fn()
  }
  const commandInteraction = {
    handleApplyCommand: vi.fn(),
    handleCopyContent: vi.fn(),
    handleRejectContent: vi.fn(),
    handleApproveCommand: vi.fn(),
    handleApproveAndAutoApproveReadOnly: vi.fn(),
    handleApproveAndAutoApprove: vi.fn(),
    handleCancel: vi.fn(),
    handleRetry: vi.fn()
  }
  const hostState = { updateHosts: vi.fn(), updateHostsForCommandMode: vi.fn(), getCurentTabAssetInfo: vi.fn() }
  const messageOptions = {
    handleOptionSelect: vi.fn(),
    getSelectedOption: vi.fn(),
    handleCustomInputChange: vi.fn(),
    getCustomInput: vi.fn(),
    canSubmitOption: vi.fn(),
    handleOptionSubmit: vi.fn()
  }
  const modelConfiguration = {
    hasAvailableModels: ref(true),
    initModel: vi.fn(),
    checkModelConfig: vi.fn(),
    initModelOptions: vi.fn(),
    refreshModelOptions: vi.fn()
  }
  const stateSnapshot = { getCurrentState: vi.fn(), restoreState: vi.fn(), emitStateChange: vi.fn() }
  const tabManagement = {
    createNewEmptyTab: vi.fn(),
    restoreHistoryTab: vi.fn(),
    loadOlderHistoryForTab: vi.fn(),
    handleTabRemove: vi.fn(),
    renameTab: vi.fn(),
    editingTabId: ref<string | null>(null),
    editingTitle: ref(''),
    cancelTabRename: vi.fn(),
    handleRenameKeydown: vi.fn(),
    handleTabMenuClick: vi.fn()
  }
  const todo = {
    currentTodos: ref([]),
    shouldShowTodoAfterMessage: vi.fn(() => false),
    getTodosForMessage: vi.fn(),
    markLatestMessageWithTodoUpdate: vi.fn(),
    clearTodoState: vi.fn()
  }
  const interactiveInput = {
    getInteractionStateForTab: vi.fn(),
    submitInteraction: vi.fn(),
    cancelInteraction: vi.fn(),
    dismissInteraction: vi.fn(),
    suppressInteraction: vi.fn(),
    unsuppressInteraction: vi.fn(),
    clearError: vi.fn()
  }
  const exportChat = { exportChat: vi.fn() }
  return {
    session,
    autoScroll,
    aiChatSearch,
    chatNavRail,
    chatHistory,
    chatMessages,
    commandInteraction,
    hostState,
    messageOptions,
    modelConfiguration,
    stateSnapshot,
    tabManagement,
    todo,
    interactiveInput,
    exportChat
  }
}

const globalStubs = {
  'a-tabs': tabsStub,
  'a-tab-pane': tabPaneStub,
  'a-input': inputStub,
  'a-button': buttonStub,
  'a-dropdown': dropdownStub,
  'a-menu': menuStub,
  'a-menu-item': menuItemStub,
  'a-tooltip': tooltipStub,
  'v-contextmenu': contextMenuStub,
  'v-contextmenu-item': contextMenuItemStub,
  AiChatSearchBar: childStub,
  ChatNavRail: childStub,
  ConnectionPicker: childStub,
  DatabasePicker: childStub,
  SchemaPicker: childStub,
  InputSendContainer: childStub,
  MarkdownRenderer: childStub,
  DbQueryResultCard: childStub,
  TodoInlineDisplay: childStub,
  UserMessage: childStub,
  CommandInteractionInput: childStub
}

describe('AiTab changed interactions', () => {
  let wrapper: VueWrapper

  beforeEach(async () => {
    mocks.state = createMockState()
    mocks.getGlobalState.mockResolvedValue({})
    vi.clearAllMocks()
    const onCommandExplainResponse = vi.fn(() => mocks.unsubscribeExplainResponse)
    Object.assign(window, {
      api: { onCommandExplainResponse, sendToMain: vi.fn(), getTaskList: vi.fn() }
    })
    localStorage.clear()
    wrapper = mount(AiTab, {
      attachTo: document.body,
      props: { toggleSidebar: vi.fn() },
      global: { stubs: globalStubs, mocks: { $t: (key: string) => key } }
    })
    await flushPromises()
    await nextTick()
  })

  afterEach(() => {
    wrapper.unmount()
    document.body.replaceChildren()
  })

  it('warms history on mount and wires up the new-tab and refresh buttons', async () => {
    expect(mocks.state.chatHistory.loadHistoryList).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.state.chatHistory.refreshHistoryList).not.toHaveBeenCalled()
    expect(wrapper.findAll('.history-menu-item')).toHaveLength(2)
    await wrapper.get('[data-testid="new-tab-button"]').trigger('click')
    expect(mocks.state.tabManagement.createNewEmptyTab).toHaveBeenCalled()
    await wrapper.get('img[alt="history"]').trigger('click')
    expect(mocks.state.chatHistory.refreshHistoryList).toHaveBeenCalled()
  })

  it('updates the search and favorites controls in the history dropdown', async () => {
    await wrapper.get('.history-search-input').setValue('deployment')
    expect(mocks.state.chatHistory.historySearchValue.value).toBe('deployment')
    expect(wrapper.find('.favorite-header').exists()).toBe(true)
    await wrapper.get('.favorites-button').trigger('click')
    expect(mocks.state.chatHistory.showOnlyFavorites.value).toBe(true)
    expect(wrapper.find('.star-outline-icon').exists()).toBe(false)
    await wrapper.get('.favorites-button').trigger('click')
    expect(mocks.state.chatHistory.showOnlyFavorites.value).toBe(false)
    expect(wrapper.find('.star-outline-icon').exists()).toBe(true)
  })

  it('restores a history item unless its title is being edited', async () => {
    await wrapper.findAll('.history-menu-item')[0].trigger('click')
    expect(mocks.state.tabManagement.restoreHistoryTab).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-1' }))
    await wrapper.findAll('.history-menu-item')[1].trigger('click')
    expect(mocks.state.tabManagement.restoreHistoryTab).toHaveBeenCalledTimes(1)
  })

  it('keeps history actions from restoring the conversation and saves edited titles', async () => {
    const historyItem = wrapper.findAll('.history-menu-item')[0]
    await historyItem.get('.favorite-btn').trigger('click')
    expect(mocks.state.chatHistory.toggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-1' }))
    expect(historyItem.classes()).toContain('favorite-item')
    await historyItem.findAll('.menu-action-btn')[1].trigger('click')
    expect(mocks.state.chatHistory.editHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-1' }))
    const editingItem = wrapper.findAll('.history-menu-item')[0]
    await editingItem.get('.history-title-input').setValue('New history title')
    await editingItem.get('.history-title-input').trigger('click')
    await editingItem.get('.history-title-input').trigger('blur')
    await editingItem.get('.history-title-input').trigger('keydown', { key: 'Enter' })
    expect(mocks.state.chatHistory.saveHistoryTitle).toHaveBeenCalledWith(expect.objectContaining({ editingTitle: 'New history title' }))
    await wrapper.findAll('.history-menu-item')[1].get('.save-btn').trigger('click')
    expect(mocks.state.chatHistory.saveHistoryTitle).toHaveBeenCalledTimes(2)
    expect(mocks.state.tabManagement.restoreHistoryTab).not.toHaveBeenCalled()
  })

  it('cancels history editing and deletes without selecting the history item', async () => {
    await wrapper.findAll('.history-menu-item')[1].get('.cancel-btn').trigger('click')
    expect(mocks.state.chatHistory.cancelEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-2' }))
    expect(wrapper.findAll('.history-menu-item')[1].find('.history-title-input').exists()).toBe(false)
    await wrapper.findAll('.history-menu-item')[0].findAll('.menu-action-btn')[2].trigger('click')
    expect(mocks.state.chatHistory.deleteHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-1' }))
    expect(mocks.state.tabManagement.restoreHistoryTab).not.toHaveBeenCalled()
  })

  it('loads more history from click or intersection and exports from the overflow menu', async () => {
    await wrapper.get('.history-load-more').trigger('click')
    await wrapper.get('.history-load-more').trigger('intersection')
    expect(mocks.state.chatHistory.loadMoreHistory).toHaveBeenCalled()
    expect(mocks.state.chatHistory.handleIntersection).toHaveBeenCalled()
    mocks.state.chatHistory.isLoadingMore.value = true
    await nextTick()
    expect(wrapper.get('.history-load-more').text()).toBe('ai.loading')
    await wrapper.findAllComponents(menuItemStub).at(-1)!.trigger('click')
    expect(mocks.state.exportChat.exportChat).toHaveBeenCalled()
  })

  it('exports tab context as draggable HTML and tolerates missing dataTransfer', async () => {
    const tabTitle = wrapper.get('.tab-title')
    await tabTitle.trigger('dragstart')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
    await tabTitle.trigger('dragstart', { dataTransfer })
    const payload = encodeURIComponent(JSON.stringify({ contextType: 'chat', id: 'tab-1', title: 'Chat 1' }))
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/html', `<span data-chaterm-context="${payload}"></span>`)
    expect(dataTransfer.effectAllowed).toBe('copy')
  })

  it.each(['rename', 'close', 'closeOthers', 'closeAll'])('dispatches %s to the right-clicked tab instead of the active tab', async (action) => {
    const activeTab = mocks.state.session.chatTabs.value[0]
    mocks.state.session.chatTabs.value.push({ ...activeTab, id: 'tab-2', title: 'Chat 2', session: createSession() })
    await nextTick()
    const target = wrapper.findAll('.tab-title-container')[1]
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.element.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(mocks.contextMenuShow).toHaveBeenCalledExactlyOnceWith(event)
    const actionIndex = ['rename', 'close', 'closeOthers', 'closeAll'].indexOf(action)
    await wrapper.findAll('.context-menu-item')[actionIndex].trigger('click')
    expect(mocks.state.tabManagement.handleTabMenuClick).toHaveBeenCalledWith(action, expect.objectContaining({ id: 'tab-2' }))
    expect(mocks.state.session.currentChatId.value).toBe('tab-1')
  })

  it('ignores menu actions before any tab has been right-clicked', async () => {
    await wrapper.findAll('.context-menu-item')[0].trigger('click')
    expect(mocks.state.tabManagement.handleTabMenuClick).not.toHaveBeenCalled()
  })

  it('dismisses on capture-phase outside clicks and keydown, but not inside-menu clicks', async () => {
    await wrapper.get('.tab-title-container').trigger('contextmenu')
    await wrapper.get('.context-menu-item').trigger('click')
    expect(mocks.contextMenuHide).not.toHaveBeenCalled()
    const title = wrapper.get('.tab-title').element
    title.addEventListener('click', (event) => event.stopPropagation(), { once: true })
    await wrapper.get('.tab-title').trigger('click')
    expect(mocks.contextMenuHide).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(mocks.contextMenuHide).toHaveBeenCalledTimes(2)
  })

  it('removes window listeners and unsubscribes when unmounted', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(mocks.unsubscribeExplainResponse).toHaveBeenCalledExactlyOnceWith()
    mocks.contextMenuHide.mockClear()
    window.dispatchEvent(new MouseEvent('click'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(mocks.contextMenuHide).not.toHaveBeenCalled()
    removeListener.mockRestore()
  })

  it('binds and focuses tab rename input and forwards keyboard, blur and close actions', async () => {
    mocks.state.tabManagement.editingTabId.value = 'tab-1'
    mocks.state.tabManagement.editingTitle.value = 'Renamed'
    await nextTick()
    await nextTick()
    const input = wrapper.get('.tab-title-input')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('New tab title')
    expect(mocks.state.tabManagement.editingTitle.value).toBe('New tab title')
    await input.trigger('click')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('blur')
    expect(mocks.state.tabManagement.handleRenameKeydown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }), 'tab-1')
    expect(mocks.state.tabManagement.cancelTabRename).toHaveBeenCalled()
    await wrapper.get('.tab-close-icon').trigger('click')
    expect(mocks.state.tabManagement.handleTabRemove).toHaveBeenCalledWith('tab-1')
  })
})
