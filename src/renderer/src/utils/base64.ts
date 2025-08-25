export class Base64Util {
  static encode(input: string): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(input, 'utf-8').toString('base64')
    }
    return btoa(unescape(encodeURIComponent(input)))
  }

  static decode(base64: string): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8')
    }
    return decodeURIComponent(escape(atob(base64)))
  }
}
