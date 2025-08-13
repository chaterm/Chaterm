const fs = require('fs')
const path = require('path')

const lockPath = path.resolve(__dirname, '../package-lock.json')
if (!fs.existsSync(lockPath)) {
  console.log('package-lock.json not found')
  process.exit(0)
}
const pkgLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const pkgs = pkgLock.packages || {} // npm v7+
const ssh2Key = Object.keys(pkgs).find((k) => k === 'node_modules/ssh2' || k.endsWith('/node_modules/ssh2'))

if (ssh2Key && pkgs[ssh2Key]) {
  if (pkgs[ssh2Key].optionalDependencies) {
    delete pkgs[ssh2Key].optionalDependencies
    console.log(`Deleted optionalDependencies for ${ssh2Key}`)
  }
} else {
  console.log('ssh2 not found in package-lock.json')
}

fs.writeFileSync(lockPath, JSON.stringify(pkgLock, null, 2))
console.log('Patched package-lock.json.')
