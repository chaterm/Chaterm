<template>
  <div class="alias-config">
    <a-card :bordered="false" class="alias-config-container responsive-table">
      <a-row>
        <a-col :span="10">
          <a-input-search
            v-model:value="searchText"
            :placeholder="$t('extensions.fuzzySearch')"
            class="input-search"
            @search="handleTableChange"
            @press-enter="handleTableChange"
          />
        </a-col>
        <a-col :span="2">
          <a-button
            type="primary"
            :icon="h(PlusOutlined)"
            style="margin-left: 5px"
            @click="handleAdd"
          />
        </a-col>
      </a-row>
      <a-table
        style="margin-top: 14px"
        :columns="columns"
        :data-source="list"
        :pagination="false"
        class="alias-config-table"
        @change="handleTableChange"
      >
        <template #emptyText>No data</template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'alias'">
            <a-input
              v-model:value="record.alias"
              :disabled:="record.edit"
              :class="{ 'editable-input': record.edit }"
            />
          </template>
          <template v-else-if="column.key === 'command'">
            <a-textarea
              v-model:value="record.command"
              class="textarea-command"
              :auto-size="{ minRows: 1, maxRows: 5 }"
              :disabled:="record.edit"
              :class="{ 'editable-input': record.edit }"
              :spellcheck="false"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button
              v-if="!record.edit"
              type="link"
              style="width: 40px"
              :icon="h(EditOutlined)"
              @click="columnOpt('edit', record)"
            >
            </a-button>
            <a-button
              v-if="!record.edit"
              type="link"
              style="width: 40px"
              :icon="h(CloseOutlined)"
              @click="columnOpt('del', record)"
            >
            </a-button>
            <a-button
              v-if="record.edit"
              type="link"
              style="width: 40px"
              :icon="h(CheckOutlined)"
              @click="columnOpt('save', record)"
            />
            <a-button
              v-if="record.edit"
              style="width: 40px"
              type="link"
              :icon="h(CloseSquareOutlined)"
              @click="columnOpt('cancel', record)"
            />
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, h } from 'vue'
import {
  PlusOutlined,
  CloseOutlined,
  EditOutlined,
  CheckOutlined,
  CloseSquareOutlined
} from '@ant-design/icons-vue'
import 'xterm/css/xterm.css'
import { encrypt } from '@/utils/util'
import {
  listUserQuickCommand,
  updateUserQuickCommand,
  createUserQuickCommand,
  deleteUserQuickCommand,
  aliasRefresh
} from '@api/user/user'
import { cloneDeep } from 'lodash'
import i18n from '@/locales'
import { userInfoStore } from '@/store'

const searchText = ref('')
const list = ref()
const editFlag = ref(true)
const cloneRecord = ref({})
const { t } = i18n.global
const columns = computed(() => [
  {
    title: t('extensions.alias'),
    dataIndex: 'alias',
    key: 'alias',
    width: '20%'
  },
  {
    title: t('extensions.command'),
    dataIndex: 'command',
    key: 'command'
  },
  {
    title: t('extensions.action'),
    dataIndex: 'action',
    key: 'action',
    width: '20%'
  }
])

const pageTable = ref({
  total: 0,
  current: 1,
  pageSize: 1000,
  totalPage: 0
})
const handleTableChange = (page = null) => {
  if (page) {
    pageTable.value.total = page.total
    pageTable.value.current = page.current
    pageTable.value.pageSize = page.pageSize
  }
  listUserQuickCommand({
    searchText: searchText.value
    // pageNo: pageTable.value.current,
    // pageSize: pageTable.value.pageSize
  })
    .then((res) => {
      if (res.data.data) {
        list.value = res.data.data
        // pageTable.value.total = res.data.totalCount
        // pageTable.value.current = res.data.pageNo
        // pageTable.value.pageSize = res.data.pageSize
        // pageTable.value.totalPage = res.data.totalPage
        // console.log(pageTable.value)
      } else {
        list.value = []
        // pageTable.value.total = 0
        // pageTable.value.current = 1
        // pageTable.value.pageSize = 10
        // console.log(pageTable.value)
      }
    })
    .catch((err) => {
      console.log(err, 'err')
    })
}

const columnOpt = (type, record) => {
  switch (type) {
    case 'edit':
      if (editFlag.value) {
        record.edit = true
        editFlag.value = false
        cloneRecord.value = cloneDeep(record)
        // console.log('this.cloneRecord', cloneRecord.value)
      } else {
        // console.log('每次只能编辑一条数据')
      }
      break
    case 'del':
      deleteUserQuickCommand({ id: record.id })
        .then((res) => {
          if (res.code === 200) {
            handleTableChange()
            aliasConfigRefresh()
          }
        })
        .catch((err) => {
          // console.log(err)
        })
      break
    case 'save':
      if (record.alias.length === 0 || record.command.length === 0) {
        // console.log('缺少别名或命令')
        return
      }
      if (record.id === 0) {
        createUserQuickCommand(record)
          .then((res) => {
            if (res.code === 200) {
              record.edit = false
              editFlag.value = true
              handleTableChange()
              aliasConfigRefresh()
            }
          })
          .catch((err) => {
            console.log(err, 'err')
          })
      } else {
        updateUserQuickCommand(record)
          .then((res) => {
            if (res.code === 200) {
              record.edit = false
              editFlag.value = true
              handleTableChange()
              aliasConfigRefresh()
            }
          })
          .catch((err) => {
            console.log(err, 'err')
          })
      }
      break
    case 'cancel':
      if (record.id === 0) {
        list.value.splice(0, 1)
      } else {
        record.alias = cloneRecord.value.alias
        record.command = cloneRecord.value.command
      }
      record.edit = false
      editFlag.value = true
      cloneRecord.value = {}
      break
  }
}

// 初始化终端
onMounted(() => {
  handleTableChange()
})

// 销毁时清理资源
onBeforeUnmount(() => {})

const handleAdd = () => {
  if (!editFlag.value) {
    return
  }
  if (list.value.length) {
    list.value = [
      {
        alias: '',
        command: '',
        edit: true,
        id: 0
      },
      ...list.value
    ]
  } else {
    list.value.push({
      alias: '',
      command: '',
      edit: true,
      id: 0
    })
  }
}

const aliasConfigRefresh = () => {
  const authData = {
    uid: userInfoStore()?.userInfo.uid
  }
  // console.log('aliasConfigRefresh', userInfoStore()?.userInfo.uid, authData)
  const auth = decodeURIComponent(encrypt(authData))
  aliasRefresh({ data: auth }).then((response) => {
    if (response) {
      // console.log(response)
    }
  })
}
</script>

<style scoped>
.alias-config {
  width: 100%;
  height: 100%;
}

.alias-config-container {
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  border-radius: 6px;
  //overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: #ffffff;
}

.input-search :deep(.ant-input) {
  &::placeholder {
    color: #ffffff; /* 设置placeholder颜色 */
    opacity: 0.3; /* 可选：调整透明度 */
  }
}

:deep(.ant-card) {
  height: 100%;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.alias-config-table :deep(.ant-table-tbody) {
  background-color: #1a1a1a; /* 黑色背景 */
}

.alias-config-table :deep(.ant-table-thead > tr > th) {
  /* 可以选择保留默认样式或自定义 */
  /* 例如: */
  //background: #1a1a1a; /* 深灰色表头 */
  background: #1a1a1a; /* 深灰色表头 */
  color: #fff;
  padding: 8px;
  border-radius: 0;
  border: none !important;
  border-bottom: 1px solid #f0f0f0 !important; /* 可选：保留表头底部边框 */
}

.alias-config-table :deep(.ant-table-tbody > tr > td) {
  /* 可以选择保留默认样式或自定义 */
  /* 例如: */
  background: #1a1a1a; /* 深灰色表头 */
  color: #fff;
  padding: 8px;
  border: none !important;
  border-bottom: 1px solid #333;
}

.alias-config-table :deep(.ant-input) {
  background-color: transparent; /* 透明背景 */
  border: none; /* 移除边框 */
  box-shadow: none; /* 移除阴影 */
  color: #fff; /* 输入文字为白色 */
}

.alias-config-table {
  /* 可编辑状态的输入框样式 - 灰色背景 */

  .editable-input {
    background-color: #3a3a3a !important; /* 灰色背景 */
    padding: 4px 8px;
    border-radius: 4px;
  }

  .textarea-command {
    white-space: pre-wrap;
  }
}

.responsive-table {
  width: 75%;
  margin-left: auto;
  margin-right: auto;

  @media (min-width: 768px) {
    width: 85%;
  }

  @media (min-width: 992px) {
    width: 70%;
  }
}

.alias-config-table:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #4a4a4a !important; /* 浅灰色悬浮背景 */
}
</style>
