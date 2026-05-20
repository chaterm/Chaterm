import { describe, expect, it } from 'vitest'
import { getOnboardingTourSteps } from '../tourDefinitions'

describe('onboarding tour definitions', () => {
  it('defines the interface guide tour in the intended order', () => {
    expect(getOnboardingTourSteps('interfaceGuide').map((step) => step.targetId)).toEqual([
      'left-module-switcher',
      'left-function-panel',
      'main-workspace-tabs',
      'top-layout-controls',
      'right-ai-toggle',
      'right-ai-sidebar'
    ])
  })

  it('makes the interface AI toggle step target-click driven', () => {
    const aiToggleStep = getOnboardingTourSteps('interfaceGuide').find((step) => step.id === 'ai-toggle')

    expect(aiToggleStep).toMatchObject({
      targetId: 'right-ai-toggle',
      advanceOnTargetClick: true
    })
  })

  it('defines the system settings tour in the intended order', () => {
    expect(getOnboardingTourSteps('systemSettings').map((step) => step.targetId)).toEqual([
      'setting-entry',
      'settings-side-nav',
      'settings-general-content',
      'settings-background-section',
      'settings-background-preset',
      'settings-terminal-tab',
      'settings-terminal-options',
      'settings-ai-preferences-tab',
      'settings-ai-preferences-content',
      'settings-ai-auto-approval'
    ])
  })

  it('makes the background preset step target-click driven without a card', () => {
    const backgroundPresetStep = getOnboardingTourSteps('systemSettings').find((step) => step.id === 'background-preset')

    expect(backgroundPresetStep).toMatchObject({
      targetId: 'settings-background-preset',
      hideCard: true,
      advanceOnTargetClick: true
    })
  })

  it('makes the AI preferences tab clickable and auto approval event-driven', () => {
    const steps = getOnboardingTourSteps('systemSettings')

    expect(steps.find((step) => step.id === 'ai-preferences-tab')).toMatchObject({
      targetId: 'settings-ai-preferences-tab',
      advanceOnTargetClick: true
    })
    expect(steps.find((step) => step.id === 'ai-auto-approval')).toMatchObject({
      targetId: 'settings-ai-auto-approval',
      advanceOnEvent: 'onboarding:autoApprovalEnabled'
    })
  })

  it('defines the AI chat tour as a real request path', () => {
    const steps = getOnboardingTourSteps('aiChat')

    expect(steps.map((step) => step.targetId)).toEqual([
      'right-ai-toggle',
      'right-ai-sidebar',
      'ai-input',
      'ai-mode-select',
      'ai-model-select',
      'ai-model-option',
      'ai-context-trigger',
      'ai-context-hosts-menu',
      'ai-localhost-option',
      'ai-send-button'
    ])
    expect(steps[0]).toMatchObject({
      advanceOnTargetClick: true,
      highlightTargetIds: ['left-ai-toggle'],
      advanceOnTargetIds: ['right-ai-toggle', 'left-ai-toggle']
    })
    expect(steps[3]).toMatchObject({
      targetId: 'ai-mode-select',
      advanceOnTargetIds: ['ai-mode-agent-option']
    })
    expect(steps.slice(3, 9).every((step) => step.advanceOnTargetClick && step.requiresTargetClick && step.allowNextWithoutTargetClick)).toBe(true)
    expect(steps[9]).toMatchObject({
      advanceOnTargetClick: true,
      requiresTargetClick: true
    })
    expect(steps[9].allowNextWithoutTargetClick).toBeUndefined()
  })
})
