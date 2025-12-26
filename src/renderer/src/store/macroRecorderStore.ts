import { defineStore } from 'pinia'
import eventBus from '@/utils/eventBus'

// Recording time limit: 5 minutes
const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000
// Maximum number of commands
const MAX_COMMAND_COUNT = 50
// Default minimum sleep threshold in milliseconds
const DEFAULT_SLEEP_THRESHOLD_MS = 500

// Timer ID for auto-stop (stored outside state to avoid reactivity)
let autoStopTimerId: ReturnType<typeof setTimeout> | null = null

// Command entry with timestamp for calculating delays
interface CommandEntry {
  command: string
  timestamp: number
}

export interface MacroRecorderState {
  isRecording: boolean
  terminalId: string | null
  commandBuffer: CommandEntry[]
  currentLineBuffer: string
  recordingStartTime: number | null
  defaultSnippetName: string
  targetGroupUuid: string | null
  // Whether to record control keys (arrows, esc, tab, ctrl combinations)
  // These are supported by commandScript.ts for execution
  recordControlKeys: boolean
  // Minimum delay threshold for generating sleep commands (ms)
  sleepThresholdMs: number
}

export const useMacroRecorderStore = defineStore('macroRecorder', {
  state: (): MacroRecorderState => ({
    isRecording: false,
    terminalId: null,
    commandBuffer: [],
    currentLineBuffer: '',
    recordingStartTime: null,
    defaultSnippetName: '',
    targetGroupUuid: null,
    recordControlKeys: true, // Default: record control keys (they are executable)
    sleepThresholdMs: DEFAULT_SLEEP_THRESHOLD_MS // Configurable sleep threshold
  }),

  getters: {
    // Check if currently recording
    getIsRecording: (state) => state.isRecording,

    // Get bound terminal ID
    getBoundTerminalId: (state) => state.terminalId,

    // Get recorded command count
    getCommandCount: (state) => state.commandBuffer.length,

    // Get all recorded commands as content string with sleep commands
    getRecordedContent: (state) => {
      if (state.commandBuffer.length === 0) return ''

      const result: string[] = []
      for (let i = 0; i < state.commandBuffer.length; i++) {
        const entry = state.commandBuffer[i]

        // Add sleep command if delay exceeds threshold
        if (i > 0) {
          const prevEntry = state.commandBuffer[i - 1]
          const delay = entry.timestamp - prevEntry.timestamp
          if (delay >= state.sleepThresholdMs) {
            result.push(`sleep==${delay}`)
          }
        }

        result.push(entry.command)
      }

      return result.join('\n')
    },

    // Check if reached command limit
    hasReachedCommandLimit: (state) => state.commandBuffer.length >= MAX_COMMAND_COUNT,

    // Get recording duration in milliseconds
    getRecordingDuration: (state) => {
      if (!state.recordingStartTime) return 0
      return Date.now() - state.recordingStartTime
    }
  },

  actions: {
    // Generate default snippet name with timestamp
    generateDefaultName(): string {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      const second = String(now.getSeconds()).padStart(2, '0')
      return `macro-${year}${month}${day}-${hour}${minute}${second}`
    },

    // Set whether to record control keys
    setRecordControlKeys(enabled: boolean): void {
      this.recordControlKeys = enabled
    },

    // Set sleep threshold in milliseconds
    setSleepThreshold(ms: number): void {
      this.sleepThresholdMs = Math.max(0, ms)
    },

    // Check if limit is reached and return reason
    isOverLimit(now: number): 'time' | 'count' | null {
      // Use >= to include boundary (exactly 5 min or 50 commands)
      if (this.recordingStartTime && now - this.recordingStartTime >= MAX_RECORDING_DURATION_MS) {
        return 'time'
      }
      if (this.commandBuffer.length >= MAX_COMMAND_COUNT) {
        return 'count'
      }
      return null
    },

    // Auto-stop recording when limits are reached
    // This actually stops recording and emits event with the result
    autoStop(reason: 'time' | 'count'): void {
      if (!this.isRecording) {
        return
      }

      console.warn(`[MacroRecorder] Auto-stopping: ${reason === 'time' ? 'time limit reached' : 'command limit reached'}`)

      // Clear auto-stop timer
      this.clearAutoStopTimer()

      // Preserve current buffer content before stopping
      if (this.currentLineBuffer.length > 0) {
        this.commandBuffer.push({
          command: this.currentLineBuffer,
          timestamp: Date.now()
        })
      }

      // Get the recorded content before resetting state
      const result = {
        content: this.getRecordedContent,
        name: this.defaultSnippetName,
        groupUuid: this.targetGroupUuid
      }

      // Reset state - actually stop recording
      this.isRecording = false
      this.terminalId = null
      this.commandBuffer = []
      this.currentLineBuffer = ''
      this.recordingStartTime = null
      this.targetGroupUuid = null

      // Emit event with reason and result for UI to handle saving
      eventBus.emit('macroRecordingLimitReached', { reason, result })
    },

    // Add command to buffer with limit check
    // Returns false if limit reached (recording will auto-stop)
    addCommandToBuffer(command: string, timestamp: number): boolean {
      if (this.commandBuffer.length >= MAX_COMMAND_COUNT) {
        this.autoStop('count')
        return false
      }
      this.commandBuffer.push({ command, timestamp })
      return true
    },

    // Start recording for a specific terminal
    startRecording(terminalId: string, groupUuid: string | null = null): boolean {
      if (this.isRecording) {
        console.warn('[MacroRecorder] Already recording')
        return false
      }

      if (!terminalId) {
        console.warn('[MacroRecorder] No terminal ID provided')
        return false
      }

      this.isRecording = true
      this.terminalId = terminalId
      this.commandBuffer = []
      this.currentLineBuffer = ''
      this.recordingStartTime = Date.now()
      this.defaultSnippetName = this.generateDefaultName()
      this.targetGroupUuid = groupUuid

      // Set up auto-stop timer for time limit
      this.clearAutoStopTimer()
      autoStopTimerId = setTimeout(() => {
        if (this.isRecording) {
          this.autoStop('time')
        }
      }, MAX_RECORDING_DURATION_MS)

      console.log(`[MacroRecorder] Started recording for terminal: ${terminalId}`)
      return true
    },

    // Stop recording and return recorded content
    stopRecording(): { content: string; name: string; groupUuid: string | null } | null {
      if (!this.isRecording) {
        console.warn('[MacroRecorder] Not currently recording')
        return null
      }

      // Clear auto-stop timer
      this.clearAutoStopTimer()

      // If there's unfinished content in current line buffer, add it
      // Use length > 0 instead of trim() to preserve intentional spaces
      if (this.currentLineBuffer.length > 0) {
        this.commandBuffer.push({
          command: this.currentLineBuffer,
          timestamp: Date.now()
        })
      }

      const result = {
        content: this.getRecordedContent,
        name: this.defaultSnippetName,
        groupUuid: this.targetGroupUuid
      }

      // Reset state
      this.isRecording = false
      this.terminalId = null
      this.commandBuffer = []
      this.currentLineBuffer = ''
      this.recordingStartTime = null
      this.targetGroupUuid = null

      console.log(`[MacroRecorder] Stopped recording`)
      return result
    },

    // Append input character to current line buffer
    // Called from terminal input handler
    appendInput(termId: string, char: string): void {
      // Skip if not recording or terminal doesn't match
      if (!this.isRecording || this.terminalId !== termId) {
        return
      }

      // Cache timestamp once for consistency
      const now = Date.now()

      // Check time limit at the beginning
      const limitReason = this.isOverLimit(now)
      if (limitReason) {
        this.autoStop(limitReason)
        return
      }

      // Handle special characters
      if (char === '\r' || char === '\n') {
        // Enter pressed - commit current line as a command
        // Use length > 0 instead of trim() to preserve intentional spaces
        if (this.currentLineBuffer.length > 0) {
          this.addCommandToBuffer(this.currentLineBuffer, now)
        }
        this.currentLineBuffer = ''
      } else if (char === '\x7f' || char === '\b') {
        // Backspace - remove last character from buffer
        if (this.currentLineBuffer.length > 0) {
          this.currentLineBuffer = this.currentLineBuffer.slice(0, -1)
        }
      } else if (char === '\x1b') {
        // Single ESC key - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('esc', now)
        }
      } else if (char === '\x1b[A') {
        // Up arrow - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('up', now)
        }
      } else if (char === '\x1b[B') {
        // Down arrow - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('down', now)
        }
      } else if (char === '\x1b[C') {
        // Right arrow - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('right', now)
        }
      } else if (char === '\x1b[D') {
        // Left arrow - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('left', now)
        }
      } else if (char.startsWith('\x1b')) {
        // Other escape sequences - ignore
        return
      } else if (char === '\x03') {
        // Ctrl+C - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('ctrl+c', now)
        }
        this.currentLineBuffer = ''
      } else if (char === '\x04') {
        // Ctrl+D - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('ctrl+d', now)
        }
      } else if (char === '\x1a') {
        // Ctrl+Z - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('ctrl+z', now)
        }
      } else if (char === '\t') {
        // Tab key - only record if control keys enabled
        if (this.recordControlKeys) {
          this.addCommandToBuffer('tab', now)
        }
      } else if (char.length === 1 && char.charCodeAt(0) >= 32) {
        // Normal printable character
        this.currentLineBuffer += char
      } else if (char.length > 1 && !char.includes('\x1b')) {
        // Pasted text or programmatic input without escape sequences
        // Split on any line ending: \r\n (Windows), \n (Unix), or \r (Mac/carriage return)
        const lines = char.split(/\r\n|\r|\n/)
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            // For lines after the first, commit previous line
            // Use length > 0 instead of trim() to preserve intentional spaces
            if (this.currentLineBuffer.length > 0) {
              if (!this.addCommandToBuffer(this.currentLineBuffer, now)) {
                return // Limit reached, recording auto-stopped
              }
            }
            this.currentLineBuffer = ''
          }
          this.currentLineBuffer += lines[i]
        }
      }
    },

    // Check if recording should auto-stop due to limits
    checkLimits(): { shouldStop: boolean; reason: string | null } {
      if (!this.isRecording) {
        return { shouldStop: false, reason: null }
      }

      const reason = this.isOverLimit(Date.now())
      if (reason) {
        return { shouldStop: true, reason }
      }

      return { shouldStop: false, reason: null }
    },

    // Clear auto-stop timer
    clearAutoStopTimer(): void {
      if (autoStopTimerId !== null) {
        clearTimeout(autoStopTimerId)
        autoStopTimerId = null
      }
    },

    // Cancel recording without saving
    cancelRecording(): void {
      this.clearAutoStopTimer()
      this.isRecording = false
      this.terminalId = null
      this.commandBuffer = []
      this.currentLineBuffer = ''
      this.recordingStartTime = null
      this.targetGroupUuid = null
      console.log('[MacroRecorder] Recording cancelled')
    }
  }
})
