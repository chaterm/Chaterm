<template>
  <div class="dashboard-container">
    <div class="welcome-content">
      <img
        class="logo"
        src="@/assets/logo.svg"
        alt="logo"
      />
      <div class="welcome-title">{{ $t('term.welcome') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="less" scoped>
.dashboard-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  padding-top: 25vh;
}

.welcome-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 32px 40px;
  @media (max-width: 600px) {
    flex-direction: column;
    padding: 20px 10px;
    gap: 12px;
  }
}

.logo {
  margin-bottom: 0px;
  width: 40px;
  height: 40px;
  &:hover {
    transform: scale(1.05);
  }
}

.welcome-title {
  font-size: 20px;
  font-weight: bold;
  background: linear-gradient(90deg, #00eaff 0%, #1677ff 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  line-height: 56px;
  margin: 0;
  letter-spacing: 1px;
}
</style>
