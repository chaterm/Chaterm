import request from '@/utils/request'
const urls = {
  model: '/ai/conversation/model-list',
  conversationDetail: '/ai/conversation/conversation-detail',
  conversationList: '/ai/conversation/conversation-list'
}

export function getAiModel(params) {
  return request({
    method: 'get',
    url: urls.model,
    params: params
  })
}

export function getChatDetailList(params) {
  return request({
    method: 'get',
    url: urls.conversationDetail,
    params: params
  })
}

export function getConversationList(params) {
  return request({
    method: 'get',
    url: urls.conversationList,
    params: params
  })
}
