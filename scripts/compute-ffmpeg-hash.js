// Compute SHA256 of Electron's bundled ffmpeg.dll at build time.
// The hash is injected into the main bundle via electron-vite `define` and used
// at runtime to detect post-install DLL replacement (Windows only).
//
// Returns an empty string on non-Windows hosts, which disables the runtime check.
// Note: cross-building a Windows package on a non-Windows host will produce a
// binary without DLL protection. The release CI always builds Windows targets
// on windows-latest runners, so this is acceptable for the official pipeline.
// On Windows hosts the DLL must exist: a missing file means Electron was not
// downloaded correctly or was tampered with, so we fail the build loudly rather
// than ship a binary with the integrity check silently disabled.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function computeFfmpegHash() {
  if (process.platform !== 'win32') return ''

  const ffmpegPath = path.join(__dirname, '../node_modules/electron/dist/ffmpeg.dll')
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`ffmpeg.dll not found at expected path: ${ffmpegPath}`)
  }

  const buffer = fs.readFileSync(ffmpegPath)
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase()
}

module.exports = { computeFfmpegHash }
