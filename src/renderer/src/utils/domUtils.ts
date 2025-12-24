/**
 * Check if the focus is currently within the AITab component
 * @param event - The keyboard event (may have null target for synthetic events)
 * @returns true if focus is within AITab component, false otherwise
 */
export function isFocusInAiTab(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  const activeElement = document.activeElement as HTMLElement | null

  // Helper function to check if an element is within AITab
  const isElementInAiTab = (element: HTMLElement | null): boolean => {
    if (!element) {
      return false
    }

    // Check if element is within right sidebar
    const rightSidebar = document.querySelector('.rigth-sidebar')
    if (rightSidebar?.contains(element)) {
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

  // Check both event target and active element
  return isElementInAiTab(target) || isElementInAiTab(activeElement)
}
