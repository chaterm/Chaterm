<template>
  <div class="db-overview">
    <div class="db-overview__hero">
      <div class="db-overview__header">
        <span class="db-overview__eyebrow">{{ $t('database.overview') }}</span>
        <h2 class="db-overview__title">{{ $t('database.overview') }}</h2>
        <p class="db-overview__lead">{{ $t('database.overviewLead') }}</p>
      </div>
      <div class="db-overview__actions">
        <div class="db-overview__action-chip">
          <span class="db-overview__action-kicker">+</span>
          <span>{{ $t('database.overviewTipConnection') }}</span>
        </div>
        <div class="db-overview__action-chip">
          <span class="db-overview__action-kicker">/</span>
          <span>{{ $t('database.overviewTipExplore') }}</span>
        </div>
        <div class="db-overview__action-chip">
          <span class="db-overview__action-kicker">SQL</span>
          <span>{{ $t('database.overviewTipQuery') }}</span>
        </div>
      </div>
    </div>

    <div class="db-overview__panel">
      <div class="db-overview__panel-header">
        <div>
          <span class="db-overview__panel-title">{{ $t('database.newConnection') }}</span>
          <p class="db-overview__panel-copy">{{ $t('database.searchPlaceholder') }}</p>
        </div>
        <span class="db-overview__panel-count">{{ dbTypeOptions.length }}</span>
      </div>

      <div class="db-overview__engine-grid">
        <article
          v-for="option in dbTypeOptions"
          :key="option.code"
          class="db-overview__engine-card"
          :class="{
            'db-overview__engine-card--enabled': option.enabled,
            'db-overview__engine-card--disabled': !option.enabled
          }"
        >
          <div class="db-overview__engine-main">
            <img
              class="db-overview__engine-icon"
              :src="option.iconUrl"
              :alt="option.name"
              width="18"
              height="18"
            />
            <span class="db-overview__engine-name">{{ option.name }}</span>
          </div>
          <span
            v-if="!option.enabled"
            class="db-overview__engine-badge"
          >
            {{ $t('database.comingSoon') }}
          </span>
        </article>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { DATABASE_TYPE_OPTIONS } from '../constants/databaseTypes'

const dbTypeOptions = DATABASE_TYPE_OPTIONS
</script>

<style lang="less" scoped>
.db-overview {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgb(59 130 246 / 12%), transparent 32%), linear-gradient(180deg, rgb(255 255 255 / 1%) 0%, transparent 100%),
    var(--bg-color);
  color: var(--text-color);

  &__header {
    max-width: 760px;
  }

  &__hero {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px;
    background: linear-gradient(135deg, rgb(59 130 246 / 14%), rgb(15 23 42 / 0%));
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: 18px;
  }

  &__title {
    margin: 6px 0 10px;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-color);
  }

  &__eyebrow {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary-color, #60a5fa);
    background: rgb(59 130 246 / 12%);
  }

  &__lead {
    margin: 0;
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__actions {
    display: grid;
    gap: 10px;
    width: min(360px, 100%);
  }

  &__action-chip {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: 14px;
    background: rgb(15 23 42 / 30%);
    color: var(--text-color-secondary, #8a94a6);
    font-size: 13px;
    line-height: 1.5;
  }

  &__action-kicker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border-radius: 10px;
    color: var(--text-color);
    background: rgb(255 255 255 / 8%);
    font-size: 12px;
    font-weight: 600;
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 22px 24px 24px;
    background: rgb(255 255 255 / 2%);
    border: 1px solid var(--border-color);
    border-radius: 18px;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 3%);
  }

  &__panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  &__panel-title {
    display: block;
    margin-bottom: 6px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
  }

  &__panel-copy {
    margin: 0;
    font-size: 13px;
    color: var(--text-color-secondary, #8a94a6);
  }

  &__panel-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: rgb(255 255 255 / 6%);
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  &__engine-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 12px;
  }

  &__engine-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid rgb(255 255 255 / 6%);
    border-radius: 14px;
    background: rgb(255 255 255 / 3%);
    transition:
      border-color 0.18s ease,
      transform 0.18s ease,
      background-color 0.18s ease;

    &:hover {
      transform: translateY(-1px);
      border-color: rgb(96 165 250 / 28%);
      background: rgb(255 255 255 / 5%);
    }
  }

  &__engine-card--enabled {
    box-shadow: inset 0 0 0 1px rgb(34 197 94 / 10%);
  }

  &__engine-card--disabled {
    .db-overview__engine-icon,
    .db-overview__engine-name {
      opacity: 0.55;
    }
  }

  &__engine-main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  &__engine-icon {
    flex: 0 0 auto;
    object-fit: contain;
  }

  &__engine-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-color);
  }

  &__engine-badge {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 7%);
    color: var(--text-color-secondary, #8a94a6);
    font-size: 11px;
    line-height: 1;
  }

  &__tips {
    margin: 0;
    padding-left: 18px;
    color: var(--text-color-secondary, #8a94a6);
    font-size: 13px;
    line-height: 1.7;
  }

  @media (max-width: 960px) {
    padding: 18px;

    &__hero,
    &__panel {
      padding: 18px;
    }

    &__title {
      font-size: 22px;
    }
  }
}
</style>
