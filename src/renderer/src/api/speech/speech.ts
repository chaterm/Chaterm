import request from '@/utils/request'

// import authRequest from '@/utils/authRequest'

const urls = {
  voiceToText: '/speech/voice-to-text'
}

export function voiceToText(params) {
  return request({
    method: 'post',
    url: urls.voiceToText,
    data: params
  })
}
