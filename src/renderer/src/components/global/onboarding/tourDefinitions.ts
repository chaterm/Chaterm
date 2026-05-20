import type { OnboardingModuleId, OnboardingTourStep } from '@/store/onboardingStore'

export const onboardingTourSteps: Record<OnboardingModuleId, OnboardingTourStep[]> = {
  interfaceGuide: [
    {
      id: 'module-switcher',
      targetId: 'left-module-switcher',
      titleKey: 'onboarding.tours.interfaceGuide.moduleSwitcher.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.moduleSwitcher.description'
    },
    {
      id: 'function-panel',
      targetId: 'left-function-panel',
      titleKey: 'onboarding.tours.interfaceGuide.functionPanel.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.functionPanel.description'
    },
    {
      id: 'workspace',
      targetId: 'main-workspace-tabs',
      titleKey: 'onboarding.tours.interfaceGuide.workspace.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.workspace.description'
    },
    {
      id: 'top-controls',
      targetId: 'top-layout-controls',
      titleKey: 'onboarding.tours.interfaceGuide.topControls.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.topControls.description'
    },
    {
      id: 'ai-toggle',
      targetId: 'right-ai-toggle',
      titleKey: 'onboarding.tours.interfaceGuide.aiToggle.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.aiToggle.description',
      advanceOnTargetClick: true
    },
    {
      id: 'ai-sidebar',
      targetId: 'right-ai-sidebar',
      titleKey: 'onboarding.tours.interfaceGuide.aiSidebar.title',
      descriptionKey: 'onboarding.tours.interfaceGuide.aiSidebar.description'
    }
  ],
  systemSettings: [
    {
      id: 'setting-entry',
      targetId: 'setting-entry',
      titleKey: 'onboarding.tours.systemSettings.settingEntry.title',
      descriptionKey: 'onboarding.tours.systemSettings.settingEntry.description'
    },
    {
      id: 'settings-side-nav',
      targetId: 'settings-side-nav',
      titleKey: 'onboarding.tours.systemSettings.sideNav.title',
      descriptionKey: 'onboarding.tours.systemSettings.sideNav.description'
    },
    {
      id: 'general-settings',
      targetId: 'settings-general-content',
      titleKey: 'onboarding.tours.systemSettings.general.title',
      descriptionKey: 'onboarding.tours.systemSettings.general.description'
    },
    {
      id: 'background-settings',
      targetId: 'settings-background-section',
      titleKey: 'onboarding.tours.systemSettings.background.title',
      descriptionKey: 'onboarding.tours.systemSettings.background.description'
    },
    {
      id: 'background-preset',
      targetId: 'settings-background-preset',
      titleKey: 'onboarding.tours.systemSettings.backgroundPreset.title',
      descriptionKey: 'onboarding.tours.systemSettings.backgroundPreset.description',
      hideCard: true,
      advanceOnTargetClick: true
    },
    {
      id: 'terminal-tab',
      targetId: 'settings-terminal-tab',
      titleKey: 'onboarding.tours.systemSettings.terminalTab.title',
      descriptionKey: 'onboarding.tours.systemSettings.terminalTab.description'
    },
    {
      id: 'terminal-options',
      targetId: 'settings-terminal-options',
      titleKey: 'onboarding.tours.systemSettings.terminalOptions.title',
      descriptionKey: 'onboarding.tours.systemSettings.terminalOptions.description'
    },
    {
      id: 'ai-preferences-tab',
      targetId: 'settings-ai-preferences-tab',
      titleKey: 'onboarding.tours.systemSettings.aiPreferencesTab.title',
      descriptionKey: 'onboarding.tours.systemSettings.aiPreferencesTab.description',
      advanceOnTargetClick: true
    },
    {
      id: 'ai-preferences-content',
      targetId: 'settings-ai-preferences-content',
      titleKey: 'onboarding.tours.systemSettings.aiPreferencesContent.title',
      descriptionKey: 'onboarding.tours.systemSettings.aiPreferencesContent.description'
    },
    {
      id: 'ai-auto-approval',
      targetId: 'settings-ai-auto-approval',
      titleKey: 'onboarding.tours.systemSettings.aiAutoApproval.title',
      descriptionKey: 'onboarding.tours.systemSettings.aiAutoApproval.description',
      advanceOnEvent: 'onboarding:autoApprovalEnabled'
    }
  ],
  addAndConnectHost: [
    {
      id: 'assets-entry',
      targetId: 'assets-entry',
      titleKey: 'onboarding.tours.addAndConnectHost.assetsEntry.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.assetsEntry.description'
    },
    {
      id: 'host-management',
      targetId: 'host-management-entry',
      titleKey: 'onboarding.tours.addAndConnectHost.hostManagement.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.hostManagement.description'
    },
    {
      id: 'new-host',
      targetId: 'asset-new-host-button',
      titleKey: 'onboarding.tours.addAndConnectHost.newHost.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.newHost.description'
    },
    {
      id: 'form-fields',
      targetId: 'asset-form-fields',
      titleKey: 'onboarding.tours.addAndConnectHost.formFields.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.formFields.description'
    },
    {
      id: 'form-submit',
      targetId: 'asset-form-submit',
      titleKey: 'onboarding.tours.addAndConnectHost.formSubmit.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.formSubmit.description'
    },
    {
      id: 'connect-asset',
      targetId: 'asset-card',
      titleKey: 'onboarding.tours.addAndConnectHost.connectAsset.title',
      descriptionKey: 'onboarding.tours.addAndConnectHost.connectAsset.description'
    }
  ],
  aiChat: [
    {
      id: 'ai-sidebar-entry',
      targetId: 'right-ai-toggle',
      titleKey: 'onboarding.tours.aiChat.sidebar.title',
      descriptionKey: 'onboarding.tours.aiChat.sidebar.description',
      highlightTargetIds: ['left-ai-toggle'],
      advanceOnTargetClick: true,
      advanceOnTargetIds: ['right-ai-toggle', 'left-ai-toggle']
    },
    {
      id: 'ai-sidebar-overview',
      targetId: 'right-ai-sidebar',
      titleKey: 'onboarding.tours.aiChat.sidebarOverview.title',
      descriptionKey: 'onboarding.tours.aiChat.sidebarOverview.description'
    },
    {
      id: 'ai-input',
      targetId: 'ai-input',
      titleKey: 'onboarding.tours.aiChat.input.title',
      descriptionKey: 'onboarding.tours.aiChat.input.description'
    },
    {
      id: 'ai-mode-agent',
      targetId: 'ai-mode-select',
      titleKey: 'onboarding.tours.aiChat.modeAgent.title',
      descriptionKey: 'onboarding.tours.aiChat.modeAgent.description',
      advanceOnTargetClick: true,
      advanceOnTargetIds: ['ai-mode-agent-option'],
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-model-open',
      targetId: 'ai-model-select',
      titleKey: 'onboarding.tours.aiChat.modelOpen.title',
      descriptionKey: 'onboarding.tours.aiChat.modelOpen.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-model-option',
      targetId: 'ai-model-option',
      titleKey: 'onboarding.tours.aiChat.modelOption.title',
      descriptionKey: 'onboarding.tours.aiChat.modelOption.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-context-open',
      targetId: 'ai-context-trigger',
      titleKey: 'onboarding.tours.aiChat.contextOpen.title',
      descriptionKey: 'onboarding.tours.aiChat.contextOpen.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-context-hosts',
      targetId: 'ai-context-hosts-menu',
      titleKey: 'onboarding.tours.aiChat.contextHosts.title',
      descriptionKey: 'onboarding.tours.aiChat.contextHosts.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-localhost-option',
      targetId: 'ai-localhost-option',
      titleKey: 'onboarding.tours.aiChat.localhost.title',
      descriptionKey: 'onboarding.tours.aiChat.localhost.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true,
      allowNextWithoutTargetClick: true
    },
    {
      id: 'ai-send',
      targetId: 'ai-send-button',
      titleKey: 'onboarding.tours.aiChat.send.title',
      descriptionKey: 'onboarding.tours.aiChat.send.description',
      advanceOnTargetClick: true,
      requiresTargetClick: true
    }
  ]
}

export const getOnboardingTourSteps = (moduleId: OnboardingModuleId | null): OnboardingTourStep[] => {
  if (!moduleId) return []
  return onboardingTourSteps[moduleId] || []
}
