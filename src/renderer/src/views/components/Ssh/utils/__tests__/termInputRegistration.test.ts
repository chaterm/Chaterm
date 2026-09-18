import { describe, it, expect, beforeEach } from 'vitest'
import { ref, watch, nextTick } from 'vue'
import { inputManager, componentInstances, activeTermId } from '../termInputManager'

// Mirrors the `watch(connectionId, ...)` body in sshConnect.vue, which owns
// inputManager registration for a terminal pane. The real module is used so the
// register/unregister/setActiveTerm semantics under test are the shipped ones.
const mountConnectionWatch = (connectionId: ReturnType<typeof ref<string>>) => {
  const termOndata = () => {}
  return watch(connectionId, (newId, oldId) => {
    if (oldId === newId) return
    if (oldId) {
      inputManager.unregisterInstances(oldId)
    }
    if (newId) {
      inputManager.registerInstances({ termOndata }, newId)
    }
  })
}

// The shortcut guard in sshConnect.vue: Cmd+F / Cmd+W / Cmd+P / Cmd+= all bail
// out early unless the active term id matches this pane's connection id.
const shortcutGuardPasses = (connectionId: string) => {
  const activeTerm = inputManager.getActiveTerm()
  return Boolean(activeTerm.id && connectionId && activeTerm.id === connectionId)
}

describe('sshConnect inputManager registration lifecycle', () => {
  beforeEach(() => {
    // The module holds singleton state shared across tests.
    componentInstances.value.splice(0, componentInstances.value.length)
    activeTermId.value = ''
  })

  it('registers under the real id when connectionId resolves after mount', async () => {
    // The SSH path assigns connectionId only after `await api.connectAssetInfo`,
    // so it is still empty when the pane mounts.
    const connectionId = ref('')
    mountConnectionWatch(connectionId)

    expect(componentInstances.value).toHaveLength(0)

    connectionId.value = 'ssh-conn-1'
    await nextTick()

    expect(componentInstances.value.map((entry) => entry.key)).toEqual(['ssh-conn-1'])
    expect(activeTermId.value).toBe('ssh-conn-1')
    expect(shortcutGuardPasses('ssh-conn-1')).toBe(true)
  })

  it('never leaves an entry keyed on the empty connection id', async () => {
    const connectionId = ref('')
    mountConnectionWatch(connectionId)

    connectionId.value = 'ssh-conn-1'
    await nextTick()

    expect(componentInstances.value.some((entry) => entry.key === '')).toBe(false)
  })

  it('unregisters the previous id and re-registers on reconnect', async () => {
    const connectionId = ref('conn-a')
    mountConnectionWatch(connectionId)

    // The initial value predates the watch, so register it the way mount does.
    inputManager.registerInstances({ termOndata: () => {} }, 'conn-a')
    expect(activeTermId.value).toBe('conn-a')

    connectionId.value = 'conn-b'
    await nextTick()

    expect(componentInstances.value.map((entry) => entry.key)).toEqual(['conn-b'])
    expect(activeTermId.value).toBe('conn-b')
    expect(shortcutGuardPasses('conn-b')).toBe(true)
    expect(shortcutGuardPasses('conn-a')).toBe(false)
  })

  it('unregisters without re-registering when connectionId is cleared', async () => {
    const connectionId = ref('conn-a')
    mountConnectionWatch(connectionId)
    inputManager.registerInstances({ termOndata: () => {} }, 'conn-a')

    connectionId.value = ''
    await nextTick()

    expect(componentInstances.value).toHaveLength(0)
    expect(activeTermId.value).toBe('')
    expect(shortcutGuardPasses('')).toBe(false)
  })

  it('keeps sibling panes registered when one reconnects', async () => {
    inputManager.registerInstances({ termOndata: () => {} }, 'other-pane')

    const connectionId = ref('')
    mountConnectionWatch(connectionId)

    connectionId.value = 'conn-a'
    await nextTick()

    expect(componentInstances.value.map((entry) => entry.key)).toEqual(['other-pane', 'conn-a'])

    connectionId.value = 'conn-b'
    await nextTick()

    expect(componentInstances.value.map((entry) => entry.key)).toEqual(['other-pane', 'conn-b'])
    expect(activeTermId.value).toBe('conn-b')
  })
})
