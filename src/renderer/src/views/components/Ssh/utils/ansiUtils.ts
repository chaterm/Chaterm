// Pre-compiled regex constants for ANSI sequence stripping.
// Shared across sshConnect.vue, terminalPrompt.ts, and other terminal utilities.

const ANSI_COLOR_RE = /\x1b\[[0-9;]*m/g
const ANSI_CURSOR_MOVE_RE = /\x1b\[[0-9;]*[ABCDEFGJKST]/g
const ANSI_ERASE_RE = /\x1b\[[0-9]*[XK]/g
const ANSI_POSITION_RE = /\x1b\[[0-9;]*[Hf]/g
const ANSI_MODE_RE = /\x1b\[[?][0-9;]*[hl]/g
const OSC_TITLE_RE = /\x1b\]0;[^\x07]*\x07/g
const OSC_PS_RE = /\x1b\]9;[^\x07]*\x07/g
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

// Extended patterns (used in prompt detection and some output processing)
const ANSI_CURSOR_VISIBILITY_RE = /\x1b\[[?]25[hl]/g
const ANSI_ERASE_DISPLAY_RE = /\x1b\[[0-9;]*[JK]/g
const CONTROL_CHARS_EXTENDED_RE = /[\x00-\x07\x0B\x0C\x0E-\x1F\x7F]/g

/**
 * Strip basic ANSI sequences: color, cursor movement, erase, position, mode,
 * OSC title/PowerShell sequences, and control characters.
 * This is the most commonly used variant (8-pattern chain).
 */
export const stripAnsiBasic = (str: string): string =>
  str
    .replace(ANSI_COLOR_RE, '')
    .replace(ANSI_CURSOR_MOVE_RE, '')
    .replace(ANSI_ERASE_RE, '')
    .replace(ANSI_POSITION_RE, '')
    .replace(ANSI_MODE_RE, '')
    .replace(OSC_TITLE_RE, '')
    .replace(OSC_PS_RE, '')
    .replace(CONTROL_CHARS_RE, '')

/**
 * Strip extended ANSI sequences: everything in stripAnsiBasic plus cursor
 * visibility and erase-in-display sequences. Uses a slightly broader
 * control-character range (\x00-\x07 instead of \x00-\x08).
 * Used for prompt detection and detailed output cleaning.
 */
export const stripAnsiExtended = (str: string): string =>
  str
    .replace(ANSI_COLOR_RE, '')
    .replace(ANSI_CURSOR_MOVE_RE, '')
    .replace(ANSI_ERASE_RE, '')
    .replace(ANSI_POSITION_RE, '')
    .replace(ANSI_MODE_RE, '')
    .replace(OSC_TITLE_RE, '')
    .replace(OSC_PS_RE, '')
    .replace(ANSI_CURSOR_VISIBILITY_RE, '')
    .replace(ANSI_ERASE_DISPLAY_RE, '')
    .replace(CONTROL_CHARS_EXTENDED_RE, '')
