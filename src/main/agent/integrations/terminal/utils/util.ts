import CryptoJS from 'crypto-js'

export function encrypt(authData: any): string {
  const keyStr = 'CtmKeyNY@D96^qza'
  const ivStr = keyStr
  const key = CryptoJS.enc.Utf8.parse(keyStr)
  const iv = CryptoJS.enc.Utf8.parse(ivStr)
  const srcs = CryptoJS.enc.Utf8.parse(JSON.stringify(authData))
  const encrypted = CryptoJS.AES.encrypt(srcs, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encodeURIComponent(encrypted.toString())
} 