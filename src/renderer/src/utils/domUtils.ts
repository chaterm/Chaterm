/**
 * Check if the focus is currently within the AITab component
 * @param event - The keyboard event
 * @returns true if focus is within AITab component, false otherwise
 */
export function isFocusInAiTab(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement
  const activeElement = document.activeElement as HTMLElement

  // Check if event target or active element is within AITab component
  // AITab component is wrapped in .rigth-sidebar container
  const rightSidebar = document.querySelector('.rigth-sidebar')
  const isInAiTab =
    (rightSidebar && (rightSidebar.contains(target) || rightSidebar.contains(activeElement))) ||
    target.closest('.ai-chat-custom-tabs') !== null ||
    activeElement?.closest('.ai-chat-custom-tabs') !== null ||
    target.classList.contains('chat-textarea') ||
    activeElement?.classList.contains('chat-textarea')

  return isInAiTab
}
