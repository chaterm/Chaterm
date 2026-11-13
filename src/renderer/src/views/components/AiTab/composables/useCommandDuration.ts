import { computed, onBeforeUnmount, ref, watch } from 'vue'

export interface CommandDurationSource {
  // Final duration once the command finished, otherwise counted from startedAt while it runs
  startedAt?: number
  durationMs?: number
  running?: boolean
}

export const formatCommandDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * Run time text of a command: the recorded duration once finished, a ticking count-up while running.
 */
export function useCommandDuration(source: () => CommandDurationSource) {
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | undefined

  const isTicking = computed(() => {
    const { durationMs, running, startedAt } = source()
    return durationMs === undefined && !!running && !!startedAt
  })

  const stopTicker = () => {
    clearInterval(ticker)
    ticker = undefined
  }

  watch(
    isTicking,
    (ticking) => {
      stopTicker()
      if (ticking) {
        now.value = Date.now()
        ticker = setInterval(() => {
          now.value = Date.now()
        }, 1000)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(stopTicker)

  return computed(() => {
    const { durationMs, startedAt } = source()
    if (durationMs !== undefined) return formatCommandDuration(durationMs)
    if (isTicking.value) return formatCommandDuration(Math.max(0, now.value - startedAt!))
    return ''
  })
}
