<template>
  <div class="tabs-panel">
    <template v-if="tabs && tabs.length">
      <draggable
        v-model="localTabs"
        class="tabs-bar"
        :animation="150"
        handle=".tab-title"
        item-key="id"
        @end="onDragEnd"
      >
        <template #item="{ element: tab }">
          <div :class="{ 'tab-item': true, active: tab.id === activeTab }">
            <span class="tab-title" @click="$emit('change-tab', tab.id)">{{
              tab.ip ? tab.title : $t(`common.${tab.title}`)
            }}</span>
            <button class="close-btn" @click.stop="$emit('close-tab', tab.id)">&times;</button>
          </div>
        </template>
      </draggable>
      <div class="tabs-content">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ 'tab-content': true, active: tab.id === activeTab }"
        >
          <Term :ref="(el) => setTermRef(el, tab.id)" v-if="tab.type == 'term'" :serverInfo="tab" />
          <UserInfo v-if="tab.content === 'userInfo'" />
          <userConfig v-if="tab.content === 'userConfig'" />
          <aliasConfig v-if="tab.content === 'aliasConfig'" />
        </div>
      </div>
    </template>
    <template v-else>
      <Dashboard />
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import Term from '@views/components/Term/index.vue'
import Dashboard from '@views/components/Term/dashboard.vue'
import UserInfo from '@views/components/LeftTab/userInfo.vue'
import userConfig from '@views/components/LeftTab/userConfig.vue'
import aliasConfig from '@views/components/Extensions/aliasConfig.vue'

const props = defineProps({
  tabs: {
    type: Array,
    required: true
  },
  activeTab: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['close-tab', 'change-tab', 'update-tabs', 'refresh-tab-name'])
const localTabs = computed({
  get: () => props.tabs,
  set: (value) => {
    emit('update-tabs', value)
  }
})
const onDragEnd = () => {}
const termRefMap = ref([])
const setTermRef = (el, tabId) => {
  if (el) {
    termRefMap.value[tabId] = el
  } else {
    delete termRefMap.value[tabId]
  }
}
const resizeTerm = (termid = '') => {
  if (termid) {
    setTimeout(() => {
      termRefMap.value[termid].handleResize()
    })
  } else {
    const keys = Object.keys(termRefMap.value)
    if (keys.length == 0) return
    for (let i = 0; i < keys.length; i++) {
      termRefMap.value[keys[i]].handleResize()
    }
  }
}
const refreshTabName = function () {
  emit('refresh-tab-name')
}

defineExpose({
  resizeTerm
})
</script>

<style scoped>
.tabs-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tabs-bar {
  display: flex;
  background-color: #1a1a1a;
  border-bottom: 1px solid #414141;
  overflow-x: auto;
  user-select: none;
  height: 35px;
}

.tab-item {
  display: flex;
  align-items: center;
  padding: 0 4px;
  border-right: 1px solid #414141;
  background-color: #1a1a1a;
  width: 170px;
}

.tab-item.active {
  background-color: #414141;
  border-bottom: 2px solid #007acc;
}

.tab-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  margin-left: 8px;
  padding: 0 4px;
  color: #666;
}

.close-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.tabs-content {
  flex: 1;
  overflow: auto;
  background-color: #1a1a1a;
  padding: 4px;
}

.tab-content {
  display: none;
  height: 100%;
}

.tab-content.active {
  display: block;
}

/* 拖拽时的样式 */
.sortable-chosen {
  opacity: 0.8;
  background-color: #e0e0e0 !important;
}

.sortable-ghost {
  opacity: 0.4;
  background-color: #ccc !important;
}
</style>
