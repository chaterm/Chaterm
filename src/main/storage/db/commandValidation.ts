/**
 * Validates whether a command string is safe and well-formed for storage.
 * Extracted from autoCompleteDatabaseService for shared use.
 */
export function isValidCommand(command: string): boolean {
  // Remove leading/trailing spaces
  command = command.trim()

  // Empty command
  if (!command) return false

  // Command length limit (1-255 characters)
  if (command.length < 1 || command.length > 255) return false

  // Not allowed to start with these special characters, but ./ and ~/ are allowed
  const invalidStartChars = /^[!@#$%^&*()+=\-[\]{};:'"\\|,<>?`]/
  if (invalidStartChars.test(command)) return false

  // Special handling for commands starting with .: only ./ is allowed, other cases starting with . are not allowed
  if (command.startsWith('.') && !command.startsWith('./')) {
    return false
  }

  // Not allowed to have three or more consecutive identical characters at the beginning
  if (/^(.)\1{2,}/.test(command)) return false

  // Not allowed to contain these dangerous character combinations
  const dangerousPatterns = [
    /rm\s+-rf\s+\//, // Delete root directory
    />[>&]?\/dev\/sd[a-z]/, // Write to disk device
    /mkfs\./, // Format command
    /dd\s+if=.*of=\/dev\/sd[a-z]/, // DD write to disk
    /:\(\)\{\s*:\|:&\s*\};:/ // Fork bomb
  ]

  if (dangerousPatterns.some((pattern) => pattern.test(command))) return false

  // Allow common symbols like pipes, parallel execution, redirection | & > < ; + =
  // Support URL/scp-like forms by allowing ':' and '@'
  const validCommandFormat = /^(?:\.\/|~\/|[\p{L}_]|\p{N})[\p{L}\p{N}\s\-./:@|&><;+=_~`"'()[\]{}!#$%*?\\,^]*$/u

  if (!validCommandFormat.test(command)) return false

  return true
}
