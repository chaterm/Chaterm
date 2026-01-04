/**
 * Check if an element is within the AITab component
 * @param element - The element to check
 * @returns true if the element is within AITab component, false otherwise
 */
export function isElementInAiTab(element: HTMLElement | null): boolean {
  if (!element) {
    return false
  }

  // Check if element is within right sidebar (terminal mode)
  const rightSidebar = document.querySelector('.rigth-sidebar')
  if (rightSidebar?.contains(element)) {
    return true
  }

  // Check if element is within agents chat container (agents mode)
  const agentsChatContainer = document.querySelector('.agents-chat-container')
  if (agentsChatContainer?.contains(element)) {
    return true
  }

  // Check if element is within AI chat tabs
  if (element.closest('.ai-chat-custom-tabs')) {
    return true
  }

  // Check if element is the chat textarea
  if (element.classList.contains('chat-textarea')) {
    return true
  }

  return false
}

/**
 * Check if the focus is currently within the AITab component
 * @param event - The keyboard event (optional, may have null target for synthetic events)
 * @returns true if focus is within AITab component, false otherwise
 */
export function isFocusInAiTab(event?: KeyboardEvent): boolean {
  const target = event?.target as HTMLElement | null
  const activeElement = document.activeElement as HTMLElement | null

  // Check both event target and active element
  return isElementInAiTab(target) || isElementInAiTab(activeElement)
}
