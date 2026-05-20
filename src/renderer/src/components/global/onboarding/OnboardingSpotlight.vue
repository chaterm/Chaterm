<template>
  <div
    v-if="activeStep"
    class="spotlight-root"
  >
    <template v-if="targetRect">
      <div
        v-for="mask in masks"
        :key="mask.key"
        class="spotlight-mask"
        :style="mask.style"
        @click="handleMaskClick"
      ></div>
      <div
        class="spotlight-highlight"
        :style="highlightStyle"
      ></div>
      <div
        v-for="(style, index) in secondaryHighlightStyles"
        :key="`secondary-highlight-${index}`"
        class="spotlight-highlight spotlight-highlight-secondary"
        :style="style"
      ></div>
    </template>
    <div
      v-else
      class="spotlight-mask spotlight-mask-full"
      @click="handleMaskClick"
    ></div>

    <div
      v-if="showCard"
      class="spotlight-card"
      :class="{ fallback: !targetRect }"
      :style="cardStyle"
    >
      <button
        type="button"
        class="close-button"
        :aria-label="t('common.close')"
        @click="stopTour"
      >
        ×
      </button>
      <h3>{{ t(activeStep.titleKey) }}</h3>
      <p>{{ t(activeStep.descriptionKey) }}</p>
      <p
        v-if="!targetRect"
        class="fallback-text"
      >
        {{ t('onboarding.spotlight.targetMissing') }}
      </p>
      <div class="spotlight-footer">
        <span>{{ t('onboarding.spotlight.progress', { current: activeStepIndex + 1, total: steps.length }) }}</span>
        <div class="spotlight-actions">
          <a-button
            v-if="activeStepIndex > 0"
            size="small"
            @click="prevStep"
          >
            {{ t('onboarding.spotlight.previous') }}
          </a-button>
          <a-button
            v-if="showNextButton"
            size="small"
            type="primary"
            @click="nextStep"
          >
            {{ isLastStep ? t('onboarding.spotlight.finish') : t('onboarding.spotlight.next') }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import i18n from '@/locales'
import { useOnboardingStore, type OnboardingModuleId } from '@/store/onboardingStore'
import eventBus from '@/utils/eventBus'
import { getOnboardingTourSteps } from './tourDefinitions'
import { prepareOnboardingStep } from './onboardingActions'

const { t } = i18n.global
const onboardingStore = useOnboardingStore()
const targetRect = ref<DOMRect | null>(null)
const secondaryTargetRects = ref<DOMRect[]>([])

const margin = 8
const safeInset = 16
const cardGap = 12
const cardWidth = 304
const cardHeightEstimate = 190

const steps = computed(() => getOnboardingTourSteps(onboardingStore.activeTour))
const activeStepIndex = computed(() => onboardingStore.activeStepIndex)
const activeStep = computed(() => steps.value[activeStepIndex.value])
const isLastStep = computed(() => activeStepIndex.value >= steps.value.length - 1)
const showCard = computed(() => Boolean(activeStep.value && (!activeStep.value.hideCard || !targetRect.value)))
const showNextButton = computed(() =>
  Boolean(!activeStep.value?.requiresTargetClick || activeStep.value.allowNextWithoutTargetClick || !targetRect.value)
)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

const createHighlightRect = (rect: DOMRect): HighlightRect => ({
  top: Math.max(0, rect.top - margin),
  left: Math.max(0, rect.left - margin),
  width: Math.min(window.innerWidth, rect.width + margin * 2),
  height: Math.min(window.innerHeight, rect.height + margin * 2)
})

const getHighlightStyle = (rect: HighlightRect): CSSProperties => ({
  top: `${rect.top}px`,
  left: `${rect.left}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`
})

const highlightRect = computed(() => {
  if (!targetRect.value) return null
  return createHighlightRect(targetRect.value)
})

const secondaryHighlightStyles = computed<CSSProperties[]>(() => secondaryTargetRects.value.map(createHighlightRect).map(getHighlightStyle))

const highlightStyle = computed<CSSProperties>(() => {
  const rect = highlightRect.value
  if (!rect) return {}
  return getHighlightStyle(rect)
})

const masks = computed(() => {
  const rect = highlightRect.value
  if (!rect) return []
  const rightWidth = Math.max(0, window.innerWidth - rect.left - rect.width)
  const bottomTop = rect.top + rect.height
  return [
    { key: 'top', style: { top: '0px', left: '0px', width: '100vw', height: `${rect.top}px` } },
    { key: 'left', style: { top: `${rect.top}px`, left: '0px', width: `${rect.left}px`, height: `${rect.height}px` } },
    { key: 'right', style: { top: `${rect.top}px`, left: `${rect.left + rect.width}px`, width: `${rightWidth}px`, height: `${rect.height}px` } },
    { key: 'bottom', style: { top: `${bottomTop}px`, left: '0px', width: '100vw', height: `${Math.max(0, window.innerHeight - bottomTop)}px` } }
  ]
})

const cardStyle = computed<CSSProperties>(() => {
  const rect = highlightRect.value
  const maxHeight = `calc(100vh - ${safeInset * 2}px)`
  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxHeight
    }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxTop = Math.max(safeInset, viewportHeight - cardHeightEstimate - safeInset)
  const maxLeft = Math.max(safeInset, viewportWidth - cardWidth - safeInset)
  const alignedTop = clamp(rect.top, safeInset, maxTop)
  const alignedLeft = clamp(rect.left, safeInset, maxLeft)
  const rightSpace = viewportWidth - rect.left - rect.width - cardGap - safeInset
  const leftSpace = rect.left - cardGap - safeInset
  const bottomSpace = viewportHeight - rect.top - rect.height - cardGap - safeInset
  const topSpace = rect.top - cardGap - safeInset

  const outsideCandidates = [
    rightSpace >= cardWidth ? { top: alignedTop, left: rect.left + rect.width + cardGap } : null,
    leftSpace >= cardWidth ? { top: alignedTop, left: rect.left - cardWidth - cardGap } : null,
    bottomSpace >= cardHeightEstimate ? { top: rect.top + rect.height + cardGap, left: alignedLeft } : null,
    topSpace >= cardHeightEstimate ? { top: rect.top - cardHeightEstimate - cardGap, left: alignedLeft } : null
  ].filter(Boolean) as Array<{ top: number; left: number }>

  const position =
    outsideCandidates[0] ||
    [
      { top: safeInset, left: safeInset },
      { top: safeInset, left: maxLeft },
      { top: maxTop, left: safeInset },
      { top: maxTop, left: maxLeft }
    ].sort((a, b) => overlapArea(a, rect) - overlapArea(b, rect))[0]

  return {
    top: `${position.top}px`,
    left: `${position.left}px`,
    maxHeight
  }
})

const overlapArea = (cardPosition: { top: number; left: number }, rect: HighlightRect) => {
  const xOverlap = Math.max(0, Math.min(cardPosition.left + cardWidth, rect.left + rect.width) - Math.max(cardPosition.left, rect.left))
  const yOverlap = Math.max(0, Math.min(cardPosition.top + cardHeightEstimate, rect.top + rect.height) - Math.max(cardPosition.top, rect.top))
  return xOverlap * yOverlap
}

const getTargetCandidates = (targetId: string) => Array.from(document.querySelectorAll(`[data-onboarding-id="${targetId}"]`)) as HTMLElement[]

const getInteractiveTarget = (target: HTMLElement) =>
  (target.closest('.ant-select-item-option, .ant-select-item, .menu-item, .select-item') as HTMLElement | null) || target

const isVisibleTarget = (target: HTMLElement) => {
  const rect = target.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const resolveTargetElement = (targetId: string) => {
  const targets = getTargetCandidates(targetId).map(getInteractiveTarget).filter(isVisibleTarget)

  if (!targets.length) return null

  return targets.find((target) => target.closest('.ant-select-dropdown, .context-select-popup')) || targets[0]
}

const resolveClickTargetElement = (targetId: string) =>
  resolveTargetElement(targetId) || getTargetCandidates(targetId).map(getInteractiveTarget)[0] || null

const resolveHighlightRects = (targetIds: string[] = []) =>
  targetIds
    .map(resolveTargetElement)
    .filter((target): target is HTMLElement => Boolean(target))
    .map((target) => target.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)

const getAdvanceTargetIds = () => {
  const step = activeStep.value
  if (!step) return []
  return step.advanceOnTargetIds?.length ? step.advanceOnTargetIds : [step.targetId]
}

const isPointInsideRect = (event: MouseEvent, target: HTMLElement) => {
  const rect = target.getBoundingClientRect()
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
}

const refreshTarget = async () => {
  const step = activeStep.value
  if (!step) {
    targetRect.value = null
    secondaryTargetRects.value = []
    return
  }

  await nextTick()
  ;[80, 260, 520, 900, 1400].forEach((delay) => {
    window.setTimeout(() => {
      if (activeStep.value?.id !== step.id) return

      const target = resolveTargetElement(step.targetId)
      if (!target) {
        targetRect.value = null
        secondaryTargetRects.value = []
        return
      }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const rect = target.getBoundingClientRect()
      targetRect.value = rect.width > 0 && rect.height > 0 ? rect : null
      secondaryTargetRects.value = targetRect.value ? resolveHighlightRects(step.highlightTargetIds) : []
    }, delay)
  })
}

const prevStep = () => {
  const nextIndex = Math.max(0, activeStepIndex.value - 1)
  onboardingStore.setActiveStepIndex(nextIndex)
}

const completeTour = () => {
  if (onboardingStore.activeTour && onboardingStore.activeTour !== 'addAndConnectHost') {
    onboardingStore.markModuleComplete(onboardingStore.activeTour)
  }
  onboardingStore.stopTour()
}

const nextStep = () => {
  if (isLastStep.value) {
    completeTour()
    return
  }
  onboardingStore.setActiveStepIndex(activeStepIndex.value + 1)
}

const stopTour = () => {
  onboardingStore.stopTour()
}

const handleTargetActivation = (event: MouseEvent) => {
  const step = activeStep.value
  if (!step?.advanceOnTargetClick) return

  const clickedTarget = getAdvanceTargetIds().some((targetId) => {
    const target = resolveClickTargetElement(targetId)
    return Boolean(target?.contains(event.target as Node))
  })
  if (!clickedTarget) return

  window.setTimeout(() => {
    if (activeStep.value?.id === step.id) {
      nextStep()
    }
  }, 80)
}

const handleMaskClick = (event: MouseEvent) => {
  const step = activeStep.value
  if (!step?.advanceOnTargetClick) return

  const clickedTarget = getAdvanceTargetIds()
    .map(resolveTargetElement)
    .find((target): target is HTMLElement => Boolean(target && isPointInsideRect(event, target)))

  if (!clickedTarget) return

  event.preventDefault()
  event.stopPropagation()
  clickedTarget.click()
}

const handleAutoApprovalEnabled = () => {
  if (activeStep.value?.advanceOnEvent === 'onboarding:autoApprovalEnabled') {
    nextStep()
  }
}

const handleStartTour = (moduleId: OnboardingModuleId) => {
  onboardingStore.startTour(moduleId)
}

watch(
  () => [onboardingStore.activeTour, onboardingStore.activeStepIndex] as const,
  () => {
    const step = activeStep.value
    if (step && onboardingStore.activeTour) {
      prepareOnboardingStep(onboardingStore.activeTour, step.id)
    }
    refreshTarget()
  },
  { immediate: true }
)

onMounted(() => {
  onboardingStore.ensureV2State()
  eventBus.on('onboarding:startTour', handleStartTour)
  eventBus.on('onboarding:stopTour', stopTour)
  eventBus.on('onboarding:autoApprovalEnabled', handleAutoApprovalEnabled)
  window.addEventListener('resize', refreshTarget)
  window.addEventListener('scroll', refreshTarget, true)
  window.addEventListener('mousedown', handleTargetActivation, true)
  window.addEventListener('click', handleTargetActivation, true)
})

onBeforeUnmount(() => {
  eventBus.off('onboarding:startTour', handleStartTour)
  eventBus.off('onboarding:stopTour', stopTour)
  eventBus.off('onboarding:autoApprovalEnabled', handleAutoApprovalEnabled)
  window.removeEventListener('resize', refreshTarget)
  window.removeEventListener('scroll', refreshTarget, true)
  window.removeEventListener('mousedown', handleTargetActivation, true)
  window.removeEventListener('click', handleTargetActivation, true)
})
</script>

<style lang="less" scoped>
.spotlight-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: none;
}

.spotlight-mask {
  position: fixed;
  background: rgba(0, 0, 0, 0.68);
  pointer-events: auto;
}

.spotlight-mask-full {
  inset: 0;
}

.spotlight-highlight {
  position: fixed;
  border: 2px solid var(--button-bg-color);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.28),
    0 8px 28px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.spotlight-highlight-secondary {
  background: rgba(22, 119, 255, 0.12);
}

.spotlight-card {
  position: fixed;
  width: 304px;
  padding: 16px;
  border-radius: 8px;
  color: var(--text-color);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
  overflow: auto;
  pointer-events: auto;

  h3 {
    margin: 0 22px 8px 0;
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: var(--text-color-secondary);
    font-size: 13px;
    line-height: 1.55;
  }
}

.fallback {
  text-align: left;
}

.fallback-text {
  margin-top: 8px !important;
  color: var(--text-color-tertiary) !important;
}

.close-button {
  position: absolute;
  top: 8px;
  right: 10px;
  border: 0;
  color: var(--text-color-secondary);
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.spotlight-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;

  span {
    color: var(--text-color-tertiary);
    font-size: 12px;
  }
}

.spotlight-actions {
  display: flex;
  gap: 6px;
}
</style>
