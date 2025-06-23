<template>
  <div>
    <v-contextmenu-item @click="onContextMenuAction('copy')">{{ $t('common.copy') }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('paste')">{{ $t('common.paste') }}</v-contextmenu-item>
    <!-- <v-contextmenu-item
        :disabled="true"
        @click="onContextMenuAction('saveAsConfig')"
        >另存为配置</v-contextmenu-item
      >
      <v-contextmenu-item
        :disabled="true"
        @click="onContextMenuAction('activityNotification')"
        >活动时通知</v-contextmenu-item
      >
      <v-contextmenu-item
        :disabled="true"
        @click="onContextMenuAction('focusAllTabs')"
        >聚焦所有标签页</v-contextmenu-item
      > -->
    <v-contextmenu-item
      :disabled="!props.isConnect"
      @click="onContextMenuAction('disconnect')"
      >{{ $t('common.disconnect') }}</v-contextmenu-item
    >
    <v-contextmenu-item
      :disabled="props.isConnect"
      @click="onContextMenuAction('reconnect')"
      >{{ $t('common.reconnect') }}</v-contextmenu-item
    >
    <!-- <v-contextmenu-item
        :disabled="true"
        @click="onContextMenuAction('openSftpPanel')"
        >打开 SFTP 面板</v-contextmenu-item
      > -->
    <v-contextmenu-item @click="onContextMenuAction('newTerminal')">{{ $t('common.newTerminal') }}</v-contextmenu-item>
    <!-- <v-contextmenu-item
        :disabled="true"
        @click="onContextMenuAction('newByConfig')"
        >依据配置新建</v-contextmenu-item
      > -->
    <v-contextmenu-item @click="onContextMenuAction('close')">{{ $t('common.close') }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('clearTerm')">{{ $t('common.clearTerm') }}</v-contextmenu-item>
    <v-contextmenu-item @click="onContextMenuAction('shrotenName')">{{ $t('common.shrotenName') }}</v-contextmenu-item>
    <v-contextmenu-submenu :title="$t('common.fontsize')">
      <v-contextmenu-item @click="onContextMenuAction('fontsizeLargen')">{{ $t('common.largen') }}</v-contextmenu-item>
      <v-contextmenu-item @click="onContextMenuAction('fontsizeSmaller')">{{ $t('common.smaller') }}</v-contextmenu-item>
    </v-contextmenu-submenu>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount, defineProps, reactive } from 'vue'
const emit = defineEmits(['contextAct'])
const props = defineProps({
  wsInstance: {
    type: Object
  },
  termInstance: { type: Object, required: true },
  copyText: { type: String, required: true },
  terminalId: { type: String, required: true },
  isConnect: { type: Boolean, default: true }
})
const onContextMenuAction = (action) => {
  switch (action) {
    case 'copy':
      // 复制
      navigator.clipboard.writeText(props.copyText)
      console.log(props.copyText, 'copyTextcopyText')
      break
    case 'paste':
      emit('contextAct', 'paste')
      break
    case 'saveAsConfig':
      // 另存为配置
      break
    case 'activityNotification':
      // 活动时通知
      break
    case 'focusAllTabs':
      // 聚焦所有标签页
      break
    case 'disconnect':
      //   props.wsInstance.close()
      emit('contextAct', 'disconnect')
      // 断开连接
      break
    case 'reconnect':
      // 重新连接
      emit('contextAct', 'reconnect')
      //   connectWebsocket()
      break
    case 'openSftpPanel':
      // 打开 SFTP 面板
      break
    case 'newTerminal':
      emit('contextAct', 'newTerminal')
      //   console.log(props.serverInfo, 'props.serverInfo.id')
      //   emit('createNewTerm', props.serverInfo)
      // 新终端
      break
    case 'newByConfig':
      // 依据配置新建
      break
    case 'close':
      emit('contextAct', 'close')
      //   socket.value.close()
      //   emit('closeTabInTerm', props.serverInfo.id)
      // 关闭
      break
    case 'splitRight':
      // 拆分-右侧
      break
    case 'splitDown':
      // 拆分-向下
      break
    case 'splitLeft':
      // 拆分-左侧
      break
    case 'splitUp':
      // 拆分-向上
      break
    case 'clearTerm':
      emit('contextAct', 'clearTerm')
      break
    case 'shrotenName':
      emit('contextAct', 'shrotenName')
      break
    case 'fontsizeLargen':
      emit('contextAct', 'fontsizeLargen')
      break
    case 'fontsizeSmaller':
      emit('contextAct', 'fontsizeSmaller')
      break
    default:
      // 未知操作
      break
  }
}
</script>
<style scoped lang="less"></style>
