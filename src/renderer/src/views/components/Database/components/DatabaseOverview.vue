<template>
  <div class="db-overview">
    <div class="db-overview__header">
      <span class="db-overview__title">{{ $t('database.overview') }}</span>
    </div>
    <div class="db-overview__body">
      <p class="db-overview__lead">{{ $t('database.overviewLead') }}</p>
      <ul class="db-overview__tips">
        <li>{{ $t('database.overviewTipExplore') }}</li>
        <li>{{ $t('database.overviewTipConnection') }}</li>
        <li>{{ $t('database.overviewTipQuery') }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="less" scoped>
.db-overview {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--bg-color);
  color: var(--text-color);

  &__header {
    margin-bottom: 16px;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
  }

  &__body {
    color: var(--text-color-secondary, #8a94a6);
    font-size: 13px;
    line-height: 1.6;
  }

  &__lead {
    margin-bottom: 12px;
  }

  &__tips {
    margin: 0;
    padding-left: 18px;
  }
}
</style>
