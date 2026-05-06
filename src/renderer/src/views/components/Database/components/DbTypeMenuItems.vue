<template>
  <!-- variant="menu" — embeds inside an a-menu / a-dropdown overlay -->
  <template v-if="variant === 'menu'">
    <template
      v-for="option in dbTypeOptions"
      :key="`${keyPrefix}-${option.code}`"
    >
      <a-menu-item
        v-if="option.enabled"
        :class="itemClass(option)"
        @click="emit('select', option.code)"
      >
        <span class="db-sidebar__db-option">
          <img
            class="db-sidebar__db-option-icon"
            :src="option.iconUrl"
            :alt="option.name"
            width="16"
            height="16"
          />
          <span class="db-sidebar__db-option-name">{{ option.name }}</span>
        </span>
      </a-menu-item>
      <a-menu-item
        v-else
        :disabled="true"
        :class="itemClass(option)"
      >
        <a-tooltip
          :title="t('database.comingSoon')"
          placement="right"
        >
          <span class="db-sidebar__db-option">
            <img
              class="db-sidebar__db-option-icon"
              :src="option.iconUrl"
              :alt="option.name"
              width="16"
              height="16"
            />
            <span class="db-sidebar__db-option-name">{{ option.name }}</span>
          </span>
        </a-tooltip>
      </a-menu-item>
    </template>
  </template>

  <!-- variant="plain" — standalone rendering, no a-menu wrapper required.
       Uses .ant-dropdown-menu-item so it inherits the shared overlay styling
       defined by .db-sidebar__menu-overlay. -->
  <template v-else>
    <template
      v-for="option in dbTypeOptions"
      :key="`${keyPrefix}-${option.code}`"
    >
      <li
        v-if="option.enabled"
        :class="['ant-dropdown-menu-item', ...itemClass(option)]"
        @click="emit('select', option.code)"
      >
        <span class="db-sidebar__db-option">
          <img
            class="db-sidebar__db-option-icon"
            :src="option.iconUrl"
            :alt="option.name"
            width="16"
            height="16"
          />
          <span class="db-sidebar__db-option-name">{{ option.name }}</span>
        </span>
      </li>
      <a-tooltip
        v-else
        :title="t('database.comingSoon')"
        placement="right"
      >
        <li :class="['ant-dropdown-menu-item', 'ant-dropdown-menu-item-disabled', ...itemClass(option)]">
          <span class="db-sidebar__db-option">
            <img
              class="db-sidebar__db-option-icon"
              :src="option.iconUrl"
              :alt="option.name"
              width="16"
              height="16"
            />
            <span class="db-sidebar__db-option-name">{{ option.name }}</span>
          </span>
        </li>
      </a-tooltip>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DatabaseType } from '../types'
import { DATABASE_TYPE_OPTIONS, type DatabaseTypeOption } from '../constants/databaseTypes'

const props = withDefaults(
  defineProps<{
    keyPrefix: string
    classPrefix: string
    variant?: 'menu' | 'plain'
  }>(),
  { variant: 'menu' }
)

const emit = defineEmits<{
  (e: 'select', dbType: DatabaseType): void
}>()

const { t } = useI18n()

const dbTypeOptions = computed<readonly DatabaseTypeOption[]>(() => DATABASE_TYPE_OPTIONS)

function itemClass(option: DatabaseTypeOption): string[] {
  const classes = [`${props.classPrefix}${option.code.toLowerCase()}`]
  if (!option.enabled) {
    classes.push('db-sidebar__db-option--disabled')
  }
  return classes
}
</script>
